import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { crearAlmacenRedis } from '../redis-store.js';

test(
  'Redis conserva sesiones entre procesos y coordina una sola rotación',
  { skip: !process.env.SESSION_REDIS_TEST_URL },
  async (t) => {
    const opciones = { prefix: 'lonja:test:' + randomUUID() + ':' };
    const a = await crearAlmacenRedis(process.env.SESSION_REDIS_TEST_URL, opciones);
    const b = await crearAlmacenRedis(process.env.SESSION_REDIS_TEST_URL, opciones);
    t.after(async () => {
      await b.delete('prueba');
      await Promise.all([a.cerrar(), b.cerrar()]);
    });
    await a.set('prueba', { access: 'anterior', refresh: 'viejo', usuario: { id: 1 }, expira: Date.now() + 60000 });
    assert.equal((await b.get('prueba')).access, 'anterior');
    let llamadas = 0;
    const renovar = async () => {
      llamadas++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { access: 'nuevo', refresh: 'rotado' };
    };
    const resultados = await Promise.all([a.rotar('prueba', 'viejo', renovar), b.rotar('prueba', 'viejo', renovar)]);
    assert.equal(llamadas, 1);
    assert.ok(resultados.every((s) => s.refresh === 'rotado'));
    await b.usuario('prueba', { id: 1, nombre: 'Actualizado' });
    assert.equal((await a.get('prueba')).access, 'nuevo');
    assert.equal((await a.get('prueba')).usuario.nombre, 'Actualizado');
    await assert.rejects(
      a.rotar('prueba', 'rotado', async () => {
        await b.delete('prueba');
        return { access: 'no-resucitar' };
      }),
    );
    assert.equal(await b.get('prueba'), null);
  },
);

test('reiniciar el cliente no borra la sesión persistida', { skip: !process.env.SESSION_REDIS_TEST_URL }, async () => {
  const opciones = { prefix: 'lonja:test:' + randomUUID() + ':' };
  const a = await crearAlmacenRedis(process.env.SESSION_REDIS_TEST_URL, opciones);
  await a.set('reinicio', { access: 'token-servidor', expira: Date.now() + 60000 });
  await a.cerrar();
  const b = await crearAlmacenRedis(process.env.SESSION_REDIS_TEST_URL, opciones);
  try {
    assert.equal((await b.get('reinicio')).access, 'token-servidor');
  } finally {
    await b.delete('reinicio');
    await b.cerrar();
  }
});
