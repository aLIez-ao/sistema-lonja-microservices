import { Compra, Lote, Comprador, Especie, Tipo } from '../../../models/index.js';

import { redondea } from '../../../shared/helpers/fechas.js';

import { consultarListado, combinarWhere } from '../../../shared/helpers/listado.js';
import { condicionBusqueda } from '../../../shared/helpers/busqueda.js';
import { condicionFiltros } from '../../../shared/helpers/filtros.js';
import { col, Op } from 'sequelize';

export const ordenCompras = {
  fecha: 'fecha',
  lote: 'id_cmp',
  comprador: col('comprador.apellido_paterno'),
  kilos: col('lote.kilos'),
  precio: 'precio_kilo_final',
  total: 'precio_total',
};
export const lotesDisponiblesWhere = (incluirId) =>
  incluirId ? { [Op.or]: [{ '$compra.id_cmp$': null }, { id_lte: incluirId }] } : { '$compra.id_cmp$': null };

export const incluye = [
  { model: Comprador, as: 'comprador' },
  { model: Lote, as: 'lote', include: [{ model: Especie, as: 'especies', include: [{ model: Tipo, as: 'tipo' }] }] },
];

export function lotesDisponibles_findAll(where) {
  return Lote.findAll({
    where,
    order: [['id_lte', 'DESC']],
    include: [
      { model: Compra, as: 'compra', required: false, attributes: [] },
      { model: Especie, as: 'especies', include: [{ model: Tipo, as: 'tipo' }] },
    ],
  });
}

export function catalogos_findAll() {
  return Comprador.findAll({
    order: [
      ['apellido_paterno', 'ASC'],
      ['nombre', 'ASC'],
    ],
  });
}

export function lista_findAll() {
  return Comprador.findAll({
    order: [
      ['apellido_paterno', 'ASC'],
      ['nombre', 'ASC'],
    ],
  });
}

export function lista_findAll2() {
  return Tipo.findAll({ order: [['nombre', 'ASC']] });
}

export async function lista_listado(l, ORDEN) {
  return consultarListado(l, {
    modelo: Compra,
    pk: 'id_cmp',
    include: incluye,
    includeOrden: [
      { model: Comprador, as: 'comprador' },
      { model: Lote, as: 'lote' },
    ],
    where: combinarWhere(await condicionBusqueda('compras', l.q), await condicionFiltros('compras', l.filtros)),
    orden: ORDEN,
  });
}

export function compra_findOne(entrada_params) {
  return Compra.findOne({ where: { id_cmp: entrada_params.id }, include: [{ model: Lote, as: 'lote' }] });
}

export function compra_findOne2(entrada_params) {
  return Compra.findOne({ where: { id_cmp: entrada_params.id }, include: [{ model: Lote, as: 'lote' }] });
}

export function actualizar_findByPk(entrada_body) {
  return Comprador.findByPk(entrada_body.codigo_cpr);
}

export function actualizar_update(entrada_body, precio, compra) {
  return Compra.update(
    {
      codigo_cpr: entrada_body.codigo_cpr,
      precio_kilo_final: precio,
      precio_total: redondea(Number(compra.lote.kilos) * precio),
    },
    { where: { id_cmp: compra.id_cmp } },
  );
}

export function compra_findOne3(entrada_params) {
  return Compra.findOne({ where: { id_cmp: entrada_params.id } });
}

export function eliminar_destroy(entrada_params) {
  return Compra.destroy({ where: { id_cmp: entrada_params.id } });
}

export function compra_findOne4(entrada_params) {
  return Compra.findOne({
    where: { id_cmp: entrada_params.id },
    include: incluye,
  });
}

export function compra_findOne5(entrada_params) {
  return Compra.findOne({
    where: { id_cmp: entrada_params.id },
    include: incluye,
  });
}

export function compra_findOne6(entrada_params) {
  return Compra.findOne({
    where: { id_cmp: entrada_params.id },
    include: incluye,
  });
}
