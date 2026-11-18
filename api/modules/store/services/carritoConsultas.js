import { CarritoItem, Lote, Especie, Tipo, EspecieCatalogo } from '../../../models/index.js';

export const includeLote = {
  model: Lote,
  as: 'lote',
  include: [
    {
      model: Especie,
      as: 'especies',
      include: [
        { model: Tipo, as: 'tipo' },
        { model: EspecieCatalogo, as: 'catalogo', attributes: ['imagen', 'descripcion'] },
      ],
    },
  ],
};

export function cantidad_count(entrada_usuario) {
  return CarritoItem.count({ where: { id_usuario: entrada_usuario.id } });
}

export function filas_findAll(entrada_usuario) {
  return CarritoItem.findAll({
    where: { id_usuario: entrada_usuario.id },
    include: [includeLote],
    order: [['fecha', 'DESC']],
  });
}

export function agregar_create(entrada_usuario, id) {
  return CarritoItem.create({ id_usuario: entrada_usuario.id, id_lte: id });
}

export function quitar_destroy(entrada_usuario, entrada_params) {
  return CarritoItem.destroy({ where: { id_usuario: entrada_usuario.id, id_lte: entrada_params.id_lte } });
}

export function vaciar_destroy(entrada_usuario) {
  return CarritoItem.destroy({ where: { id_usuario: entrada_usuario.id } });
}
