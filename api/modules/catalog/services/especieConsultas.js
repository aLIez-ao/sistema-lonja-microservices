import { Especie, EspecieCatalogo, Lote, Tipo, Compra } from '../../../models/index.js';

import { consultarListado, combinarWhere } from '../../../shared/helpers/listado.js';
import { condicionBusqueda } from '../../../shared/helpers/busqueda.js';
import { condicionFiltros } from '../../../shared/helpers/filtros.js';
import { col, Op } from 'sequelize';

export const ordenEspecies = { id: 'id_epe', nombre: 'nombre', tipo: col('tipo.nombre'), lote: 'id_lte' };
export const lotesDisponiblesWhere = (excluir) => (excluir.length ? { id_lte: { [Op.notIn]: excluir } } : {});
export const catalogosWhere = (catId) =>
  catId ? { [Op.or]: [{ activo: true }, { id_cat: catId }] } : { activo: true };

export function tipos_findAll() {
  return Tipo.findAll({ order: [['nombre', 'ASC']] });
}

export async function lista_listado(l, ORDEN) {
  return consultarListado(l, {
    modelo: Especie,
    pk: 'id_epe',
    include: [
      { model: Tipo, as: 'tipo' },
      { model: Lote, as: 'lote', include: [{ model: Compra, as: 'compra' }] },
    ],
    includeOrden: [{ model: Tipo, as: 'tipo' }],
    where: combinarWhere(await condicionBusqueda('especies', l.q), await condicionFiltros('especies', l.filtros)),
    orden: ORDEN,
  });
}

export function vendidos_findAll() {
  return Compra.findAll({ attributes: ['id_cmp'], raw: true });
}

export function lotesDisponibles_findAll(where) {
  return Lote.findAll({
    where,
    order: [['id_lte', 'DESC']],
    include: [{ model: Especie, as: 'especies', include: [{ model: Tipo, as: 'tipo' }] }],
  });
}

export function catalogos_findAll(where) {
  return EspecieCatalogo.findAll({ where, include: [{ model: Tipo, as: 'tipo' }], order: [['nombre', 'ASC']] });
}

export function catalogos_findAll2() {
  return Tipo.findAll({ order: [['nombre', 'ASC']] });
}

export function catalogo_findByPk(entrada_body) {
  return EspecieCatalogo.findByPk(entrada_body.id_cat);
}

export function registrar_findOne(entrada_body, catalogo) {
  return Especie.findOne({ where: { id_lte: entrada_body.id_lte, id_cat: catalogo.id_cat } });
}

export function registrar_create(entrada_body, catalogo) {
  return Especie.create({
    id_lte: entrada_body.id_lte,
    id_cat: catalogo.id_cat,
    nombre: catalogo.nombre,
    id_tpo: catalogo.id_tpo,
    imagen: catalogo.imagen,
  });
}

export function especie_findByPk(entrada_params) {
  return Especie.findByPk(entrada_params.id, {
    include: [{ model: Lote, as: 'lote', include: [{ model: Compra, as: 'compra' }] }],
  });
}

export function especie_findByPk2(entrada_params) {
  return Especie.findByPk(entrada_params.id, {
    include: [
      { model: Tipo, as: 'tipo' },
      { model: EspecieCatalogo, as: 'catalogo' },
      { model: Lote, as: 'lote', include: [{ model: Compra, as: 'compra' }] },
    ],
  });
}

export function especie_findByPk3(entrada_params) {
  return Especie.findByPk(entrada_params.id, {
    include: [{ model: Lote, as: 'lote', include: [{ model: Compra, as: 'compra' }] }],
  });
}

export function catalogo_findByPk2(entrada_body) {
  return EspecieCatalogo.findByPk(entrada_body.id_cat);
}

export function repetida_findOne(entrada_body, catalogo) {
  return Especie.findOne({ where: { id_lte: entrada_body.id_lte, id_cat: catalogo.id_cat } });
}

export function actualizar_update(especie, entrada_body, catalogo) {
  return especie.update({
    id_lte: entrada_body.id_lte,
    id_cat: catalogo.id_cat,
    nombre: catalogo.nombre,
    id_tpo: catalogo.id_tpo,
    imagen: catalogo.imagen,
  });
}

export function especie_findByPk4(entrada_params) {
  return Especie.findByPk(entrada_params.id, {
    include: [{ model: Lote, as: 'lote', include: [{ model: Compra, as: 'compra' }] }],
  });
}

export function eliminar_destroy(especie) {
  return especie.destroy();
}
