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
