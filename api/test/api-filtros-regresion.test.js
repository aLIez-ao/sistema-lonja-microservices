import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regresionRest } from './rest-regresion.js';

const ctx = regresionRest({
  async preparar(c) {
    c.pescado = await c.modelos.Tipo.create({ nombre: 'Filtro Pescado' });
    c.marisco = await c.modelos.Tipo.create({ nombre: 'Filtro Marisco' });
    c.ana = await c.modelos.Comprador.create({
      nombre: 'Ana Filtro',
      apellido_paterno: 'Pérez',
      correo: 'ana-filtro@example.test',
    });
    c.beto = await c.modelos.Comprador.create({
      nombre: 'Beto Filtro',
      apellido_paterno: 'Ruiz',
      correo: 'beto-filtro@example.test',
    });
    c.filas = [];
    for (const [nombre, tipo, kilos, fecha] of [
      ['Huachinango', c.pescado, 10, '2026-11-01T05:30:00Z'],
      ['Camarón', c.marisco, 20, '2026-11-02T16:00:00Z'],
      ['Pulpo', c.marisco, 50, '2026-11-03T16:00:00Z'],
      ['Robalo', c.pescado, 30, '2026-11-04T16:00:00Z'],
    ])
      c.filas.push(await c.lote({ nombre, tipo, kilos, fecha: new Date(fecha) }));
    for (const [i, comprador, total] of [
      [0, c.ana, '1000.00'],
      [1, c.beto, '2000.00'],
    ]) {
      await c.modelos.Compra.create({
        id_cmp: c.filas[i].lote.id_lte,
        codigo_cpr: comprador.codigo_cpr,
        precio_kilo_final: '100.00',
        precio_total: total,
        fecha: c.filas[i].lote.fecha,
      });
    }
    await c.filas[2].catalogo.update({ activo: false });
  },
});
const ids = (r, pk) => r.datos.datos.map((f) => f[pk]).sort((a, b) => a - b);

test('filtro de fecha de compras usa el día de México, incluyendo el cruce UTC', async () => {
  const octubre = await ctx.pedir('GET', '/compras?desde=2026-10-31&hasta=2026-10-31');
  assert.deepEqual(ids(octubre, 'id_cmp'), [ctx.filas[0].lote.id_lte]);
  const noviembre = await ctx.pedir('GET', '/compras?desde=2026-11-01&hasta=2026-11-02');
  assert.deepEqual(ids(noviembre, 'id_cmp'), [ctx.filas[1].lote.id_lte]);
});

test('compras combina comprador, tipo, importe y búsqueda sin mezclar coincidencias', async () => {
  const r = await ctx.pedir(
    'GET',
    '/compras?' +
      new URLSearchParams({
        comprador: String(ctx.beto.codigo_cpr),
        tipo: String(ctx.marisco.id_tpo),
        totalMin: '1500',
        totalMax: '2500',
        q: 'Camarón',
      }),
  );
  assert.deepEqual(ids(r, 'id_cmp'), [ctx.filas[1].lote.id_lte]);
  const nada = await ctx.pedir('GET', `/compras?comprador=${ctx.ana.codigo_cpr}&tipo=${ctx.marisco.id_tpo}`);
  assert.equal(nada.datos.meta.total, 0);
});

test('lotes separa disponibles y vendidos con filtros combinados de peso y tipo', async () => {
  const disponibles = await ctx.pedir(
    'GET',
    `/lotes?estado=disponibles&tipo=${ctx.marisco.id_tpo}&kilosMin=40&kilosMax=60`,
  );
  assert.deepEqual(ids(disponibles, 'id_lte'), [ctx.filas[2].lote.id_lte]);
  const vendidos = await ctx.pedir('GET', '/lotes?estado=vendidos');
  assert.deepEqual(
    ids(vendidos, 'id_lte'),
    ctx.filas.slice(0, 2).map((f) => f.lote.id_lte),
  );
});

test('especies filtra por tipo y disponibilidad, no por número de especies del lote', async () => {
  const r = await ctx.pedir('GET', `/especies?tipo=${ctx.pescado.id_tpo}&estado=disponibles`);
  assert.deepEqual([...new Set(r.datos.datos.map((e) => e.id_lte))], [ctx.filas[3].lote.id_lte]);
});

test('catálogo combina actividad y tipo y conserva fichas inactivas históricas', async () => {
  const activas = await ctx.pedir('GET', `/catalogo?activo=true&tipo=${ctx.marisco.id_tpo}`);
  assert.deepEqual(ids(activas, 'id_cat'), [ctx.filas[1].catalogo.id_cat]);
  const inactivas = await ctx.pedir('GET', '/catalogo?activo=false');
  assert.deepEqual(ids(inactivas, 'id_cat'), [ctx.filas[2].catalogo.id_cat]);
  assert.equal((await ctx.pedir('GET', `/catalogo/${ctx.filas[2].catalogo.id_cat}`)).status, 200);
});

test('compradores combina compras y correo y no duplica quien tenga varias compras', async () => {
  const con = await ctx.pedir('GET', '/compradores?compras=con&correo=con');
  assert.deepEqual(ids(con, 'codigo_cpr'), [ctx.ana.codigo_cpr, ctx.beto.codigo_cpr]);
  const sin = await ctx.pedir('GET', '/compradores?compras=con&correo=sin');
  assert.deepEqual(ids(sin, 'codigo_cpr'), []);
});

test('usuarios filtra personal, rol y verificación sin exponer hashes ni tokens', async () => {
  const sin = await ctx.crearUsuario('sin-verificar', { rol: 'capturista', email_verificado: false });
  const r = await ctx.pedir('GET', '/usuarios?seccion=personal&rol=capturista&verificado=sin');
  assert.deepEqual(ids(r, 'id'), [sin.id]);
  assert.doesNotMatch(JSON.stringify(r.datos), /password|token_recuperacion|token_verificacion|sesion_version/);
});

test('búsqueda literal y filtros impiden que un texto con SQL cambie el conjunto', async () => {
  for (const recurso of ['compras', 'compradores', 'lotes', 'especies', 'catalogo', 'tipos', 'usuarios']) {
    const r = await ctx.pedir('GET', `/${recurso}?q=` + encodeURIComponent("' OR 1=1 --"));
    assert.equal(r.status, 200);
    assert.equal(r.datos.meta.total, 0);
  }
});

test('tienda pública conserva filtros de precio y tipo y excluye ventas', async () => {
  const r = await ctx.pedir('GET', `/tienda/lotes?tipo=${ctx.pescado.id_tpo}&precioMin=10&precioMax=30`, undefined, {
    actor: null,
  });
  assert.deepEqual(ids(r, 'id_lte'), [ctx.filas[3].lote.id_lte]);
  assert.doesNotMatch(JSON.stringify(r.datos), /ana-filtro@example.test|precio_kilo_final|codigo_cpr/);
});
