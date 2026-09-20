const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session'); // <-- Agrega esto
const bcrypt = require('bcrypt');

const app = express();
let sql;

app.use(bodyParser.urlencoded({ extended: false }));

// Configuración de sesiones
if (!process.env.SESSION_SECRET) {
    console.error('Falta SESSION_SECRET. Copia .env.example a .env y define un valor.');
    process.exit(1);
}

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // true para HTTPS
}));

// Conexión a la base de datos 
const db = new sqlite3.Database(process.env.DB_PATH || './civicaya.db', sqlite3.OPEN_READWRITE, (err) => {
    if (err) return console.error(err.message);
});


const sucursales = ["Acevedo", "Itagui", "San Antonio"];
sucursales.forEach(nombre => {
    db.run(
        "INSERT OR IGNORE INTO Sucursales (Nombre_Sucursal) VALUES (?)",
        [nombre],
        (err) => {
            if (err) console.error("Error insertando sucursal:", err.message);
        }
    );
});


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Project', 'index.html'));
});

// Ruta para procesar el login
app.post('/login', (req, res) => {
const { correo, contrasena } = req.body;
    sql = `
        SELECT uc.*, u.Id_Usuario, so.Id_Solicitud
        FROM Usuarios_Civica uc
        LEFT JOIN Usuarios u ON uc.Correo = u.Correo
        LEFT JOIN Solicitudes so ON u.Id_Usuario = so.Id_Usuario
        WHERE uc.Correo = ?
        LIMIT 1
    `;
    db.get(sql, [correo], (err, row) => {
        if (err) return res.status(500).send('Error en el servidor');
        if (!row) return res.send('Correo o contraseña incorrectos');
        // Comparar hash
        bcrypt.compare(contrasena, row.Contraseña, (err, result) => {
            if (err) return res.status(500).send('Error en el servidor');
            if (!result) return res.send('Correo o contraseña incorrectos');
            req.session.usuario = row.Correo;
            req.session.tipoUsuario = row.TipoUsuario;
            if (row.TipoUsuario === 'Admin') {
                res.redirect('/Project/ModuloAdmin.html');
            } else if (row.TipoUsuario === 'Normal') {
                if(row.Id_Solicitud){
                    res.redirect('/Project/ModuloUC.html');
                }else{
                    res.redirect('/Project/ModuloUser.html');
                }
                
            } else {
                res.send('Tipo de usuario no reconocido');
            }
        });
    });
});

app.get('/usuario-actual', (req, res) => {
    if (req.session.usuario) {
        res.json({ correo: req.session.usuario, tipo: req.session.tipoUsuario });
        
    } else {
        res.status(401).json({ error: 'No autenticado' });
    }
});

// Ruta para cerrar sesión
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/Project/InicioSesion.html');
    });
});

// Registro de usuario con hash
app.post('/registrar', (req, res) => {
    const { correo, contrasena, confirmar } = req.body;
    if (contrasena !== confirmar) {
        return res.send('Las contraseñas no coinciden');
    }
    bcrypt.hash(contrasena, 10, (err, hash) => {
        if (err) return res.send('Error al registrar usuario');
        const sql = 'INSERT INTO Usuarios_Civica (Correo, Contraseña, TipoUsuario) VALUES (?, ?, ?)';
        db.run(sql, [correo, hash, 'Normal'], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.send('El correo ya está registrado');
                }
                return res.send('Error al registrar usuario');
            }
            req.session.usuario = correo;
            req.session.tipoUsuario = 'Normal';
            // Enviar mensaje y URL de redirección en JSON
            res.json({ mensaje: 'Usuario registrado exitosamente', redirect: '/Project/ModuloUser.html' });
        });
    });
});

// Registrar solicitud: (por cédula)
app.post('/registrar-solicitud', express.json(), (req, res) => {
    const { nombre, apellido, cedula, fecha_nacimiento, correo, telefono, direccion, sucursal } = req.body;
    db.get(
        `SELECT so.Id_Solicitud 
         FROM Usuarios u 
         JOIN Solicitudes so ON u.Id_Usuario = so.Id_Usuario 
         WHERE u.Cedula = ? AND so.Estado != 'ENTREGADO'`, 
        [cedula], 
        (err, row) => {
            if (err) return res.status(500).json({ mensaje: 'Error al verificar solicitud previa' });
            if (row && row.Id_Solicitud) return res.status(400).json({ mensaje: 'Ya existe una solicitud pendiente para esta persona.' });
            const sqlUsuario = `
                INSERT OR IGNORE INTO Usuarios (Nombre, Apellido, Cedula, Fecha_Nacimiento, Correo, Telefono, Direccion)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            db.run(sqlUsuario, [nombre, apellido, cedula, fecha_nacimiento, correo, telefono, direccion], function (err) {
                if (err) return res.status(500).json({ mensaje: 'Error al registrar usuario' });
                db.get('SELECT Id_Usuario FROM Usuarios WHERE Cedula = ?', [cedula], (err, usuario) => {
                    if (err || !usuario) return res.status(500).json({ mensaje: 'Error al obtener usuario' });
                    db.get('SELECT id_Sucursal FROM Sucursales WHERE Nombre_Sucursal = ?', [sucursal], (err, suc) => {
                        if (err || !suc) return res.status(500).json({ mensaje: 'Error al obtener sucursal' });
                        const random = Math.floor(1000000000 + Math.random() * 9000000000);
                        const codigoBarras = cedula + random;
                        const sqlSolicitud = `
                            INSERT INTO Solicitudes (Id_Usuario, id_Sucursal, Estado, Codigo_Barras)
                            VALUES (?, ?, 'PENDIENTE', ?)
                        `;
                        db.run(sqlSolicitud, [usuario.Id_Usuario, suc.id_Sucursal, codigoBarras], function (err) {
                            if (err) return res.status(400).json({ mensaje: 'Error al registrar solicitud' });
                            res.json({ redirect: '/Project/ModuloUC.html', mensaje: 'Solicitud registrada exitosamente.' });
                        });
                    });
                });
            });
        }
    );
});


app.get('/solicitudes-todas', soloAdmin, (req, res) => {
    const sucursal = req.query.sucursal;
    let sql = `
        SELECT u.Nombre, u.Apellido, u.Cedula, s.Nombre_Sucursal, so.Estado
        FROM Solicitudes so
        JOIN Usuarios u ON so.Id_Usuario = u.Id_Usuario
        JOIN Sucursales s ON so.id_Sucursal = s.id_Sucursal
        WHERE so.Estado != 'ENTREGADO'
    `;
    const params = [];
    if (sucursal) {
        sql += ' AND s.Nombre_Sucursal = ?';
        params.push(sucursal);
    }
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json([]);
        res.json(rows);
    });
});

app.get('/solicitudes-Entregadas', soloAdmin, (req, res) => {
    const sucursal = req.query.sucursal;
    let sql = `
        SELECT u.Nombre, u.Apellido, u.Cedula, s.Nombre_Sucursal, so.Estado
        FROM Solicitudes so
        JOIN Usuarios u ON so.Id_Usuario = u.Id_Usuario
        JOIN Sucursales s ON so.id_Sucursal = s.id_Sucursal
        WHERE so.Estado = 'ENTREGADO'
    `;
    const params = [];
    if (sucursal) {
        sql += ' AND s.Nombre_Sucursal = ?';
        params.push(sucursal);
    }
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json([]);
        res.json(rows);
    });
});

// Cambiar estado de la solicitud
app.post('/cambiar-estado', soloAdmin, express.json(), (req, res) => {
    const { cedula, estado } = req.body;
    // Busca el usuario por cédula y actualiza el estado de su solicitud
    db.get('SELECT Id_Usuario FROM Usuarios WHERE Cedula = ?', [cedula], (err, usuario) => {
        if (err || !usuario) return res.send('Usuario no encontrado');
        db.run('UPDATE Solicitudes SET Estado = ? WHERE Id_Usuario = ?', [estado, usuario.Id_Usuario], function (err) {
            if (err) return res.send('Error actualizando estado');
            res.send('Estado actualizado correctamente');
        });
    });
});

// Eliminar usuario, su solicitud y relación con sucursal
app.post('/eliminar-usuario', soloAdmin, express.json(), (req, res) => {
    const { cedula } = req.body;
    db.get('SELECT Id_Usuario FROM Usuarios WHERE Cedula = ?', [cedula], (err, usuario) => {
        if (err || !usuario) return res.send('Usuario no encontrado');
        const idUsuario = usuario.Id_Usuario;
        // Elimina primero la solicitud, luego el usuario
        db.run('DELETE FROM Solicitudes WHERE Id_Usuario = ?', [idUsuario], function (err) {
            if (err) return res.send('Error eliminando solicitud');
            db.run('DELETE FROM Usuarios WHERE Id_Usuario = ?', [idUsuario], function (err) {
                if (err) return res.send('Error eliminando usuario');
                res.send('Usuario y solicitud eliminados correctamente');
            });
        });
    });
});

app.get('/solicitud-usuario', (req, res) => {
    const correo = req.query.correo;
    if (!correo) return res.json({ existe: false });
    const sql = `
        SELECT u.Nombre, u.Apellido, u.Cedula, u.Correo, s.Nombre_Sucursal, so.Estado, so.Codigo_Barras
        FROM Usuarios u
        JOIN Solicitudes so ON u.Id_Usuario = so.Id_Usuario
        JOIN Sucursales s ON so.id_Sucursal = s.id_Sucursal
        WHERE u.Correo = ?
        LIMIT 1
    `;
    db.get(sql, [correo], (err, row) => {
        if (err || !row) return res.json({ existe: false });
        res.json({ existe: true, ...row });
    });
});

app.get('/datos-persona', (req, res) => {
    const cedula = req.query.cedula;
    if (!cedula) return res.json({ existe: false });
    const sql = `
        SELECT u.Nombre, u.Apellido, u.Cedula, u.Correo, s.Nombre_Sucursal, so.Codigo_Barras
        FROM Usuarios u
        JOIN Solicitudes so ON u.Id_Usuario = so.Id_Usuario
        JOIN Sucursales s ON so.id_Sucursal = s.id_Sucursal
        WHERE u.Cedula = ?
        LIMIT 1
    `;
    db.get(sql, [cedula], (err, row) => {
        if (err || !row) return res.json({ existe: false });
        res.json({ existe: true, ...row });
    });
});

function soloAdmin(req, res, next) {
    if (req.session && req.session.usuario && req.session.tipoUsuario === 'Admin') {
        next();
    } else {
        res.status(403).send('Acceso denegado. Solo administradores.');
    }
}

// Servir la página solo si es Admin
app.get('/Project/ModuloAdmin.html', soloAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'Project', 'ModuloAdmin.html'));
});
// Servir archivos estáticos (como los módulos)
app.use(express.static(__dirname));

// Iniciar el servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor iniciado en http://localhost:${port}`);
});