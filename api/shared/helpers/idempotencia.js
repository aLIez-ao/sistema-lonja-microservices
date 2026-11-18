import db from '../config/db.js';
import { Idempotencia } from '../../models/index.js';
import { hashToken } from './seguridad.js';
import { ErrorDeUsuario } from './utiles.js';

const activas = new Map();
const canonico = (valor) =>
  Array.isArray(valor)
    ? valor.map(canonico)
    : valor && typeof valor === 'object'
      ? Object.fromEntries(
          Object.keys(valor)
            .sort()
            .map((k) => [k, canonico(valor[k])]),
        )
      : valor;
const comprobar = (fila, hash) => {
  if (fila.entrada_hash !== hash) throw new ErrorDeUsuario('La clave de idempotencia ya se usó con otros datos.', 409);
  return { estado: fila.estado, cuerpo: fila.respuesta };
};

/** Reserva y resultado se confirman en la misma transacción que el pedido o pago. */
export async function idempotente({ usuario, ambito, clave, entrada }, accion) {
  if (typeof clave !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(clave))
    throw new ErrorDeUsuario('Se requiere Idempotency-Key (1 a 128 caracteres ASCII).', 400);
  const where = { id_usuario: usuario.id, ambito, clave: hashToken(clave) };
  const hash = hashToken(JSON.stringify(canonico(entrada ?? {})));
  const llave = JSON.stringify(where);
  const activa = activas.get(llave);
  if (activa) {
    if (activa.hash !== hash) throw new ErrorDeUsuario('La clave de idempotencia ya se usó con otros datos.', 409);
    return activa.promesa;
  }
  const promesa = (async () => {
    const previa = await Idempotencia.findOne({ where });
    if (previa) return comprobar(previa, hash);
    try {
      return await db.transaction(async (transaction) => {
        const fila = await Idempotencia.create(
          { ...where, entrada_hash: hash, estado: 0, respuesta: {} },
          { transaction },
        );
        const resultado = await accion(transaction);
        const cuerpo = JSON.parse(JSON.stringify(resultado.cuerpo));
        await fila.update({ estado: resultado.estado, respuesta: cuerpo }, { transaction });
        return { ...resultado, cuerpo };
      });
    } catch (error) {
      if (error.name !== 'SequelizeUniqueConstraintError') throw error;
      const previa = await Idempotencia.findOne({ where });
      if (!previa) throw error;
      return comprobar(previa, hash);
    }
  })();
  activas.set(llave, { hash, promesa });
  try {
    return await promesa;
  } finally {
    activas.delete(llave);
  }
}
