// Selector de cita en dos pasos: día y hora.
// Requiere util.js. Los cupos los calcula el servidor (horarios.js): aquí solo se muestran.

const DIAS_POR_PAGINA = 5;

// 'AAAA-MM-DD' → 'Lunes 21 de septiembre'
function fechaLarga(fecha) {
  const texto = formatearFecha(fecha).replace(',', '');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Suma días a una fecha 'AAAA-MM-DD'
function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

// Dibuja el selector dentro de `contenedor`. Opciones:
//   onContinuar: función que se llama al pulsar el botón de la barra inferior
//   textoContinuar: texto de ese botón (por defecto "Continuar")
// Uso:
//   const cita = crearSelectorCita(div, { onContinuar });
//   cita.cargar(nombreDelPAC);   // carga los horarios de ese PAC
//   cita.valor();                // { fecha, hora } o null si falta elegir
//   cita.recargar();             // vuelve a consultar los cupos (p. ej. si otra persona tomó la hora)
function crearSelectorCita(contenedor, { onContinuar, textoContinuar = 'Continuar' } = {}) {
  contenedor.innerHTML = `
    <span class="etiqueta requerido" id="citaTitulo">Día y hora de la cita</span>
    <p class="ayuda" id="citaMensaje">Primero elige un punto de atención.</p>
    <div id="citaContenido" hidden>
      <button type="button" class="btn btn-atajo" id="citaAtajo">Elegir el primer cupo disponible</button>

      <h3 class="paso">1. Elige el día</h3>
      <div class="dias" id="citaDias" role="radiogroup" aria-label="Día de la cita"></div>
      <div class="paginas">
        <button type="button" class="btn btn-secundario" id="citaAnterior">Días anteriores</button>
        <button type="button" class="btn btn-secundario" id="citaSiguiente">Ver más días</button>
      </div>

      <h3 class="paso">2. Elige la hora</h3>
      <div id="citaHoras" aria-live="polite"></div>
      <p class="ayuda" id="citaAyuda"></p>
    </div>
    <div class="barra-cita no-imprimir" id="citaBarra" hidden>
      <p class="resumen" id="citaResumen" aria-live="polite"></p>
      <button type="button" class="btn" id="citaContinuar" disabled>${esc(textoContinuar)}</button>
    </div>`;

  const $ = (id) => contenedor.querySelector(`#${id}`);
  const mensaje = $('citaMensaje');
  const contenido = $('citaContenido');
  const cajaDias = $('citaDias');
  const cajaHoras = $('citaHoras');
  const barra = $('citaBarra');
  const botonContinuar = $('citaContinuar');

  let sucursal = '';
  let dias = [];      // [{ fecha, franjas: [{ hora, cupos, libres, disponible }] }]
  let hoy = '';
  let pagina = 0;
  let seleccion = { fecha: '', hora: '' };

  const franjaLibre = (f) => f.disponible && f.libres > 0;
  const diaLibre = (dia) => dia.franjas.some(franjaLibre);

  // Deja espacio al final de la página para que la barra fija no tape el contenido
  function ajustarBarra() {
    const visible = !barra.hidden && barra.offsetHeight > 0; // 0 si un contenedor padre está oculto
    document.body.style.paddingBottom = visible ? `${barra.offsetHeight + 16}px` : '';
  }

  function actualizarResumen() {
    const completo = seleccion.fecha && seleccion.hora;
    $('citaResumen').textContent = completo
      ? `Elegiste: ${fechaLarga(seleccion.fecha)}, ${formatearHora(seleccion.hora)}`
      : seleccion.fecha
        ? `Elegiste: ${fechaLarga(seleccion.fecha)}. Ahora elige la hora.`
        : 'Elige un día y una hora.';
    botonContinuar.disabled = !completo;
    ajustarBarra();
  }

  function marcaDelDia(fecha) {
    if (fecha === hoy) return 'Hoy';
    if (fecha === sumarDias(hoy, 1)) return 'Mañana';
    return '';
  }

  function dibujarDias() {
    const inicio = pagina * DIAS_POR_PAGINA;
    cajaDias.innerHTML = dias.slice(inicio, inicio + DIAS_POR_PAGINA).map((dia) => {
      const libre = diaLibre(dia);
      const marca = marcaDelDia(dia.fecha);
      return `<label class="tarjeta-dia${libre ? '' : ' agotado'}">
        <input type="radio" name="citaDia" value="${esc(dia.fecha)}"${libre ? '' : ' disabled'}${dia.fecha === seleccion.fecha ? ' checked' : ''}>
        <span><b>${esc(fechaLarga(dia.fecha))}</b>${libre
          ? (marca ? `<em class="marca">${marca}</em>` : '')
          : '<em class="sin-cupos">Sin cupos</em>'}</span>
      </label>`;
    }).join('');
    $('citaAnterior').disabled = pagina === 0;
    $('citaSiguiente').disabled = inicio + DIAS_POR_PAGINA >= dias.length;
  }

  function dibujarHoras() {
    const dia = dias.find((d) => d.fecha === seleccion.fecha);
    if (!dia) {
      cajaHoras.innerHTML = '<p class="ayuda">Elige un día para ver las horas.</p>';
      return;
    }
    const grupo = (titulo, franjas) => franjas.length === 0 ? '' : `
      <h4 class="grupo">${titulo}</h4>
      <div class="horas">${franjas.map((f) => {
        const libre = franjaLibre(f);
        const texto = formatearHora(f.hora); // '8:45 a. m.' → '8:45' y 'a. m.' en dos líneas
        const corte = texto.indexOf(' ');
        const horaSola = texto.slice(0, corte);
        const jornada = texto.slice(corte + 1);
        const nota = !libre ? '<em class="nota">No disponible</em>' : f.libres <= 2 ? '<em class="nota ultimos">Últimos cupos</em>' : '';
        return `<label class="hora${libre ? '' : ' agotada'}">
          <input type="radio" name="citaHora" value="${esc(f.hora)}"${libre ? '' : ' disabled'}${f.hora === seleccion.hora ? ' checked' : ''}>
          <span><strong>${esc(horaSola)}</strong><small>${esc(jornada)}</small>${nota}</span>
        </label>`;
      }).join('')}</div>`;
    cajaHoras.innerHTML =
      grupo('Mañana', dia.franjas.filter((f) => f.hora < '12:00')) +
      grupo('Tarde', dia.franjas.filter((f) => f.hora >= '12:00'));
  }

  function elegirDia(fecha) {
    if (fecha === seleccion.fecha) return;
    seleccion = { fecha, hora: '' };
    dibujarHoras();
    actualizarResumen();
  }

  cajaDias.addEventListener('change', (e) => elegirDia(e.target.value));

  cajaHoras.addEventListener('change', (e) => {
    seleccion.hora = e.target.value;
    actualizarResumen();
  });

  $('citaAnterior').addEventListener('click', () => { pagina--; dibujarDias(); });
  $('citaSiguiente').addEventListener('click', () => { pagina++; dibujarDias(); });

  // Atajo: el primer día y la primera hora con cupo
  $('citaAtajo').addEventListener('click', () => {
    for (const dia of dias) {
      const franja = dia.franjas.find(franjaLibre);
      if (!franja) continue;
      seleccion = { fecha: dia.fecha, hora: franja.hora };
      pagina = Math.floor(dias.indexOf(dia) / DIAS_POR_PAGINA);
      dibujarDias();
      dibujarHoras();
      actualizarResumen();
      cajaHoras.scrollIntoView({ block: 'center', behavior: 'smooth' }); // deja a la vista la hora elegida
      return;
    }
  });

  botonContinuar.addEventListener('click', () => onContinuar && onContinuar());

  function vaciar(texto) {
    dias = [];
    seleccion = { fecha: '', hora: '' };
    contenido.hidden = true;
    barra.hidden = true;
    mensaje.hidden = false;
    mensaje.textContent = texto;
    ajustarBarra();
  }

  async function cargarHorarios() {
    const { ok, datos } = await pedirJSON(`/horarios/tabla?sucursal=${encodeURIComponent(sucursal)}`);
    if (!ok) return vaciar(datos.mensaje || 'No se pudieron cargar los horarios. Intenta de nuevo.');
    if (datos.dias.length === 0) return vaciar('No hay horarios disponibles por ahora.');

    dias = datos.dias;
    hoy = datos.hoy;
    // Si la hora elegida ya se agotó (otra persona la tomó), se pide elegir de nuevo
    const dia = dias.find((d) => d.fecha === seleccion.fecha);
    if (!dia || !diaLibre(dia)) seleccion = { fecha: '', hora: '' };
    else if (!dia.franjas.some((f) => f.hora === seleccion.hora && franjaLibre(f))) seleccion.hora = '';

    mensaje.hidden = true;
    contenido.hidden = false;
    barra.hidden = false;
    pagina = seleccion.fecha ? Math.floor(dias.findIndex((d) => d.fecha === seleccion.fecha) / DIAS_POR_PAGINA) : 0;
    dibujarDias();
    dibujarHoras();
    $('citaAyuda').textContent = `También atendemos sin cita en la sede (${datos.sinCita.presenciales} turnos presenciales y ` +
      `${datos.sinCita.asistidos} asistidos al día). Con cita web tienes tu hora asegurada.`;
    actualizarResumen();
  }

  new ResizeObserver(ajustarBarra).observe(barra); // cambia de alto con el texto o al ocultarse

  return {
    cargar(nombrePunto) {
      sucursal = nombrePunto;
      seleccion = { fecha: '', hora: '' };
      if (!sucursal) return Promise.resolve(vaciar('Primero elige un punto de atención.'));
      mensaje.hidden = false;
      mensaje.textContent = 'Cargando horarios…';
      return cargarHorarios();
    },
    recargar: cargarHorarios,
    valor: () => (seleccion.fecha && seleccion.hora ? { ...seleccion } : null)
  };
}
