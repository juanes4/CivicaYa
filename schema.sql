-- Esquema de CívicaYa (SQLite)
-- Los puntos de atención (tabla Sucursales) se cargan desde puntos.js.
-- Las franjas y sus cupos NO se guardan: salen de horarios.js; aquí solo están las citas.

CREATE TABLE IF NOT EXISTS Usuarios_Civica (
    Correo TEXT PRIMARY KEY,
    "Contraseña" TEXT NOT NULL,          -- hash bcrypt
    TipoUsuario TEXT NOT NULL            -- 'Normal' | 'Admin'
);

CREATE TABLE IF NOT EXISTS Usuarios (
    Id_Usuario INTEGER PRIMARY KEY AUTOINCREMENT,
    Nombre TEXT NOT NULL,
    Apellido TEXT NOT NULL,
    Cedula TEXT NOT NULL UNIQUE,
    Fecha_Nacimiento TEXT NOT NULL,
    Correo TEXT NOT NULL UNIQUE,
    Telefono TEXT,
    Direccion TEXT
);

CREATE TABLE IF NOT EXISTS Sucursales (
    id_Sucursal INTEGER PRIMARY KEY AUTOINCREMENT,
    Nombre_Sucursal TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS Solicitudes (
    id_Solicitud INTEGER PRIMARY KEY AUTOINCREMENT,
    Id_Usuario INTEGER NOT NULL,
    id_Sucursal INTEGER NOT NULL,
    Estado TEXT NOT NULL,                -- 'PENDIENTE' | 'CONFIRMADO' | 'ENTREGADO' | 'CANCELADA'
    Codigo_Barras TEXT,
    Fecha_Cita TEXT,                     -- 'AAAA-MM-DD' (vacía en solicitudes anteriores a los horarios)
    Hora_Cita TEXT,                      -- 'HH:MM' (franjas definidas en horarios.js)
    Codigo_Cita TEXT,                    -- ej. 'CV-4821'
    FOREIGN KEY (Id_Usuario) REFERENCES Usuarios(Id_Usuario),
    FOREIGN KEY (id_Sucursal) REFERENCES Sucursales(id_Sucursal)
);

-- Personas que piden que las llamemos en vez de sacar la cita por la web
CREATE TABLE IF NOT EXISTS Llamadas (
    id_Llamada INTEGER PRIMARY KEY AUTOINCREMENT,
    Nombre TEXT NOT NULL,
    Celular TEXT NOT NULL,
    Creada TEXT NOT NULL DEFAULT (datetime('now'))   -- UTC
);
