import esquemaActual from './001_esquema_actual.js';
import avisoSuscripcionDescartado from './002_aviso_suscripcion_descartado.js';
import sesion from './003_sesion.js';
import trabajo from './004_trabajo.js';
import idempotencia from './005_idempotencia.js';
import refreshUsado from './006_refresh_usado.js';

export const migraciones = [esquemaActual, avisoSuscripcionDescartado, sesion, trabajo, idempotencia, refreshUsado];
