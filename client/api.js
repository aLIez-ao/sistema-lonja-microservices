import { erroresFormulario } from './validacion.js';

export class ErrorApi extends Error {
  constructor(status, problema) {
    super(problema?.detail || 'No se pudo contactar con el servicio.');
    this.status = status;
    this.errores = problema?.errores || [];
  }
}

/** Solo el servidor conoce los tokens. Nunca se reenvían cookies del navegador. */
export function crearApi({ url = process.env.API_URL || 'http://127.0.0.1:2900/api/v1', timeout = 10000 } = {}) {
  const base = new URL(url.endsWith('/') ? url : url + '/');
  const renovaciones = new WeakMap();
  async function enviar(
    ruta,
    { method = 'GET', body, sesion, requestId, headers = {}, renovar = true, binario = false } = {},
  ) {
    if (typeof ruta !== 'string' || ruta.startsWith('/') || ruta.includes('..') || /^[a-z]+:/i.test(ruta))
      throw new Error('Ruta de API inválida.');
    const destino = new URL(ruta, base);
    if (destino.origin !== base.origin || !destino.pathname.startsWith(base.pathname))
      throw new Error('Ruta de API inválida.');
    const errores = erroresFormulario(method, ruta, body);
    if (errores.length) throw new ErrorApi(422, { detail: 'Revisa los datos del formulario.', errores });
    let respuesta;
    try {
      respuesta = await fetch(destino, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(timeout),
        headers: {
          Accept: 'application/json',
          ...headers,
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...(sesion?.access && { Authorization: `Bearer ${sesion.access}` }),
          ...(requestId && { 'X-Request-Id': requestId }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ErrorApi(503);
    }
    if (respuesta.status === 401 && sesion?.refresh && renovar) {
      let pendiente = renovaciones.get(sesion);
      if (!pendiente) {
        const renovarTokens = (refresh) =>
          enviar('auth/refresh', {
            method: 'POST',
            body: { refresh },
            renovar: false,
            requestId,
          });
        pendiente = (
          sesion.rotar
            ? sesion.rotar(renovarTokens)
            : renovarTokens(sesion.refresh).then((tokens) => Object.assign(sesion, tokens))
        ).finally(() => renovaciones.delete(sesion));
        renovaciones.set(sesion, pendiente);
      }
      await pendiente;
      return enviar(ruta, { method, body, sesion, requestId, headers, renovar: false, binario });
    }
    if (!respuesta.ok) {
      let problema;
      try {
        problema = await respuesta.json();
      } catch {
        /* respuesta ajena al contrato */
      }
      throw new ErrorApi(respuesta.status, problema);
    }
    if (binario) return respuesta;
    return respuesta.status === 204 ? null : respuesta.json();
  }
  return { pedir: enviar };
}
