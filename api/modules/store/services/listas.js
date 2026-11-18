import { EspecieCatalogo, Lista, Lote } from '../../../models/index.js';

export async function elementoValido(tipo, idRef) {
  return tipo === 'lote' ? Lote.findByPk(idRef) : EspecieCatalogo.findByPk(idRef);
}

export async function obtenerListaFavoritos(idUsuario) {
  const existente = await Lista.findOne({ where: { id_usuario: idUsuario, nombre: 'Favoritos' } });
  if (existente) return existente;
  const [lista] = await Lista.findOrCreate({
    where: { id_usuario: idUsuario, nombre: 'Favoritos' },
    defaults: { fecha: new Date() },
  });
  return lista;
}
