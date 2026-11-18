const niveles = { error: 0, warn: 1, info: 2 };
function emitir(nivel, evento, datos = {}) {
  const minimo = process.env.LOG_NIVEL || 'info';
  if (niveles[nivel] > (niveles[minimo] ?? niveles.info)) return;
  const error = datos.error;
  const contexto = error ? { nombre: error.name, mensaje: error.message } : datos;
  console[nivel](JSON.stringify({ fecha: new Date().toISOString(), nivel, evento, ...contexto }));
}
export const registro = Object.fromEntries(
  Object.keys(niveles).map((nivel) => [nivel, (evento, datos) => emitir(nivel, evento, datos)]),
);
