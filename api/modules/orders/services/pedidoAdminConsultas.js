import { Op } from 'sequelize';
import { Pedido, Usuario, Comprador, PedidoItem, Lote, Especie, Compra } from '../../../models/index.js';

import { ESTADOS_PEDIDO, ESTADO_PEDIDO } from '../../../models/Pedido.js';

export const ESTADOS = ESTADOS_PEDIDO;

export const avanzan = {
  [ESTADO_PEDIDO.PAGADO]: ESTADO_PEDIDO.PREPARANDO,
  [ESTADO_PEDIDO.PREPARANDO]: ESTADO_PEDIDO.ENVIADO,
  [ESTADO_PEDIDO.ENVIADO]: ESTADO_PEDIDO.ENTREGADO,
};

export const incluir = [
  { model: Usuario, as: 'usuario', attributes: ['id', 'nombre_completo', 'correo'] },
  { model: Comprador, as: 'comprador' },
  {
    model: PedidoItem,
    as: 'items',
    include: [{ model: Lote, as: 'lote', include: [{ model: Especie, as: 'especies' }] }],
  },
];

export async function construirFiltros(query) {
  const where = {};
  if (ESTADOS.includes(query.estado)) where.estado = query.estado;
  if (['domicilio', 'recoger'].includes(query.entrega)) where.entrega = query.entrega;
  const fechaValida = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(valor || '');
  if (fechaValida(query.desde) || fechaValida(query.hasta)) {
    where.fecha = {};
    if (fechaValida(query.desde)) where.fecha[Op.gte] = new Date(`${query.desde}T00:00:00`);
    if (fechaValida(query.hasta))
      where.fecha[Op.lt] = new Date(new Date(`${query.hasta}T00:00:00`).getTime() + 86400000);
  }
  if (query.q?.trim()) {
    const texto = `%${query.q.trim().slice(0, 80)}%`;
    const [personas, usuarios] = await Promise.all([personas_findAll(texto), usuarios_findAll(texto)]);
    where[Op.or] = [
      { id_ped: Number.isInteger(Number(query.q)) ? Number(query.q) : -1 },
      { codigo_cpr: { [Op.in]: personas.map((persona) => persona.codigo_cpr) } },
      { id_usuario: { [Op.in]: usuarios.map((usuario) => usuario.id) } },
    ];
  }
  return where;
}

export function personas_findAll(q) {
  return Comprador.findAll({
    where: {
      [Op.or]: [{ nombre: { [Op.like]: q } }, { apellido_paterno: { [Op.like]: q } }, { correo: { [Op.like]: q } }],
    },
    attributes: ['codigo_cpr'],
  });
}

export function usuarios_findAll(q) {
  return Usuario.findAll({
    where: {
      [Op.or]: [{ usuario: { [Op.like]: q } }, { nombre_completo: { [Op.like]: q } }, { correo: { [Op.like]: q } }],
    },
    attributes: ['id'],
  });
}

export function consulta_findAndCountAll(where, ordenCampo, direccion, tamano, pagina) {
  return Pedido.findAndCountAll({
    where,
    include: incluir,
    distinct: true,
    order: [[ordenCampo, direccion]],
    limit: tamano,
    offset: (pagina - 1) * tamano,
  });
}

export function pedido_findByPk(entrada_params) {
  return Pedido.findByPk(entrada_params.id, { include: incluir });
}

export function compras_findAll(pedido) {
  return Compra.findAll({ where: { id_ped: pedido.id_ped } });
}

export function pedido_findByPk2(entrada_params) {
  return Pedido.findByPk(entrada_params.id, { include: incluir });
}

export function consulta_update(pedido, siguiente) {
  return pedido.update({ estado: siguiente });
}

export function usuario_findByPk(salida) {
  return Usuario.findByPk(salida.pedido.id_usuario);
}
