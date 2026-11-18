import RefreshUsado from '../models/RefreshUsado.js';
export async function up({ transaction }) {
  await RefreshUsado.sync({ transaction });
}
export async function down({ transaction }) {
  if (await RefreshUsado.count({ transaction }))
    throw new Error('Hay sesiones con refresh rotado; revócalas antes de revertir.');
  await RefreshUsado.drop({ transaction });
}
export default { id: '006_refresh_usado', up, down };
