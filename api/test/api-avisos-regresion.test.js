import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { regresionRest } from './rest-regresion.js';
import { iniciarColaTrabajos } from '../shared/helpers/colaTrabajos.js';

const ctx = regresionRest();
const aviso = {
  asunto: 'Horario de subasta',
  titulo: 'Cambio de horario',
  mensaje: 'La subasta iniciará a las 9:00.',
  tipo: 'evento',
};
beforeEach(async () => {
  await ctx.esperarCorreos();
  ctx.enviados.length = 0;
  ctx.fallarCorreos.clear();
  await ctx.modelos.Usuario.update({ recibir_avisos: false }, { where: { rol: 'comprador' } });
});

test('avisos REST: solo compradores activos, verificados, vinculados y suscritos reciben correo', async () => {
  const elegible = await ctx.crearUsuario('suscrita', { recibir_avisos: true });
  for (const cambios of [
    { recibir_avisos: false },
    { activo: false },
    { email_verificado: false },
    { codigo_cpr: null },
    { rol: 'capturista' },
  ]) {
    await ctx.crearUsuario('excluida', { recibir_avisos: true, ...cambios });
  }
  const respuesta = await ctx.pedir('POST', '/configuracion/avisos', aviso);
  assert.equal(respuesta.status, 202);
  assert.match(respuesta.datos.mensaje, /1 suscriptores/);
  await ctx.esperarCorreos();
  assert.deepEqual(
    ctx.enviados.map((e) => e.to),
    [elegible.correo],
  );
  assert.match(ctx.enviados[0].subject, /Horario de subasta/);
  assert.match(ctx.enviados[0].text, /iniciará a las 9:00/);
});

test('baja REST: consultar no cambia la suscripción; confirmar la baja sí y deja de recibir', async () => {
  const u = await ctx.crearUsuario('baja', { recibir_avisos: true });
  await ctx.pedir('POST', '/configuracion/avisos', aviso);
  await ctx.esperarCorreos();
  const enlace = /https:\/\/[^\s]+\/avisos\/baja\/[^\s]+/.exec(ctx.enviados[0].text)[0];
  assert.equal(new URL(enlace).origin, 'https://cliente.regresion.test');
  const ruta = '/avisos/baja/' + new URL(enlace).pathname.split('/').at(-1);
  assert.equal((await ctx.pedir('GET', ruta, undefined, { actor: null })).status, 200);
  assert.equal((await u.reload()).recibir_avisos, true);
  assert.equal((await ctx.pedir('POST', ruta, undefined, { actor: null })).status, 200);
  assert.equal((await u.reload()).recibir_avisos, false);
  ctx.enviados.length = 0;
  await ctx.pedir('POST', '/configuracion/avisos', aviso);
  await ctx.esperarCorreos();
  assert.equal(ctx.enviados.length, 0);
  assert.equal((await ctx.pedir('POST', '/avisos/baja/no-valido', undefined, { actor: null })).status, 400);
});

test('aviso de suscripción descartado persiste en la cuenta y en un acceso nuevo', async () => {
  const r = await ctx.pedir('POST', '/configuracion/aviso-suscripcion/descartar', {}, { actor: 'comprador' });
  assert.equal(r.status, 204);
  ctx.tokens.comprador = await ctx.entrar(ctx.usuarios.comprador);
  const yo = await ctx.pedir('GET', '/auth/yo', undefined, { actor: 'comprador' });
  assert.equal(yo.datos.datos.aviso_suscripcion_descartado, true);
});

test('avisos REST: no encola ni envía cuando faltan suscriptores', async () => {
  const antes = await ctx.modelos.Trabajo.count();
  const r = await ctx.pedir('POST', '/configuracion/avisos', aviso);
  assert.equal(r.status, 202);
  assert.match(r.datos.mensaje, /No hay suscriptores/);
  assert.equal(await ctx.modelos.Trabajo.count(), antes);
  assert.equal(ctx.enviados.length, 0);
});

for (const [nombre, cambios] of [
  ['asunto vacío', { asunto: '' }],
  ['asunto largo', { asunto: 'x'.repeat(121) }],
  ['cabeceras en asunto', { asunto: 'Aviso\r\nCc: ajeno@example.test' }],
  ['mensaje vacío', { mensaje: '' }],
  ['mensaje largo', { mensaje: 'x'.repeat(4001) }],
  ['título largo', { titulo: 'x'.repeat(121) }],
  ['tipo desconocido', { tipo: 'publicidad' }],
])
  test('avisos REST rechaza ' + nombre + ' sin crear trabajos', async () => {
    const antes = await ctx.modelos.Trabajo.count();
    assert.equal((await ctx.pedir('POST', '/configuracion/avisos', { ...aviso, ...cambios })).status, 422);
    assert.equal(await ctx.modelos.Trabajo.count(), antes);
  });

for (const actor of [null, 'comprador', 'capturista'])
  test('avisos REST impide envío por ' + (actor || 'anónimo'), async () => {
    assert.equal((await ctx.pedir('POST', '/configuracion/avisos', aviso, { actor })).status, actor ? 403 : 401);
  });

test('reintentar un aviso tras error SMTP no reenvía a quienes ya fueron atendidos', async () => {
  const uno = await ctx.crearUsuario('primero', { recibir_avisos: true });
  const dos = await ctx.crearUsuario('segundo', { recibir_avisos: true });
  ctx.fallarCorreos.add(dos.correo);
  await ctx.pedir('POST', '/configuracion/avisos', aviso);
  await ctx.esperarCorreos();
  assert.deepEqual(
    ctx.enviados.map((e) => e.to),
    [uno.correo],
  );
  const trabajo = await ctx.modelos.Trabajo.findOne({ where: { estado: 'pendiente' } });
  assert.ok(trabajo);
  ctx.fallarCorreos.clear();
  await trabajo.update({ proximo_intento: new Date(0) });
  await iniciarColaTrabajos();
  await ctx.esperarCorreos();
  assert.deepEqual(ctx.enviados.map((e) => e.to).sort(), [uno.correo, dos.correo].sort());
  assert.equal((await trabajo.reload()).estado, 'completado');
});
