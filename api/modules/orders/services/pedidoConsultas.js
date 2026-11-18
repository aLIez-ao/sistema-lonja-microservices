import {
  CarritoItem,
  Pedido,
  PedidoItem,
  Usuario,
  Comprador,
  DireccionEntrega,
  Lote,
  Especie,
  Tipo,
  Compra,
} from '../../../models/index.js';

import { ESTADO_PEDIDO } from '../../../models/Pedido.js';

export const includeEspecies = { model: Especie, as: 'especies', include: [{ model: Tipo, as: 'tipo' }] };

export const includeItems = {
  model: PedidoItem,
  as: 'items',
  include: [{ model: Lote, as: 'lote', include: [includeEspecies] }],
};

export function obtenerCarrito_findAll(usuarioId, transaction) {
  return CarritoItem.findAll({
    where: { id_usuario: usuarioId },
    include: [{ model: Lote, as: 'lote', include: [includeEspecies] }],
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
}

export function usuario_findByPk(entrada_usuario) {
  return Usuario.findByPk(entrada_usuario.id);
}

export function direcciones_findAll(usuario) {
  return DireccionEntrega.findAll({
    where: { id_usuario: usuario.id },
    order: [
      ['principal', 'DESC'],
      ['id_dir', 'ASC'],
    ],
  });
}

export function usuario_findByPk2(entrada_usuario) {
  return Usuario.findByPk(entrada_usuario.id);
}

export function pedido_findOne(entrada_params, entrada_usuario) {
  return Pedido.findOne({
    where: { id_ped: entrada_params.id, id_usuario: entrada_usuario.id },
    include: [includeItems],
  });
}

export function usuario_findByPk3(entrada_usuario) {
  return Usuario.findByPk(entrada_usuario.id);
}

export function pedido_findOne2(entrada_params, entrada_usuario) {
  return Pedido.findOne({ where: { id_ped: entrada_params.id, id_usuario: entrada_usuario.id } });
}

export function cancelar_update(pedido) {
  return pedido.update({ estado: ESTADO_PEDIDO.CANCELADO });
}

export function pedidos_findAll(entrada_usuario) {
  return Pedido.findAll({
    where: { id_usuario: entrada_usuario.id },
    include: [includeItems],
    order: [['fecha', 'DESC']],
  });
}

export function pedido_findOne3(entrada_params, entrada_usuario) {
  return Pedido.findOne({
    where: { id_ped: entrada_params.id, id_usuario: entrada_usuario.id },
    include: [includeItems, { model: Compra, as: 'compras' }],
  });
}

export function pedido_findOne4(entrada_params, entrada_usuario) {
  return Pedido.findOne({ where: { id_ped: entrada_params.id, id_usuario: entrada_usuario.id } });
}

export function consulta_findOne(entrada_params, pedido) {
  return Compra.findOne({
    where: { id_cmp: entrada_params.id_cmp, id_ped: pedido.id_ped, codigo_cpr: pedido.codigo_cpr },
    include: [
      { model: Comprador, as: 'comprador' },
      { model: Lote, as: 'lote', include: [includeEspecies] },
    ],
  });
}
