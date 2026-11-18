import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regresionRest } from './rest-regresion.js';

const ctx = regresionRest({
  async preparar(c) {
    const tipo = await c.modelos.Tipo.create({ nombre: 'Listado Pescado' });
    const lotes = [];
    for (let i = 0; i < 12; i++)
      lotes.push((await c.lote({ nombre: `Listado ${i}`, tipo, kilos: 10 + i, especies: i === 11 ? 3 : 1 })).lote);
    for (let i = 0; i < 8; i++)
      await c.modelos.Compra.create({
        id_cmp: lotes[i].id_lte,
        codigo_cpr: c.usuarios.comprador.codigo_cpr,
        precio_kilo_final: '10.00',
        precio_total: String((i + 1) * 100),
        fecha: new Date(`2026-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`),
      });
    for (let i = 0; i < 5; i++) await c.crearUsuario('listado-' + i, { rol: 'capturista' });
  },
});

for (const [recurso, pk, orden] of [
  ['tipos', 'id_tpo', 'id'],
  ['catalogo', 'id_cat', 'id'],
  ['especies', 'id_epe', 'id'],
  ['lotes', 'id_lte', 'id'],
  ['compradores', 'codigo_cpr', 'codigo'],
  ['compras', 'id_cmp', 'lote'],
  ['usuarios', 'id', 'id'],
])
  test(`paginación REST de ${recurso}: ninguna fila perdida o repetida entre páginas`, async () => {
    const primero = await ctx.pedir('GET', `/${recurso}?tamano=2&orden=${orden}&dir=asc`);
    assert.equal(primero.status, 200);
    const total = primero.datos.meta.total;
    const ids = [];
    for (let pagina = 1; pagina <= Math.ceil(total / 2); pagina++) {
      const r = await ctx.pedir('GET', `/${recurso}?tamano=2&pagina=${pagina}&orden=${orden}&dir=asc`);
      assert.equal(r.status, 200);
      assert.equal(r.datos.meta.total, total);
      assert.equal(r.datos.meta.pagina, pagina);
      assert.equal(r.datos.datos.length, Math.min(2, total - (pagina - 1) * 2));
      ids.push(...r.datos.datos.map((fila) => fila[pk]));
    }
    assert.equal(ids.length, total);
    assert.equal(new Set(ids).size, total);
    assert.deepEqual(
      ids,
      [...ids].sort((a, b) => a - b),
    );
  });

test('ordenar compras por total ordena el conjunto completo antes de paginar', async () => {
  const pagina = async (n) => (await ctx.pedir('GET', `/compras?orden=total&dir=desc&tamano=3&pagina=${n}`)).datos;
  const a = await pagina(1),
    b = await pagina(2),
    c = await pagina(3);
  assert.deepEqual(
    a.datos.map((f) => Number(f.precio_total)),
    [800, 700, 600],
  );
  assert.deepEqual(
    b.datos.map((f) => Number(f.precio_total)),
    [500, 400, 300],
  );
  assert.deepEqual(
    c.datos.map((f) => Number(f.precio_total)),
    [200, 100],
  );
  assert.equal(a.meta.total, 8);
});

test('empates mantienen orden estable y contar lotes no cuenta sus especies como filas distintas', async () => {
  const r = await ctx.pedir('GET', '/lotes?orden=cajas&dir=asc&tamano=100');
  assert.equal(r.status, 200);
  const ids = r.datos.datos.map((f) => f.id_lte);
  assert.equal(r.datos.meta.total, 12);
  assert.equal(ids.length, 12);
  assert.deepEqual(
    ids,
    [...ids].sort((a, b) => b - a),
  );
});

for (const recurso of ['lotes', 'catalogo', 'especies', 'tipos', 'compras', 'compradores', 'usuarios']) {
  test(`${recurso} devuelve una página vacía coherente para búsqueda sin coincidencias`, async () => {
    const r = await ctx.pedir('GET', `/${recurso}?q=sin-coincidencias-xyz&tamano=2&pagina=999`);
    assert.equal(r.status, 200);
    assert.equal(r.datos.meta.total, 0);
    assert.deepEqual(r.datos.datos, []);
    assert.equal(r.datos.meta.pagina, 1);
  });
  for (const query of ['pagina=0', 'pagina=10001', 'tamano=0', 'tamano=101']) {
    test(`${recurso} rechaza paginación inválida ${query}`, async () => {
      const r = await ctx.pedir('GET', `/${recurso}?${query}`);
      assert.equal(r.status, 422);
    });
  }
}

test('usuarios: búsqueda literal de % y _ sin convertirlos en comodines', async () => {
  const especial = await ctx.crearUsuario('literal', { rol: 'capturista', nombre_completo: 'Personal 50%_literal' });
  const r = await ctx.pedir('GET', '/usuarios?q=' + encodeURIComponent('%_'));
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.datos.datos.map((u) => u.id),
    [especial.id],
  );
  const cero = await ctx.pedir('GET', '/usuarios?q=' + encodeURIComponent('%_no_existe'));
  assert.equal(cero.datos.meta.total, 0);
});
