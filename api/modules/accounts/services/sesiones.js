import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { Usuario, Sesion } from '../../../models/index.js';
import RefreshUsado from '../../../models/RefreshUsado.js';
import db from '../../../shared/config/db.js';
import { us_findOne } from './loginConsultas.js';
import { crearLimite, hashToken, nuevoToken } from '../../../shared/helpers/seguridad.js';
import { ErrorDeUsuario } from '../../../shared/helpers/utiles.js';

const limiteIP = crearLimite({ max: 5, ventanaMs: 900000 });
const limiteCuenta = crearLimite({ max: 20, ventanaMs: 900000 });
const falso = bcrypt.hashSync('credencial-inexistente', 10);
const opcionesJWT = { algorithms: ['HS256'], issuer: 'lonja-api', audience: 'lonja-cliente' };
const rotaciones = new Map();
const errorSesion = () => new ErrorDeUsuario('La sesión no es válida o caducó.', 401);

export const usuarioPublico = (u) => ({
  id: u.id,
  usuario: u.usuario,
  nombre_completo: u.nombre_completo,
  rol: u.rol,
  correo: u.correo,
  email_verificado: u.email_verificado,
  foto: u.foto,
  preferencias: u.preferencias,
  recibir_avisos: u.recibir_avisos,
  aviso_suscripcion_descartado: u.aviso_suscripcion_descartado,
});

function respuesta(us, sesion, refresh) {
  const access = jwt.sign({ rol: us.rol, v: us.sesion_version, sid: sesion.id }, process.env.SC_JWT, {
    algorithm: 'HS256',
    issuer: 'lonja-api',
    audience: 'lonja-cliente',
    subject: String(us.id),
    expiresIn: '15m',
  });
  return { access, refresh, tipo: 'Bearer', expira_en: 900, usuario: usuarioPublico(us) };
}

export async function entrar({ usuario, password } = {}, ip) {
  if (
    typeof usuario !== 'string' ||
    typeof password !== 'string' ||
    !usuario.trim() ||
    usuario.length > 80 ||
    password.length > 200
  )
    throw new ErrorDeUsuario('Escribe usuario y contraseña.', 422);
  const identificador = usuario.trim().toLowerCase();
  const clave = `${ip}|${identificador}`;
  if (limiteIP.bloqueado(clave)) throw new ErrorDeUsuario('Demasiados intentos. Intenta más tarde.', 429);
  const us = await us_findOne(usuario.trim());
  const claveCuenta = us ? `usuario:${us.id}` : `identificador:${identificador}`;
  if (limiteCuenta.bloqueado(claveCuenta)) throw new ErrorDeUsuario('Demasiados intentos. Intenta más tarde.', 429);
  const coincide = await bcrypt.compare(password, us?.password || falso);
  if (!us || !coincide || !us.activo) {
    limiteIP.fallo(clave);
    limiteCuenta.fallo(claveCuenta);
    throw new ErrorDeUsuario('Revisa las credenciales.', 401);
  }
  limiteIP.limpiar(clave);
  limiteCuenta.limpiar(claveCuenta);
  const refresh = nuevoToken();
  const sesion = await Sesion.create({
    id: randomUUID(),
    id_usuario: us.id,
    hash: hashToken(refresh),
    version: us.sesion_version,
    expira: new Date(Date.now() + 8 * 3600000),
  });
  return respuesta(us, sesion, refresh);
}

export async function renovar(refresh) {
  if (typeof refresh !== 'string' || !/^[a-f0-9]{64}$/.test(refresh)) throw errorSesion();
  const hash = hashToken(refresh);
  if (rotaciones.has(hash)) await rotaciones.get(hash).catch(() => {});
  const previa = await RefreshUsado.findByPk(hash);
  if (previa) {
    await Sesion.destroy({ where: { id: previa.id_sesion } });
    throw errorSesion();
  }
  if (rotaciones.has(hash)) return renovar(refresh);
  const tarea = rotarRefresh(hash);
  rotaciones.set(hash, tarea);
  try {
    return await tarea;
  } finally {
    rotaciones.delete(hash);
  }
}

async function rotarRefresh(hash) {
  const sesion = await Sesion.findOne({ where: { hash, expira: { [Op.gt]: new Date() } } });
  if (!sesion) throw errorSesion();
  const us = await Usuario.scope('sinClave').findByPk(sesion.id_usuario);
  if (!us?.activo || us.sesion_version !== sesion.version) {
    await sesion.destroy();
    throw errorSesion();
  }
  const nuevo = nuevoToken();
  // Compare-and-swap: solo un consumidor puede rotar el mismo refresh.
  const cambiadas = await db.transaction(async (transaction) => {
    const [cantidad] = await Sesion.update(
      { hash: hashToken(nuevo) },
      { where: { id: sesion.id, hash, expira: { [Op.gt]: new Date() } }, transaction },
    );
    if (cantidad === 1) await RefreshUsado.create({ hash, id_sesion: sesion.id }, { transaction });
    return cantidad;
  });
  if (cambiadas !== 1) throw errorSesion();
  return respuesta(us, sesion, nuevo);
}

export async function desdeAccess(token) {
  try {
    const claims = jwt.verify(token, process.env.SC_JWT, opcionesJWT);
    const [us, sesion] = await Promise.all([
      Usuario.scope('sinClave').findByPk(claims.sub),
      Sesion.findByPk(claims.sid),
    ]);
    if (
      !us?.activo ||
      !sesion ||
      sesion.id_usuario !== us.id ||
      +sesion.expira <= Date.now() ||
      claims.v !== us.sesion_version ||
      sesion.version !== us.sesion_version
    )
      throw errorSesion();
    return { usuario: us, sesion };
  } catch (error) {
    if (error instanceof ErrorDeUsuario || error instanceof jwt.JsonWebTokenError) throw errorSesion();
    throw error;
  }
}

export async function salir(id) {
  await Sesion.destroy({ where: { id } });
}

export { limiteCuenta as limiteLoginCuenta };
