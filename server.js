const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const bcrypt = require('bcrypt');
const puntos = require('./puntos');
const horarios = require('./horarios');

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Configuración de sesiones
if (!process.env.SESSION_SECRET) {
    console.error('Falta SESSION_SECRET. Copia .env.example a .env y define un valor.');
    process.exit(1);
}

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, sameSite: 'lax' } // secure: true con HTTPS
}));

// Conexión a la base de datos
const dbPath = process.env.DB_PATH || './civicaya.db';
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error(`No se pudo abrir la base de datos (${dbPath}): ${err.message}`);
        console.error('Ejecuta "npm run db:init" para crearla.');
        process.exit(1);
    }
});

db.run('PRAGMA foreign_keys = ON');

puntos.forEach(({ nombre }) => {
    db.run(
        'INSERT OR IGNORE INTO Sucursales (Nombre_Sucursal) VALUES (?)',
        [nombre],
        (err) => {
            if (err) console.error('Error insertando punto de atención:', err.message);
        }
    );
});

// Versiones con promesas de los métodos de sqlite3
const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
const all = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

// Pone al día una base creada antes de los horarios: crea las tablas que falten (schema.sql)
// y agrega a Solicitudes las columnas de la cita.
const COLUMNAS_CITA = ['Fecha_Cita', 'Hora_Cita', 'Codigo_Cita'];

async function migrar() {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await new Promise((resolve, reject) => db.exec(schema, (err) => err ? reject(err) : resolve()));
    const existentes = (await all('PRAGMA table_info(Solicitudes)')).map((c) => c.name);
    for (const columna of COLUMNAS_CITA) {
        if (!existentes.includes(columna)) await run(`ALTER TABLE Solicitudes ADD COLUMN ${columna} TEXT`);
    }
    await run('CREATE INDEX IF NOT EXISTS idx_solicitudes_cita ON Solicitudes (id_Sucursal, Fecha_Cita, Hora_Cita)');
}

const texto = (valor) => String(valor ?? '').trim();
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Guarda al usuario en una sesión nueva (evita reutilizar el id de sesión previo)
function iniciarSesion(req, correo, tipo, callback) {
    req.session.regenerate((err) => {
        if (err) return callback(err);
        req.session.usuario = correo;
        req.session.tipoUsuario = tipo;
        req.session.save(callback);
    });
}

// --- Control de acceso ---

function requiereSesion(req, res, next) {
    if (req.session.usuario) return next();
    res.status(401).json({ mensaje: 'No autenticado' });
}

function soloAdmin(req, res, next) {
    if (req.session.usuario && req.session.tipoUsuario === 'Admin') return next();
    res.status(403).json({ mensaje: 'Acceso denegado. Solo administradores.' });
}

// Páginas: sin sesión van al login; con otro tipo de usuario, a su módulo
function pagina(tipo) {
    return (req, res, next) => {
        if (!req.session.usuario) return res.redirect('/Project/InicioSesion.html');
        if (req.session.tipoUsuario === tipo) return next();
        res.redirect(req.session.tipoUsuario === 'Admin' ? '/Project/ModuloAdmin.html' : '/Project/ModuloUser.html');
    };
}

const paginasPorTipo = {
    Admin: ['ModuloAdmin.html', 'Eliminados.html', 'civica.html'],
    Normal: ['ModuloUser.html', 'ModuloUC.html']
};
Object.entries(paginasPorTipo).forEach(([tipo, archivos]) => {
    archivos.forEach(archivo => {
        app.get(`/Project/${archivo}`, pagina(tipo), (req, res) => {
            res.sendFile(path.join(__dirname, 'Project', archivo));
        });
    });
});

// Solo se sirve la carpeta Project (nunca la raíz: ahí están la base de datos y el código)
app.use('/Project', express.static(path.join(__dirname, 'Project')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Project', 'index.html'));
});

// --- Sesión ---

app.post('/login', async (req, res) => {
    const correo = texto(req.body.correo);
    const contrasena = String(req.body.contrasena ?? '');
    const fallo = '/Project/InicioSesion.html?error=1';
    try {
        const usuario = await get(
            `SELECT uc.Correo, uc."Contraseña" AS Hash, uc.TipoUsuario,
                    EXISTS (SELECT 1 FROM Usuarios u JOIN Solicitudes so ON so.Id_Usuario = u.Id_Usuario
                            WHERE u.Correo = uc.Correo) AS TieneSolicitud
             FROM Usuarios_Civica uc
             WHERE lower(uc.Correo) = lower(?)`,
            [correo]
        );
        if (!usuario || !(await bcrypt.compare(contrasena, usuario.Hash))) return res.redirect(fallo);

        let destino;
        if (usuario.TipoUsuario === 'Admin') destino = '/Project/ModuloAdmin.html';
        else if (usuario.TipoUsuario === 'Normal') destino = usuario.TieneSolicitud ? '/Project/ModuloUC.html' : '/Project/ModuloUser.html';
        else return res.redirect(fallo);

        iniciarSesion(req, usuario.Correo, usuario.TipoUsuario, (err) => {
            if (err) return res.status(500).send('Error en el servidor');
            res.redirect(destino);
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error en el servidor');
    }
});

app.get('/usuario-actual', requiereSesion, (req, res) => {
    res.json({ correo: req.session.usuario, tipo: req.session.tipoUsuario });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/Project/InicioSesion.html');
    });
});

// Registro de usuario con hash
app.post('/registrar', async (req, res) => {
    const correo = texto(req.body.correo).toLowerCase();
    const contrasena = String(req.body.contrasena ?? '');
    const confirmar = String(req.body.confirmar ?? '');

    if (!CORREO_VALIDO.test(correo)) return res.status(400).json({ mensaje: 'Ingresa un correo válido.' });
    if (contrasena.length < 6) return res.status(400).json({ mensaje: 'La contraseña debe tener al menos 6 caracteres.' });
    if (contrasena !== confirmar) return res.status(400).json({ mensaje: 'Las contraseñas no coinciden.' });

    try {
        const existente = await get('SELECT 1 FROM Usuarios_Civica WHERE lower(Correo) = ?', [correo]);
        if (existente) return res.status(409).json({ mensaje: 'El correo ya está registrado.' });

        const hash = await bcrypt.hash(contrasena, 10);
        await run('INSERT INTO Usuarios_Civica (Correo, Contraseña, TipoUsuario) VALUES (?, ?, ?)', [correo, hash, 'Normal']);

        iniciarSesion(req, correo, 'Normal', (err) => {
            if (err) return res.status(500).json({ mensaje: 'Error al iniciar sesión.' });
            res.json({ mensaje: 'Usuario registrado exitosamente.', redirect: '/Project/ModuloUser.html' });
        });
    } catch (err) {
        console.error(err);
        if (err.message.includes('UNIQUE constraint failed')) return res.status(409).json({ mensaje: 'El correo ya está registrado.' });
        res.status(500).json({ mensaje: 'Error al registrar usuario.' });
    }
});

// --- Puntos de atención ---

// Foto del PAC: Project/img/pac/<imagen>.(jpg|jpeg|png|webp); si no existe, una imagen genérica
const IMAGEN_GENERICA = '/Project/img/pac/placeholder.svg';
function imagenDelPunto(punto) {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
        const archivo = `${punto.imagen}.${ext}`;
        if (fs.existsSync(path.join(__dirname, 'Project', 'img', 'pac', archivo))) return `/Project/img/pac/${archivo}`;
    }
    return IMAGEN_GENERICA;
}

app.get('/puntos', (req, res) => {
    res.json(puntos.map((punto) => ({
        nombre: punto.nombre,
        ubicacion: punto.ubicacion,
        mapa: punto.mapa,
        imagen: imagenDelPunto(punto)
    })));
});

// --- Horarios y cupos ---

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;
const HORA_VALIDA = /^\d{2}:\d{2}$/;

async function buscarPunto(nombre) {
    return get('SELECT id_Sucursal FROM Sucursales WHERE Nombre_Sucursal = ?', [texto(nombre)]);
}

// Citas ocupadas por franja: Map 'AAAA-MM-DD HH:MM' → cantidad (las canceladas liberan el cupo)
async function ocupacion(idSucursal, fechas) {
    if (fechas.length === 0) return new Map();
    const filas = await all(
        `SELECT Fecha_Cita, Hora_Cita, COUNT(*) AS n FROM Solicitudes
         WHERE id_Sucursal = ? AND Fecha_Cita IN (${fechas.map(() => '?').join(',')}) AND Estado != 'CANCELADA'
         GROUP BY Fecha_Cita, Hora_Cita`,
        [idSucursal, ...fechas]
    );
    return new Map(filas.map((f) => [`${f.Fecha_Cita} ${f.Hora_Cita}`, f.n]));
}

// Todas las franjas de un día con sus cupos. `disponible` es falso cuando ya no se puede reservar
// por tiempo (p. ej. las de hoy que quedan a menos de 2 horas); `libres` es 0 cuando se agotó el cupo.
function franjasDelDia(fecha, ocupadas) {
    return horarios.FRANJAS.map(({ hora, cupos }) => ({
        hora,
        cupos,
        libres: Math.max(0, cupos - (ocupadas.get(`${fecha} ${hora}`) || 0)),
        disponible: horarios.franjaReservable(fecha, hora)
    }));
}

// Tabla de un PAC: los próximos días con todas sus franjas, más la información de atención sin cita
app.get('/horarios/tabla', requiereSesion, async (req, res) => {
    try {
        const punto = await buscarPunto(req.query.sucursal);
        if (!punto) return res.status(400).json({ mensaje: 'Selecciona un punto de atención válido.' });
        const fechas = horarios.fechasReservables();
        const ocupadas = await ocupacion(punto.id_Sucursal, fechas);
        const dias = fechas
            .map((fecha) => ({ fecha, franjas: franjasDelDia(fecha, ocupadas) }))
            .filter(({ franjas }) => franjas.some((f) => f.disponible));
        res.json({
            hoy: horarios.hoy(), // para rotular "Hoy" y "Mañana" con la fecha de Colombia
            dias,
            sinCita: {
                presenciales: horarios.CONFIG.CUPOS_PRESENCIALES_DIA,
                asistidos: horarios.CONFIG.CUPOS_ASISTIDOS_DIA
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: 'Error al consultar los horarios.' });
    }
});

// Código corto de la cita (ej. CV-4821), distinto de los de las citas vigentes
async function generarCodigoCita() {
    for (let intento = 0; intento < 20; intento++) {
        const codigo = `CV-${crypto.randomInt(1000, 10000)}`;
        const usado = await get("SELECT 1 FROM Solicitudes WHERE Codigo_Cita = ? AND Estado != 'CANCELADA'", [codigo]);
        if (!usado) return codigo;
    }
    throw new Error('No se pudo generar un código de cita');
}

// Un mismo texto de error para cualquier fecha/hora que no se pueda reservar
const CITA_INVALIDA = 'Elige un día y una hora disponibles.';
const SIN_CUPOS = 'Esa hora ya no tiene cupos. Elige otra, por favor.';

function citaValida(fecha, hora) {
    return FECHA_VALIDA.test(fecha) && HORA_VALIDA.test(hora) && horarios.franjaReservable(fecha, hora);
}

// Cambia la fecha y hora de la cita en el mismo PAC (a otro PAC se llega cancelando y pidiendo de nuevo)
app.post('/reprogramar-cita', requiereSesion, async (req, res) => {
    const fecha = texto(req.body.fecha);
    const hora = texto(req.body.hora);
    if (!citaValida(fecha, hora)) return res.status(400).json({ mensaje: CITA_INVALIDA });

    try {
        const solicitud = await get(
            `SELECT so.id_Solicitud, so.id_Sucursal, so.Codigo_Cita
             FROM Solicitudes so JOIN Usuarios u ON u.Id_Usuario = so.Id_Usuario
             WHERE u.Correo = ? AND so.Estado IN ('PENDIENTE', 'CONFIRMADO')
             ORDER BY so.id_Solicitud DESC LIMIT 1`,
            [req.session.usuario]
        );
        if (!solicitud) return res.status(404).json({ mensaje: 'No tienes una solicitud en curso.' });

        const codigo = solicitud.Codigo_Cita || await generarCodigoCita();
        // El cupo se comprueba y se toma en una sola sentencia, así nunca se pasa de la capacidad
        const resultado = await run(
            `UPDATE Solicitudes SET Fecha_Cita = ?, Hora_Cita = ?, Codigo_Cita = ?
             WHERE id_Solicitud = ?
               AND (SELECT COUNT(*) FROM Solicitudes
                    WHERE id_Sucursal = ? AND Fecha_Cita = ? AND Hora_Cita = ? AND Estado != 'CANCELADA'
                      AND id_Solicitud != ?) < ?`,
            [fecha, hora, codigo, solicitud.id_Solicitud,
             solicitud.id_Sucursal, fecha, hora, solicitud.id_Solicitud, horarios.capacidad(hora)]
        );
        if (!resultado.changes) return res.status(409).json({ mensaje: SIN_CUPOS });
        res.json({ mensaje: 'Tu cita fue actualizada.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: 'Error al cambiar la cita.' });
    }
});

// Cancelar la solicitud libera el cupo de la cita (solo mientras la Cívica aún no está lista)
app.post('/cancelar-solicitud', requiereSesion, async (req, res) => {
    try {
        const resultado = await run(
            `UPDATE Solicitudes SET Estado = 'CANCELADA'
             WHERE Estado = 'PENDIENTE' AND Id_Usuario = (SELECT Id_Usuario FROM Usuarios WHERE Correo = ?)`,
            [req.session.usuario]
        );
        if (!resultado.changes) return res.status(409).json({ mensaje: 'No hay una solicitud pendiente para cancelar.' });
        res.json({ mensaje: 'Tu solicitud fue cancelada y el cupo quedó libre.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: 'Error al cancelar la solicitud.' });
    }
});

// "¿Prefiere que lo llamemos?": guarda el nombre y el celular para que un asesor llame
// TODO producción: limitar peticiones (rate limit) y avisar al equipo de atención.
app.post('/solicitar-llamada', requiereSesion, async (req, res) => {
    const nombre = texto(req.body.nombre);
    const celular = texto(req.body.celular);
    if (!nombre || nombre.length > 60) return res.status(400).json({ mensaje: 'Escribe tu nombre.' });
    if (!/^\d{7,12}$/.test(celular)) return res.status(400).json({ mensaje: 'El celular debe tener entre 7 y 12 dígitos numéricos.' });
    try {
        await run('INSERT INTO Llamadas (Nombre, Celular) VALUES (?, ?)', [nombre, celular]);
        res.json({ mensaje: 'Listo. Un asesor te llamará.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: 'Error al guardar tu solicitud.' });
    }
});

app.get('/llamadas', soloAdmin, async (req, res) => {
    try {
        res.json(await all('SELECT id_Llamada, Nombre, Celular, Creada FROM Llamadas ORDER BY id_Llamada'));
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: 'Error al consultar las llamadas.' });
    }
});

app.post('/llamada-atendida', soloAdmin, async (req, res) => {
    try {
        const resultado = await run('DELETE FROM Llamadas WHERE id_Llamada = ?', [Number(req.body.id)]);
        if (!resultado.changes) return res.status(404).json({ mensaje: 'La llamada ya no existe.' });
        res.json({ mensaje: 'Llamada marcada como atendida.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: 'Error al actualizar la llamada.' });
    }
});

// --- Solicitudes ---

function fechaNacimientoValida(fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
    const d = new Date(`${fecha}T00:00:00Z`);
    return !isNaN(d) && d.toISOString().slice(0, 10) === fecha && d <= new Date() && d.getUTCFullYear() >= 1900;
}

app.post('/registrar-solicitud', requiereSesion, async (req, res) => {
    const correo = req.session.usuario; // el correo sale de la sesión, no del formulario
    const nombre = texto(req.body.nombre);
    const apellido = texto(req.body.apellido);
    const cedula = texto(req.body.cedula);
    const fechaNacimiento = texto(req.body.fecha_nacimiento);
    const telefono = texto(req.body.telefono);
    const direccion = texto(req.body.direccion);
    const sucursal = texto(req.body.sucursal);
    const fechaCita = texto(req.body.fecha);
    const horaCita = texto(req.body.hora);

    if (!nombre || !apellido || !cedula || !fechaNacimiento || !telefono || !sucursal) {
        return res.status(400).json({ mensaje: 'Completa todos los campos obligatorios.' });
    }
    if (req.body.acepta_datos !== true) {
        return res.status(400).json({ mensaje: 'Debes aceptar el tratamiento de datos personales.' });
    }
    if (!citaValida(fechaCita, horaCita)) return res.status(400).json({ mensaje: CITA_INVALIDA });
    if (nombre.length > 60 || apellido.length > 60 || direccion.length > 150) {
        return res.status(400).json({ mensaje: 'Alguno de los textos es demasiado largo.' });
    }
    if (!/^\d{6,10}$/.test(cedula)) return res.status(400).json({ mensaje: 'La cédula debe tener entre 6 y 10 dígitos numéricos.' });
    if (!/^\d{7,12}$/.test(telefono)) return res.status(400).json({ mensaje: 'El teléfono debe tener entre 7 y 12 dígitos numéricos.' });
    if (!fechaNacimientoValida(fechaNacimiento)) return res.status(400).json({ mensaje: 'La fecha de nacimiento no es válida.' });

    try {
        const punto = await get('SELECT id_Sucursal FROM Sucursales WHERE Nombre_Sucursal = ?', [sucursal]);
        if (!punto) return res.status(400).json({ mensaje: 'Selecciona un punto de atención válido.' });

        const previos = await all('SELECT Id_Usuario, Cedula, Correo FROM Usuarios WHERE Cedula = ? OR Correo = ?', [cedula, correo]);
        let idUsuario;
        let usuarioNuevo = false;
        if (previos.length === 0) {
            usuarioNuevo = true;
            const nuevo = await run(
                `INSERT INTO Usuarios (Nombre, Apellido, Cedula, Fecha_Nacimiento, Correo, Telefono, Direccion)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [nombre, apellido, cedula, fechaNacimiento, correo, telefono, direccion]
            );
            idUsuario = nuevo.lastID;
        } else if (previos.length === 1 && previos[0].Cedula === cedula && previos[0].Correo === correo) {
            idUsuario = previos[0].Id_Usuario;
            await run(
                'UPDATE Usuarios SET Nombre = ?, Apellido = ?, Fecha_Nacimiento = ?, Telefono = ?, Direccion = ? WHERE Id_Usuario = ?',
                [nombre, apellido, fechaNacimiento, telefono, direccion, idUsuario]
            );
        } else {
            const cuentaConOtraCedula = previos.some(p => p.Correo === correo);
            return res.status(409).json({
                mensaje: cuentaConOtraCedula
                    ? 'Tu cuenta ya está asociada a otra cédula.'
                    : 'Esa cédula ya está registrada con otra cuenta.'
            });
        }

        const enCurso = await get(
            "SELECT 1 FROM Solicitudes WHERE Id_Usuario = ? AND Estado NOT IN ('ENTREGADO', 'CANCELADA')",
            [idUsuario]
        );
        if (enCurso) return res.status(409).json({ mensaje: 'Ya existe una solicitud en curso para esta persona.' });

        const codigoBarras = `${cedula}${crypto.randomInt(1000000000, 10000000000)}`;
        const codigoCita = await generarCodigoCita();
        // El cupo se comprueba y se toma en una sola sentencia, así nunca se pasa de la capacidad
        const resultado = await run(
            `INSERT INTO Solicitudes (Id_Usuario, id_Sucursal, Estado, Codigo_Barras, Fecha_Cita, Hora_Cita, Codigo_Cita)
             SELECT ?, ?, 'PENDIENTE', ?, ?, ?, ?
             WHERE (SELECT COUNT(*) FROM Solicitudes
                    WHERE id_Sucursal = ? AND Fecha_Cita = ? AND Hora_Cita = ? AND Estado != 'CANCELADA') < ?`,
            [idUsuario, punto.id_Sucursal, codigoBarras, fechaCita, horaCita, codigoCita,
             punto.id_Sucursal, fechaCita, horaCita, horarios.capacidad(horaCita)]
        );
        if (!resultado.changes) {
            // No dejar guardada una persona sin solicitud: si corrige un dato y reintenta, no chocaría con esta cédula
            if (usuarioNuevo) await run('DELETE FROM Usuarios WHERE Id_Usuario = ?', [idUsuario]);
            return res.status(409).json({ mensaje: SIN_CUPOS });
        }
        res.json({ redirect: '/Project/ModuloUC.html', mensaje: 'Solicitud registrada exitosamente.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: 'Error al registrar la solicitud.' });
    }
});

function listarSolicitudes(entregadas) {
    return async (req, res) => {
        const sucursal = req.query.sucursal;
        let sql = `
            SELECT u.Nombre, u.Apellido, u.Cedula, s.Nombre_Sucursal, so.Estado, so.Fecha_Cita, so.Hora_Cita
            FROM Solicitudes so
            JOIN Usuarios u ON so.Id_Usuario = u.Id_Usuario
            JOIN Sucursales s ON so.id_Sucursal = s.id_Sucursal
            WHERE so.Estado ${entregadas ? "= 'ENTREGADO'" : "NOT IN ('ENTREGADO', 'CANCELADA')"}
        `;
        const params = [];
        if (sucursal) {
            sql += ' AND s.Nombre_Sucursal = ?';
            params.push(sucursal);
        }
        // Las citas más próximas primero; las solicitudes sin cita (anteriores a los horarios) al final
        sql += ' ORDER BY so.Fecha_Cita IS NULL, so.Fecha_Cita, so.Hora_Cita, so.id_Solicitud';
        try {
            res.json(await all(sql, params));
        } catch (err) {
            console.error(err);
            res.status(500).json({ mensaje: 'Error al consultar las solicitudes.' });
        }
    };
}

app.get('/solicitudes-todas', soloAdmin, listarSolicitudes(false));
app.get('/solicitudes-Entregadas', soloAdmin, listarSolicitudes(true));

// Cada estado solo se alcanza desde el anterior: PENDIENTE → CONFIRMADO → ENTREGADO
const ESTADO_PREVIO = { CONFIRMADO: 'PENDIENTE', ENTREGADO: 'CONFIRMADO' };

app.post('/cambiar-estado', soloAdmin, async (req, res) => {
    const cedula = texto(req.body.cedula);
    const estado = texto(req.body.estado);
    const previo = ESTADO_PREVIO[estado];
    if (!previo) return res.status(400).json({ mensaje: 'Estado no válido.' });

    try {
        const resultado = await run(
            `UPDATE Solicitudes SET Estado = ?
             WHERE Estado = ? AND Id_Usuario = (SELECT Id_Usuario FROM Usuarios WHERE Cedula = ?)`,
            [estado, previo, cedula]
        );
        if (!resultado.changes) {
            return res.status(409).json({ mensaje: `No se pudo actualizar: no hay una solicitud ${previo} para esa cédula.` });
        }
        res.json({ mensaje: 'Estado actualizado correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: 'Error actualizando estado.' });
    }
});

// Eliminar usuario y sus solicitudes
app.post('/eliminar-usuario', soloAdmin, async (req, res) => {
    const cedula = texto(req.body.cedula);
    try {
        const usuario = await get('SELECT Id_Usuario FROM Usuarios WHERE Cedula = ?', [cedula]);
        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        // Primero las solicitudes, luego el usuario
        await run('DELETE FROM Solicitudes WHERE Id_Usuario = ?', [usuario.Id_Usuario]);
        await run('DELETE FROM Usuarios WHERE Id_Usuario = ?', [usuario.Id_Usuario]);
        res.json({ mensaje: 'Usuario y solicitud eliminados correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: 'Error eliminando usuario.' });
    }
});

// Solicitud más reciente de la persona que tiene la sesión iniciada
app.get('/solicitud-usuario', requiereSesion, async (req, res) => {
    try {
        const fila = await get(
            `SELECT u.Nombre, u.Apellido, u.Cedula, u.Correo, s.Nombre_Sucursal, so.Estado, so.Codigo_Barras,
                    so.Fecha_Cita, so.Hora_Cita, so.Codigo_Cita
             FROM Usuarios u
             JOIN Solicitudes so ON u.Id_Usuario = so.Id_Usuario
             JOIN Sucursales s ON so.id_Sucursal = s.id_Sucursal
             WHERE u.Correo = ?
             ORDER BY so.id_Solicitud DESC
             LIMIT 1`,
            [req.session.usuario]
        );
        res.json(fila ? { existe: true, ...fila } : { existe: false });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: 'Error al consultar la solicitud.' });
    }
});

// Datos para imprimir la tarjeta (solo administradores)
app.get('/datos-persona', soloAdmin, async (req, res) => {
    const cedula = texto(req.query.cedula);
    if (!cedula) return res.json({ existe: false });
    try {
        const fila = await get(
            `SELECT u.Nombre, u.Apellido, u.Cedula, u.Correo, s.Nombre_Sucursal, so.Codigo_Barras
             FROM Usuarios u
             JOIN Solicitudes so ON u.Id_Usuario = so.Id_Usuario
             JOIN Sucursales s ON so.id_Sucursal = s.id_Sucursal
             WHERE u.Cedula = ?
             ORDER BY so.id_Solicitud DESC
             LIMIT 1`,
            [cedula]
        );
        res.json(fila ? { existe: true, ...fila } : { existe: false });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: 'Error al consultar los datos.' });
    }
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ mensaje: 'Error en el servidor.' });
});

// Iniciar el servidor
const port = process.env.PORT || 3000;
migrar().then(() => {
    app.listen(port, () => {
        console.log(`Servidor iniciado en http://localhost:${port}`);
    });
}).catch((err) => {
    console.error(`No se pudo preparar la base de datos: ${err.message}`);
    console.error('Ejecuta "npm run db:init" para crearla.');
    process.exit(1);
});
