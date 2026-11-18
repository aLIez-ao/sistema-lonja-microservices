import Sesion from '../models/Sesion.js';

export async function up({ transaction }) {
  await Sesion.sync({ transaction });
}

export async function down({ transaction }) {
  await Sesion.drop({ transaction });
}

export default { id: '003_sesion', up, down };
