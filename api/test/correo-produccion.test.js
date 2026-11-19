import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificarCorreoInicio, fijarTransporteParaPruebas } from '../shared/helpers/email.js';

test('producción rechaza el simulador y los errores de transporte; desarrollo permite el simulador', async (t) => {
  const nombres = ['NODE_ENV', 'SMTP_HOST', 'GMAIL_USER', 'GMAIL_PASS', 'EMAIL_USER', 'EMAIL_PASS'];
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
  fijarTransporteParaPruebas({ async verify() {} });
  assert.equal((await verificarCorreoInicio()).simulado, false);
  fijarTransporteParaPruebas(null);
  process.env.NODE_ENV = 'development';
  assert.equal((await verificarCorreoInicio()).simulado, true);
});
