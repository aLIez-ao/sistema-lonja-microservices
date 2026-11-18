import './shared/config/entorno.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { fileURLToPath } from 'node:url';
import db from './shared/config/db.js';
import { correlacion, erroresApi, problema } from './middleware/problemas.js';
import { crearLimitadorApi } from './middleware/limitesApi.js';
import { auth } from './modules/accounts/api/auth.js';
import { tienda } from './modules/store/api/tienda.js';
import { catalog } from './modules/catalog/api/index.js';
import { cuenta } from './modules/accounts/api/cuenta.js';
import { administracion } from './modules/accounts/api/administracion.js';
import { tiendaCuenta } from './modules/store/api/cuenta.js';
import { pedidosApi } from './modules/orders/api/index.js';
import { ventasApi } from './modules/sales/api/index.js';
import { jsonApi } from './shared/helpers/json.js';

const app = express();
app.disable('x-powered-by');
app.set('json replacer', jsonApi);
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
app.use(correlacion);
app.use(helmet());
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
const origenes = (process.env.CORS_ORIGENES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: (origen, cb) => cb(null, !!origen && origenes.includes(origen)), credentials: false }));
app.use(express.json({ limit: '450kb' }));
const salud = async (req, res) => {
  try {
    await db.authenticate();
    res.json({ bd: 'ok' });
  } catch {
    problema(res, 503, 'La base de datos no está disponible.');
  }
};
app.get('/salud', salud);
app.get('/api/v1/salud', salud);
app.use('/api/v1', crearLimitadorApi());
app.use('/api/v1/auth', auth);
app.use('/api/v1/tienda', tienda);
app.use('/api/v1', cuenta);
app.use('/api/v1', administracion);
app.use('/api/v1', tiendaCuenta);
app.use('/api/v1', pedidosApi);
app.use('/api/v1', ventasApi);
app.use(
  '/api/v1/archivos',
  express.static(process.env.UPLOADS_DIR || fileURLToPath(new URL('./storage/uploads', import.meta.url)), {
    dotfiles: 'deny',
    index: false,
  }),
);
app.use('/api/v1', catalog);
if (process.env.NODE_ENV !== 'production') {
  const contrato = YAML.parse(readFileSync(new URL('../contracts/openapi.yaml', import.meta.url), 'utf8'));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(contrato));
}
app.use((req, res) => problema(res, 404, 'No existe este recurso.'));
app.use(erroresApi);

export default app;
