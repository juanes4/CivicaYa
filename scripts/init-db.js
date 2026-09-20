// Crea la base de datos a partir de schema.sql y, opcionalmente, un administrador inicial.
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcrypt');

const dbPath = process.env.DB_PATH || './civicaya.db';
const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('No se pudo abrir la base de datos:', err.message);
        process.exit(1);
    }
});

db.exec(schema, async (err) => {
    if (err) {
        console.error('Error aplicando schema.sql:', err.message);
        process.exit(1);
    }
    console.log(`Base de datos lista en ${dbPath}`);

    const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
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
    } else {
        db.close();
    }
});
