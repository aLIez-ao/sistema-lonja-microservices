import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { db, modelos } from './ayuda.js';
const { default: app } = await import('../app.js');
import { crearAdministradorInicial } from '../modules/accounts/index.js';
import { validarRespuesta } from './contrato.js';
import { crearLimitadorApi } from '../middleware/limitesApi.js';
import express from 'express';

let servidor, base;
before(async () => {
  await db.sync({ force: true });
  await crearAdministradorInicial();
  servidor = app.listen(0);
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(async () => {
  await new Promise((resolve) => servidor.close(resolve));
  await db.close();
});

async function pedir(metodo, ruta, datos, access) {
  const respuesta = await fetch(base + '/api/v1' + ruta, {
    method: metodo,
    headers: {
      ...(datos && { 'Content-Type': 'application/json' }),
      ...(access && { Authorization: `Bearer ${access}` }),
    },
    ...(datos && { body: JSON.stringify(datos) }),
  });
  const cuerpo = respuesta.status === 204 ? null : await respuesta.json();
  validarRespuesta(metodo, ruta, respuesta, cuerpo);
  return { respuesta, cuerpo };
}
const entrar = () => pedir('POST', '/auth/sesion', { usuario: 'admin', password: 'AdminPrueba123' });

test('salud y errores son JSON con correlación; no se publican vistas ni cookies', async () => {
  const { respuesta } = await pedir('GET', '/salud');
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('x-content-type-options'), 'nosniff');
  for (const ruta of ['/no-existe', '/css/lonja.css', '/acceso']) {
    const r = await fetch(base + ruta, { headers: { 'X-Request-Id': 'prueba-123' } });
    assert.equal(r.status, 404);
    assert.equal(r.headers.get('x-request-id'), 'prueba-123');
    assert.equal((await r.json()).id, 'prueba-123');
  }
  assert.equal((await pedir('GET', '/auth/yo')).respuesta.status, 401);
});

test('access dura 15 minutos y refresh se guarda únicamente con hash', async () => {
  const { respuesta, cuerpo } = await entrar();
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('set-cookie'), null);
  const claims = jwt.decode(cuerpo.access);
  assert.equal(claims.exp - claims.iat, 900);
  assert.equal(claims.sub, String(cuerpo.usuario.id));
  const sesion = await modelos.Sesion.findByPk(claims.sid);
  assert.notEqual(sesion.hash, cuerpo.refresh);
  assert.ok(+sesion.expira <= Date.now() + 8 * 3600000);
  assert.equal((await pedir('GET', '/auth/yo', null, cuerpo.access)).cuerpo.datos.rol, 'admin');
  assert.ok(!('password' in cuerpo.usuario));
});

test('rota el refresh una sola vez, incluso con solicitudes concurrentes', async () => {
  const { cuerpo } = await entrar();
  const resultados = await Promise.all([
    pedir('POST', '/auth/refresh', { refresh: cuerpo.refresh }),
    pedir('POST', '/auth/refresh', { refresh: cuerpo.refresh }),
  ]);
  assert.deepEqual(resultados.map((r) => r.respuesta.status).sort(), [200, 401]);
  assert.equal((await pedir('POST', '/auth/refresh', { refresh: cuerpo.refresh })).respuesta.status, 401);
  const nueva = resultados.find((r) => r.respuesta.status === 200).cuerpo;
  assert.equal((await pedir('GET', '/auth/yo', null, nueva.access)).respuesta.status, 401);
  assert.equal((await pedir('POST', '/auth/refresh', { refresh: nueva.refresh })).respuesta.status, 401);
});

test('salir revoca access y refresh; cambiar contraseña también invalida ambos', async () => {
  const primera = (await entrar()).cuerpo;
  assert.equal((await pedir('DELETE', '/auth/sesion', null, primera.access)).respuesta.status, 204);
  assert.equal((await pedir('GET', '/auth/yo', null, primera.access)).respuesta.status, 401);
  assert.equal((await pedir('POST', '/auth/refresh', { refresh: primera.refresh })).respuesta.status, 401);
  const segunda = (await entrar()).cuerpo;
  const us = await modelos.Usuario.findByPk(segunda.usuario.id);
  await us.update({ password: 'OtraClave123' });
  assert.equal((await pedir('GET', '/auth/yo', null, segunda.access)).respuesta.status, 401);
  assert.equal((await pedir('POST', '/auth/refresh', { refresh: segunda.refresh })).respuesta.status, 401);
  await us.update({ password: 'AdminPrueba123' });
});

test('rechaza access expirado, una cookie histórica y credenciales mal formadas', async () => {
  const { cuerpo } = await entrar();
  const claims = jwt.decode(cuerpo.access);
  delete claims.exp;
  delete claims.iat;
  const vencido = jwt.sign(claims, process.env.SC_JWT, { expiresIn: -1 });
  assert.equal((await pedir('GET', '/auth/yo', null, vencido)).respuesta.status, 401);
  const r = await fetch(base + '/api/v1/auth/yo', { headers: { Cookie: `_token=${cuerpo.access}` } });
  assert.equal(r.status, 401);
  assert.equal((await pedir('POST', '/auth/sesion', { usuario: [], password: {} })).respuesta.status, 422);
  assert.equal((await pedir('POST', '/auth/refresh', { refresh: {} })).respuesta.status, 401);
});

test('cinco fallos bloquean el acceso y anuncian Retry-After', async () => {
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await pedir('POST', '/auth/sesion', { usuario: 'ausente', password: 'incorrecta' })).respuesta.status,
      401,
    );
  const { respuesta } = await pedir('POST', '/auth/sesion', { usuario: 'ausente', password: 'incorrecta' });
  assert.equal(respuesta.status, 429);
  assert.equal(respuesta.headers.get('retry-after'), '900');
});

test('el limitador cuenta por IP y envía un problema 429', async () => {
  const limitado = express();
  limitado.use(crearLimitadorApi({ max: 1 }));
  limitado.get('/', (req, res) => res.json({ ok: true }));
  const s = limitado.listen(0);
  try {
    const url = `http://127.0.0.1:${s.address().port}`;
    assert.equal((await fetch(url)).status, 200);
    const r = await fetch(url);
    assert.equal(r.status, 429);
    assert.equal(r.headers.get('retry-after'), '60');
  } finally {
    await new Promise((resolve) => s.close(resolve));
  }
});

test('los fallos de acceso de una IP no bloquean a otro visitante del mismo usuario', async (t) => {
  const anterior = app.get('trust proxy');
  app.set('trust proxy', 'loopback');
  t.after(() => app.set('trust proxy', anterior));
  await modelos.Usuario.create({
    usuario: 'ip-independiente',
    nombre_completo: 'Prueba IP',
    password: 'AccesoPrueba123',
    rol: 'admin',
  });
  const entrar = (ip, password) =>
    fetch(base + '/api/v1/auth/sesion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify({ usuario: 'ip-independiente', password }),
    });
  for (let i = 0; i < 5; i++) assert.equal((await entrar('198.51.100.21', 'incorrecta')).status, 401);
  assert.equal((await entrar('198.51.100.21', 'AccesoPrueba123')).status, 429);
  assert.equal((await entrar('198.51.100.22', 'AccesoPrueba123')).status, 200);
});
