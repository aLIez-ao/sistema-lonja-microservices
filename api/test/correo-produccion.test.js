import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { verificarCorreoInicio, fijarTransporteParaPruebas } from '../shared/helpers/email.js';

test('producción rechaza simulación y errores permanentes, pero tolera una caída temporal del SMTP', async (t) => {
  const nombres = [
    'NODE_ENV',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'GMAIL_USER',
    'GMAIL_PASS',
    'EMAIL_USER',
    'EMAIL_PASS',
  ];
  const anteriores = Object.fromEntries(nombres.map((n) => [n, process.env[n]]));
  t.after(() => {
    for (const n of nombres) {
      if (anteriores[n] === undefined) delete process.env[n];
      else process.env[n] = anteriores[n];
    }
    fijarTransporteParaPruebas(null);
  });
  for (const n of nombres) delete process.env[n];
  process.env.NODE_ENV = 'production';
  await assert.rejects(verificarCorreoInicio(), /correo de producción no está disponible/);
  fijarTransporteParaPruebas({
    async verify() {
      throw new Error('fallo controlado');
    },
  });
  await assert.rejects(verificarCorreoInicio(), /correo de producción no está disponible/);
  for (const error of [
    { code: 'EAUTH', responseCode: 454 },
    { code: 'ETLS', responseCode: 454 },
    { code: 'ESOCKET' },
  ]) {
    fijarTransporteParaPruebas({
      async verify() {
        throw Object.assign(new Error('fallo permanente'), error);
      },
    });
    await assert.rejects(verificarCorreoInicio(), /correo de producción no está disponible/);
  }
  for (const error of [{ code: 'ETIMEDOUT' }, { code: 'ECONNREFUSED' }, { responseCode: 421 }]) {
    fijarTransporteParaPruebas({
      async verify() {
        throw Object.assign(new Error('caída temporal'), error);
      },
    });
    const resultado = await verificarCorreoInicio();
    assert.equal(resultado.transitorio, true);
    assert.equal(resultado.simulado, false);
  }
  fijarTransporteParaPruebas({ async verify() {} });
  assert.equal((await verificarCorreoInicio()).simulado, false);
  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_PORT = 'incorrecto';
  await assert.rejects(verificarCorreoInicio(), /Configuración SMTP inválida/);
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'usuario';
  await assert.rejects(verificarCorreoInicio(), /Configuración SMTP inválida/);
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  fijarTransporteParaPruebas(null);
  const servidor = createServer();
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(servidor.address().port);
  await new Promise((resolve) => servidor.close(resolve));
  const caidaReal = await verificarCorreoInicio();
  assert.equal(caidaReal.transitorio, true, 'Nodemailer traduce el rechazo real del socket');
  assert.equal(caidaReal.simulado, false);
  delete process.env.SMTP_HOST;
  fijarTransporteParaPruebas(null);
  process.env.NODE_ENV = 'development';
  assert.equal((await verificarCorreoInicio()).simulado, true);
});
