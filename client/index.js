import dotenv from 'dotenv';
import { crearCliente } from './app.js';
import { crearSesiones } from './sesiones.js';
import { crearAlmacenRedis } from './redis-store.js';

// El cliente solo necesita API_URL, CLIENTE_URL y su configuración de presentación.
dotenv.config({ path: new URL('./.env', import.meta.url), quiet: true });
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_REDIS_URL)
  throw new Error('Configura SESSION_REDIS_URL en producción.');
const almacen = process.env.SESSION_REDIS_URL ? await crearAlmacenRedis(process.env.SESSION_REDIS_URL) : undefined;
const app = crearCliente({ sesiones: crearSesiones({ almacen }) });
const servidor = app.listen(process.env.CLIENTE_PORT || 3000);
for (const senal of ['SIGINT', 'SIGTERM'])
  process.once(senal, () => servidor.close(() => app.locals.sesiones.cerrar()));
