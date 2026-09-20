const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const bcrypt = require('bcrypt');
const puntos = require('./puntos');

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

    if (!nombre || !apellido || !cedula || !fechaNacimiento || !telefono || !sucursal) {
        return res.status(400).json({ mensaje: 'Completa todos los campos obligatorios.' });
    }
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
        if (previos.length === 0) {
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

        const enCurso = await get("SELECT 1 FROM Solicitudes WHERE Id_Usuario = ? AND Estado != 'ENTREGADO'", [idUsuario]);
        if (enCurso) return res.status(409).json({ mensaje: 'Ya existe una solicitud en curso para esta persona.' });

        const codigoBarras = `${cedula}${crypto.randomInt(1000000000, 10000000000)}`;
        await run(
            "INSERT INTO Solicitudes (Id_Usuario, id_Sucursal, Estado, Codigo_Barras) VALUES (?, ?, 'PENDIENTE', ?)",
            [idUsuario, punto.id_Sucursal, codigoBarras]
        );
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
            SELECT u.Nombre, u.Apellido, u.Cedula, s.Nombre_Sucursal, so.Estado
            FROM Solicitudes so
            JOIN Usuarios u ON so.Id_Usuario = u.Id_Usuario
            JOIN Sucursales s ON so.id_Sucursal = s.id_Sucursal
            WHERE so.Estado ${entregadas ? '=' : '!='} 'ENTREGADO'
        `;
        const params = [];
        if (sucursal) {
            sql += ' AND s.Nombre_Sucursal = ?';
            params.push(sucursal);
        }
        sql += ' ORDER BY so.id_Solicitud';
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
            `SELECT u.Nombre, u.Apellido, u.Cedula, u.Correo, s.Nombre_Sucursal, so.Estado, so.Codigo_Barras
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
app.listen(port, () => {
    console.log(`Servidor iniciado en http://localhost:${port}`);
});
