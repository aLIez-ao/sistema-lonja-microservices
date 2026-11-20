import { Op, fn, col, literal, where as sqlWhere } from 'sequelize';
import db from '../../../shared/config/db.js';
import { Lote, Especie, EspecieCatalogo, Tipo, Compra } from '../../../models/index.js';
import { consultarListado, combinarWhere } from '../../../shared/helpers/listado.js';

export const INCLUDE_ESPECIES = [
  {
    model: Especie,
    as: 'especies',
    include: [
      { model: Tipo, as: 'tipo' },
      { model: EspecieCatalogo, as: 'catalogo', attributes: ['id_cat', 'descripcion', 'imagen'] },
    ],
  },
];

export function noReservado_escape(ahora) {
  return db.escape(ahora);
}

const sinCompra = () =>
  sqlWhere(literal('NOT EXISTS (SELECT 1 FROM compra WHERE compra.id_cmp = `Lote`.`id_lte`)'), {
    [Op.eq]: true,
  });
const conEspecies = () =>
  sqlWhere(literal('EXISTS (SELECT 1 FROM especie WHERE especie.id_lte = `Lote`.`id_lte`)'), {
    [Op.eq]: true,
  });
const noReservado = (ahora = new Date()) =>
  sqlWhere(
    literal(
      `NOT EXISTS (SELECT 1 FROM pedido_item pi INNER JOIN pedido p ON p.id_ped = pi.id_ped WHERE pi.id_lte = \`Lote\`.\`id_lte\` AND p.estado = 'pendiente_pago' AND p.reservado_hasta > ${db.escape(ahora)})`,
    ),
    { [Op.eq]: true },
  );

export const disponible = (ahora) => combinarWhere(sinCompra(), conEspecies(), noReservado(ahora));
export const ordenPortada = {
  nuevos: 'fecha',
  precio: 'precio_kilo_salida',
  total: literal('(kilos * precio_kilo_salida)'),
  kilos: 'kilos',
};

export async function idsDeLotesConEspecie(where) {
  const filas = await filas_findAll2(where);
  return [...new Set(filas.map((fila) => fila.id_lte))];
}
export const idsNombresEspecies = async (nombres) => idsDeLotesConEspecie({ nombre: { [Op.in]: nombres } });
export const idsCatalogoEspecie = async (id) => idsDeLotesConEspecie({ id_cat: id });

export async function condicionBusquedaPublica(q) {
  if (!q) return {};
  const ids = await idsDeLotesConEspecie(
    sqlWhere(fn('INSTR', fn('LOWER', col('nombre')), q.toLowerCase()), { [Op.gt]: 0 }),
  );
  const numero = Number(q);
  if (Number.isInteger(numero) && numero > 0) ids.push(numero);
  return { id_lte: { [Op.in]: [...new Set(ids)] } };
}

export async function whereDeFiltros(l) {
  const condiciones = [disponible()];
  if (l.q) condiciones.push(await condicionBusquedaPublica(l.q));
  if (l.filtros.tipo) condiciones.push({ id_lte: { [Op.in]: await idsDeLotesConEspecie({ id_tpo: l.filtros.tipo }) } });
  if (l.filtros.especie)
    condiciones.push({ id_lte: { [Op.in]: await idsDeLotesConEspecie({ id_cat: l.filtros.especie }) } });
  if (l.filtros.precioMin !== undefined) condiciones.push({ precio_kilo_salida: { [Op.gte]: l.filtros.precioMin } });
  if (l.filtros.precioMax !== undefined) condiciones.push({ precio_kilo_salida: { [Op.lte]: l.filtros.precioMax } });
  if (l.filtros.kilosMin !== undefined) condiciones.push({ kilos: { [Op.gte]: l.filtros.kilosMin } });
  return combinarWhere(...condiciones);
}

export function fila_findOne() {
  return Lote.findOne({
    attributes: [
      [fn('MIN', col('precio_kilo_salida')), 'precioMin'],
      [fn('MAX', col('precio_kilo_salida')), 'precioMax'],
      [fn('MIN', col('kilos')), 'kilosMin'],
      [fn('MAX', col('kilos')), 'kilosMax'],
      [fn('AVG', col('precio_kilo_salida')), 'precioMedio'],
      [fn('SUM', col('kilos')), 'kilosTotal'],
    ],
    where: disponible(),
    raw: true,
  });
}

export function filas_findAll(where = {}, order, limit) {
  const { fechaDesde, idsLote, ...resto } = where;
  const condiciones = [];
  if (fechaDesde) condiciones.push({ fecha: { [Op.gte]: fechaDesde } });
  if (idsLote) condiciones.push({ id_lte: { [Op.in]: idsLote } });
  return Lote.findAll({
    where: combinarWhere(disponible(), ...condiciones, resto),
    include: INCLUDE_ESPECIES,
    order,
    limit,
  });
}

export function filas_findAll2(where) {
  return Especie.findAll({ attributes: ['id_lte'], where, raw: true });
}

export function portada_listado(l, where, ORDEN_PORTADA) {
  return consultarListado(l, {
    modelo: Lote,
    pk: 'id_lte',
    include: INCLUDE_ESPECIES,
    includeOrden: [],
    where,
    orden: ORDEN_PORTADA,
  });
}

export function portada_findAll() {
  return Tipo.findAll({ order: [['id_tpo', 'ASC']] });
}

export function portada_findAll2() {
  return EspecieCatalogo.findAll({
    where: { activo: true },
    attributes: ['id_cat', 'nombre'],
    order: [['nombre', 'ASC']],
  });
}

export function portada_count() {
  return Lote.count({ where: disponible() });
}

export function portada_findAll3() {
  return Lote.findAll({
    attributes: [
      [col('especies.id_tpo'), 'id_tpo'],
      [fn('COUNT', fn('DISTINCT', col('Lote.id_lte'))), 'total'],
    ],
    where: disponible(),
    include: [{ model: Especie, as: 'especies', attributes: [], required: true }],
    group: [col('especies.id_tpo')],
    raw: true,
  });
}

export function lote_findByPk(id) {
  return Lote.findByPk(id, {
    include: [
      ...INCLUDE_ESPECIES,
      // Sin include de Comprador: la tienda nunca lee datos del comprador.
      { model: Compra, as: 'compra', attributes: ['id_cmp'] },
    ],
  });
}

export function catalogo_findByPk(id) {
  return EspecieCatalogo.findByPk(id, {
    include: [{ model: Tipo, as: 'tipo' }],
  });
}

export function filas_findAll3(where) {
  return Lote.findAll({
    where,
    include: INCLUDE_ESPECIES,
    order: [['fecha', 'DESC']],
    limit: 8,
  });
}

/** Compras de los últimos días de lotes que contienen la especie del catálogo indicada. */
export function comprasRecientesDeCatalogo(idCat, desde) {
  return Compra.findAll({
    attributes: ['precio_kilo_final', 'fecha'],
    where: {
      fecha: { [Op.gte]: desde },
      id_cmp: { [Op.in]: literal(`(SELECT id_lte FROM especie WHERE id_cat = ${db.escape(Number(idCat))})`) },
    },
    include: [{ model: Lote, as: 'lote', attributes: ['kilos'] }],
    order: [['fecha', 'ASC']],
  });
}
