import db from '../../../shared/config/db.js';
import { Lote, Especie, EspecieCatalogo, Tipo, Compra, Comprador, ListaItem } from '../../../models/index.js';

import { consultarListado, combinarWhere } from '../../../shared/helpers/listado.js';
import { condicionBusqueda } from '../../../shared/helpers/busqueda.js';
import { condicionFiltros } from '../../../shared/helpers/filtros.js';
import { sincronizarEspecies } from '../helpers/lotes.js';
import { literal, Op } from 'sequelize';

export const ordenLotes = {
  id: 'id_lte',
  fecha: 'fecha',
  kilos: 'kilos',
  cajas: 'numero_cajas',
  salida: 'precio_kilo_salida',
  estado: literal('(SELECT COUNT(*) FROM compra WHERE compra.id_cmp = `Lote`.`id_lte`)'),
};
export const catalogosWhere = (ids) =>
  ids.length ? { [Op.or]: [{ activo: true }, { id_cat: { [Op.in]: ids } }] } : { activo: true };

export function tipos_findAll() {
  return Tipo.findAll({ order: [['nombre', 'ASC']] });
}

export async function lista_listado(l, ORDEN) {
  return consultarListado(l, {
    modelo: Lote,
    pk: 'id_lte',
    include: [
      { model: Especie, as: 'especies', include: [{ model: Tipo, as: 'tipo' }] },
      { model: Compra, as: 'compra', include: [{ model: Comprador, as: 'comprador' }] },
    ],
    includeOrden: [],
    where: combinarWhere(await condicionBusqueda('lotes', l.q), await condicionFiltros('lotes', l.filtros)),
    orden: ORDEN,
  });
}

export function idsActuales_findAll(idLte) {
  return Especie.findAll({ where: { id_lte: idLte }, attributes: ['id_cat'], raw: true });
}

export function catalogos_findAll(where) {
  return EspecieCatalogo.findAll({ where, include: [{ model: Tipo, as: 'tipo' }], order: [['nombre', 'ASC']] });
}

export function catalogos_findAll2() {
  return Tipo.findAll({ order: [['nombre', 'ASC']] });
}

export async function registrar_transaction(datos, entrada_body) {
  return db.transaction(async (t) => {
    const lote = await Lote.create(datos(entrada_body), { transaction: t });
    await sincronizarEspecies(lote.id_lte, entrada_body.especies, t);
  });
}

export function lote_findByPk(entrada_params) {
  return Lote.findByPk(entrada_params.id, { include: [{ model: Compra, as: 'compra' }] });
}

export function lote_findByPk2(entrada_params) {
  return Lote.findByPk(entrada_params.id, {
    include: [
      { model: Especie, as: 'especies', include: [{ model: Tipo, as: 'tipo' }] },
      { model: Compra, as: 'compra', include: [{ model: Comprador, as: 'comprador' }] },
    ],
  });
}

export async function actualizar_transaction(lote, datos, entrada_body) {
  return db.transaction(async (t) => {
    await lote.update(datos(entrada_body), { transaction: t });
    await sincronizarEspecies(lote.id_lte, entrada_body.especies, t);
  });
}

export async function eliminar_transaction(lote) {
  return db.transaction(async (transaction) => {
    await lote.destroy({ transaction });
    await ListaItem.destroy({ where: { tipo: 'lote', id_ref: lote.id_lte }, transaction });
  });
}
