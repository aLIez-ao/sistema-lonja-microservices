import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { regresionRest } from './rest-regresion.js';
import { hashToken } from '../shared/helpers/seguridad.js';

const ctx = regresionRest();
const registro = {
  nombre: 'Ana <img src=x>',
  apellido_paterno: 'Regresión',
  correo: 'registro-correo@example.test',
  password: 'CorreoPrueba123',
  password_confirmar: 'CorreoPrueba123',
  aviso_privacidad: true,
};
beforeEach(async () => {
  await ctx.esperarCorreos();
  ctx.enviados.length = 0;
  ctx.fallarCorreos.clear();
});

test('registro REST envía verificación con HTML escapado, expiración y enlace del cliente', async () => {
  const r = await ctx.pedir('POST', '/registro', registro, { actor: null });
  assert.equal(r.status, 202);
  assert.equal(ctx.enviados.length, 1);
  const correo = ctx.enviados[0];
  assert.equal(correo.to, registro.correo);
  assert.match(correo.subject, /Confirma tu correo/);
  assert.match(correo.html, /Ana &lt;img src=x&gt;/);
  assert.doesNotMatch(correo.html, /Ana <img/);
  assert.match(correo.text, /24 horas/);
  const token = /https:\/\/cliente\.regresion\.test\/verificar-email\/([a-f0-9]{64})/.exec(correo.text)?.[1];
  assert.ok(token);
  const u = await ctx.modelos.Usuario.findOne({ where: { correo: registro.correo } });
  assert.equal(u.token_verificacion, hashToken(token));
  assert.doesNotMatch(JSON.stringify(r.datos), new RegExp(token));
});

test('registro repetido no reenvía enlaces ni revela la existencia de la cuenta', async () => {
  const r = await ctx.pedir('POST', '/registro', registro, { actor: null });
  assert.equal(r.status, 202);
  assert.equal(ctx.enviados.length, 0);
  assert.doesNotMatch(JSON.stringify(r.datos), /ya existe|registrada|token/i);
});

test('recuperación REST mantiene respuesta uniforme y el correo contiene un enlace de una hora', async () => {
  const u = ctx.usuarios.comprador;
  const conocida = await ctx.pedir('POST', '/auth/recuperacion', { identificador: u.correo }, { actor: null });
  const desconocida = await ctx.pedir(
    'POST',
    '/auth/recuperacion',
    { identificador: 'inexistente@example.test' },
    { actor: null },
  );
  assert.deepEqual(conocida.datos, desconocida.datos);
  assert.equal(ctx.enviados.length, 1);
  assert.equal(ctx.enviados[0].to, u.correo);
  assert.match(ctx.enviados[0].subject, /Recuperación de contraseña/);
  assert.match(ctx.enviados[0].text, /1 hora/);
  assert.match(ctx.enviados[0].text, /https:\/\/cliente\.regresion\.test\/recuperar-password\/[a-f0-9]{64}/);
});

test('invitación REST comunica usuario y plazo de 72 horas sin enviar una contraseña', async () => {
  const r = await ctx.pedir('POST', '/usuarios', {
    usuario: 'invitada-correo',
    nombre_completo: 'Invitada <script>',
    correo: 'invitada-correo@example.test',
    rol: 'capturista',
  });
  assert.equal(r.status, 201);
  assert.equal(ctx.enviados.length, 1);
  const correo = ctx.enviados[0];
  assert.match(correo.text, /invitada-correo/);
  assert.match(correo.text, /72 horas/);
  assert.match(correo.html, /Invitada &lt;script&gt;/);
  assert.doesNotMatch(correo.text, /Regresion123|CorreoPrueba123/);
  assert.doesNotMatch(JSON.stringify(r.datos), /token_recuperacion|password/);
});

test('cambiar contraseña envía aviso de seguridad sin la contraseña nueva', async () => {
  const u = await ctx.crearUsuario('cambio-clave');
  ctx.tokens.cambio = await ctx.entrar(u);
  const r = await ctx.pedir(
    'PUT',
    '/cuenta/password',
    { password_actual: 'Regresion123', password: 'NuevaSecreta123', password_confirmar: 'NuevaSecreta123' },
    { actor: 'cambio' },
  );
  assert.equal(r.status, 204);
  // El envío de seguridad se inicia después de confirmar la contraseña.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ctx.enviados.length, 1);
  assert.match(ctx.enviados[0].subject, /contraseña fue cambiada/);
  assert.match(ctx.enviados[0].text, /demás sesiones/);
  assert.doesNotMatch(JSON.stringify(ctx.enviados), /NuevaSecreta123/);
  assert.equal((await ctx.pedir('GET', '/auth/yo', undefined, { actor: 'cambio' })).status, 401);
});

test('fallo SMTP no expone detalles técnicos al registrar o recuperar una cuenta', async () => {
  const correo = 'smtp-falla@example.test';
  ctx.fallarCorreos.add(correo);
  const r = await ctx.pedir('POST', '/registro', { ...registro, correo }, { actor: null });
  assert.equal(r.status, 202);
  assert.doesNotMatch(JSON.stringify(r.datos), /SMTP|EAUTH|stack|token/);
  assert.ok(await ctx.modelos.Usuario.findOne({ where: { correo } }));
});

test('factura de mostrador llega con destinatario, importes y PDF adjunto correctos', async () => {
  const { lote, catalogo } = await ctx.lote({ nombre: 'Huachinango <b>', kilos: 12, precio: '30.00' });
  const cpr = await ctx.modelos.Comprador.create({
    nombre: 'Compradora <img>',
    apellido_paterno: 'Factura',
    correo: 'factura-regresion@example.test',
  });
  const r = await ctx.pedir('POST', '/compras', {
    id_cmp: lote.id_lte,
    codigo_cpr: cpr.codigo_cpr,
    precio_kilo_final: '35.50',
  });
  assert.equal(r.status, 201);
  await ctx.esperarCorreos();
  const correo = ctx.enviados.find((e) => e.to === cpr.correo);
  assert.ok(correo);
  assert.match(correo.subject, /Factura|Comprobante/);
  assert.match(correo.html, /426\.00/);
  assert.match(correo.html, /Compradora &lt;img&gt;/);
  assert.match(correo.html, new RegExp(catalogo.nombre.replace('<b>', '&lt;b&gt;')));
  assert.equal(correo.attachments.length, 1);
  assert.equal(Buffer.from(correo.attachments[0].content).subarray(0, 5).toString(), '%PDF-');
});

test('pedido pagado y cambios enviado/entregado generan correos con su pedido e importes', async () => {
  const { lote } = await ctx.lote({ kilos: 8, precio: '50.00' });
  const pedido = await ctx.comprar(lote);
  await ctx.esperarCorreos();
  const pagado = ctx.enviados.find(
    (e) => e.to === ctx.usuarios.comprador.correo && /Confirmación de pago/i.test(e.subject),
  );
  assert.ok(pagado);
  assert.match(pagado.html, new RegExp('Pedido #' + pedido.id_ped));
  assert.match(pagado.html, /400\.00/);
  ctx.enviados.length = 0;
  for (const estado of ['preparando', 'enviado', 'entregado']) {
    assert.equal((await ctx.pedir('PATCH', `/pedidos/${pedido.id_ped}`, { estado })).status, 204);
    await ctx.esperarCorreos();
  }
  assert.ok(ctx.enviados.some((e) => /Actualización de pedido/i.test(e.subject) && /Pedido enviado/i.test(e.html)));
  assert.ok(ctx.enviados.some((e) => /Actualización de pedido/i.test(e.subject) && /Pedido entregado/i.test(e.html)));
});

test('reenviar verificación impone enfriamiento y el último enlace reemplaza al anterior', async () => {
  const u = await ctx.crearUsuario('reenvio', { email_verificado: false });
  ctx.tokens.reenvio = await ctx.entrar(u);
  const enviar = () => ctx.pedir('POST', '/cuenta/verificacion', {}, { actor: 'reenvio' });
  assert.equal((await enviar()).status, 202);
  const primero = /verificar-email\/([a-f0-9]{64})/.exec(ctx.enviados.at(-1).text)[1];
  assert.equal((await enviar()).status, 429);
  assert.equal(ctx.enviados.length, 1);
  await u.update({ token_verificacion_envio: new Date(0) });
  assert.equal((await enviar()).status, 202);
  const ultimo = /verificar-email\/([a-f0-9]{64})/.exec(ctx.enviados.at(-1).text)[1];
  assert.notEqual(ultimo, primero);
  assert.equal((await ctx.pedir('POST', '/auth/verificacion/' + primero, undefined, { actor: null })).status, 400);
  assert.equal((await ctx.pedir('POST', '/auth/verificacion/' + ultimo, undefined, { actor: null })).status, 200);
  assert.equal((await u.reload()).email_verificado, true);
});

test('la verificación admite cinco reenvíos por hora y bloquea el sexto aunque termine el enfriamiento', async () => {
  const u = await ctx.crearUsuario('max-reenvio', { email_verificado: false });
  ctx.tokens.maxReenvio = await ctx.entrar(u);
  for (let i = 0; i < 5; i++) {
    await u.reload();
    await u.update({ token_verificacion_envio: new Date(0) });
    assert.equal((await ctx.pedir('POST', '/cuenta/verificacion', {}, { actor: 'maxReenvio' })).status, 202);
  }
  await u.reload();
  await u.update({ token_verificacion_envio: new Date(0) });
  const sexto = await ctx.pedir('POST', '/cuenta/verificacion', {}, { actor: 'maxReenvio' });
  assert.equal(sexto.status, 429);
  assert.equal(ctx.enviados.length, 5);
  assert.ok(sexto.headers.get('retry-after'));
});

test('cambiar correo invalida el enlace anterior y sincroniza la ficha del comprador', async () => {
  const u = await ctx.crearUsuario('correo-nuevo', { email_verificado: false });
  ctx.tokens.correoNuevo = await ctx.entrar(u);
  await ctx.pedir('POST', '/cuenta/verificacion', {}, { actor: 'correoNuevo' });
  const anterior = /verificar-email\/([a-f0-9]{64})/.exec(ctx.enviados.at(-1).text)[1];
  const correo = 'actualizado-regresion@example.test';
  const r = await ctx.pedir('PATCH', '/cuenta', { correo }, { actor: 'correoNuevo' });
  assert.equal(r.status, 200);
  assert.equal(r.datos.datos.us.email_verificado, false);
  assert.equal(ctx.enviados.at(-1).to, correo);
  assert.equal((await ctx.modelos.Comprador.findByPk(u.codigo_cpr)).correo, correo);
  assert.equal((await ctx.pedir('POST', '/auth/verificacion/' + anterior, undefined, { actor: null })).status, 400);
});

test('cuentas inactivas no reciben recuperación ni consumen un enlace de verificación', async () => {
  const u = await ctx.crearUsuario('inactiva', {
    activo: false,
    email_verificado: false,
    token_verificacion: hashToken('inactivo'),
    token_verificacion_expira: new Date(Date.now() + 60000),
  });
  assert.equal(
    (await ctx.pedir('POST', '/auth/recuperacion', { identificador: u.correo }, { actor: null })).status,
    202,
  );
  assert.equal(ctx.enviados.length, 0);
  assert.equal((await ctx.pedir('POST', '/auth/verificacion/inactivo', undefined, { actor: null })).status, 400);
  assert.equal((await u.reload()).email_verificado, false);
});

test('el diagnóstico de SMTP se limita al administrador y no se devuelve en la cuenta compradora', async () => {
  ctx.fallarCorreos.add(ctx.usuarios.admin.correo);
  const r = await ctx.pedir('POST', '/configuracion/correo/prueba', {});
  assert.equal(r.status, 503);
  const admin = await ctx.pedir('GET', '/configuracion');
  assert.ok(admin.datos.datos.estadoCorreo.ultimoError);
  const comprador = await ctx.pedir('GET', '/configuracion', undefined, { actor: 'comprador' });
  assert.equal(comprador.datos.datos.estadoCorreo, null);
  assert.doesNotMatch(JSON.stringify(comprador.datos), /SMTP|ultimoError|remitente/);
});
