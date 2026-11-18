import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { obtener, serializar } from './recursos.js';
import { guardarImagenDataURL, borrarImagen } from '../../../shared/helpers/imagenes.js';
import { ErrorDeUsuario } from '../../../shared/helpers/utiles.js';

export async function actualizarImagen(id, data) {
  const fila = await obtener('catalogo', id);
  const opciones = {
    dir: path.join(
      process.env.UPLOADS_DIR || fileURLToPath(new URL('../../../storage/uploads', import.meta.url)),
      'especies',
    ),
    urlBase: '/uploads/especies/',
    prefijo: 'cat',
    maxBytes: 280 * 1024,
  };
  if (typeof data !== 'string') throw new ErrorDeUsuario('Envía un archivo imagen o imagen_data.', 422);
  const nueva = await guardarImagenDataURL(data, opciones);
  try {
    await fila.update({ imagen: nueva });
  } catch (error) {
    await borrarImagen(nueva, opciones);
    throw error;
  }
  // Una imagen anterior puede seguir apareciendo en las copias históricas de especies.
  // Se conserva hasta que un proceso de limpieza compruebe todas sus referencias.
  return serializar(fila);
}
export async function quitarImagen(id) {
  const fila = await obtener('catalogo', id);
  await fila.update({ imagen: null });
}
