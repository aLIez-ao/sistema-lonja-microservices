import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { db, modelos } from '../../api/test/ayuda.js';
const { default: api } = await import('../../api/app.js');
import { crearAdministradorInicial, crearTiposIniciales } from '../../api/modules/accounts/index.js';
import { crearCliente } from '../app.js';
import { crearApi } from '../api.js';
import { fijarTransporteParaPruebas } from '../../api/shared/helpers/email.js';
import { detenerColaTrabajos } from '../../api/shared/helpers/colaTrabajos.js';

function navegador() {
  const cookies = new Map();
  return {
    cookies,
    async pedir(method, ruta, body) {
      const r = await fetch(base + ruta, {
        method,
        redirect: 'manual',
        headers: {
          Cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; '),
          ...(body !== undefined && { Origin: base, 'Content-Type': 'application/json' }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      for (const linea of r.headers.getSetCookie()) {
        const [par] = linea.split(';');
        const i = par.indexOf('=');
        const nombre = par.slice(0, i),
          valor = par.slice(i + 1);
        if (!valor || /Max-Age=0/i.test(linea)) cookies.delete(nombre);
        else cookies.set(nombre, decodeURIComponent(valor));
      }
      return { status: r.status, headers: r.headers, texto: await r.text() };
    },
  };
}

let servidorApi, servidorCliente, app, base;
before(async () => {
  await db.sync({ force: true });
  await crearAdministradorInicial();
  await crearTiposIniciales();
  const catalogo = await modelos.EspecieCatalogo.create({ nombre: 'Pargo API', id_tpo: 1 });
  const lote = await modelos.Lote.create({ kilos: 20, numero_cajas: 2, precio_kilo_salida: '35.50' });
  await modelos.Especie.create({ nombre: catalogo.nombre, id_cat: catalogo.id_cat, id_lte: lote.id_lte, id_tpo: 1 });
  servidorApi = api.listen(0);
  app = crearCliente({ api: crearApi({ url: `http://127.0.0.1:${servidorApi.address().port}/api/v1` }) });
  servidorCliente = app.listen(0);
  base = `http://127.0.0.1:${servidorCliente.address().port}`;
});
after(async () => {
  await detenerColaTrabajos();
  fijarTransporteParaPruebas(null);
  app.locals.sesiones.cerrar();
  await Promise.all([servidorApi, servidorCliente].map((s) => new Promise((resolve) => s.close(resolve))));
  await db.close();
});

test('el cliente renderiza portada y fichas con datos de la API real y CSP estricta', async () => {
  for (const ruta of ['/', '/tienda/lote/1', '/tienda/especie/1']) {
    const respuesta = await fetch(base + ruta);
    assert.equal(respuesta.status, 200);
    const html = await respuesta.text();
    assert.match(html, /Pargo API/);
    assert.match(respuesta.headers.get('content-security-policy'), /script-src 'self'/);
    assert.doesNotMatch(html, /AdminPrueba123|"refresh"|"access"/);
  }
  const sugerencias = await fetch(base + '/tienda/sugerencias?q=Pargo');
  assert.equal((await sugerencias.json())[0].id, 1);
});

test('solo entrega lonja_sid al navegador y cerrar sesión la elimina', async () => {
  const r = await fetch(base + '/credenciales', {
    method: 'POST',
    redirect: 'manual',
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin', password: 'AdminPrueba123' }),
  });
  assert.equal(r.status, 302);
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /lonja_sid=[a-f0-9]{64}/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.doesNotMatch(cookie, /refresh|access|_token/);
  const salir = await fetch(base + '/cerrarsesion', {
    method: 'POST',
    redirect: 'manual',
    headers: { Origin: base, Cookie: cookie.split(';')[0] },
  });
  assert.equal(salir.status, 302);
  assert.equal(await modelos.Sesion.count(), 0);
});

test('rechaza formularios de otro origen y comunica errores de credenciales', async () => {
  const datos = {
    method: 'POST',
    headers: { Origin: 'https://ajeno.invalid', 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin', password: 'incorrecta' }),
  };
  assert.equal((await fetch(base + '/credenciales', datos)).status, 403);
  datos.headers.Origin = base;
  const r = await fetch(base + '/credenciales', datos);
  assert.equal(r.status, 401);
  assert.match(await r.text(), /Revisa las credenciales/);
});

test('el formulario HTML conserva el origen y rechaza orígenes nulos o ausentes', async () => {
  const formulario = await fetch(base + '/acceso');
  assert.equal(formulario.headers.get('referrer-policy'), 'same-origin');
  assert.match(await formulario.text(), /<form action="\/credenciales" method="POST">/);
  const opciones = {
    method: 'POST',
    redirect: 'manual',
    headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ usuario: 'admin', password: 'AdminPrueba123' }).toString(),
  };
  const acceso = await fetch(base + '/credenciales', opciones);
  assert.equal(acceso.status, 302);
  assert.equal(acceso.headers.get('location'), '/dashboard');
  await fetch(base + '/cerrarsesion', {
    method: 'POST',
    headers: { Origin: base, Cookie: acceso.headers.get('set-cookie').split(';')[0] },
    redirect: 'manual',
  });
  opciones.headers.Origin = 'null';
  assert.equal((await fetch(base + '/credenciales', opciones)).status, 403);
  delete opciones.headers.Origin;
  assert.equal((await fetch(base + '/credenciales', opciones)).status, 403);
});

test('renueva transparentemente un access vencido contra la API real', async () => {
  const url = `http://127.0.0.1:${servidorApi.address().port}/api/v1`;
  const http = crearApi({ url });
  const tokens = await http.pedir('auth/sesion', {
    method: 'POST',
    body: { usuario: 'admin', password: 'AdminPrueba123' },
  });
  const claims = jwt.decode(tokens.access);
  delete claims.iat;
  delete claims.exp;
  tokens.access = jwt.sign(claims, process.env.SC_JWT, { expiresIn: -1 });
  const anterior = tokens.refresh;
  const resultados = await Promise.all([
    http.pedir('auth/yo', { sesion: tokens }),
    http.pedir('auth/yo', { sesion: tokens }),
  ]);
  assert.ok(resultados.every((r) => r.datos.rol === 'admin'));
  assert.notEqual(tokens.refresh, anterior);
  await http.pedir('auth/sesion', { method: 'DELETE', sesion: tokens });
});

test('registro, cuenta, direcciones y configuración se atienden por HTTP', async () => {
  let correo;
  fijarTransporteParaPruebas({
    sendMail: async (datos) => {
      correo = datos;
      return { messageId: 'cliente-recorrido' };
    },
  });
  const usuario = {
    nombre: 'Compradora',
    apellido_paterno: 'Cliente',
    correo: 'bff@example.test',
    password: 'Compradora123',
    password_confirmar: 'Compradora123',
    aviso_privacidad: 'on',
  };
  const post = (ruta, datos, cookie = '') =>
    fetch(base + ruta, {
      method: 'POST',
      redirect: 'manual',
      headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(datos),
    });
  const alta = await post('/registro', usuario);
  assert.equal(alta.status, 200);
  assert.match(await alta.text(), /Revisa tu correo/);
  const token = /verificar-email\/([a-f0-9]+)/.exec(correo.text)[1];
  assert.equal((await fetch(base + '/verificar-email/' + token)).status, 200);
  const login = await post('/credenciales', { usuario: usuario.correo, password: usuario.password });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  for (const ruta of [
    '/cuenta',
    '/cuenta/datos',
    '/cuenta/direcciones',
    '/cuenta/direcciones/nueva',
    '/configuracion',
  ]) {
    const r = await fetch(base + ruta, { headers: { Cookie: cookie } });
    assert.equal(r.status, 200, ruta);
  }
  const direccion = {
    alias: 'Casa BFF',
    destinatario: 'Compradora Cliente',
    telefono: '2291234567',
    calle: 'Puerto',
    num_ext: '15',
    colonia: 'Centro',
    cp: '91700',
    municipio: 'Veracruz',
    estado: 'Veracruz',
    principal: 'on',
  };
  assert.equal((await post('/cuenta/direcciones', direccion, cookie)).status, 302);
  const lista = await fetch(base + '/cuenta/direcciones', { headers: { Cookie: cookie } });
  assert.match(await lista.text(), /Casa BFF/);
  const preferencia = await post('/configuracion/guardar-rapido', { clave: 'tema', valor: 'dark' }, cookie);
  assert.deepEqual(await preferencia.json(), { ok: true });
  const cuenta = await modelos.Usuario.findOne({ where: { correo: usuario.correo } });
  assert.equal(JSON.parse(cuenta.preferencias).tema, 'dark');
  assert.equal((await fetch(base + '/usuarios', { headers: { Cookie: cookie }, redirect: 'manual' })).status, 403);
  for (const ruta of ['/cuenta/listas', '/cuenta/opiniones', '/cuenta/preguntas', '/carrito']) {
    const respuesta = await fetch(base + ruta, { headers: { Cookie: cookie } });
    assert.equal(respuesta.status, 200, ruta);
  }
  assert.equal((await post('/carrito/agregar/1', {}, cookie)).status, 200);
  const checkout = await fetch(base + '/pedido/nuevo', { headers: { Cookie: cookie } });
  assert.equal(checkout.status, 200);
  const clave = /name="clave_operacion" value="([^"]+)"/.exec(await checkout.text())[1];
  const pedido = await post('/pedido', { entrega: 'recoger', clave_operacion: clave }, cookie);
  assert.equal(pedido.status, 302);
  assert.match(pedido.headers.get('location'), /^\/pedido\/\d+\/pago$/);
  const id = /\/pedido\/(\d+)/.exec(pedido.headers.get('location'))[1];
  const pago = await fetch(base + pedido.headers.get('location'), { headers: { Cookie: cookie } });
  assert.equal(pago.status, 200);
  const clavePago = /name="clave_operacion" value="([^"]+)"/.exec(await pago.text())[1];
  const aprobado = await post(`/pedido/${id}/pagar`, { metodo: 'transferencia', clave_operacion: clavePago }, cookie);
  assert.equal(aprobado.status, 302);
  assert.equal(aprobado.headers.get('location'), `/cuenta/pedidos/${id}`);
  const pdf = await fetch(base + `/cuenta/pedidos/${id}/factura/1.pdf`, { headers: { Cookie: cookie } });
  assert.equal(pdf.status, 200);
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    '%PDF-',
  );
  await post('/cerrarsesion', {}, cookie);
});

test('el personal usa catálogo, captura de mostrador y reportes a través de la API', async () => {
  const post = (ruta, datos, cookie = '') =>
    fetch(base + ruta, {
      method: 'POST',
      redirect: 'manual',
      headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
      body: new URLSearchParams(datos),
    });
  const login = await post('/credenciales', { usuario: 'admin', password: 'AdminPrueba123' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  for (const ruta of [
    '/dashboard',
    '/tipos',
    '/tipos/crear',
    '/tipos/1',
    '/tipos/1/editar',
    '/catalogo',
    '/catalogo/crear',
    '/catalogo/1/editar',
    '/lotes',
    '/lotes/crear',
    '/lotes/1',
    '/especies',
    '/especies/crear',
    '/especies/1',
    '/compradores',
    '/compradores/crear',
    '/compras',
    '/compras/crear',
    '/pedidos',
    '/usuarios',
    '/usuarios/crear',
    '/preguntas',
    '/opiniones',
  ]) {
    const respuesta = await fetch(base + ruta, { headers: { Cookie: cookie } });
    assert.equal(respuesta.status, 200, ruta);
  }
  const comprador = await post(
    '/compradores',
    {
      nombre: 'Mostrador',
      apellido_paterno: 'Cliente',
      apellido_materno: '',
      correo: 'mostrador-bff@example.test',
      direccion: 'Puerto',
    },
    cookie,
  );
  assert.equal(comprador.status, 302);
  const cpr = await modelos.Comprador.findOne({ where: { correo: 'mostrador-bff@example.test' } });
  const lote = await post(
    '/lotes',
    { kilos: '17', numero_cajas: '2', precio_kilo_salida: '30.00', especies: '1' },
    cookie,
  );
  assert.equal(lote.status, 302);
  const lte = await modelos.Lote.findOne({ where: { kilos: 17 } });
  assert.ok(lte);
  const venta = await post(
    '/compras',
    { id_cmp: String(lte.id_lte), codigo_cpr: String(cpr.codigo_cpr), precio_kilo_final: '40.00' },
    cookie,
  );
  assert.equal(venta.status, 302);
  assert.equal(venta.headers.get('location'), `/compras/${lte.id_lte}/factura`);
  const factura = await fetch(base + venta.headers.get('location'), { headers: { Cookie: cookie } });
  assert.equal(factura.status, 200);
  const anio = new Date().getFullYear();
  for (const ruta of [
    '/reportes/diario?anio=' + anio,
    '/reportes/diario.csv?anio=' + anio,
    '/reportes/anual.pdf?anio=' + anio,
  ]) {
    const respuesta = await fetch(base + ruta, { headers: { Cookie: cookie } });
    assert.equal(respuesta.status, 200, ruta);
  }
  await post('/cerrarsesion', {}, cookie);
});

test('regresiones de cookies y preferencias contra cliente y API reales', async (t) => {
  const web = navegador();
  await t.test('la tienda anónima no solicita consentimiento y la sesión sí', async () => {
    assert.doesNotMatch((await web.pedir('GET', '/')).texto, /cookieConsentBanner/);
    assert.equal(
      (await web.pedir('POST', '/credenciales', { usuario: 'admin', password: 'AdminPrueba123' })).status,
      302,
    );
    assert.match((await web.pedir('GET', '/dashboard')).texto, /cookieConsentBanner/);
  });
  await t.test('sin consentimiento se conserva la preferencia en cuenta y no en cookie', async () => {
    assert.equal(
      (await web.pedir('POST', '/configuracion/guardar-rapido', { clave: 'tema', valor: 'dark' })).status,
      200,
    );
    assert.equal(web.cookies.has('lonja_theme'), false);
    assert.match((await web.pedir('GET', '/dashboard')).texto, /data-theme="dark"/);
  });
  await t.test('valor inválido produce 422 y no modifica preferencias', async () => {
    assert.equal(
      (await web.pedir('POST', '/configuracion/guardar-rapido', { clave: 'tema', valor: '<script>' })).status,
      422,
    );
    assert.match((await web.pedir('GET', '/dashboard')).texto, /data-theme="dark"/);
  });
  await t.test('aceptar todas escribe preferencias y retira el banner', async () => {
    assert.equal((await web.pedir('POST', '/configuracion/cookies', { nivel: 'all' })).status, 200);
    assert.equal(web.cookies.get('lonja_cookies_consent'), 'all');
    assert.equal(web.cookies.get('lonja_theme'), 'dark');
    assert.doesNotMatch((await web.pedir('GET', '/dashboard')).texto, /cookieConsentBanner/);
  });
  await t.test('selección personalizada elimina cookies de categorías rechazadas', async () => {
    await web.pedir('POST', '/configuracion/cookies', { categorias: ['accesibilidad'] });
    assert.equal(web.cookies.get('lonja_cookies_consent'), 'custom:accesibilidad');
    assert.equal(web.cookies.has('lonja_theme'), false);
    await web.pedir('POST', '/configuracion/guardar-rapido', { clave: 'moneda', valor: 'USD' });
    assert.equal(web.cookies.has('lonja_currency'), false);
  });
  await t.test('revocar consentimiento conserva tema y moneda en la cuenta', async () => {
    await web.pedir('POST', '/configuracion/cookies', { nivel: 'essential' });
    const html = (await web.pedir('GET', '/configuracion')).texto;
    assert.match(html, /data-theme="dark"/);
    assert.match(html, /value="USD" selected/);
  });
  await t.test('logout elimina la sesión y exige nuevo acceso para preferencias', async () => {
    await web.pedir('POST', '/cerrarsesion', {});
    assert.equal(web.cookies.has('lonja_sid'), false);
    assert.equal((await web.pedir('GET', '/configuracion')).status, 302);
  });
});
