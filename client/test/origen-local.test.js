import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { request } from 'node:http';
import { redirigirOrigenLocal } from '../middleware/origen-local.js';

async function cliente(t, opciones) {
  const app = express();
  app.use(redirigirOrigenLocal(opciones));
  app.use((req, res) => res.sendStatus(req.method === 'POST' ? 403 : 200));
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        servidor.closeAllConnections();
        servidor.close(resolve);
      }),
  );
  return (host, ruta = '/acceso', method = 'GET') =>
    new Promise((resolve, reject) => {
      const peticion = request(
        { hostname: '127.0.0.1', port: servidor.address().port, path: ruta, method, headers: { Host: host } },
        (respuesta) => {
          respuesta.resume();
          respuesta.once('end', () =>
            resolve({ status: respuesta.statusCode, headers: new Headers(respuesta.headers) }),
          );
        },
      );
      peticion.on('error', reject);
      peticion.end();
    });
}

test('el acceso local alternativo redirige al origen configurado conservando ruta y parámetros', async (t) => {
  const pedir = await cliente(t, { url: 'http://localhost:3000', habilitado: true });
  for (const host of ['127.0.0.1:3000', '[::1]:3000']) {
    const respuesta = await pedir(host, '/acceso?volver=%2Fdashboard');
    assert.equal(respuesta.status, 302);
    assert.equal(respuesta.headers.get('location'), 'http://localhost:3000/acceso?volver=%2Fdashboard');
  }
  assert.equal((await pedir('localhost:3000')).status, 200);
  assert.equal((await pedir('127.0.0.1:3000', '/acceso', 'HEAD')).status, 302);
  assert.equal((await pedir('127.0.0.1:3000', '/salud')).status, 200);
});

test('la redirección no cambia escrituras, puertos distintos ni hosts ajenos', async (t) => {
  const pedir = await cliente(t, { url: 'http://localhost:3000', habilitado: true });
  assert.equal((await pedir('127.0.0.1:3000', '/credenciales', 'POST')).status, 403);
  assert.equal((await pedir('127.0.0.1:3001')).status, 200);
  assert.equal((await pedir('ajeno.invalid:3000')).status, 200);
  const externa = await cliente(t, { url: 'http://ejemplo.invalid:3000', habilitado: true });
  assert.equal((await externa('127.0.0.1:3000')).status, 200);
});

test('producción y los entornos sin URL configurada no redirigen alias locales', async (t) => {
  const produccion = await cliente(t, { url: 'http://localhost:3000', habilitado: false });
  assert.equal((await produccion('127.0.0.1:3000')).status, 200);
  const sinUrl = await cliente(t, { url: '', habilitado: true });
  assert.equal((await sinUrl('127.0.0.1:3000')).status, 200);
});
