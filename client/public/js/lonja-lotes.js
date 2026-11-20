/**
 * Tabla de lotes: selección múltiple, barra de acciones en bloque y exportación
 * CSV de las filas seleccionadas. Eliminar lo hace el formulario #lotesBloque.
 */
(function () {
  'use strict';

  const barra = document.querySelector('[data-barra-bloque]');
  const todo = document.querySelector('[data-seleccionar-todo]');
  if (!barra || !todo) return;

  const casillas = () => Array.from(document.querySelectorAll('[data-casilla-bloque]'));
  const marcadas = () => casillas().filter((c) => c.checked);

  function pintar() {
    const total = casillas().length;
    const n = marcadas().length;
    barra.hidden = n === 0;
    barra.querySelector('[data-cuenta-bloque]').textContent = String(n);
    todo.checked = total > 0 && n === total;
    todo.indeterminate = n > 0 && n < total;
    casillas().forEach((c) => c.closest('tr')?.classList.toggle('fila-activa', c.checked));
  }

  todo.addEventListener('change', () => {
    casillas().forEach((c) => {
      c.checked = todo.checked;
    });
    pintar();
  });
  document.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-casilla-bloque]')) pintar();
  });
  barra.querySelector('[data-limpiar-bloque]')?.addEventListener('click', () => {
    casillas().forEach((c) => {
      c.checked = false;
    });
    pintar();
  });

  // Evita que una celda que empieza con = + - @ se interprete como fórmula en la hoja de cálculo.
  const celda = (valor) => {
    let texto = String(valor ?? '');
    if (/^[=+\-@\t\r]/.test(texto)) texto = "'" + texto;
    return /[",\n\r]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
  };

  barra.querySelector('[data-exportar-bloque]')?.addEventListener('click', () => {
    const encabezado = ['Lote', 'Fecha', 'Especies', 'Cajas', 'Kilos', 'Precio salida/kg', 'Estado'];
    const filas = marcadas().map((c) => JSON.parse(c.closest('tr').dataset.csv));
    const csv = [encabezado, ...filas].map((fila) => fila.map(celda).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'lotes-seleccionados.csv';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
  });

  pintar();
})();
