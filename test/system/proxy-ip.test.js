import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { crearLimitadorApi } from '../../api/middleware/limitesApi.js';
import { crearCliente } from '../../client/app.js';
import { crearApi } from '../../client/api.js';

async function escuchar(t, app) {
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        servidor.closeAllConnections();
        servidor.close(resolve);
      }),
  );
  return `http://127.0.0.1:${servidor.address().port}`;
}

test('dos visitantes conservan límites independientes a través del cliente HTTP', async (t) => {
  const api = express();
  api.set('trust proxy', 'loopback');
  api.use(crearLimitadorApi({ max: 2 }));
  api.get('/api/v1/tienda/sugerencias', (req, res) => res.json({ datos: [{ ip: req.ip }] }));
  const baseApi = await escuchar(t, api);
  const cliente = crearCliente({ api: crearApi({ url: baseApi + '/api/v1' }) });
  cliente.set('trust proxy', 'loopback');
  t.after(() => cliente.locals.sesiones.cerrar());
  const base = await escuchar(t, cliente);
  const pedir = (ip) => fetch(base + '/tienda/sugerencias?q=test', { headers: { 'X-Forwarded-For': ip } });
  assert.equal((await pedir('198.51.100.10')).status, 200);
  assert.equal((await pedir('198.51.100.10')).status, 200);
  assert.equal((await pedir('198.51.100.10')).status, 429);
  const otro = await pedir('198.51.100.11');
  assert.equal(otro.status, 200);
  assert.equal((await otro.json())[0].ip, '198.51.100.11');
});

test('el cliente no reenvía un X-Forwarded-For enviado desde una conexión sin confianza', async (t) => {
  let recibida;
  const api = express();
  api.get('/api/v1/tienda/sugerencias', (req, res) => {
    recibida = req.get('X-Forwarded-For');
    res.json([]);
  });
  const baseApi = await escuchar(t, api);
  const cliente = crearCliente({ api: crearApi({ url: baseApi + '/api/v1' }) });
  cliente.set('trust proxy', false);
  t.after(() => cliente.locals.sesiones.cerrar());
  const base = await escuchar(t, cliente);
  await fetch(base + '/tienda/sugerencias', { headers: { 'X-Forwarded-For': '198.51.100.99' } });
  assert.equal(recibida, '127.0.0.1');
});
