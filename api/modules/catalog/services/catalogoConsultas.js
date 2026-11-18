import { col, fn, where as sqlWhere } from 'sequelize';
import { Especie, EspecieCatalogo, Tipo } from '../../../models/index.js';

import { consultarListado, combinarWhere } from '../../../shared/helpers/listado.js';
import { condicionBusqueda } from '../../../shared/helpers/busqueda.js';
import { condicionFiltros } from '../../../shared/helpers/filtros.js';

export const ordenCatalogo = { id: 'id_cat', nombre: 'nombre', tipo: col('tipo.nombre'), activo: 'activo' };

export function filas_findAll(nombre) {
  return EspecieCatalogo.findAll({
    where: sqlWhere(fn('LOWER', col('nombre')), String(nombre).trim().toLowerCase()),
  });
}

export function tipos_findAll() {
  return Tipo.findAll({ order: [['nombre', 'ASC']] });
}

export async function lista_listado(l, ORDEN) {
  return consultarListado(l, {
    modelo: EspecieCatalogo,
    pk: 'id_cat',
    include: [{ model: Tipo, as: 'tipo' }],
    where: combinarWhere(await condicionBusqueda('catalogo', l.q), await condicionFiltros('catalogo', l.filtros)),
    orden: ORDEN,
  });
}

export function filas_findAll2(l) {
  return Especie.findAll({
    attributes: ['id_cat'],
    where: { id_cat: l.filas.map((f) => f.id_cat) },
    raw: true,
  });
}

export function verCrear_findAll() {
  return Tipo.findAll({ order: [['nombre', 'ASC']] });
}

export function registrar_findByPk(entrada_body) {
  return Tipo.findByPk(entrada_body.id_tpo);
}

export async function item_create(entrada_body, aplicarImagen) {
  return EspecieCatalogo.create({
    nombre: entrada_body.nombre.trim(),
    id_tpo: entrada_body.id_tpo,
    descripcion: entrada_body.descripcion?.trim() || null,
    imagen: await aplicarImagen(null, entrada_body),
    activo: true,
  });
}

export function conTipo_findByPk(item) {
  return EspecieCatalogo.findByPk(item.id_cat, { include: [{ model: Tipo, as: 'tipo' }] });
}

export function registrar_findAll() {
  return Tipo.findAll({ order: [['nombre', 'ASC']] });
}

export function item_findByPk(entrada_params) {
  return EspecieCatalogo.findByPk(entrada_params.id);
}

export function editar_findAll() {
  return Tipo.findAll({ order: [['nombre', 'ASC']] });
}

export function item_findByPk2(entrada_params) {
  return EspecieCatalogo.findByPk(entrada_params.id);
}

export function actualizar_findByPk(entrada_body) {
  return Tipo.findByPk(entrada_body.id_tpo);
}

export function actualizar_update(item, entrada_body, imagen) {
  return item.update({
    nombre: entrada_body.nombre.trim(),
    id_tpo: entrada_body.id_tpo,
    descripcion: entrada_body.descripcion?.trim() || null,
    imagen,
  });
}

export function actualizar_findAll() {
  return Tipo.findAll({ order: [['nombre', 'ASC']] });
}

export function item_findByPk3(entrada_params) {
  return EspecieCatalogo.findByPk(entrada_params.id);
}

export function desactivar_update(item) {
  return item.update({ activo: false });
}

export function usos_count(item) {
  return Especie.count({ where: { id_cat: item.id_cat } });
}

export function item_findByPk4(entrada_params) {
  return EspecieCatalogo.findByPk(entrada_params.id);
}

export function reactivar_update(item) {
  return item.update({ activo: true });
}
