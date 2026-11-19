import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, modelos } from './ayuda.js';
import { idempotente } from '../shared/helpers/idempotencia.js';

let usuario;
before(async () => {
  await db.sync({ force: true });
  usuario = await modelos.Usuario.create({
    usuario: 'colisiones',
    nombre_completo: 'Prueba',
    password: 'PruebaColision123',
    rol: 'comprador',
  });
});
after(() => db.close());
const bloqueo = () => Object.assign(new Error('Bloqueo de ensayo'), { original: { errno: 1213 } });
const entrada = (clave, ambito = 'crear-pedido') => ({ usuario, ambito, clave, entrada: { entrega: 'recoger' } });

test('repite la reserva completa y revierte los cambios de los intentos con deadlock', async () => {
  let intentos = 0;
  const salida = await idempotente(entrada('reserva-reintentada'), async (transaction) => {
    await modelos.Tipo.create({ nombre: 'reserva-confirmada' }, { transaction });
    if (++intentos < 3) throw bloqueo();
    return { estado: 201, cuerpo: { ok: true } };
  });
  assert.equal(intentos, 3);
  assert.equal(salida.estado, 201);
  assert.equal(await modelos.Tipo.count({ where: { nombre: 'reserva-confirmada' } }), 1);
  assert.equal(await modelos.Idempotencia.count(), 1);
  await idempotente(entrada('reserva-reintentada'), () =>
    assert.fail('El resultado confirmado no debe ejecutarse de nuevo.'),
  );
});

test('agota tres intentos con conflicto 409 y no deja una respuesta parcial', async () => {
  let intentos = 0;
  await assert.rejects(
    idempotente(entrada('reserva-agotada'), () => {
      intentos++;
      throw bloqueo();
    }),
    (e) => e.estado === 409,
  );
  assert.equal(intentos, 3);
  assert.equal(await modelos.Idempotencia.count(), 1);
});

test('un deadlock en un pago no repite automáticamente la acción de cobro', async () => {
  let cargos = 0;
  await assert.rejects(
    idempotente(entrada('pago-no-repetido', 'pago:1'), () => {
      cargos++;
      throw bloqueo();
    }),
    /Bloqueo de ensayo/,
  );
  assert.equal(cargos, 1);
  assert.equal(await modelos.Idempotencia.count(), 1);
});
