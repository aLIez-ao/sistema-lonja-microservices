import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { arrancar, modelos, db } from './ayuda.js';
import { asegurarEsquema, rellenarCatalogoEspecies, revertirUltimaMigracion } from '../migrations/ejecutor.js';
const { Lote, Especie, EspecieCatalogo, Migracion } = modelos;
let srv;
before(async () => {
  srv = await arrancar();
});
after(() => srv.cerrar());
const loteDePrueba = (kilos = 100) => Lote.create({ kilos, numero_cajas: 10, precio_kilo_salida: 50 });

test('la migración crea el catálogo desde las especies existentes y es idempotente', async () => {
  const lote = await loteDePrueba(80);
  await Especie.bulkCreate([
    { nombre: 'Huachinango', id_lte: lote.id_lte, id_tpo: 1, imagen: '/img/Huachinango.webp' },
    { nombre: 'huachinango', id_lte: lote.id_lte, id_tpo: 1, imagen: null },
    { nombre: 'Camarón', id_lte: lote.id_lte, id_tpo: 2, imagen: '/img/Camaron.webp' },
  ]);

  const primera = await rellenarCatalogoEspecies();
  assert.equal(primera.creados, 2);
  assert.equal(primera.asignados, 3);

  const segunda = await rellenarCatalogoEspecies();
  assert.equal(segunda.creados, 0);
  assert.equal(segunda.asignados, 0);

  assert.equal(await EspecieCatalogo.count(), 2);
  const huachi = await EspecieCatalogo.findOne({ where: { nombre: 'Huachinango' } });
  assert.equal(huachi.id_tpo, 1);
  assert.equal(huachi.imagen, '/img/Huachinango.webp');
  assert.equal(await Especie.count({ where: { id_cat: huachi.id_cat } }), 2);
  assert.equal(await Especie.count({ where: { id_cat: null } }), 0);
  await asegurarEsquema();
  assert.equal(await Migracion.count({ where: { id: '001_esquema_actual' } }), 1);
  assert.equal(await Migracion.count({ where: { id: '002_aviso_suscripcion_descartado' } }), 1);
  assert.equal(await revertirUltimaMigracion(), '006_refresh_usado');
  assert.equal(await revertirUltimaMigracion(), '005_idempotencia');
  assert.equal(await revertirUltimaMigracion(), '004_trabajo');
  assert.equal(await revertirUltimaMigracion(), '003_sesion');
  assert.equal(await revertirUltimaMigracion(), '002_aviso_suscripcion_descartado');
  assert.equal((await db.getQueryInterface().describeTable('usuario')).aviso_suscripcion_descartado, undefined);
  await assert.rejects(revertirUltimaMigracion(), /no tiene una reversión definida/);
  assert.equal(await Migracion.count({ where: { id: '001_esquema_actual' } }), 1);
  await asegurarEsquema();
  assert.ok((await db.getQueryInterface().describeTable('usuario')).aviso_suscripcion_descartado);
});
