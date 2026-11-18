import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, modelos } from './ayuda.js';
import { validarRespuesta } from './contrato.js';
import { detenerColaTrabajos } from '../shared/helpers/colaTrabajos.js';
const { default: app } = await import('../app.js');
let server, base, access, cpr, lote, compra;
before(async () => {
  await db.sync({ force: true });
  await modelos.Usuario.create({
    usuario: 'admin-ventas',
    nombre_completo: 'Administrador Ventas',
    password: 'Administrador123',
    rol: 'admin',
  });
  const tipo = await modelos.Tipo.create({ nombre: 'Pescado' });
  const catalogo = await modelos.EspecieCatalogo.create({ nombre: 'Atún REST', id_tpo: tipo.id_tpo });
  lote = await modelos.Lote.create({ kilos: 10, numero_cajas: 1, precio_kilo_salida: '30.00' });
  await modelos.Especie.create({
    id_lte: lote.id_lte,
    id_cat: catalogo.id_cat,
    id_tpo: tipo.id_tpo,
    nombre: catalogo.nombre,
  });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
  access = (await pedir('POST', '/auth/sesion', { usuario: 'admin-ventas', password: 'Administrador123' })).datos
    .access;
});
after(async () => {
  await detenerColaTrabajos();
  await new Promise((resolve) => server.close(resolve));
  await db.close();
});
async function pedir(
  method,
  ruta,
  body,
  headers = {},
  contratoRuta = ruta.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/{id}'),
) {
  const r = await fetch(base + ruta, {
    method,
    headers: {
      Accept: 'application/json',
      ...(access && { Authorization: `Bearer ${access}` }),
      ...(body && { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  const media = r.headers.get('content-type') || '';
  const datos =
    r.status === 204
      ? null
      : media.includes('pdf')
        ? Buffer.from(await r.arrayBuffer())
        : media.includes('csv')
          ? await r.text()
          : await r.json();
  validarRespuesta(method, contratoRuta, r, Buffer.isBuffer(datos) ? datos.toString('base64') : datos);
  return { r, datos };
}
test('compradores y venta en mostrador validan entradas, calculan importes y no duplican lotes', async () => {
  const creada = await pedir('POST', '/compradores', {
    nombre: '=SUM(1,1)',
    apellido_paterno: 'Cliente',
    correo: 'ventas-api@example.test',
    direccion: 'Puerto',
  });
  assert.equal(creada.r.status, 201);
  cpr = creada.datos.datos;
  const venta = await pedir('POST', '/compras', {
    id_cmp: lote.id_lte,
    codigo_cpr: cpr.codigo_cpr,
    precio_kilo_final: '35.50',
  });
  assert.equal(venta.r.status, 201);
  compra = venta.datos.datos;
  assert.equal(compra.precio_total, '355.00');
  assert.equal(compra.moneda, 'MXN');
  assert.equal(
    (await pedir('POST', '/compras', { id_cmp: lote.id_lte, codigo_cpr: cpr.codigo_cpr, precio_kilo_final: '35.50' })).r
      .status,
    409,
  );
  assert.equal((await pedir('DELETE', `/compradores/${cpr.codigo_cpr}`)).r.status, 409);
  assert.equal((await pedir('GET', '/compras?tamano=1')).datos.meta.total, 1);
});
test('editar una compra exige la versión vigente y mantiene el cálculo del servidor', async () => {
  const actual = await pedir('GET', `/compras/${compra.id_cmp}`);
  assert.equal((await pedir('PATCH', `/compras/${compra.id_cmp}`, { precio_kilo_final: '40.00' })).r.status, 428);
  const cambio = await pedir(
    'PATCH',
    `/compras/${compra.id_cmp}`,
    { precio_kilo_final: '40.00' },
    { 'If-Match': actual.r.headers.get('etag') },
  );
  assert.equal(cambio.r.status, 200);
  assert.equal(cambio.datos.datos.precio_total, '400.00');
  assert.equal(
    (
      await pedir(
        'PATCH',
        `/compras/${compra.id_cmp}`,
        { precio_kilo_final: '41.00' },
        { 'If-Match': actual.r.headers.get('etag') },
      )
    ).r.status,
    412,
  );
});
test('reportes JSON, CSV y PDF comparten datos y el CSV neutraliza fórmulas', async () => {
  const anio = new Date().getFullYear(),
    ruta = '/reportes/' + anio;
  const json = await pedir('GET', ruta, null, {}, '/reportes/{anio}');
  assert.equal(json.r.status, 200);
  assert.equal(Number(json.datos.datos.totalesAnio.total), 400);
  const csv = await pedir('GET', ruta, null, { Accept: 'text/csv' }, '/reportes/{anio}');
  assert.equal(csv.r.status, 200);
  assert.match(csv.datos, /"'=SUM\(1,1\) Cliente"/);
  const pdf = await pedir('GET', ruta, null, { Accept: 'application/pdf' }, '/reportes/{anio}');
  assert.equal(pdf.r.status, 200);
  assert.equal(pdf.datos.subarray(0, 5).toString(), '%PDF-');
  assert.equal((await pedir('GET', ruta, null, { Accept: 'image/png' }, '/reportes/{anio}')).r.status, 406);
});

test('dashboard y búsqueda por entidad conservan sus cifras y no interpretan comodines SQL', async () => {
  const tablero = await pedir('GET', '/dashboard');
  assert.equal(tablero.r.status, 200);
  assert.equal(tablero.datos.datos.lotes.vendidos, await modelos.Compra.count());
  for (const entidad of ['compras', 'lotes', 'especies', 'catalogo', 'compradores', 'tipos', 'usuarios']) {
    for (const q of ['REST', '1', '%_']) {
      const resultado = await pedir('GET', '/buscar/sugerencias?' + new URLSearchParams({ entidad, q }));
      assert.equal(resultado.r.status, 200);
      assert.ok(Array.isArray(resultado.datos.datos));
      assert.ok(resultado.datos.datos.length <= 8);
      if (q === '%_') assert.equal(resultado.datos.datos.length, 0);
    }
  }
});
