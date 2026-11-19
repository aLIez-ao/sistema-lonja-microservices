import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import YAML from 'yaml';
import { crearApi, ErrorApi } from '../api.js';
import { crearCliente } from '../app.js';

const contrato = YAML.parse(readFileSync(new URL('../../contracts/openapi.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: false });
addFormats(ajv);
ajv.addSchema({ $id: 'lonja', components: contrato.components });
const usuario = {
  id: 1,
  usuario: 'prueba',
  nombre_completo: 'Cuenta de prueba',
  rol: 'admin',
  correo: null,
  email_verificado: true,
};
const problema = (status, detail) => ({
  type: 'about:blank',
  title: 'Error',
  status,
  detail,
  errores: [],
  id: 'prueba-controlada',
});
function responder(res, status, cuerpo, esquema) {
  if (esquema) assert.ok(ajv.getSchema('lonja#/components/schemas/' + esquema)(cuerpo));
  res.writeHead(status, { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' });
  res.end(JSON.stringify(cuerpo));
}
async function servidor(t, manejar) {
  const server = createServer(manejar).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return `http://127.0.0.1:${server.address().port}`;
}

test('el transporte renueva una sola vez, conserva correlación y nunca reenvía cookies', async (t) => {
  let renovaciones = 0;
  const peticiones = [];
  const base = await servidor(t, async (req, res) => {
    peticiones.push(req.headers);
    if (req.url === '/api/v1/auth/refresh') {
      renovaciones++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return responder(
        res,
        200,
        { access: 'nuevo', refresh: 'b'.repeat(64), tipo: 'Bearer', expira_en: 900, usuario },
        'Sesion',
      );
    }
    if (req.url === '/api/v1/auth/yo') {
      return req.headers.authorization === 'Bearer nuevo'
        ? responder(res, 200, { datos: usuario })
        : responder(res, 401, problema(401, 'Access vencido.'), 'Problema');
    }
    responder(res, 501, problema(501, 'Ruta fuera del escenario.'), 'Problema');
  });
  const api = crearApi({ url: base + '/api/v1' });
  const sesion = { access: 'vencido', refresh: 'a'.repeat(64) };
  const resultados = await Promise.all(
    [1, 2].map(() =>
      api.pedir('auth/yo', {
        sesion,
        requestId: 'correlacion-prueba',
        ip: '198.51.100.8',
        headers: { 'x-forwarded-for': '198.51.100.99' },
      }),
    ),
  );
  assert.equal(renovaciones, 1);
  assert.ok(resultados.every((r) => r.datos.id === usuario.id));
  assert.ok(peticiones.every((h) => !h.cookie && h['x-request-id'] === 'correlacion-prueba'));
  assert.ok(peticiones.every((h) => h['x-forwarded-for'] === '198.51.100.8'));
  await assert.rejects(api.pedir('https://otro.example/auth/yo'), /Ruta de API inválida/);
});

test('el cliente muestra problem+json del formulario y mantiene CSP ante errores', async (t) => {
  const base = await servidor(t, (req, res) =>
    responder(res, 422, problema(422, 'Credenciales de prueba inválidas.'), 'Problema'),
  );
  const app = crearCliente({ api: crearApi({ url: base + '/api/v1' }) });
  t.after(() => app.locals.sesiones.cerrar());
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const origen = `http://127.0.0.1:${server.address().port}`;
  const respuesta = await fetch(origen + '/credenciales', {
    method: 'POST',
    headers: { Origin: origen, 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'prueba', password: 'ClavePrueba123' }),
  });
  assert.equal(respuesta.status, 422);
  assert.match(await respuesta.text(), /Credenciales de prueba inválidas/);
  assert.match(respuesta.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(respuesta.headers.get('set-cookie'), null);
});

test('un timeout se convierte en 503 y un error HTML del proxy conserva su estado', async (t) => {
  const base = await servidor(t, (req, res) => {
    if (req.url.endsWith('/salud')) return; // conexión abierta hasta que el cliente cancela
    res.writeHead(502, { 'Content-Type': 'text/html' });
    res.end('<h1>Proxy no disponible</h1>');
  });
  const api = crearApi({ url: base + '/api/v1', timeout: 100 });
  await assert.rejects(api.pedir('salud'), (e) => e instanceof ErrorApi && e.status === 503);
  await assert.rejects(
    api.pedir('tienda/portada'),
    (e) => e instanceof ErrorApi && e.status === 502 && !e.message.includes('<h1>'),
  );
});

test('salud comprueba la API y propaga una correlación única', async (t) => {
  let disponible = true;
  let correlacion;
  const app = crearCliente({
    api: {
      async pedir(ruta, opciones) {
        assert.equal(ruta, 'salud');
        correlacion = opciones.requestId;
        if (!disponible) throw new ErrorApi(503);
        return { bd: 'ok' };
      },
    },
  });
  const server = app.listen(0);
  t.after(() => {
    app.locals.sesiones.cerrar();
    return new Promise((resolve) => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}/salud`;
  const ok = await fetch(url);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('x-request-id'), correlacion);
  disponible = false;
  const fallo = await fetch(url);
  assert.equal(fallo.status, 503);
  assert.equal((await fallo.json()).api, 'unavailable');
});

test('producción conserva estáticos en caché y el registro enlaza información de privacidad', async (t) => {
  const anterior = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  let app;
  try {
    app = crearCliente();
  } finally {
    if (anterior === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = anterior;
  }
  t.after(() => app.locals.sesiones.cerrar());
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}`;
  const css = await fetch(url + '/css/header.css');
  assert.match(css.headers.get('cache-control'), /max-age=3600/);
  assert.equal(
    (await fetch(url + '/css/header.css', { cache: 'no-cache', headers: { 'If-None-Match': css.headers.get('etag') } }))
      .status,
    304,
  );
  const registro = await fetch(url + '/registro');
  assert.match(await registro.text(), /href="\/privacidad"/);
  const privacidad = await fetch(url + '/privacidad');
  assert.equal(privacidad.status, 200);
  assert.match(await privacidad.text(), /Entorno de demostración/);
});
