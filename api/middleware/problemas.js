import { randomUUID } from 'node:crypto';
import { ErrorDeUsuario } from '../shared/helpers/utiles.js';
import { registro } from '../shared/helpers/registro.js';

const titulos = {
  400: 'Solicitud inválida',
  401: 'Autenticación requerida',
  403: 'Acceso denegado',
  404: 'Recurso no encontrado',
  406: 'Formato de respuesta no admitido',
  409: 'Conflicto',
  412: 'El recurso ha cambiado',
  413: 'Cuerpo demasiado grande',
  415: 'Formato no admitido',
  422: 'Validación fallida',
  428: 'Precondición requerida',
  429: 'Demasiadas solicitudes',
  500: 'Error interno',
  503: 'Servicio no disponible',
};

export function problema(res, status, detail, errores = []) {
  return res
    .status(status)
    .type('application/problem+json')
    .json({
      type: 'about:blank',
      title: titulos[status] || 'Error',
      status,
      detail,
      errores,
      id: res.locals.requestId,
    });
}

export function correlacion(req, res, next) {
  const recibido = req.get('X-Request-Id');
  res.locals.requestId = /^[A-Za-z0-9_-]{1,80}$/.test(recibido || '') ? recibido : randomUUID();
  res.set('X-Request-Id', res.locals.requestId);
  next();
}

export function erroresApi(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.name === 'MulterError')
    return problema(
      res,
      err.code === 'LIMIT_FILE_SIZE' ? 413 : 422,
      'El archivo o los campos enviados no son válidos.',
    );
  if (err instanceof ErrorDeUsuario) return problema(res, err.estado, err.message, err.errores || []);
  if (['SequelizeUniqueConstraintError', 'SequelizeForeignKeyConstraintError'].includes(err.name))
    return problema(res, 409, 'El registro ya existe o está relacionado con otros datos.');
  if (err.name === 'SequelizeValidationError')
    return problema(
      res,
      422,
      'Revisa los campos.',
      err.errors.map((e) => ({ campo: e.path, mensaje: e.message })),
    );
  if (err.type === 'entity.parse.failed') return problema(res, 400, 'El cuerpo JSON no es válido.');
  if (err.type === 'entity.too.large') return problema(res, 413, 'El cuerpo supera el tamaño permitido.');
  registro.error('Error en la API', { id: res.locals.requestId, error: err });
  return problema(res, 500, 'No se pudo completar la solicitud.');
}
