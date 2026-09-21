// Utilidades compartidas por las páginas de CívicaYa

// Escapa texto antes de meterlo en innerHTML (evita inyección de HTML)
function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Muestra un aviso en un elemento .alerta; tipo: 'error' | 'exito'
function mostrarAlerta(elemento, tipo, mensaje) {
  elemento.className = `alerta ${tipo}`;
  elemento.textContent = mensaje;
  elemento.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); // por si el formulario es largo
}

// Pide JSON al servidor y devuelve { ok, status, datos }
async function pedirJSON(url, opciones) {
  const respuesta = await fetch(url, opciones);
  let datos = {};
  try {
    datos = await respuesta.json();
  } catch {
    // la respuesta no era JSON
  }
  return { ok: respuesta.ok, status: respuesta.status, datos };
}

// Envía datos como JSON con POST
function enviarJSON(url, cuerpo) {
  return pedirJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
}

// Llena un <select> con los puntos de atención (PAC) que entrega el servidor
async function cargarPuntos(select) {
  const { ok, datos } = await pedirJSON('/puntos');
  if (!ok || !Array.isArray(datos)) return false;
  datos.forEach(({ nombre }) => {
    const opcion = document.createElement('option');
    opcion.value = nombre;
    opcion.textContent = nombre;
    select.appendChild(opcion);
  });
  return true;
}

// 'AAAA-MM-DD' → 'lunes 21 de septiembre' (se usa el mediodía para evitar saltos por zona horaria)
function formatearFecha(fecha) {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
}

// 'HH:MM' (24 h) → '8:00 a. m.'
function formatearHora(hora) {
  const [h, m] = hora.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
