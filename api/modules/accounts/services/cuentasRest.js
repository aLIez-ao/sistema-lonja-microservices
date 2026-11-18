import { Op } from 'sequelize';
import db from '../../../shared/config/db.js';
import { Usuario, Comprador, DireccionEntrega, Compra, Lote, Especie, Tipo } from '../../../models/index.js';
import { ErrorDeUsuario } from '../../../shared/helpers/utiles.js';
import { crearLimite, problemasPassword, hashToken } from '../../../shared/helpers/seguridad.js';
import { correoValido, telefonoValido } from '../../../shared/helpers/validacion.js';
import { usuarioLibre, erroresRegistro } from './validacionRegistro.js';
import { registrar_transaction, existente_findOne } from './registroConsultas.js';
import {
  enviarVerificacionCorreo,
  enviarEnlacePassword,
  segundosEsperaVerificacion,
  limiteVerificacion,
} from '../helpers/cuentas.js';
import { enviarEmailPasswordCambiada } from '../../../shared/helpers/email.js';
import { compradorDe, compradorPorCorreo, vincularComprador, partirNombre } from '../helpers/comprador.js';
import { prepararFoto } from '../helpers/avatar.js';
import { usuarioPublico, limiteLoginCuenta } from './sesiones.js';
import { registro } from '../../../shared/helpers/registro.js';

export const limiteRegistro = crearLimite({ max: 5, ventanaMs: 3600000 });
const limiteRecuperar = crearLimite({ max: 5, ventanaMs: 3600000 });
const baseCliente = () => process.env.CLIENTE_URL || 'http://localhost:3000';
const error = (texto, estado = 422) => {
  throw new ErrorDeUsuario(texto, estado);
};
const aviso = { mensaje: 'Si los datos corresponden a una cuenta, recibirás un correo con las instrucciones.' };
export const cuentaPublica = (u) => ({
  ...usuarioPublico(u),
  telefono: u.telefono,
  rfc: u.rfc,
  razon_social: u.razon_social,
  foto: u.foto,
  codigo_cpr: u.codigo_cpr,
  recibir_avisos: u.recibir_avisos,
  preferencias: u.preferencias,
});

function validar(errores) {
  if (errores.length) {
    const e = new ErrorDeUsuario(errores.join('. '), 422);
    e.errores = errores.map((mensaje) => ({ mensaje }));
    throw e;
  }
}

export async function registrarCuenta(b, ip) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) error('Envía los datos del registro.');
  for (const campo of ['nombre', 'apellido_paterno', 'correo', 'password', 'password_confirmar'])
    if (typeof b[campo] !== 'string') error(`Campo inválido: ${campo}.`);
  for (const campo of ['apellido_materno', 'telefono'])
    if (b[campo] !== undefined && typeof b[campo] !== 'string') error(`Campo inválido: ${campo}.`);
  if (b.sitio_web || b.empresa_web) return aviso;
  const entrada = {
    ...b,
    aviso_privacidad: b.aviso_privacidad === true ? 'on' : b.aviso_privacidad,
    recibir_avisos: b.recibir_avisos === true ? 'on' : b.recibir_avisos,
  };
  validar(erroresRegistro(entrada));
  if (limiteRegistro.bloqueado(ip)) error('Demasiados registros. Espera una hora.', 429);
  limiteRegistro.fallo(ip);
  const correo = b.correo.trim().toLowerCase();
  if (await existente_findOne(correo)) return aviso;
  try {
    let resultado;
    for (let intento = 0; intento < 3; intento++) {
      try {
        resultado = await registrar_transaction(
          correo,
          usuarioLibre,
          b.nombre.trim(),
          b.apellido_paterno.trim(),
          String(b.apellido_materno || '').trim() || null,
          entrada,
        );
        break;
      } catch (e) {
        if (e.name !== 'SequelizeUniqueConstraintError' || intento === 2) throw e;
      }
    }
    if (resultado?.us)
      await enviarVerificacionCorreo(baseCliente(), resultado.us).catch((e) =>
        registro.error('No se pudo enviar la verificación', e),
      );
  } catch (e) {
    if (e.name !== 'SequelizeUniqueConstraintError') throw e;
  }
  return aviso;
}

export async function recuperarCuenta(identificador, ip) {
  if (typeof identificador !== 'string' || !identificador.trim() || identificador.length > 80)
    error('Escribe tu correo o usuario.');
  if (limiteRecuperar.bloqueado(ip)) error('Demasiadas solicitudes. Espera una hora.', 429);
  limiteRecuperar.fallo(ip);
  const us = await Usuario.findOne({
    where: { [Op.or]: [{ correo: identificador.trim().toLowerCase() }, { usuario: identificador.trim() }] },
  });
  if (us?.activo && us.correo)
    await enviarEnlacePassword(baseCliente(), us).catch((e) => registro.error('No se pudo enviar la recuperación', e));
  return aviso;
}

export async function verificarCorreo(token) {
  const us = await Usuario.findOne({
    where: { token_verificacion: hashToken(token), token_verificacion_expira: { [Op.gt]: new Date() }, activo: true },
  });
  if (!us) error('El enlace de verificación no es válido o caducó.', 400);
  const [confirmadas] = await Usuario.update(
    { email_verificado: true, token_verificacion: null, token_verificacion_expira: null },
    { where: { id: us.id, token_verificacion: hashToken(token), token_verificacion_expira: { [Op.gt]: new Date() } } },
  );
  if (confirmadas !== 1) error('El enlace de verificación ya se usó o caducó.', 400);
  await us.reload();
  if (us.rol === 'comprador' && !us.codigo_cpr) {
    try {
      await vincularComprador(us);
    } catch (e) {
      if (e.code === 'COMPRADOR_YA_VINCULADO')
        error('Correo verificado; el personal debe reconciliar el comprador vinculado a otra cuenta.', 409);
      throw e;
    }
  }
  return { mensaje: 'Correo verificado.' };
}

export async function restablecer(token, b) {
  validar(problemasPassword(b?.password));
  if (b.password !== b.password_confirmar) error('Las contraseñas no coinciden.');
  const usuario = await db.transaction(async (transaction) => {
    const us = await Usuario.findOne({
      where: { token_recuperacion: hashToken(token), token_recuperacion_expira: { [Op.gt]: new Date() }, activo: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!us) error('El enlace no es válido, ya se usó o caducó.', 400);
    us.password = b.password;
    us.token_recuperacion = null;
    us.token_recuperacion_expira = null;
    us.email_verificado = true;
    await us.save({ transaction });
    limiteLoginCuenta.limpiar(`usuario:${us.id}`);
    return us;
  });
  enviarEmailPasswordCambiada({ usuario, correo: usuario.correo }).catch(() => {});
}

export async function verRestablecimiento(token) {
  const us = await Usuario.findOne({
    where: { token_recuperacion: hashToken(token), token_recuperacion_expira: { [Op.gt]: new Date() }, activo: true },
  });
  if (!us) error('El enlace no es válido, ya se usó o caducó.', 400);
  return { usuario: us.usuario, nombre_completo: us.nombre_completo };
}

export async function verCuenta(usuario) {
  const us = await Usuario.findByPk(usuario.id);
  if (!us?.activo) error('La cuenta no está disponible.', 401);
  const [comprador, direcciones, compras] = await Promise.all([
    compradorDe(us),
    DireccionEntrega.findAll({
      where: { id_usuario: us.id },
      order: [
        ['principal', 'DESC'],
        ['id_dir', 'ASC'],
      ],
    }),
    us.codigo_cpr
      ? Compra.findAll({
          where: { codigo_cpr: us.codigo_cpr },
          include: [
            {
              model: Lote,
              as: 'lote',
              include: [{ model: Especie, as: 'especies', include: [{ model: Tipo, as: 'tipo' }] }],
            },
          ],
          order: [['fecha', 'DESC']],
        })
      : [],
  ]);
  const partes = comprador || partirNombre(us.nombre_completo);
  return {
    us: cuentaPublica(us),
    comprador,
    direcciones,
    compras,
    total: compras.reduce((s, c) => s + Number(c.precio_total), 0).toFixed(2),
    datos: {
      nombre: partes.nombre,
      apellido_paterno: partes.apellido_paterno,
      apellido_materno: partes.apellido_materno || '',
      correo: us.correo || '',
      telefono: us.telefono || '',
      rfc: us.rfc || '',
      razon_social: us.razon_social || '',
    },
  };
}

export async function actualizarCuenta(usuario, entrada) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) error('Envía los datos de tu cuenta.');
  const actual = await verCuenta(usuario);
  const b = { ...actual.datos, ...entrada };
  for (const k of ['nombre', 'apellido_paterno', 'apellido_materno', 'correo', 'telefono', 'rfc', 'razon_social'])
    if (typeof b[k] !== 'string') error(`Campo inválido: ${k}.`);
  const nombre = b.nombre.trim(),
    paterno = b.apellido_paterno.trim(),
    materno = b.apellido_materno.trim();
  const completo = [nombre, paterno, materno].filter(Boolean).join(' ');
  if (!nombre || !paterno || nombre.length > 40 || paterno.length > 40 || materno.length > 40 || completo.length > 80)
    error('Revisa el nombre y los apellidos.');
  const correo = b.correo.trim().toLowerCase();
  if (!correoValido(correo) || correo.length > 80) error('Correo inválido.');
  if (b.telefono && !telefonoValido(b.telefono)) error('Teléfono inválido.');
  if (b.rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(b.rfc)) error('RFC inválido.');
  if (b.razon_social.length > 100) error('La razón social admite 100 caracteres.');
  const us = await Usuario.findByPk(usuario.id);
  const cambia = correo !== us.correo;
  await db.transaction(async (transaction) => {
    const cpr = us.codigo_cpr
      ? await Comprador.findByPk(us.codigo_cpr, { transaction, lock: transaction.LOCK.UPDATE })
      : null;
    const ajeno = cambia && cpr ? await compradorPorCorreo(correo, { transaction }) : null;
    if (ajeno && ajeno.codigo_cpr !== us.codigo_cpr) error('Ese correo pertenece a otro comprador.', 409);
    await us.update(
      {
        nombre_completo: completo,
        correo,
        telefono: b.telefono || null,
        rfc: b.rfc.toUpperCase() || null,
        razon_social: b.razon_social || null,
        ...(cambia && {
          email_verificado: false,
          token_verificacion: null,
          token_verificacion_expira: null,
          token_recuperacion: null,
          token_recuperacion_expira: null,
        }),
      },
      { transaction },
    );
    if (cpr)
      await cpr.update(
        { nombre, apellido_paterno: paterno, apellido_materno: materno || null, ...(cambia && { correo }) },
        { transaction },
      );
  });
  if (cambia)
    await enviarVerificacionCorreo(baseCliente(), us).catch((e) =>
      registro.error('No se pudo enviar la verificación', e),
    );
  return verCuenta(usuario);
}

export async function cambiarAvatar(usuario, fotoData, quitar) {
  const us = await Usuario.findByPk(usuario.id);
  const foto = await prepararFoto(us, { fotoData, quitar });
  try {
    await us.update({ foto: foto.foto });
  } catch (e) {
    await foto.revertir();
    throw e;
  }
  await foto.confirmar();
  return cuentaPublica(us);
}

export async function reenviarVerificacion(usuario) {
  const us = await Usuario.findByPk(usuario.id);
  if (!us.correo) error('La cuenta no tiene correo.');
  if (us.email_verificado) return { mensaje: 'El correo ya está verificado.' };
  if (segundosEsperaVerificacion(us)) error('Espera un minuto antes de reenviar.', 429);
  if (limiteVerificacion.bloqueado(String(us.id))) error('Demasiados envíos. Espera una hora.', 429);
  limiteVerificacion.fallo(String(us.id));
  await enviarVerificacionCorreo(baseCliente(), us);
  return aviso;
}

export async function cambiarPassword(usuario, b) {
  const us = await Usuario.findByPk(usuario.id);
  if (typeof b?.password_actual !== 'string' || !(await us.verificarClave(b.password_actual)))
    error('La contraseña actual no coincide.', 403);
  validar(problemasPassword(b.password, { usuario: us.usuario }));
  if (b.password !== b.password_confirmar) error('Las contraseñas no coinciden.');
  await us.update({ password: b.password });
  enviarEmailPasswordCambiada({ usuario: us, correo: us.correo }).catch(() => {});
}
