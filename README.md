# CívicaYa

Reclama tu **Cívica personalizada** sin hacer fila.

Las personas registran sus datos con anticipación desde la web, eligen la sucursal donde recogerán la tarjeta y solo tienen que ir al punto de atención del Metro de Medellín a mostrar su documento y reclamarla. El objetivo es distribuir la afluencia de personas y evitar aglomeraciones en los puntos de entrega.

## Cómo funciona

1. La persona crea una cuenta con su correo y contraseña.
2. Diligencia el formulario (nombre, cédula, fecha de nacimiento, teléfono, dirección), elige el PAC y **reserva día y hora** (turnos de 15 minutos).
3. El sistema genera la solicitud con un código, un código de cita (`CV-4821`) y estado `PENDIENTE`.
4. Un administrador la pasa a `CONFIRMADO` cuando la tarjeta está lista y a `ENTREGADO` cuando la persona la reclama (siempre en ese orden).

## Horarios de atención

Todo se ajusta en [horarios.js](horarios.js) (`CONFIG`): días de atención, cupos web por hora, sobreagendamiento (10 %), anticipación mínima (2 h) y máxima (15 días), y los cupos presenciales/asistidos que solo se muestran como información. Las franjas se generan desde esa configuración; en la base solo se guardan las citas (`Fecha_Cita`, `Hora_Cita`, `Codigo_Cita` en `Solicitudes`).

- Una sola solicitud en curso por persona; el cupo se comprueba y se toma en una sola sentencia SQL (nunca se sobrepasa).
- Desde «Mi solicitud» se puede cambiar el día/hora (mismo PAC) o cancelar la solicitud (`CANCELADA`, libera el cupo).
- Al iniciar, el servidor actualiza bases antiguas (agrega las columnas y tablas nuevas).

## Puntos de atención (PAC)

San Antonio Oriente, San Antonio Occidente, Acevedo, Itagüí, San Javier y Niquía. La lista vive en [puntos.js](puntos.js) (nombre, ubicación y enlace a Google Maps); el servidor la carga en la tabla `Sucursales` al iniciar y las páginas la consultan en `/puntos`.

Para mostrar la foto de un PAC, guarda el archivo en `Project/img/pac/` con el nombre indicado en `imagen` (por ejemplo `acevedo.jpg`, `san-antonio-oriente.png`). Si no hay foto se usa una imagen genérica.

## Funcionalidades

- Registro e inicio de sesión (contraseñas con bcrypt, sesiones con express-session).
- Formulario de solicitud con elección del PAC.
- Vista de la solicitud para el usuario, con su estado y código.
- Panel de administración: listar solicitudes por PAC, confirmar y marcar entregas.

### Pendiente

- Notificaciones por correo (nodemailer ya está como dependencia, sin uso todavía).

## Tecnologías

Node.js · Express 5 · SQLite (`sqlite3`) · HTML/CSS/JS · bcrypt · express-session

## Puesta en marcha

Requiere Node.js 22.9 o superior.

```bash
npm install
cp .env.example .env     # y edita SESSION_SECRET (y ADMIN_* si quieres un admin)
npm run db:init          # crea la base a partir de schema.sql
npm start
```

Abre <http://localhost:3000>.

`npm run db:init` crea el usuario administrador si defines `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `.env`.

## Variables de entorno

| Variable | Descripción | Por defecto |
|---|---|---|
| `SESSION_SECRET` | Secreto de las sesiones (obligatorio) | — |
| `PORT` | Puerto del servidor | `3000` |
| `DB_PATH` | Ruta del archivo SQLite | `./civicaya.db` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin inicial (solo `db:init`) | — |

## Estructura

```
server.js          Servidor Express y rutas
puntos.js          Lista de puntos de atención (PAC)
horarios.js        Configuración y reglas de cupos y franjas
schema.sql         Esquema de la base de datos
scripts/init-db.js Inicializa la base, los PAC y el admin
Project/           Páginas HTML, css/, js/ e img/ (solo esta carpeta se sirve al navegador)
```
