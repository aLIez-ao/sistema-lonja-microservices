import { registro } from '../shared/helpers/registro.js';
import db from '../shared/config/db.js';
import { Migracion } from '../models/index.js';
import { migraciones } from './index.js';
import { rellenarCatalogoEspecies } from './catalogo.js';

export { rellenarCatalogoEspecies };

/** El servidor de producción comprueba versiones; el DDL solo se ejecuta desde migrar. */
export async function comprobarEsquema() {
  const aplicadas = new Set((await Migracion.findAll({ attributes: ['id'], raw: true })).map((m) => m.id));
  const pendientes = migraciones.filter((m) => !aplicadas.has(m.id));
  if (pendientes.length)
    throw new Error(`Hay migraciones pendientes: ${pendientes.map((m) => m.id).join(', ')}. Ejecuta npm run migrar.`);
}

/** Compatibilidad con la llamada histórica. */
export async function asegurarColumnasUsuario() {
  return asegurarEsquema();
}

/** Aplica en orden las migraciones que aún no aparecen en la tabla de versiones. */
export async function asegurarEsquema() {
  for (const migracion of migraciones) {
    if (await Migracion.findByPk(migracion.id)) continue;
    await db.transaction(async (transaction) => {
      await migracion.up({ transaction });
      await Migracion.create({ id: migracion.id, aplicado_en: new Date() }, { transaction });
    });
    registro.info(`Migración aplicada: ${migracion.id}`);
  }
}

/** Revierte la última migración reversible. El proceso de la aplicación debe estar detenido. */
export async function revertirUltimaMigracion() {
  for (const migracion of [...migraciones].reverse()) {
    if (!(await Migracion.findByPk(migracion.id))) continue;
    if (!migracion.down) throw new Error(`La migración ${migracion.id} no tiene una reversión definida.`);
    await db.transaction(async (transaction) => {
      await migracion.down({ transaction });
      await Migracion.destroy({ where: { id: migracion.id }, transaction });
    });
    return migracion.id;
  }
  return null;
}
