import { Op } from 'sequelize';
import {
  Lista,
  ListaItem,
  Pregunta,
  Opinion,
  EspecieCatalogo,
  Especie,
  Lote,
  Compra,
  Pedido,
  Usuario,
  CarritoItem,
  Tipo,
} from '../../../models/index.js';

export function favoritas_findOne(entrada_usuario) {
  return Lista.findOne({ where: { id_usuario: entrada_usuario.id, nombre: 'Favoritos' } });
}

export function consulta_create(entrada_usuario) {
  return Lista.create({ id_usuario: entrada_usuario.id, nombre: 'Favoritos' });
}

export function filas_findAll(entrada_usuario) {
  return Lista.findAll({
    where: { id_usuario: entrada_usuario.id },
    include: [{ model: ListaItem, as: 'items', attributes: ['tipo', 'id_ref', 'fecha'] }],
    order: [
      ['nombre', 'ASC'],
      [{ model: ListaItem, as: 'items' }, 'fecha', 'DESC'],
    ],
  });
}

export function consulta_findAll(idsLotes) {
  return Lote.findAll({
    where: { id_lte: { [Op.in]: idsLotes } },
    include: [{ model: Especie, as: 'especies', include: [{ model: Tipo, as: 'tipo' }] }],
  });
}

export function consulta_findAll2(idsEspecies) {
  return EspecieCatalogo.findAll({ where: { id_cat: { [Op.in]: idsEspecies } } });
}

export function listas_findAll(entrada_usuario) {
  return Lista.findAll({
    where: { id_usuario: entrada_usuario.id },
    attributes: ['id_lista', 'nombre'],
    include: [{ model: ListaItem, as: 'items', attributes: ['tipo', 'id_ref'] }],
    order: [['nombre', 'ASC']],
  });
}

export function consulta_count(lista) {
  return ListaItem.count({ where: { id_lista: lista.id_lista } });
}

export function actual_findOne(where) {
  return ListaItem.findOne({ where });
}

export function consulta_destroy(actual) {
  return actual.destroy();
}

export function consulta_create2(where) {
  return ListaItem.create({ ...where, fecha: new Date() });
}

export function consulta_count2(lista) {
  return ListaItem.count({ where: { id_lista: lista.id_lista } });
}

export function consulta_create3(entrada_usuario, nombre) {
  return Lista.create({ id_usuario: entrada_usuario.id, nombre });
}

export function entidad_findByPk(id_ref) {
  return Lote.findByPk(id_ref);
}

export function entidad_findByPk2(id_ref) {
  return EspecieCatalogo.findByPk(id_ref);
}

export function consulta_findOrCreate(lista, tipo, id_ref) {
  return ListaItem.findOrCreate({ where: { id_lista: lista.id_lista, tipo, id_ref }, defaults: { fecha: new Date() } });
}

export function lista_findOne(entrada_params, entrada_usuario) {
  return Lista.findOne({ where: { id_lista: entrada_params.id, id_usuario: entrada_usuario.id } });
}

export function items_findAll(lista) {
  return ListaItem.findAll({ where: { id_lista: lista.id_lista }, order: [['fecha', 'DESC']] });
}

export function consulta_findAll3(idsLotes) {
  return Lote.findAll({
    where: { id_lte: { [Op.in]: idsLotes } },
    include: [
      { model: Especie, as: 'especies', include: [{ model: Tipo, as: 'tipo' }] },
      { model: Compra, as: 'compra' },
    ],
  });
}

export function consulta_findAll4(idsEspecies) {
  return EspecieCatalogo.findAll({ where: { id_cat: { [Op.in]: idsEspecies } } });
}

export function lista_findOne2(entrada_params, entrada_usuario) {
  return Lista.findOne({ where: { id_lista: entrada_params.id, id_usuario: entrada_usuario.id } });
}

export function consulta_findOrCreate2(lista, tipo, id_ref) {
  return ListaItem.findOrCreate({ where: { id_lista: lista.id_lista, tipo, id_ref }, defaults: { fecha: new Date() } });
}

export function lista_findOne3(entrada_params, entrada_usuario) {
  return Lista.findOne({ where: { id_lista: entrada_params.id, id_usuario: entrada_usuario.id } });
}

export function consulta_update(lista, nombre) {
  return lista.update({ nombre });
}

export function lista_findOne4(entrada_params, entrada_usuario) {
  return Lista.findOne({ where: { id_lista: entrada_params.id, id_usuario: entrada_usuario.id } });
}

export function consulta_destroy2(lista) {
  return ListaItem.destroy({ where: { id_lista: lista.id_lista } });
}

export function consulta_destroy3(lista) {
  return lista.destroy();
}

export function lista_findOne5(entrada_params, entrada_usuario) {
  return Lista.findOne({ where: { id_lista: entrada_params.id, id_usuario: entrada_usuario.id } });
}

export function consulta_destroy4(lista, entrada_body) {
  return ListaItem.destroy({
    where: { id_lista: lista.id_lista, tipo: entrada_body.tipo, id_ref: entrada_body.id_ref },
  });
}

export function lista_findOne6(entrada_params, entrada_usuario) {
  return Lista.findOne({ where: { id_lista: entrada_params.id, id_usuario: entrada_usuario.id } });
}

export function items_findAll2(lista) {
  return ListaItem.findAll({ where: { id_lista: lista.id_lista, tipo: 'lote' } });
}

export function consulta_findOrCreate3(entrada_usuario, item) {
  return CarritoItem.findOrCreate({
    where: { id_usuario: entrada_usuario.id, id_lte: item.id_ref },
    defaults: { fecha: new Date() },
  });
}

export function consulta_findAll5(entrada_usuario) {
  return Pregunta.findAll({ where: { id_usuario: entrada_usuario.id }, order: [['fecha', 'DESC']] });
}

export function consulta_findAll6() {
  return Pregunta.findAll({
    include: [{ model: Usuario, as: 'autor', attributes: ['nombre_completo'] }],
    order: [
      ['estado', 'ASC'],
      ['fecha', 'ASC'],
    ],
  });
}

export function opiniones_findAll(entrada_usuario) {
  return Opinion.findAll({
    where: { id_usuario: entrada_usuario.id },
    include: [{ model: EspecieCatalogo, as: 'especie', attributes: ['id_cat', 'nombre', 'imagen'] }],
    order: [['fecha', 'DESC']],
  });
}

export function compras_findAll(entrada_usuario) {
  return Compra.findAll({
    where: { codigo_cpr: entrada_usuario.codigo_cpr },
    include: [
      {
        model: Lote,
        as: 'lote',
        required: true,
        include: [
          {
            model: Especie,
            as: 'especies',
            required: true,
            where: { id_cat: { [Op.ne]: null } },
            include: [{ model: EspecieCatalogo, as: 'catalogo', attributes: ['id_cat', 'nombre', 'imagen'] }],
          },
        ],
      },
      { model: Pedido, as: 'pedido', required: false, attributes: ['id_ped', 'estado'] },
    ],
    order: [['fecha', 'DESC']],
  });
}

export function opinion_findOne(entrada_params, entrada_usuario) {
  return Opinion.findOne({ where: { id_op: entrada_params.id, id_usuario: entrada_usuario.id } });
}

export function consulta_destroy5(opinion) {
  return opinion.destroy();
}

export function consulta_findAll7() {
  return Opinion.findAll({
    include: [
      { model: Usuario, as: 'autor', attributes: ['nombre_completo'] },
      { model: EspecieCatalogo, as: 'especie' },
    ],
    order: [['fecha', 'DESC']],
  });
}

export function opinion_findByPk(entrada_params) {
  return Opinion.findByPk(entrada_params.id);
}

export function consulta_update2(opinion, entrada_body) {
  return opinion.update({ visible: entrada_body.visible === 'true' });
}
