import db from '../../../shared/config/db.js';
import { Usuario, Lista, ListaItem, CarritoItem, Opinion } from '../../../models/index.js';
import { obtenerListaFavoritos, elementoValido } from './listas.js';
import { loteDisponible, disponibilidadDeLotes } from '../../catalog/index.js';
import { registrarPregunta, actualizarRespuestaPregunta } from './preguntas.js';
import { guardarOpinionComprada } from './opiniones.js';
import { crearLimite } from '../../../shared/helpers/seguridad.js';
import { ErrorDeUsuario } from '../../../shared/helpers/utiles.js';
import * as consultas from './socialConsultas.js';

const limitePreguntas = crearLimite({ max: 5, ventanaMs: 3600000 });
const fallo = (mensaje, estado = 422) => {
  throw new ErrorDeUsuario(mensaje, estado);
};
const esFavoritos = (nombre) => nombre.trim().toLowerCase() === 'favoritos';
const nombreLista = (nombre) =>
  typeof nombre === 'string' && nombre.trim() && nombre.trim().length <= 40 && !esFavoritos(nombre)
    ? nombre.trim()
    : fallo('Nombre de lista inválido o reservado.');
const idValido = (id) =>
  ['number', 'string'].includes(typeof id) &&
  /^\d+$/.test(String(id)) &&
  Number.isSafeInteger(Number(id)) &&
  Number(id) > 0;
async function elemento(b) {
  if (!['lote', 'especie'].includes(b?.tipo) || !idValido(b.id_ref)) fallo('Selecciona un lote o especie válido.');
  if (!(await elementoValido(b.tipo, b.id_ref))) fallo('No existe el lote o especie.', 404);
  return { tipo: b.tipo, id_ref: Number(b.id_ref) };
}
export async function listaPropia(usuario, id) {
  const lista = idValido(id) ? await Lista.findOne({ where: { id_lista: id, id_usuario: usuario.id } }) : null;
  if (!lista) fallo('No encontramos esa lista.', 404);
  return lista;
}
export async function barra(usuario) {
  const lista = await obtenerListaFavoritos(usuario.id);
  const [items, carritoCount] = await Promise.all([
    ListaItem.findAll({ where: { id_lista: lista.id_lista }, attributes: ['tipo', 'id_ref'] }),
    CarritoItem.count({ where: { id_usuario: usuario.id } }),
  ]);
  return {
    favoritos: {
      lote: items.filter((i) => i.tipo === 'lote').map((i) => String(i.id_ref)),
      especie: items.filter((i) => i.tipo === 'especie').map((i) => String(i.id_ref)),
    },
    favoritosCount: items.length,
    carritoCount,
  };
}
export async function agregarCarrito(usuario, id) {
  if (!idValido(id)) fallo('Lote inválido.');
  const { motivo } = await loteDisponible(id, { usuarioId: usuario.id });
  if (motivo) fallo('El lote ya no está disponible o está reservado.', motivo === 'no_existe' ? 404 : 409);
  await CarritoItem.findOrCreate({ where: { id_usuario: usuario.id, id_lte: id } });
  return { cantidad: await CarritoItem.count({ where: { id_usuario: usuario.id } }) };
}
export async function quitarCarrito(usuario, id) {
  await CarritoItem.destroy({ where: { id_usuario: usuario.id, ...(id !== undefined && { id_lte: id }) } });
}
export async function guardarLista(usuario, b, id) {
  if (!b || typeof b !== 'object') fallo('Envía el nombre de la lista.');
  if (id) {
    const lista = await listaPropia(usuario, id);
    if (esFavoritos(lista.nombre)) fallo('No puedes renombrar Favoritos.', 409);
    return lista.update({ nombre: nombreLista(b.nombre) });
  }
  return Lista.create({ id_usuario: usuario.id, nombre: nombreLista(b.nombre) });
}
export async function borrarLista(usuario, id) {
  const lista = await listaPropia(usuario, id);
  if (esFavoritos(lista.nombre)) fallo('No puedes borrar Favoritos.', 409);
  await db.transaction(async (transaction) => {
    await ListaItem.destroy({ where: { id_lista: lista.id_lista }, transaction });
    await lista.destroy({ transaction });
  });
}
export async function cambiarItem(usuario, id, b, borrar = false) {
  const lista = await listaPropia(usuario, id);
  const valor = await elemento(b);
  const where = { id_lista: lista.id_lista, ...valor };
  if (borrar) await ListaItem.destroy({ where });
  else await ListaItem.findOrCreate({ where });
}
export async function favorito(usuario, b, alternar = false) {
  const valor = await elemento(b);
  return db.transaction(async (transaction) => {
    await Usuario.findByPk(usuario.id, { transaction, lock: transaction.LOCK.UPDATE });
    const [lista] = await Lista.findOrCreate({ where: { id_usuario: usuario.id, nombre: 'Favoritos' }, transaction });
    const where = { id_lista: lista.id_lista, ...valor };
    const item = await ListaItem.findOne({ where, transaction });
    const favorito = !alternar || !item;
    if (alternar && item) await item.destroy({ transaction });
    else if (!item) await ListaItem.create(where, { transaction });
    return { favorito, total: await ListaItem.count({ where: { id_lista: lista.id_lista }, transaction }) };
  });
}
export async function listaAlCarrito(usuario, id) {
  const lista = await listaPropia(usuario, id);
  const items = await ListaItem.findAll({ where: { id_lista: lista.id_lista, tipo: 'lote' } });
  const estados = await disponibilidadDeLotes(
    items.map((i) => i.id_ref),
    { usuarioId: usuario.id },
  );
  let agregados = 0;
  const noDisponibles = [];
  for (const item of items) {
    const motivo = estados.get(Number(item.id_ref))?.motivo ?? null;
    if (motivo) {
      noDisponibles.push({ id: item.id_ref, motivo });
      continue;
    }
    const [, creado] = await CarritoItem.findOrCreate({ where: { id_usuario: usuario.id, id_lte: item.id_ref } });
    if (creado) agregados++;
  }
  return { agregados, omitidos: noDisponibles.length, noDisponibles };
}
export async function preguntar(usuario, b) {
  if (
    typeof b?.texto !== 'string' ||
    !b.texto.trim() ||
    b.texto.length > 500 ||
    !!b.id_lte === !!b.id_cat ||
    (b.id_lte && !idValido(b.id_lte)) ||
    (b.id_cat && !idValido(b.id_cat))
  )
    fallo('Escribe una pregunta de hasta 500 caracteres y selecciona un lote o especie.');
  if (limitePreguntas.bloqueado(usuario.id)) fallo('Demasiadas preguntas. Espera una hora.', 429);
  limitePreguntas.fallo(usuario.id);
  const resultado = await registrarPregunta({
    usuarioId: usuario.id,
    idLote: b.id_lte,
    idEspecie: b.id_cat,
    texto: b.texto.trim(),
  });
  if (!resultado.ok) fallo(resultado.mensaje, resultado.estado);
}
export async function opinar(usuario, id, b) {
  const estrellas = Number(b?.estrellas);
  if (!idValido(id) || !Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5)
    fallo('Selecciona de una a cinco estrellas.');
  if (b.titulo !== undefined && (typeof b.titulo !== 'string' || b.titulo.length > 80))
    fallo('El título admite 80 caracteres.');
  if (b.texto !== undefined && (typeof b.texto !== 'string' || b.texto.length > 1000))
    fallo('El texto admite 1000 caracteres.');
  const resultado = await guardarOpinionComprada({
    usuario,
    idCatalogo: Number(id),
    estrellas,
    titulo: b.titulo,
    textoOpinion: b.texto,
  });
  if (!resultado.ok) fallo(resultado.mensaje, resultado.estado);
}
export const misPreguntas = (usuario) => consultas.consulta_findAll5(usuario);
export const moderarPreguntas = () => consultas.consulta_findAll6();
export const moderarOpiniones = () => consultas.consulta_findAll7();
export async function responder(usuario, id, b) {
  if (
    !['respondida', 'oculta'].includes(b?.estado) ||
    (b.estado === 'respondida' && (typeof b.respuesta !== 'string' || !b.respuesta.trim() || b.respuesta.length > 500))
  )
    fallo('Estado o respuesta inválidos.');
  if (
    !(await actualizarRespuestaPregunta({
      preguntaId: id,
      estado: b.estado,
      respuesta: b.respuesta,
      usuarioId: usuario.id,
    }))
  )
    fallo('No existe esa pregunta.', 404);
}
export async function borrarOpinion(usuario, id) {
  const opinion = await Opinion.findOne({ where: { id_op: id, id_usuario: usuario.id } });
  if (!opinion) fallo('No existe esa opinión en tu cuenta.', 404);
  await opinion.destroy();
}
export async function visibilidad(id, b) {
  if (typeof b?.visible !== 'boolean') fallo('Visible debe ser booleano.');
  const opinion = await Opinion.findByPk(id);
  if (!opinion) fallo('No existe esa opinión.', 404);
  await opinion.update({ visible: b.visible });
}
