import Trabajo from '../models/Trabajo.js';

export async function up({ transaction }) {
  await Trabajo.sync({ transaction });
}

export async function down({ transaction }) {
  if (await Trabajo.count({ transaction })) throw new Error('La cola contiene trabajos; no se puede borrar.');
  await Trabajo.drop({ transaction });
}

export default { id: '004_trabajo', up, down };
