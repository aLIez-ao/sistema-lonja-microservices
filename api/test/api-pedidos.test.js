import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, modelos } from './ayuda.js';
import { validarRespuesta } from './contrato.js';
import { detenerColaTrabajos } from '../shared/helpers/colaTrabajos.js';
const { default: app } = await import('../app.js');
let server, base, access, compradorAccess, personalAccess, usuario, catalogo, pedido, lote;
before(async () => {
  await db.sync({ force: true });
  const tipo = await modelos.Tipo.create({ nombre: 'Pescado' });
  catalogo = await modelos.EspecieCatalogo.create({ nombre: 'Robalo REST', id_tpo: tipo.id_tpo });
  const cpr = await modelos.Comprador.create({
    nombre: 'Compradora',
    apellido_paterno: 'REST',
    correo: 'pedidos-api@example.test',
  });
  usuario = await modelos.Usuario.create({
    usuario: 'compradora-rest',
    nombre_completo: 'Compradora REST',
    correo: cpr.correo,
    password: 'Compradora123',
    rol: 'comprador',
    email_verificado: true,
    codigo_cpr: cpr.codigo_cpr,
  });
  await modelos.Usuario.create({
    usuario: 'personal-rest',
    nombre_completo: 'Personal REST',
    password: 'Personal123',
    rol: 'capturista',
  });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
  compradorAccess = (await pedir('POST', '/auth/sesion', { usuario: usuario.usuario, password: 'Compradora123' })).datos
    .access;
  personalAccess = (await pedir('POST', '/auth/sesion', { usuario: 'personal-rest', password: 'Personal123' })).datos
    .access;
  access = compradorAccess;
});
after(async () => {
  await detenerColaTrabajos();
  await new Promise((resolve) => server.close(resolve));
  await db.close();
});
async function pedir(method, ruta, body, clave, extras = {}) {
  const r = await fetch(base + ruta, {
    method,
    headers: {
      Accept: 'application/json',
      ...(access && { Authorization: `Bearer ${access}` }),
      ...(body && { 'Content-Type': 'application/json' }),
      ...(clave && { 'Idempotency-Key': clave }),
      ...extras,
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  const pdf = r.headers.get('content-type')?.includes('application/pdf');
  const datos = r.status === 204 ? null : pdf ? Buffer.from(await r.arrayBuffer()) : await r.json();
  validarRespuesta(method, ruta.replace(/\/\d+(?=\/|$)/g, '/{id}'), r, pdf ? datos.toString('base64') : datos);
  return { r, datos };
}
async function llenarCarrito() {
  const l = await modelos.Lote.create({ kilos: 10, numero_cajas: 1, precio_kilo_salida: '35.50' });
  await modelos.Especie.create({
    id_lte: l.id_lte,
    id_cat: catalogo.id_cat,
    id_tpo: catalogo.id_tpo,
    nombre: catalogo.nombre,
  });
  await modelos.CarritoItem.create({ id_usuario: usuario.id, id_lte: l.id_lte });
  return l;
}
test('crear exige clave y los reintentos concurrentes devuelven un solo pedido', async () => {
  lote = await llenarCarrito();
  assert.equal((await pedir('GET', '/pedidos/checkout')).r.status, 200);
  assert.equal((await pedir('POST', '/pedidos', { entrega: 'recoger' })).r.status, 400);
  const resultados = await Promise.all([
    pedir('POST', '/pedidos', { entrega: 'recoger' }, 'crear-1'),
    pedir('POST', '/pedidos', { entrega: 'recoger' }, 'crear-1'),
  ]);
  assert.ok(resultados.every((r) => r.r.status === 201));
  assert.deepEqual(resultados[0].datos, resultados[1].datos);
  pedido = resultados[0].datos.datos;
  assert.equal(await modelos.Pedido.count(), 1);
  assert.equal(await modelos.CarritoItem.count({ where: { id_usuario: usuario.id } }), 0);
  assert.equal((await pedir('POST', '/pedidos', { entrega: 'domicilio' }, 'crear-1')).r.status, 409);
  assert.equal((await pedir('GET', `/pedidos/${pedido.id_ped}`)).datos.datos.pedido.id_usuario, usuario.id);
});
test('pago en efectivo y dos cobros con la misma clave no duplican ventas', async () => {
  assert.equal(
    (await pedir('POST', `/pedidos/${pedido.id_ped}/pago`, { metodo: 'efectivo' }, 'efectivo-1')).r.status,
    200,
  );
  access = personalAccess;
  const resultados = await Promise.all([
    pedir('POST', `/pedidos/${pedido.id_ped}/cobro`, {}, 'cobro-1'),
    pedir('POST', `/pedidos/${pedido.id_ped}/cobro`, {}, 'cobro-1'),
  ]);
  assert.deepEqual(
    resultados.map((r) => r.r.status),
    [200, 200],
  );
  assert.equal(await modelos.Compra.count({ where: { id_ped: pedido.id_ped } }), 1);
  access = compradorAccess;
  const factura = await pedir('GET', `/compras/${lote.id_lte}/factura`, null, null, { Accept: 'application/pdf' });
  assert.equal(factura.r.status, 200);
  assert.equal(factura.datos.subarray(0, 5).toString(), '%PDF-');
});
test('repetir un pago rechazado con la misma clave no consume más intentos', async () => {
  await llenarCarrito();
  const nuevo = (await pedir('POST', '/pedidos', { entrega: 'recoger' }, 'crear-2')).datos.datos;
  const cuerpo = { metodo: 'tarjeta', tarjeta: { numero: '4000000000000002', mes: 12, anio: 2040, cvv: '123' } };
  for (let i = 0; i < 5; i++)
    assert.equal((await pedir('POST', `/pedidos/${nuevo.id_ped}/pago`, cuerpo, 'rechazado-1')).r.status, 422);
  assert.equal((await modelos.Pedido.findByPk(nuevo.id_ped)).estado, 'pendiente_pago');
  const pagado = await pedir('POST', `/pedidos/${nuevo.id_ped}/pago`, { metodo: 'transferencia' }, 'transferencia-1');
  assert.equal(pagado.r.status, 200);
  assert.equal(pagado.datos.datos.estado, 'pagado');
  const registros = await modelos.Idempotencia.findAll();
  assert.doesNotMatch(JSON.stringify(registros), /4000000000000002|"cvv"/);
});

test(
  'MariaDB: dos compradores reservan simultáneamente y solo uno obtiene el lote',
  { skip: db.getDialect() !== 'mariadb' },
  async () => {
    const compartido = await llenarCarrito();
    const comprador = await modelos.Comprador.create({
      nombre: 'Segundo',
      apellido_paterno: 'Concurrente',
      correo: 'segundo-concurrente@example.test',
    });
    const segundo = await modelos.Usuario.create({
      usuario: 'segundo-concurrente',
      nombre_completo: 'Segundo Concurrente',
      correo: comprador.correo,
      password: 'CompradorSegundo123',
      rol: 'comprador',
      email_verificado: true,
      codigo_cpr: comprador.codigo_cpr,
    });
    await modelos.CarritoItem.create({ id_usuario: segundo.id, id_lte: compartido.id_lte });
    const sesion = await pedir('POST', '/auth/sesion', { usuario: segundo.usuario, password: 'CompradorSegundo123' });
    const respuestas = await Promise.all(
      [compradorAccess, sesion.datos.access].map((token, i) =>
        fetch(base + '/pedidos', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
            'Idempotency-Key': 'reserva-concurrente-' + i,
          },
          body: JSON.stringify({ entrega: 'recoger' }),
        }),
      ),
    );
    assert.deepEqual(respuestas.map((r) => r.status).sort(), [201, 409]);
    for (const respuesta of respuestas) validarRespuesta('POST', '/pedidos', respuesta, await respuesta.json());
    assert.equal(await modelos.PedidoItem.count({ where: { id_lte: compartido.id_lte } }), 1);
  },
);
