import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = new URL(process.env.LONJA_PRUEBA_URL || 'https://localhost:34443');
const correoApi = process.env.LONJA_PRUEBA_CORREO || 'http://localhost:38025';
if (!['localhost', '127.0.0.1'].includes(base.hostname))
  throw new Error('El recorrido de prueba solo se ejecuta contra localhost.');
const adminPassword = process.env.LONJA_PRUEBA_ADMIN_PASSWORD;
if (!adminPassword) throw new Error('Falta LONJA_PRUEBA_ADMIN_PASSWORD.');
const cookies = new Map();
async function pedir(method, ruta, datos, { token, headers = {}, form = false } = {}) {
  const respuesta = await fetch(new URL(ruta, base), {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
    headers: {
      Accept: form ? 'text/html' : 'application/json',
      Origin: base.origin,
      Cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; '),
      ...(datos !== undefined && { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }),
      ...(token && { Authorization: 'Bearer ' + token }),
      ...headers,
    },
    ...(datos !== undefined && { body: form ? new URLSearchParams(datos) : JSON.stringify(datos) }),
  });
  for (const linea of respuesta.headers.getSetCookie()) {
    const par = linea.split(';')[0],
      i = par.indexOf('=');
    cookies.set(par.slice(0, i), par.slice(i + 1));
  }
  return respuesta;
}
const datosApi = async (method, ruta, datos, token) => {
  const r = await pedir(method, '/api/v1/' + ruta, datos, { token });
  assert.ok(r.ok, `${method} ${ruta}: ${r.status}`);
  return r.json();
};
let salud;
let ultimoError;
const esperaSalud = Number(process.env.LONJA_PRUEBA_ESPERA_MS || 120000);
assert.ok(Number.isFinite(esperaSalud) && esperaSalud > 0, 'LONJA_PRUEBA_ESPERA_MS debe ser positivo.');
const limiteSalud = Date.now() + esperaSalud;
while (Date.now() < limiteSalud) {
  try {
    salud = await pedir('GET', '/salud');
    if (salud.ok) break;
  } catch (error) {
    ultimoError = error.cause?.code || error.code || error.name;
    // Caddy puede estar terminando de emitir el certificado de localhost.
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.equal(
  salud?.status,
  200,
  `El sitio no quedó sano en ${esperaSalud} ms (HTTP ${salud?.status || 'sin respuesta'}, ${ultimoError || 'sin error de conexión'}).`,
);
const sesion = await datosApi('POST', 'auth/sesion', {
  usuario: process.env.LONJA_PRUEBA_ADMIN_USUARIO || 'admin',
  password: adminPassword,
});
const sufijo = randomUUID().slice(0, 8);
const tipo = (await datosApi('POST', 'tipos', { nombre: 'Prueba ' + sufijo }, sesion.access)).datos;
const especie = (await datosApi('POST', 'catalogo', { nombre: 'Pargo ' + sufijo, id_tpo: tipo.id_tpo }, sesion.access))
  .datos;
const lote = (
  await datosApi(
    'POST',
    'lotes',
    { kilos: 10, numero_cajas: 1, precio_kilo_salida: '35.50', especies: [especie.id_cat] },
    sesion.access,
  )
).datos;
const usuario = {
  nombre: 'Compradora',
  apellido_paterno: 'Integración',
  correo: 'integracion-' + sufijo + '@example.test',
  password: 'CompradoraPrueba2026',
  password_confirmar: 'CompradoraPrueba2026',
  aviso_privacidad: 'on',
};
assert.equal((await pedir('POST', '/registro', usuario, { form: true })).status, 200);
let token;
for (let intento = 0; intento < 20; intento++) {
  const respuesta = await fetch(correoApi + '/api/v1/message/latest');
  if (respuesta.ok) {
    const mensaje = await respuesta.json();
    token = /verificar-email\/([a-f0-9]+)/.exec(mensaje.Text || '')?.[1];
    if (token) break;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert.ok(token, 'Mailpit debe recibir el enlace de verificación.');
assert.equal((await pedir('GET', '/verificar-email/' + token)).status, 200);
assert.equal(
  (await pedir('POST', '/credenciales', { usuario: usuario.correo, password: usuario.password }, { form: true }))
    .status,
  302,
);
assert.ok(cookies.get('lonja_sid'));
assert.equal((await pedir('POST', '/carrito/agregar/' + lote.id_lte, {})).status, 200);
const formulario = await pedir('GET', '/pedido/nuevo', undefined, { form: true });
assert.equal(formulario.status, 200);
const clave = /name="clave_operacion"\s+value="([^"]+)"/.exec(await formulario.text())?.[1];
assert.ok(clave);
const creado = await pedir('POST', '/pedido', { entrega: 'recoger', clave_operacion: clave }, { form: true });
assert.equal(creado.status, 302);
const rutaPago = creado.headers.get('location');
assert.match(rutaPago, /^\/pedido\/\d+\/pago$/);
const pago = await pedir('GET', rutaPago, undefined, { form: true });
const clavePago = /name="clave_operacion"\s+value="([^"]+)"/.exec(await pago.text())?.[1];
assert.ok(clavePago);
const pagado = await pedir(
  'POST',
  rutaPago.replace('/pago', '/pagar'),
  { metodo: 'transferencia', clave_operacion: clavePago },
  { form: true },
);
assert.equal(pagado.status, 302);
const rutaPedido = pagado.headers.get('location');
assert.match(rutaPedido, /^\/cuenta\/pedidos\/\d+$/);
const pdf = await pedir('GET', rutaPedido + '/factura/' + lote.id_lte + '.pdf');
assert.equal(pdf.status, 200);
assert.equal(
  Buffer.from(await pdf.arrayBuffer())
    .subarray(0, 5)
    .toString(),
  '%PDF-',
);
await pedir('POST', '/cerrarsesion', {}, { form: true });
console.log('Contenedores verificados: registro → verificación → compra → pago simulado → factura PDF.');
