import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, modelos } from './ayuda.js';
import { validarRespuesta } from './contrato.js';
const { default: app } = await import('../app.js');
let server, base, access, usuario, otro, admin, lote, catalogo, lista;
before(async () => {
  await db.sync({ force: true });
  const tipo = await modelos.Tipo.create({ nombre: 'Pescado' });
  catalogo = await modelos.EspecieCatalogo.create({ nombre: 'Pargo Social', id_tpo: tipo.id_tpo });
  lote = await modelos.Lote.create({ kilos: 12, numero_cajas: 1, precio_kilo_salida: '25.00' });
  await modelos.Especie.create({
    id_lte: lote.id_lte,
    id_cat: catalogo.id_cat,
    id_tpo: tipo.id_tpo,
    nombre: catalogo.nombre,
  });
  const comprador = await modelos.Comprador.create({
    nombre: 'Ana',
    apellido_paterno: 'Pérez',
    correo: 'social@example.test',
  });
  usuario = await modelos.Usuario.create({
    usuario: 'compradora-social',
    nombre_completo: 'Ana Pérez',
    correo: comprador.correo,
    password: 'Compradora123',
    rol: 'comprador',
    email_verificado: true,
    codigo_cpr: comprador.codigo_cpr,
  });
  otro = await modelos.Usuario.create({
    usuario: 'otro-social',
    nombre_completo: 'Otro Comprador',
    password: 'Comprador123',
    rol: 'comprador',
  });
  admin = await modelos.Usuario.create({
    usuario: 'admin-social',
    nombre_completo: 'Administrador',
    password: 'Administrador123',
    rol: 'admin',
  });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
  access = (await pedir('POST', '/auth/sesion', { usuario: usuario.usuario, password: 'Compradora123' })).datos.access;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
});
async function pedir(method, ruta, body) {
  const r = await fetch(base + ruta, {
    method,
    headers: {
      ...(access && { Authorization: `Bearer ${access}` }),
      ...(body && { 'Content-Type': 'application/json' }),
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  const datos = r.status === 204 ? null : await r.json();
  validarRespuesta(method, ruta.replace(/\/\d+(?=\/|$)/g, '/{id}'), r, datos);
  return { r, datos };
}
test('carrito es propio, agregar repetidamente no duplica y los favoritos alternan', async () => {
  assert.equal((await pedir('POST', '/carrito/items', { id_lte: lote.id_lte })).datos.datos.cantidad, 1);
  assert.equal((await pedir('POST', '/carrito/items', { id_lte: lote.id_lte })).datos.datos.cantidad, 1);
  assert.equal((await pedir('GET', '/carrito')).datos.datos.items.length, 1);
  const body = { tipo: 'lote', id_ref: lote.id_lte };
  assert.equal((await pedir('POST', '/cuenta/favoritos', body)).datos.datos.total, 1);
  assert.equal((await pedir('POST', '/cuenta/favoritos', body)).datos.datos.total, 1);
  assert.equal((await pedir('POST', '/cuenta/favoritos/alternar', body)).datos.datos.favorito, false);
  assert.equal((await pedir('POST', '/cuenta/favoritos/alternar', body)).datos.datos.favorito, true);
  assert.equal((await pedir('GET', '/cuenta/barra')).datos.datos.carritoCount, 1);
  await modelos.CarritoItem.create({ id_usuario: otro.id, id_lte: lote.id_lte });
  await pedir('DELETE', '/carrito');
  assert.equal(await modelos.CarritoItem.count({ where: { id_usuario: otro.id } }), 1);
  assert.equal((await pedir('POST', '/carrito/items', { id_lte: 9999 })).r.status, 404);
});
test('las listas no admiten ids ajenos ni modificación de Favoritos', async () => {
  const creada = await pedir('POST', '/cuenta/listas', { nombre: 'Próxima compra' });
  assert.equal(creada.r.status, 201);
  lista = creada.datos.datos;
  const ruta = `/cuenta/listas/${lista.id_lista}`;
  assert.equal((await pedir('POST', ruta + '/items', { tipo: 'lote', id_ref: lote.id_lte })).r.status, 204);
  assert.equal((await pedir('GET', ruta)).datos.datos.items.length, 1);
  const ajena = await modelos.Lista.create({ id_usuario: otro.id, nombre: 'Privada' });
  assert.equal((await pedir('GET', `/cuenta/listas/${ajena.id_lista}`)).r.status, 404);
  assert.equal(
    (await pedir('POST', `/cuenta/listas/${ajena.id_lista}/items`, { tipo: 'lote', id_ref: lote.id_lte })).r.status,
    404,
  );
  const favorito = await modelos.Lista.findOne({ where: { id_usuario: usuario.id, nombre: 'Favoritos' } });
  assert.equal((await pedir('DELETE', `/cuenta/listas/${favorito.id_lista}`)).r.status, 409);
  assert.equal((await pedir('POST', ruta + '/carrito')).datos.datos.agregados, 1);
  assert.equal((await pedir('POST', ruta + '/carrito')).datos.datos.agregados, 0);
});
test('preguntas requieren moderación y las opiniones requieren una compra real', async () => {
  assert.equal((await pedir('POST', '/preguntas', { id_cat: catalogo.id_cat, texto: '¿Cuándo llegó?' })).r.status, 204);
  const pregunta = (await pedir('GET', '/cuenta/preguntas')).datos.datos.preguntas[0];
  assert.equal(pregunta.estado, 'pendiente');
  assert.equal((await pedir('POST', `/opiniones/${catalogo.id_cat}`, { estrellas: 5, texto: 'Fresco' })).r.status, 403);
  const compradorAccess = access;
  access = (await pedir('POST', '/auth/sesion', { usuario: admin.usuario, password: 'Administrador123' })).datos.access;
  assert.equal(
    (await pedir('PATCH', `/preguntas/${pregunta.id_preg}`, { estado: 'respondida', respuesta: 'Hoy por la mañana.' }))
      .r.status,
    204,
  );
  access = compradorAccess;
  assert.equal((await pedir('GET', '/cuenta/preguntas')).datos.datos.preguntas[0].respuesta, 'Hoy por la mañana.');
  await modelos.Compra.create({
    id_cmp: lote.id_lte,
    codigo_cpr: usuario.codigo_cpr,
    precio_kilo_final: '25.00',
    precio_total: '300.00',
  });
  assert.equal((await pedir('POST', `/opiniones/${catalogo.id_cat}`, { estrellas: 5, texto: 'Fresco' })).r.status, 204);
  assert.equal((await pedir('GET', '/cuenta/opiniones')).datos.datos.opiniones.length, 1);
  const detalle = await pedir('GET', `/cuenta/listas/${lista.id_lista}`);
  assert.equal(detalle.datos.datos.items[0].vendido, true);
  assert.doesNotMatch(JSON.stringify(detalle.datos), /codigo_cpr|precio_kilo_final|precio_total/);
  const publico = await (await fetch(base + `/tienda/especies/${catalogo.id_cat}`)).json();
  assert.doesNotMatch(JSON.stringify(publico), /social@example.test|Ana Pérez/);
  // Tendencia de 7 días: la venta de hoy aparece ponderada en el último día; el lote vendido ya no está disponible.
  assert.equal(publico.datos.tendencia.length, 7);
  assert.deepEqual(
    { precioMedio: Number(publico.datos.tendencia[6].precioMedio), kilos: publico.datos.tendencia[6].kilos },
    { precioMedio: 25, kilos: 12 },
  );
  assert.ok(publico.datos.tendencia.slice(0, 6).every((d) => d.precioMedio === null));
  assert.deepEqual(publico.datos.resumenLotes, { lotes: 0, kilos: 0, precioDesde: null, precioMedio: null });
});

test('la portada informa precio medio y kilos disponibles, y la ficha de lote sugiere parecidos', async () => {
  const tipo = await modelos.Tipo.findOne();
  const otroLote = await modelos.Lote.create({ kilos: 8, numero_cajas: 1, precio_kilo_salida: '40.00' });
  const tercero = await modelos.Lote.create({ kilos: 2, numero_cajas: 1, precio_kilo_salida: '20.00' });
  for (const l of [otroLote, tercero])
    await modelos.Especie.create({
      id_lte: l.id_lte,
      id_cat: catalogo.id_cat,
      id_tpo: tipo.id_tpo,
      nombre: catalogo.nombre,
    });
  const portada = (await (await fetch(base + '/tienda/portada')).json()).datos;
  assert.equal(portada.limites.kilosTotal, 10);
  assert.equal(Number(portada.limites.precioMedio), 30);
  const ficha = (await (await fetch(base + `/tienda/lotes/${otroLote.id_lte}`)).json()).datos;
  assert.deepEqual(
    ficha.parecidos.map((l) => l.id_lte),
    [tercero.id_lte],
  );
});
