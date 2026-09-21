// Horarios de atención y cupos para reclamar la Cívica en los PAC.
// Todo lo que se puede ajustar está en CONFIG; las franjas se generan a partir de ahí
// (en la base de datos solo se guardan las citas, nunca las franjas vacías).

const CONFIG = {
    // Zona horaria de Colombia (UTC-5, sin horario de verano)
    UTC_OFFSET_HORAS: -5,

    // Días de atención: 0 = domingo ... 6 = sábado (lunes a sábado)
    DIAS_ATENCION: [1, 2, 3, 4, 5, 6],

    // Escritorios por PAC. Por ahora son solo informativos: los cupos ya salen de
    // CUPOS_WEB_POR_HORA (de 12:00 a 2:00 p. m. hay 2 escritorios por el almuerzo escalonado).
    ESCRITORIOS_POR_SEDE: 3,
    ESCRITORIOS_EN_ALMUERZO: 2,

    // Cupos WEB por HORA (desde/hasta en horas, 24 h). Se reparten en franjas de 15 minutos.
    // Total: 8*2 + 10*2 + 7*2 + 10*2 = 70 cupos web al día por PAC.
    CUPOS_WEB_POR_HORA: [
        { desde: 8, hasta: 10, cupos: 8 },
        { desde: 10, hasta: 12, cupos: 10 },
        { desde: 12, hasta: 14, cupos: 7 },
        { desde: 14, hasta: 16, cupos: 10 }
    ],
    MINUTOS_POR_FRANJA: 15,

    // Sobreagendamiento web: se agenda un poco más de lo que se atiende porque
    // siempre hay quien no llega (0.10 = 10 %, o sea 77 citas al día en vez de 70).
    SOBREAGENDAMIENTO_WEB: 0.10,

    // Estos cupos NO se reservan en la página: solo se muestran como información.
    CUPOS_PRESENCIALES_DIA: 30,
    CUPOS_ASISTIDOS_DIA: 22,

    // Reglas de agendamiento
    DIAS_MAX_ANTICIPACION: 15,
    HORAS_MIN_ANTICIPACION: 2
};

const dosDigitos = (n) => String(n).padStart(2, '0');

// Reparte los cupos de una hora entre sus franjas lo más parejo posible (8 → 2,2,2,2; 10 → 2,3,2,3)
function repartirHora(cupos, franjas) {
    return Array.from({ length: franjas }, (_, i) =>
        Math.floor(((i + 1) * cupos) / franjas) - Math.floor((i * cupos) / franjas));
}

// Franjas del día: [{ hora: '08:00', cupos: 2 }, ...] con el sobreagendamiento ya aplicado.
// El extra se reparte de forma proporcional a lo largo del día (acumulado redondeado).
function generarFranjas() {
    const porHora = 60 / CONFIG.MINUTOS_POR_FRANJA;
    const base = [];
    CONFIG.CUPOS_WEB_POR_HORA.forEach(({ desde, hasta, cupos }) => {
        for (let h = desde; h < hasta; h++) {
            repartirHora(cupos, porHora).forEach((c, i) => {
                base.push({ hora: `${dosDigitos(h)}:${dosDigitos(i * CONFIG.MINUTOS_POR_FRANJA)}`, cupos: c });
            });
        }
    });

    let acumuladoBase = 0;
    let acumuladoWeb = 0;
    return base.map(({ hora, cupos }) => {
        acumuladoBase += cupos;
        const nuevoAcumulado = Math.round(acumuladoBase * (1 + CONFIG.SOBREAGENDAMIENTO_WEB));
        const conExtra = nuevoAcumulado - acumuladoWeb;
        acumuladoWeb = nuevoAcumulado;
        return { hora, cupos: conExtra };
    });
}

const FRANJAS = generarFranjas();
const CAPACIDAD = new Map(FRANJAS.map(({ hora, cupos }) => [hora, cupos]));
const CUPOS_WEB_DIA = FRANJAS.reduce((suma, f) => suma + f.cupos, 0);

// "Ahora" en hora de Colombia, expresado como fecha/hora de reloj en UTC (así no depende de la zona del servidor)
function ahoraLocal() {
    return new Date(Date.now() + CONFIG.UTC_OFFSET_HORAS * 3600 * 1000);
}

const aTexto = (d) => d.toISOString().slice(0, 10);

// Días en los que se puede sacar cita: desde hoy hasta DIAS_MAX_ANTICIPACION, sin días de descanso
function fechasReservables() {
    const hoy = ahoraLocal();
    const fechas = [];
    for (let i = 0; i <= CONFIG.DIAS_MAX_ANTICIPACION; i++) {
        const dia = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + i));
        if (CONFIG.DIAS_ATENCION.includes(dia.getUTCDay())) fechas.push(aTexto(dia));
    }
    return fechas;
}

// ¿Se puede reservar esa fecha y hora? (día habilitado, franja existente y con la anticipación mínima)
function franjaReservable(fecha, hora) {
    if (!CAPACIDAD.has(hora) || !fechasReservables().includes(fecha)) return false;
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const [h, m] = hora.split(':').map(Number);
    const inicio = Date.UTC(anio, mes - 1, dia, h, m);
    return inicio - ahoraLocal().getTime() >= CONFIG.HORAS_MIN_ANTICIPACION * 3600 * 1000;
}

module.exports = {
    CONFIG,
    FRANJAS,
    CUPOS_WEB_DIA,
    capacidad: (hora) => CAPACIDAD.get(hora) ?? 0,
    fechasReservables,
    franjaReservable,
    hoy: () => aTexto(ahoraLocal())
};
