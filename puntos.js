// Puntos de Atención Cívica (PAC) donde se reclaman las tarjetas.
// El nombre se guarda en la tabla Sucursales; el orden de esta lista es el que ve el usuario.
//
// imagen: nombre (sin extensión) de la foto en Project/img/pac/. Si existe un archivo
//         con ese nombre (.jpg, .jpeg, .png o .webp) se muestra; si no, una imagen genérica.
// mapa:   búsqueda en Google Maps. Se puede reemplazar por el enlace exacto del lugar.

const mapa = (busqueda) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(busqueda)}`;

module.exports = [
    {
        nombre: 'PAC San Antonio Oriente',
        ubicacion: 'Estación San Antonio, costado oriente',
        imagen: 'san-antonio-oriente',
        mapa: mapa('Estación San Antonio Metro de Medellín')
    },
    {
        nombre: 'PAC San Antonio Occidente',
        ubicacion: 'Estación San Antonio, costado occidente',
        imagen: 'san-antonio-occidente',
        mapa: mapa('Estación San Antonio Metro de Medellín')
    },
    {
        nombre: 'PAC Acevedo',
        ubicacion: 'Estación Acevedo, Medellín',
        imagen: 'acevedo',
        mapa: mapa('Estación Acevedo Metro de Medellín')
    },
    {
        nombre: 'PAC Itagüí',
        ubicacion: 'Estación Itagüí',
        imagen: 'itagui',
        mapa: mapa('Estación Itagüí Metro de Medellín')
    },
    {
        nombre: 'PAC San Javier',
        ubicacion: 'Estación San Javier, Medellín',
        imagen: 'san-javier',
        mapa: mapa('Estación San Javier Metro de Medellín')
    },
    {
        nombre: 'PAC Niquía',
        ubicacion: 'Estación Niquía, Bello',
        imagen: 'niquia',
        mapa: mapa('Estación Niquía Metro de Medellín')
    }
];
