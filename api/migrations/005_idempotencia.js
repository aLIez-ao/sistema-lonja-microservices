import Idempotencia from '../models/Idempotencia.js';
export async function up({ transaction }) {
  await Idempotencia.sync({ transaction });
}
export async function down({ transaction }) {
  if (await Idempotencia.count({ transaction }))
    throw new Error('Existen respuestas idempotentes; no se puede borrar su registro.');
  await Idempotencia.drop({ transaction });
}
export default { id: '005_idempotencia', up, down };
