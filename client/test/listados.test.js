import { test } from 'node:test';
import assert from 'node:assert/strict';
import ejs from 'ejs';
import { fileURLToPath } from 'node:url';
import { listado, consultaListado, todos } from '../helpers/listados.js';

const req = { path: '/compras', query: { q: 'Pargo', tipo: '2', tam: '10', pagina: '2', orden: 'total', dir: 'desc' } };
test('el paginador conserva búsqueda, filtros, tamaño y orden al cambiar de página', () => {
  const l = listado(req, [], { pagina: 2, tamano: 10, total: 30 });
  const url = new URL(l.urlCon({ pagina: 3 }), 'https://cliente.test');
  assert.equal(url.pathname, '/compras');
  assert.equal(url.searchParams.get('pagina'), '3');
  for (const k of ['q', 'tipo', 'tam', 'orden', 'dir']) assert.equal(url.searchParams.get(k), req.query[k]);
});

test('cambiar filtro, orden o tamaño vuelve a la primera página', () => {
  const l = listado(req, [], { pagina: 2, tamano: 10, total: 30 });
  for (const cambios of [{ q: 'Atún' }, { tipo: '1' }, { tam: 25 }, { orden: 'fecha' }]) {
    assert.equal(new URL(l.urlCon(cambios), 'https://cliente.test').searchParams.get('pagina'), '1');
  }
});

test('la plantilla muestra el resumen correcto, página actual y navegación accesible', async () => {
  const l = listado(req, [], { pagina: 2, tamano: 10, total: 30 });
  const html = await ejs.renderFile(fileURLToPath(new URL('../views/partials/paginacion.ejs', import.meta.url)), {
    l,
    etiqueta: 'compras',
  });
  assert.match(html, /Mostrando 11–20 de 30 compras/);
  assert.match(html, /aria-current="page">2</);
  assert.match(html, /aria-label="Primera página"/);
  assert.match(html, /aria-label="Última página"/);
  assert.match(html, /value="10" selected/);
  assert.match(html, /name="tipo" value="2"/);
});

test('cero filas no muestra intervalos negativos ni páginas inexistentes', () => {
  const l = listado(req, [], { pagina: 1, tamano: 10, total: 0 });
  assert.equal(l.inicio, 0);
  assert.equal(l.fin, 0);
  assert.equal(l.paginas, 1);
});

test('el adaptador traduce tam a tamano y elimina consultas estructuradas', () => {
  const q = consultaListado({ query: { ...req.query, inyectado: { rol: 'admin' } } });
  assert.equal(q.get('tamano'), '10');
  assert.equal(q.has('inyectado'), false);
});

test('las opciones de formulario recuperan todas las páginas, no solo las primeras cien', async () => {
  const llamadas = [];
  const datos = await todos(
    async (request, ruta) => {
      llamadas.push(ruta);
      const pagina = Number(new URL(ruta, 'https://api.test').searchParams.get('pagina'));
      return { datos: pagina === 1 ? Array.from({ length: 100 }, (_, i) => i + 1) : [101, 102], meta: { total: 102 } };
    },
    req,
    'compradores',
    { orden: 'nombre' },
  );
  assert.equal(datos.length, 102);
  assert.equal(llamadas.length, 2);
  assert.ok(llamadas.every((ruta) => ruta.includes('tamano=100') && ruta.includes('orden=nombre')));
});
