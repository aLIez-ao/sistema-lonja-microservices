import db from '../../../shared/config/db.js';
import { Usuario, DireccionEntrega } from '../../../models/index.js';
import { datosDireccion, erroresDireccion, MAX_DIRECCIONES } from './validacionDireccion.js';
import { ErrorDeUsuario } from '../../../shared/helpers/utiles.js';

const error = (texto, estado = 422) => {
  throw new ErrorDeUsuario(texto, estado);
};
const propias = (usuario, transaction) => ({ where: { id_usuario: usuario.id }, transaction });
export const listarDirecciones = (usuario) =>
  DireccionEntrega.findAll({
    ...propias(usuario),
    order: [
      ['principal', 'DESC'],
      ['id_dir', 'ASC'],
    ],
  });
export async function obtenerDireccion(usuario, id, transaction) {
  const fila = /^\d+$/.test(String(id))
    ? await DireccionEntrega.findOne({ where: { id_dir: id, id_usuario: usuario.id }, transaction })
    : null;
  if (!fila) error('No se encontró la dirección.', 404);
  return fila;
}

async function principalUnica(usuario, transaction) {
  const filas = await DireccionEntrega.findAll({
    ...propias(usuario, transaction),
    order: [
      ['principal', 'DESC'],
      ['id_dir', 'ASC'],
    ],
  });
  for (let i = 0; i < filas.length; i++)
    if (filas[i].principal !== (i === 0)) await filas[i].update({ principal: i === 0 }, { transaction });
}

export async function guardarDireccion(usuario, b, id) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) error('Envía una dirección.');
  return db.transaction(async (transaction) => {
    await Usuario.findByPk(usuario.id, { transaction, lock: transaction.LOCK.UPDATE });
    const anterior = id ? await obtenerDireccion(usuario, id, transaction) : null;
    if (!id && (await DireccionEntrega.count(propias(usuario, transaction))) >= MAX_DIRECCIONES)
      error('Puedes guardar como máximo diez direcciones.', 409);
    const entrada = { ...(anterior?.toJSON() || {}), ...b };
    const permitidos = [
      'alias',
      'destinatario',
      'telefono',
      'calle',
      'num_ext',
      'num_int',
      'colonia',
      'cp',
      'municipio',
      'estado',
      'referencias',
      'principal',
    ];
    if (Object.keys(b).some((k) => !permitidos.includes(k))) error('La dirección contiene campos desconocidos.');
    for (const [k, v] of Object.entries(b))
      if (k !== 'principal' && v !== null && typeof v !== 'string') error(`Campo inválido: ${k}.`);
    if (b.principal !== undefined && typeof b.principal !== 'boolean') error('Principal debe ser booleano.');
    const datos = datosDireccion(entrada);
    const errores = erroresDireccion(datos);
    if (errores.length) error(errores.join('. '));
    if (b.principal === true) await DireccionEntrega.update({ principal: false }, propias(usuario, transaction));
    const fila = anterior
      ? await anterior.update(
          { ...datos, ...(b.principal !== undefined && { principal: b.principal }) },
          { transaction },
        )
      : await DireccionEntrega.create(
          { ...datos, id_usuario: usuario.id, principal: b.principal || false },
          { transaction },
        );
    await principalUnica(usuario, transaction);
    return obtenerDireccion(usuario, fila.id_dir, transaction);
  });
}

export async function borrarDireccion(usuario, id) {
  await db.transaction(async (transaction) => {
    await Usuario.findByPk(usuario.id, { transaction, lock: transaction.LOCK.UPDATE });
    await (await obtenerDireccion(usuario, id, transaction)).destroy({ transaction });
    await principalUnica(usuario, transaction);
  });
}
