import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, modelos } from './ayuda.js';
import { fijarTransporteParaPruebas } from '../shared/helpers/email.js';
import { validarRespuesta } from './contrato.js';

const { default: app } = await import('../app.js');
let servidor, base, access, direccion, correoEnviado;
before(async () => {
  process.env.CLIENTE_URL = 'https://cliente.example.test';
  fijarTransporteParaPruebas({
    sendMail: async (datos) => {
      correoEnviado = datos;
      return { messageId: 'api-cuentas-test' };
    },
  });
  await db.sync({ force: true });
  servidor = app.listen(0);
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`;
});
after(async () => {
  fijarTransporteParaPruebas(null);
  await new Promise((resolve) => servidor.close(resolve));
  await db.close();
});

async function pedir(method, ruta, body, contratoRuta = ruta.replace(/\/\d+(?=\/|$)/g, '/{id}')) {
  const r = await fetch(base + ruta, {
    method,
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(access && { Authorization: `Bearer ${access}` }),
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  const datos = r.status === 204 ? null : await r.json();
  validarRespuesta(method, contratoRuta, r, datos);
  return { r, datos };
}
const registro = {
  nombre: 'Ana',
  apellido_paterno: 'Pérez',
  correo: 'ana-api@example.test',
  telefono: '2291234567',
  password: 'Compradora123',
  password_confirmar: 'Compradora123',
  aviso_privacidad: true,
};
const nuevaDireccion = {
  alias: 'Casa',
  destinatario: 'Ana Pérez',
  telefono: '2291234567',
  calle: 'Puerto',
  num_ext: '12',
  colonia: 'Centro',
  cp: '91700',
  municipio: 'Veracruz',
  estado: 'Veracruz',
};

test('registro no permite elegir rol y no revela cuentas existentes; el correo apunta al cliente', async () => {
  assert.equal((await pedir('POST', '/registro', { ...registro, nombre: [] })).r.status, 422);
  const alta = await pedir('POST', '/registro', { ...registro, rol: 'admin' });
  assert.equal(alta.r.status, 202);
  const repetida = await pedir('POST', '/registro', registro);
  assert.deepEqual(repetida.datos, alta.datos);
  const us = await modelos.Usuario.findOne({ where: { correo: registro.correo } });
  assert.equal(us.rol, 'comprador');
  assert.equal(us.email_verificado, false);
  assert.match(correoEnviado.text, /https:\/\/cliente\.example\.test\/verificar-email\//);
  const token = /verificar-email\/([a-f0-9]+)/.exec(correoEnviado.text)[1];
  const verificaciones = await Promise.all(
    [1, 2].map(() => pedir('POST', '/auth/verificacion/' + token, null, '/auth/verificacion/{token}')),
  );
  assert.deepEqual(verificaciones.map((r) => r.r.status).sort(), [200, 400]);
  assert.equal((await pedir('POST', '/auth/verificacion/' + token, null, '/auth/verificacion/{token}')).r.status, 400);
  const login = await pedir('POST', '/auth/sesion', { usuario: registro.correo, password: registro.password });
  access = login.datos.access;
});

test('cuenta devuelve solo datos públicos y actualiza comprador y facturación', async () => {
  const actual = await pedir('GET', '/cuenta');
  assert.equal(actual.datos.datos.us.correo, registro.correo);
  assert.equal(actual.datos.datos.us.email_verificado, true);
  assert.doesNotMatch(JSON.stringify(actual.datos), /token_verificacion|token_recuperacion|password|sesion_version/);
  const cambiado = await pedir('PATCH', '/cuenta', {
    nombre: 'Ana María',
    rfc: 'XAXX010101000',
    razon_social: 'Compradora',
  });
  assert.equal(cambiado.r.status, 200);
  assert.equal(cambiado.datos.datos.comprador.nombre, 'Ana María');
  assert.equal(cambiado.datos.datos.us.rfc, 'XAXX010101000');
  assert.equal((await pedir('PATCH', '/cuenta', { telefono: 'incorrecto' })).r.status, 422);
});

test('direcciones mantienen una principal, validan México y rechazan ids ajenos', async () => {
  const primera = await pedir('POST', '/cuenta/direcciones', nuevaDireccion);
  assert.equal(primera.r.status, 201);
  direccion = primera.datos.datos;
  assert.equal(direccion.principal, true);
  const segunda = await pedir('POST', '/cuenta/direcciones', { ...nuevaDireccion, alias: 'Oficina', principal: true });
  assert.equal(segunda.datos.datos.principal, true);
  const lista = await pedir('GET', '/cuenta/direcciones');
  assert.equal(lista.datos.datos.filter((d) => d.principal).length, 1);
  assert.equal(lista.datos.datos[0].alias, 'Oficina');
  assert.equal(
    (await pedir('PATCH', `/cuenta/direcciones/${direccion.id_dir}`, { estado: 'Estado inventado' })).r.status,
    422,
  );
  const ajeno = await modelos.Usuario.create({
    usuario: 'ajeno',
    nombre_completo: 'Otro Comprador',
    password: 'Comprador123',
    rol: 'comprador',
  });
  const fila = await modelos.DireccionEntrega.create({ ...nuevaDireccion, id_usuario: ajeno.id });
  assert.equal((await pedir('GET', `/cuenta/direcciones/${fila.id_dir}`)).r.status, 404);
  assert.equal((await pedir('PATCH', `/cuenta/direcciones/${fila.id_dir}`, { alias: 'Robada' })).r.status, 404);
  assert.equal((await pedir('DELETE', `/cuenta/direcciones/${segunda.datos.datos.id_dir}`)).r.status, 204);
  assert.equal((await pedir('GET', '/cuenta/direcciones')).datos.datos[0].principal, true);
});

test('cambiar contraseña revoca la sesión y la recuperación solo se usa una vez', async () => {
  assert.equal(
    (
      await pedir('PUT', '/cuenta/password', {
        password_actual: 'incorrecta',
        password: 'NuevaClave123',
        password_confirmar: 'NuevaClave123',
      })
    ).r.status,
    403,
  );
  assert.equal(
    (
      await pedir('PUT', '/cuenta/password', {
        password_actual: registro.password,
        password: 'NuevaClave123',
        password_confirmar: 'NuevaClave123',
      })
    ).r.status,
    204,
  );
  assert.equal((await pedir('GET', '/cuenta')).r.status, 401);
  access = null;
  assert.equal((await pedir('POST', '/auth/recuperacion', { identificador: registro.correo })).r.status, 202);
  const token = /recuperar-password\/([a-f0-9]+)/.exec(correoEnviado.text)[1];
  const ruta = '/auth/restablecer/' + token;
  const cuerpo = { password: 'Restaurada123', password_confirmar: 'Restaurada123' };
  assert.equal((await pedir('POST', ruta, cuerpo, '/auth/restablecer/{token}')).r.status, 204);
  assert.equal((await pedir('POST', ruta, cuerpo, '/auth/restablecer/{token}')).r.status, 400);
  const login = await pedir('POST', '/auth/sesion', { usuario: registro.correo, password: cuerpo.password });
  assert.equal(login.r.status, 200);
});

test('administración protege al administrador y limita la creación de compradores', async () => {
  const admin = await modelos.Usuario.create({
    usuario: 'admin-api',
    nombre_completo: 'Administrador API',
    password: 'Administrador123',
    rol: 'admin',
    correo: 'admin-api@example.test',
  });
  access = (await pedir('POST', '/auth/sesion', { usuario: admin.usuario, password: 'Administrador123' })).datos.access;
  const lista = await pedir('GET', '/usuarios');
  assert.equal(lista.r.status, 200);
  assert.doesNotMatch(JSON.stringify(lista.datos), /password|token_verificacion|token_recuperacion/);
  assert.equal((await pedir('PATCH', `/usuarios/${admin.id}`, { activo: false })).r.status, 409);
  const compradora = await modelos.Usuario.findOne({ where: { correo: registro.correo } });
  assert.equal((await pedir('PATCH', `/usuarios/${compradora.id}`, { rol: 'capturista' })).r.status, 422);
  assert.equal(
    (
      await pedir('POST', '/usuarios', {
        usuario: 'ilegítimo',
        nombre_completo: 'Comprador',
        rol: 'comprador',
        password: 'Comprador123',
        password_confirmar: 'Comprador123',
      })
    ).r.status,
    422,
  );
  const invitacion = await pedir('POST', '/usuarios', {
    usuario: 'personal-api',
    nombre_completo: 'Personal API',
    rol: 'capturista',
    correo: 'personal-api@example.test',
  });
  assert.equal(invitacion.r.status, 201);
  assert.match(correoEnviado.text, /https:\/\/cliente\.example\.test\/recuperar-password\//);
  const id = invitacion.datos.datos.id;
  assert.equal((await pedir('GET', `/usuarios/${id}`)).datos.datos.rol, 'capturista');
  assert.equal((await pedir('DELETE', `/usuarios/${admin.id}`)).r.status, 409);
});

test('configuración valida preferencias y los avisos; el comprador no administra usuarios', async () => {
  const prefs = await pedir('PATCH', '/configuracion/preferencias', { tema: 'dark', idioma: 'en' });
  assert.equal(prefs.r.status, 200);
  assert.equal(prefs.datos.datos.preferencias.tema, 'dark');
  assert.equal((await pedir('PATCH', '/configuracion/preferencias', { tema: 'inexistente' })).r.status, 422);
  assert.equal(
    (await pedir('POST', '/configuracion/avisos', { asunto: 'Inyección\r\nCc: ajeno', mensaje: 'Texto' })).r.status,
    422,
  );
  const login = await pedir('POST', '/auth/sesion', { usuario: registro.correo, password: 'Restaurada123' });
  access = login.datos.access;
  assert.equal((await pedir('GET', '/usuarios')).r.status, 403);
  assert.equal((await pedir('POST', '/configuracion/correo/prueba', {})).r.status, 403);
});
