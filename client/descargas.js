import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export async function transmitir(respuesta, res) {
  res.status(respuesta.status);
  for (const nombre of [
    'content-type',
    'content-disposition',
    'content-length',
    'etag',
    'cache-control',
    'x-request-id',
  ]) {
    const valor = respuesta.headers.get(nombre);
    if (valor) res.set(nombre, valor);
  }
  if (!respuesta.body) return res.end();
  await pipeline(Readable.fromWeb(respuesta.body), res);
}
