import { Op } from 'sequelize';
import { Compra, Lote, Comprador, Especie, Tipo } from '../../../models/index.js';

export const incluye = [
  { model: Comprador, as: 'comprador' },
  { model: Lote, as: 'lote', include: [{ model: Especie, as: 'especies', include: [{ model: Tipo, as: 'tipo' }] }] },
];

export function compras_findAll(inicio, fin) {
  return Compra.findAll({
    where: { fecha: { [Op.gte]: inicio, [Op.lt]: fin } },
    order: [['fecha', 'ASC']],
    include: incluye,
  });
}

export function consulta_min() {
  return Compra.min('fecha');
}

export function consulta_max() {
  return Compra.max('fecha');
}

export function compras_findAll2(inicio, fin) {
  return Compra.findAll({
    where: { fecha: { [Op.gte]: inicio, [Op.lt]: fin } },
    order: [['fecha', 'ASC']],
    include: incluye,
  });
}
