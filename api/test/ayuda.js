// Utilidades compartidas por las pruebas: app con SQLite en memoria y un cliente con cookies.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.BD_DIALEC ||= 'sqlite';
if (process.env.BD_DIALEC === 'sqlite') process.env.BD_STORAGE ||= ':memory:';
process.env.SC_JWT ||= 'clave_de_pruebas';
process.env.ADMIN_USER ||= 'admin';
process.env.ADMIN_PASSWORD ||= 'AdminPrueba123';
process.env.GMAIL_USER = '';
process.env.GMAIL_PASS = '';
process.env.EMAIL_USER = '';
process.env.EMAIL_PASS = '';
process.env.APP_URL = '';
const uploadsTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'sistema-lonja-test-'));
process.env.UPLOADS_DIR = uploadsTemp;

const { default: db } = await import('../shared/config/db.js');
const modelos = await import('../models/index.js');
const { default: api } = await import('../app.js');
const { crearAdministradorInicial, crearTiposIniciales } = await import('../modules/accounts/index.js');
const { asegurarEsquema } = await import('../migrations/ejecutor.js');
const { iniciarColaTrabajos, detenerColaTrabajos } = await import('../shared/helpers/colaTrabajos.js');
await import('../shared/helpers/procesadoresTrabajos.js');

export { db, modelos };

/** Arranca la app sobre una BD limpia. Devuelve { base, cerrar }. */
export async function arrancar() {
  await db.sync({ force: true });
  await asegurarEsquema();
  await crearAdministradorInicial();
  await crearTiposIniciales();
  await iniciarColaTrabajos();
  const server = api.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    cerrar: async () => {
      await detenerColaTrabajos();
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      await db.close();
      await fs.rm(uploadsTemp, { recursive: true, force: true });
    },
  };
}
