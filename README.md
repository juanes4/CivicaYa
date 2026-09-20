# CívicaYa

Reclama tu **Cívica personalizada** sin hacer fila.

Las personas registran sus datos con anticipación desde la web, eligen la sucursal donde recogerán la tarjeta y solo tienen que ir al punto de atención del Metro de Medellín a mostrar su documento y reclamarla. El objetivo es distribuir la afluencia de personas y evitar aglomeraciones en los puntos de entrega.

## Cómo funciona

1. La persona crea una cuenta con su correo y contraseña.
2. Diligencia el formulario (nombre, cédula, fecha de nacimiento, teléfono, dirección) y elige la sucursal.
3. El sistema genera la solicitud con un código de barras y estado `PENDIENTE`.
4. Un administrador la pasa a `CONFIRMADO` cuando la tarjeta está lista y a `ENTREGADO` cuando la persona la reclama.

## Funcionalidades

- Registro e inicio de sesión (contraseñas con bcrypt, sesiones con express-session).
- Formulario de solicitud por sucursal (Acevedo, Itagüí, San Antonio) con código de barras.
- Vista de la solicitud para el usuario.
- Panel de administración: listar solicitudes por sucursal, confirmar, marcar entregas y eliminar registros.

### Pendiente

- Asignación de **horarios de atención** para repartir la demanda (núcleo de la idea; aún no implementado).
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
schema.sql         Esquema de la base de datos
scripts/init-db.js Inicializa la base y el admin
Project/           Páginas HTML e imágenes
```
