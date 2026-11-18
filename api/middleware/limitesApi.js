import { crearLimite, hashToken } from '../shared/helpers/seguridad.js';
import { problema } from './problemas.js';

export function crearLimitadorApi({ max = 300, ventanaMs = 60000 } = {}) {
  const ip = crearLimite({ max, ventanaMs });
  const token = crearLimite({ max, ventanaMs });
  return (req, res, next) => {
    const encabezado = req.get('Authorization');
    const clave = encabezado ? hashToken(encabezado) : null;
    if (ip.bloqueado(req.ip) || (clave && token.bloqueado(clave))) {
      res.set('Retry-After', String(Math.ceil(ventanaMs / 1000)));
      return problema(res, 429, 'Espera antes de volver a intentarlo.');
    }
    ip.fallo(req.ip);
    if (clave) token.fallo(clave);
    next();
  };
}
