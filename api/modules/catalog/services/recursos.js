import * as tiposConsulta from './tipoConsultas.js';
import * as catalogoConsulta from './catalogoConsultas.js';
import * as especiesConsulta from './especieConsultas.js';
import * as lotesConsulta from './loteConsultas.js';
import { leerListado } from '../../../shared/helpers/listado.js';
import { filtroEntero, filtroLista, filtroFecha, filtroNumero } from '../../../shared/helpers/filtros.js';
export { etag } from '../../../shared/helpers/etag.js';
import { etag } from '../../../shared/helpers/etag.js';
import { where, fn, col } from 'sequelize';
import db from '../../../shared/config/db.js';
import {
  Tipo,
  EspecieCatalogo,
  Especie,
  Lote,
  ListaItem,
  Compra,
  Comprador,
  PedidoItem,
} from '../../../models/index.js';
import { sincronizarEspecies } from '../helpers/lotes.js';
import { loteDisponible } from './disponibilidad.js';
import { ErrorDeUsuario } from '../../../shared/helpers/utiles.js';

const recursos = { tipos: Tipo, catalogo: EspecieCatalogo, especies: Especie, lotes: Lote };
const incluye = {
  tipos: [
    {
      model: Especie,
      as: 'especies',
      include: [{ model: Lote, as: 'lote', include: [{ model: Compra, as: 'compra' }] }],
    },
  ],
  catalogo: [{ model: Tipo, as: 'tipo' }],
  especies: [
    { model: Tipo, as: 'tipo' },
    { model: EspecieCatalogo, as: 'catalogo' },
    { model: Lote, as: 'lote', include: [{ model: Compra, as: 'compra' }] },
  ],
  lotes: [
    { model: Especie, as: 'especies', include: [{ model: Tipo, as: 'tipo' }] },
    { model: Compra, as: 'compra', include: [{ model: Comprador, as: 'comprador' }] },
  ],
};
const fallo = (mensaje, estado = 422) => {
  throw new ErrorDeUsuario(mensaje, estado);
};
const idValido = (valor) => /^\d+$/.test(String(valor)) && Number.isSafeInteger(Number(valor)) && Number(valor) > 0;

export function serializar(fila) {
  const plano = typeof fila?.toJSON === 'function' ? fila.toJSON() : fila;
  return JSON.parse(
    JSON.stringify(plano, (clave, valor) =>
      ['precio_kilo_salida', 'precio_kilo_final', 'precio_total', 'total'].includes(clave) && valor !== null
        ? Number(valor).toFixed(2)
        : valor,
    ),
  );
}

export async function listar(recurso, query) {
  const pagina =
    idValido(query.pagina ?? 1) && Number(query.pagina ?? 1) <= 10000
      ? Number(query.pagina ?? 1)
      : fallo('Página inválida.');
  const tamano =
    idValido(query.tamano ?? 25) && Number(query.tamano ?? 25) <= 100
      ? Number(query.tamano ?? 25)
      : fallo('Tamaño inválido (1 a 100).');
  if (query.tipo && !idValido(query.tipo)) fallo('Tipo inválido.');
  const configuraciones = {
    tipos: [tiposConsulta, tiposConsulta.ordenTipos, {}],
    catalogo: [
      catalogoConsulta,
      catalogoConsulta.ordenCatalogo,
      { tipo: filtroEntero, activo: filtroLista('activo', 'inactivo') },
    ],
    especies: [
      especiesConsulta,
      especiesConsulta.ordenEspecies,
      { tipo: filtroEntero, estado: filtroLista('disponibles', 'vendidos') },
    ],
    lotes: [
      lotesConsulta,
      lotesConsulta.ordenLotes,
      {
        estado: filtroLista('disponibles', 'vendidos'),
        desde: filtroFecha,
        hasta: filtroFecha,
        tipo: filtroEntero,
        kilosMin: filtroNumero,
        kilosMax: filtroNumero,
      },
    ],
  };
  const [consulta, orden, filtros] = configuraciones[recurso];
  const campo = query.orden || 'id';
  const alias = Object.keys(orden).find((k) => orden[k] === campo) || campo;
  if (!Object.hasOwn(orden, alias)) fallo('Orden inválido.');
  const normalizada = { ...query, orden: alias, pagina, tam: tamano };
  if (recurso === 'catalogo' && query.activo !== undefined) {
    if (!['true', 'false', 'activo', 'inactivo'].includes(query.activo)) fallo('Estado inválido.');
    normalizada.activo = { true: 'activo', false: 'inactivo' }[query.activo] || query.activo;
  }
  const l = leerListado(
    { query: normalizada, baseUrl: '', path: '/' + recurso },
    {
      orden,
      ordenDefecto: { campo: 'id', dir: 'desc' },
      porPagina: Array.from({ length: 100 }, (_, i) => i + 1),
      filtros,
    },
  );
  await consulta.lista_listado(l, orden);
  let datos = l.filas.map(serializar);
  if (recurso === 'catalogo' && datos.length) {
    const usos = await Especie.findAll({
      attributes: ['id_cat', [fn('COUNT', col('id_epe')), 'cantidad']],
      where: { id_cat: datos.map((f) => f.id_cat) },
      group: ['id_cat'],
      raw: true,
    });
    const porId = new Map(usos.map((u) => [Number(u.id_cat), Number(u.cantidad)]));
    datos = datos.map((f) => ({ ...f, en_uso: porId.get(f.id_cat) || 0 }));
  }
  return { datos, meta: { pagina: l.pagina, tamano: l.tam, total: l.total } };
}

export async function obtener(recurso, id, transaction) {
  if (!idValido(id)) fallo('No existe este recurso.', 404);
  const fila = await recursos[recurso].findByPk(id, { include: incluye[recurso], transaction });
  if (!fila) fallo('No existe este recurso.', 404);
  return fila;
}

async function datosValidos(recurso, entrada, existente, transaction) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) fallo('Se requiere un objeto JSON.');
  const permitidos = {
    tipos: ['nombre'],
    catalogo: ['nombre', 'id_tpo', 'descripcion', 'activo'],
    lotes: ['kilos', 'numero_cajas', 'precio_kilo_salida', 'especies'],
    especies: ['id_lte', 'id_cat'],
  }[recurso];
  if (Object.keys(entrada).some((k) => !permitidos.includes(k))) fallo('La solicitud contiene campos desconocidos.');
  const b = { ...(existente?.get({ plain: true }) || {}), ...entrada };
  const salida = {};
  if (['tipos', 'catalogo'].includes(recurso)) {
    if (typeof b.nombre !== 'string' || !b.nombre.trim() || b.nombre.trim().length > 40)
      fallo('El nombre es obligatorio y admite 40 caracteres.');
    salida.nombre = b.nombre.trim();
    const duplicados = await recursos[recurso].findAll({
      where: where(fn('LOWER', col('nombre')), salida.nombre.toLowerCase()),
      transaction,
    });
    if (
      duplicados.some(
        (f) =>
          String(f.get(recursos[recurso].primaryKeyAttribute)) !==
          String(existente?.get(recursos[recurso].primaryKeyAttribute)),
      )
    )
      fallo('Ya existe ese nombre.', 409);
  }
  if (recurso === 'catalogo') {
    if (!idValido(b.id_tpo) || !(await Tipo.findByPk(b.id_tpo, { transaction })))
      fallo('Selecciona un tipo existente.');
    if (b.descripcion != null && (typeof b.descripcion !== 'string' || b.descripcion.length > 300))
      fallo('La descripción admite 300 caracteres.');
    if (b.activo !== undefined && typeof b.activo !== 'boolean') fallo('Activo debe ser booleano.');
    Object.assign(salida, { id_tpo: b.id_tpo, descripcion: b.descripcion || null, activo: b.activo ?? true });
  }
  if (recurso === 'lotes') {
    for (const clave of ['kilos', 'precio_kilo_salida']) {
      if (
        !['number', 'string'].includes(typeof b[clave]) ||
        !/^\d+(?:\.\d{1,2})?$/.test(String(b[clave])) ||
        Number(b[clave]) > 99999999 ||
        Number(b[clave]) < (clave === 'kilos' ? 0.01 : 0)
      )
        fallo(`${clave}: número decimal inválido.`);
      salida[clave] = b[clave];
    }
    if (
      !Number.isInteger(Number(b.numero_cajas)) ||
      b.numero_cajas === '' ||
      Number(b.numero_cajas) < 0 ||
      Number(b.numero_cajas) > 32767
    )
      fallo('Número de cajas inválido.');
    salida.numero_cajas = Number(b.numero_cajas);
    if (!existente || entrada.especies !== undefined) {
      if (!Array.isArray(entrada.especies) || !entrada.especies.length || entrada.especies.some((id) => !idValido(id)))
        fallo('Selecciona al menos una especie del catálogo.');
    }
  }
  if (recurso === 'especies') {
    if (!idValido(b.id_lte) || !idValido(b.id_cat)) fallo('Lote y catálogo son obligatorios.');
    await exigirDisponible(b.id_lte, transaction);
    if (existente && String(existente.id_lte) !== String(b.id_lte))
      await exigirDisponible(existente.id_lte, transaction);
    const catalogo = await EspecieCatalogo.findByPk(b.id_cat, { transaction });
    if (!catalogo?.activo) fallo('Selecciona una especie activa.');
    const duplicada = await Especie.findOne({ where: { id_lte: b.id_lte, id_cat: b.id_cat }, transaction });
    if (duplicada && duplicada.id_epe !== existente?.id_epe) fallo('Esa especie ya pertenece al lote.', 409);
    Object.assign(salida, {
      id_lte: b.id_lte,
      id_cat: b.id_cat,
      nombre: catalogo.nombre,
      id_tpo: catalogo.id_tpo,
      imagen: catalogo.imagen,
    });
  }
  return salida;
}

/** Un lote que estuvo en algún pedido se conserva para no romper el historial de ese pedido. */
async function exigirSinPedidos(id, transaction) {
  if (await PedidoItem.count({ where: { id_lte: id }, transaction }))
    fallo(`El lote #${id} aparece en pedidos anteriores y se conserva por historial.`, 409);
}

async function exigirDisponible(id, transaction) {
  const { motivo } = await loteDisponible(id, { transaction });
  if (motivo)
    fallo(
      motivo === 'no_existe' ? 'No existe el lote.' : 'El lote está reservado o vendido.',
      motivo === 'no_existe' ? 404 : 409,
    );
}

export async function guardar(recurso, entrada, id, ifMatch) {
  return db.transaction(async (transaction) => {
    let existente;
    if (id) {
      // El mismo bloqueo se usa al reservar/vender lotes.
      if (recurso === 'lotes') await exigirDisponible(id, transaction);
      existente = await obtener(recurso, id, transaction);
      if (recurso === 'lotes') {
        if (!ifMatch) fallo('Se requiere If-Match.', 428);
        if (ifMatch !== etag(serializar(existente))) fallo('El lote cambió. Vuelve a cargarlo.', 412);
      }
    }
    const datos = await datosValidos(recurso, entrada, existente, transaction);
    const fila = existente
      ? await existente.update(datos, { transaction })
      : await recursos[recurso].create(datos, { transaction });
    if (recurso === 'lotes' && entrada.especies) {
      try {
        await sincronizarEspecies(fila.id_lte, entrada.especies, transaction);
      } catch (error) {
        if (error.codigo) fallo(error.message, error.codigo === 400 ? 422 : error.codigo);
        throw error;
      }
    }
    return serializar(await obtener(recurso, fila.get(recursos[recurso].primaryKeyAttribute), transaction));
  });
}

export async function eliminar(recurso, id) {
  await db.transaction(async (transaction) => {
    const fila = await obtener(recurso, id, transaction);
    if (recurso === 'lotes') {
      await exigirDisponible(id, transaction);
      await exigirSinPedidos(id, transaction);
    }
    if (recurso === 'especies') await exigirDisponible(fila.id_lte, transaction);
    await fila.destroy({ transaction });
    if (['lotes', 'catalogo'].includes(recurso))
      await ListaItem.destroy({ where: { tipo: recurso === 'lotes' ? 'lote' : 'especie', id_ref: id }, transaction });
  });
}

/** Elimina varios lotes disponibles de forma atómica: todos o ninguno. */
export async function eliminarLotes(cuerpo) {
  const ids = cuerpo?.ids;
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 100 ||
    !ids.every((id) => Number.isSafeInteger(id) && id > 0) ||
    new Set(ids).size !== ids.length
  )
    fallo('Indica entre 1 y 100 lotes distintos.', 400);
  await db.transaction(async (transaction) => {
    // Bloquear todos los lotes antes de leer reservas evita una instantánea anterior a un pedido concurrente.
    await Lote.findAll({
      where: { id_lte: ids },
      order: [['id_lte', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    for (const id of [...ids].sort((a, b) => a - b)) {
      const lote = await obtener('lotes', id, transaction);
      await exigirDisponible(id, transaction);
      await exigirSinPedidos(id, transaction);
      await lote.destroy({ transaction });
    }
    await ListaItem.destroy({ where: { tipo: 'lote', id_ref: ids }, transaction });
  });
}
