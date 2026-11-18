import { desdeAccess } from '../modules/accounts/services/sesiones.js';
import { problema } from './problemas.js';

export async function autenticar(req, res, next) {
  const coincidencia = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') || '');
  if (!coincidencia) {
    res.set('WWW-Authenticate', 'Bearer');
    return problema(res, 401, 'Se requiere un token Bearer.');
  }
  try {
    const datos = await desdeAccess(coincidencia[1]);
    req.usuario = datos.usuario;
    req.sesionApi = datos.sesion;
    return next();
  } catch (error) {
    if (error.estado === 401) res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
    return next(error);
  }
}

export const exigirRol =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.usuario?.rol) ? next() : problema(res, 403, 'No tienes permiso para realizar esta acción.');
