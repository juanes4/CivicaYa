// Crea la base de datos a partir de schema.sql, carga los puntos de atención
// y, opcionalmente, un administrador inicial.
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcrypt');
const puntos = require('../puntos');

const dbPath = process.env.DB_PATH || './civicaya.db';
const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('No se pudo abrir la base de datos:', err.message);
        process.exit(1);
    }
});

function fallar(mensaje, err) {
    console.error(`${mensaje}:`, err.message);
    process.exit(1);
}

db.exec(schema, (err) => {
    if (err) return fallar('Error aplicando schema.sql', err);

    const insertar = db.prepare('INSERT OR IGNORE INTO Sucursales (Nombre_Sucursal) VALUES (?)');
    puntos.forEach(({ nombre }) => insertar.run(nombre));
    insertar.finalize(async (err) => {
        if (err) return fallar('Error cargando los puntos de atención', err);
        console.log(`Base de datos lista en ${dbPath} (${puntos.length} puntos de atención)`);

        const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
        if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return db.close();

        const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
        db.run(
            "INSERT OR IGNORE INTO Usuarios_Civica (Correo, Contraseña, TipoUsuario) VALUES (?, ?, 'Admin')",
            [ADMIN_EMAIL, hash],
            function (err) {
                if (err) console.error('Error creando administrador:', err.message);
                else console.log(this.changes ? `Administrador creado: ${ADMIN_EMAIL}` : 'El administrador ya existía.');
                db.close();
            }
        );
    });
});
