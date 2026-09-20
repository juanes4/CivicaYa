const sqlite3 = require('sqlite3').verbose();
let sql;

//connect to DB
const db = new sqlite3.Database('./test.db',sqlite3.OPEN_READWRITE,(err)=>{
    if (err) return console.error(err.message);
});

//Create table
//sql = 'CREATE TABLE Usuarios_Civica(Correo PRIMARY KEY,Contraseña,TipoUsuario)';
//db.run(sql);

//db.run('DROP TABLE Usuarios_Civica');

//INSERT DATA INTO TABLE
//sql = 'INSERT INTO Usuarios_Civica(Correo,Contraseña,TipoUsuario) VALUES (?,?,?)';
//db.run(sql,["miguel@gmail.com","1234567","Admin"],
//    (err)=>{
//    if (err) return console.error(err.message);
//}
//);

//query the data
// sql = 'SELECT * FROM Usuarios_Civica';
// db.all(sql,[],(err,rows)=>{
//    if (err) return console.error(err.message);
 //   rows.forEach(row=>{
 //       console.log(row);
 //   })
//});

//db.run(`
//    CREATE TABLE IF NOT EXISTS Usuarios (
 //       Id_Usuario INTEGER PRIMARY KEY AUTOINCREMENT,
  //      Nombre TEXT NOT NULL,
  //      Apellido TEXT NOT NULL,
//        Cedula TEXT NOT NULL UNIQUE,
  //      Fecha_Nacimiento TEXT NOT NULL,
   //     Correo TEXT NOT NULL UNIQUE,
 //       Telefono TEXT,
  //      Direccion TEXT
 //   )
//`, (err) => {
 //   if (err) {
 //       console.error("Error creando tabla Usuarios:", err.message);
//    } else {
 //       console.log("Tabla Usuarios lista.");
//    }
//});

//db.run(`
 //   CREATE TABLE IF NOT EXISTS Sucursales (
  //      id_Sucursal INTEGER PRIMARY KEY AUTOINCREMENT,
  //      Nombre_Sucursal TEXT NOT NULL
 //   )
//`, (err) => {
//    if (err) {
 //       console.error("Error creando tabla Sucursales:", err.message);
  //  } else {
 //       console.log("Tabla Sucursales lista.");
  //  }
//});
//
//db.run(`
//    CREATE TABLE IF NOT EXISTS Solicitudes (
//        id_Solicitud INTEGER PRIMARY KEY AUTOINCREMENT,
//       Id_Usuario INTEGER NOT NULL,
//        id_Sucursal INTEGER NOT NULL,
 //       Estado TEXT NOT NULL,
 //       Codigo_Barras TEXT,
 //       FOREIGN KEY (Id_Usuario) REFERENCES Usuarios(Id_Usuario),
  //      FOREIGN KEY (id_Sucursal) REFERENCES Sucursales(id_Sucursal)
 //   )
//`, (err) => {
//    if (err) {
//        console.error("Error creando tabla Solicitudes:", err.message);
//    } else {
//        console.log("Tabla Solicitudes lista.");
//    }
//});

//db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
 //   if (err) {
  //      return console.error("Error consultando tablas:", err.message);
 //   }
 //   console.log("Tablas en la base de datos:");
 //   rows.forEach(row => {
  //      console.log(row.name);
 //   });
//});

//const sucursales = ["Acevedo", "Itagui", "San Antonio"];
//sucursales.forEach(nombre => {
 //   db.run(
 //       "INSERT OR IGNORE INTO Sucursales (Nombre_Sucursal) VALUES (?)",
 //       [nombre],
 //       (err) => {
 //           if (err) console.error("Error insertando sucursal:", err.message);
  //      }
 //   );
//});

//db.all("SELECT * FROM Sucursales", [], (err, rows) => {
  //  if (err) {
  //      return console.error("Error consultando sucursales:", err.message);
 //   }
 //   console.log("Sucursales registradas:");
 //   rows.forEach(row => {
 //       console.log(row);
 //   });
//});




db.all(`
    SELECT so.id_Solicitud, u.Nombre, u.Apellido, u.Cedula, u.Correo, s.Nombre_Sucursal, so.Estado, so.Codigo_Barras
    FROM Solicitudes so
    JOIN Usuarios u ON so.Id_Usuario = u.Id_Usuario
    JOIN Sucursales s ON so.id_Sucursal = s.id_Sucursal
`, [], (err, rows) => {
    if (err) {
        return console.error("Error consultando Solicitudes:", err.message);
    }
    console.log("Solicitudes registradas:");
    rows.forEach(row => {
        console.log(row);
    });
});


