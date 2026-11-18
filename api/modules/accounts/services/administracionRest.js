import { Op, fn, col } from 'sequelize';
import { Usuario, Pedido } from '../../../models/index.js';
import { ErrorDeUsuario } from '../../../shared/helpers/utiles.js';
import { problemasPassword, passwordInutilizable } from '../../../shared/helpers/seguridad.js';
import { correoValido, telefonoValido } from '../../../shared/helpers/validacion.js';
import { estadoCorreo, enviarCorreoPrueba } from '../../../shared/helpers/email.js';
import { prefValida } from '../../../middleware/preferencias.js';
import { enviarAvisoMasivo } from './avisos.js';
import { enviarEnlacePassword, enviarVerificacionCorreo } from '../helpers/cuentas.js';
import { cuentaPublica, actualizarCuenta, cambiarAvatar } from './cuentasRest.js';
import { idUsuarioDeTokenBajaAvisos } from '../../../shared/helpers/tokens.js';
import { registro } from '../../../shared/helpers/registro.js';
import { condicionBusqueda } from '../../../shared/helpers/busqueda.js';

const fallo = (texto, estado = 422) => {
  throw new ErrorDeUsuario(texto, estado);
};
const publico = (u) => ({ ...cuentaPublica(u), activo: u.activo, puesto: u.puesto });
const baseCliente = () => process.env.CLIENTE_URL || 'http://localhost:3000';
export async function usuarioPorId(id) {
  const u = /^\d+$/.test(String(id)) ? await Usuario.findByPk(id) : null;
  if (!u) fallo('No existe el usuario.', 404);
  return u;
}
export const verUsuario = async (id) => publico(await usuarioPorId(id));

export async function listarUsuarios(query) {
  let pagina = Number(query.pagina || 1);
  const tamano = Number(query.tamano || 20);
  if (
    !Number.isSafeInteger(pagina) ||
    pagina < 1 ||
    pagina > 10000 ||
    !Number.isInteger(tamano) ||
    tamano < 1 ||
    tamano > 100
  )
    fallo('Paginación inválida.');
  const where = {};
  if (query.seccion === 'personal') where.rol = { [Op.in]: ['admin', 'capturista'] };
  if (query.rol) {
    if (!['admin', 'capturista', 'comprador'].includes(query.rol)) fallo('Rol inválido.');
    where.rol = query.rol;
  }
  if (query.verificado === 'verificado') where.email_verificado = true;
  if (query.verificado === 'sin') where.email_verificado = false;
  if (query.q) where[Op.and] = await condicionBusqueda('usuarios', query.q);
  const ordenes = { id: 'id', usuario: 'usuario', nombre: 'nombre_completo', estado: 'activo', rol: 'rol' };
  const orden = ordenes[query.orden] || 'nombre_completo',
    dir = query.dir === 'desc' ? 'DESC' : 'ASC';
  const count = await Usuario.count({ where });
  pagina = Math.min(pagina, Math.max(1, Math.ceil(count / tamano)));
  const rows = await Usuario.findAll({
    where,
    order: [
      [orden, dir],
      ['id', 'ASC'],
    ],
    limit: tamano,
    offset: (pagina - 1) * tamano,
  });
  const cantidades = rows.length
    ? await Pedido.findAll({
        attributes: ['id_usuario', [fn('COUNT', col('id_ped')), 'cantidad']],
        where: { id_usuario: rows.map((u) => u.id) },
        group: ['id_usuario'],
        raw: true,
      })
    : [];
  const pedidos = new Map(cantidades.map((c) => [c.id_usuario, Number(c.cantidad)]));
  return {
    datos: rows.map((u) => ({ ...publico(u), pedidos: pedidos.get(u.id) || 0 })),
    meta: { pagina, tamano, total: count },
  };
}

export async function guardarUsuario(actor, b, id) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) fallo('Envía los datos del usuario.');
  const u = id ? await usuarioPorId(id) : null;
  const entrada = { ...(u?.toJSON() || {}), ...b };
  if (b.password !== undefined && typeof b.password !== 'string') fallo('Contraseña inválida.');
  const rol = entrada.rol || 'capturista';
  if (!['admin', 'capturista', 'comprador'].includes(rol)) fallo('Rol inválido.');
  if ((u?.rol === 'comprador' && rol !== 'comprador') || (u?.rol !== 'comprador' && rol === 'comprador'))
    fallo('El comprador solo se crea en el registro y no cambia de rol.');
  if (u?.id === actor.id && (b.activo === false || rol !== 'admin'))
    fallo('No puedes desactivarte ni quitarte el rol de administrador.', 409);
  if (typeof entrada.usuario !== 'string' || !/^[\w.-]{3,40}$/.test(entrada.usuario))
    fallo('Usuario inválido (3 a 40 caracteres).');
  if (
    typeof entrada.nombre_completo !== 'string' ||
    !entrada.nombre_completo.trim() ||
    entrada.nombre_completo.length > 80
  )
    fallo('Nombre inválido.');
  if (
    entrada.correo &&
    (typeof entrada.correo !== 'string' || !correoValido(entrada.correo) || entrada.correo.length > 80)
  )
    fallo('Correo inválido.');
  if (entrada.telefono && !telefonoValido(entrada.telefono)) fallo('Teléfono inválido.');
  if (entrada.puesto && (typeof entrada.puesto !== 'string' || entrada.puesto.length > 60)) fallo('Puesto inválido.');
  if (b.activo !== undefined && typeof b.activo !== 'boolean') fallo('Activo debe ser booleano.');
  if (b.password) {
    const errores = problemasPassword(b.password, { usuario: entrada.usuario });
    if (errores.length) fallo(errores.join('. '));
    if (b.password !== b.password_confirmar) fallo('Las contraseñas no coinciden.');
  }
  if (!u && !b.password && !entrada.correo) fallo('Para una invitación se requiere correo.');
  const correo = entrada.correo?.trim().toLowerCase() || null;
  const datos = {
    usuario: entrada.usuario,
    nombre_completo: entrada.nombre_completo.trim(),
    correo,
    telefono: entrada.telefono || null,
    puesto: entrada.puesto || null,
    rol,
    activo: b.activo ?? u?.activo ?? true,
    ...(u &&
      correo !== u.correo && { email_verificado: false, token_verificacion: null, token_verificacion_expira: null }),
    ...(b.password && { password: b.password }),
  };
  const guardado = u
    ? await u.update(datos)
    : await Usuario.create({ ...datos, password: b.password || passwordInutilizable() });
  if (!u && correo) {
    try {
      if (b.password) await enviarVerificacionCorreo(baseCliente(), guardado);
      else await enviarEnlacePassword(baseCliente(), guardado, 'invitacion');
    } catch (error) {
      registro.error('Usuario creado; no se pudo enviar el acceso', { error });
    }
  }
  return publico(guardado);
}

export async function eliminarUsuario(actor, id) {
  if (Number(id) === actor.id) fallo('No puedes borrar tu propia cuenta.', 409);
  const u = await usuarioPorId(id);
  if (await Pedido.count({ where: { id_usuario: u.id } })) fallo('La cuenta conserva pedidos; desactívala.', 409);
  await u.destroy();
}
export async function invitarUsuario(id) {
  const u = await usuarioPorId(id);
  if (!u.activo || !u.correo) fallo('La cuenta debe estar activa y tener correo.');
  await enviarEnlacePassword(baseCliente(), u);
  return { mensaje: 'Se envió el enlace de recuperación.' };
}
export async function avatarUsuario(id, data, quitar) {
  return cambiarAvatar(await usuarioPorId(id), data, quitar);
}

export async function verConfiguracion(usuario) {
  const u = await usuarioPorId(usuario.id);
  const totalCompradores = await Usuario.count({
    where: {
      rol: 'comprador',
      activo: true,
      email_verificado: true,
      recibir_avisos: true,
      codigo_cpr: { [Op.ne]: null },
    },
  });
  return {
    us: publico(u),
    totalCompradores,
    estadoCorreo: u.rol === 'admin' ? estadoCorreo() : null,
    appUrl: baseCliente(),
  };
}
export async function guardarPreferencias(usuario, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some((k) => !prefValida(k, b[k])))
    fallo('Preferencias inválidas.');
  const u = await usuarioPorId(usuario.id);
  let previas = {};
  try {
    previas = JSON.parse(u.preferencias || '{}');
  } catch {
    /* preferencias históricas inválidas */
  }
  await u.update({ preferencias: JSON.stringify({ ...previas, ...b }) });
  return { preferencias: JSON.parse(u.preferencias) };
}
export async function actualizarConfiguracion(usuario, b) {
  if (typeof b?.nombre_completo !== 'string' || !b.nombre_completo.trim() || b.nombre_completo.length > 80)
    fallo('Nombre inválido.');
  const u = await usuarioPorId(usuario.id);
  if (b.correo && (typeof b.correo !== 'string' || !correoValido(b.correo) || b.correo.length > 80))
    fallo('Correo inválido.');
  if (b.telefono && !telefonoValido(b.telefono)) fallo('Teléfono inválido.');
  // La actualización de correo y del comprador usa la operación transaccional de cuenta.
  const cambios = { correo: b.correo ?? u.correo ?? '', telefono: b.telefono ?? u.telefono ?? '' };
  await actualizarCuenta(usuario, cambios);
  await u.reload();
  await u.update({
    nombre_completo: b.nombre_completo.trim(),
    ...(u.rol === 'comprador' && { recibir_avisos: b.recibir_avisos === true }),
  });
  return verConfiguracion(usuario);
}
export async function probarCorreo(usuario) {
  const u = await usuarioPorId(usuario.id);
  if (!u.correo) fallo('Tu cuenta no tiene correo.');
  const resultado = await enviarCorreoPrueba({ para: u.correo, usuario: u });
  if (!resultado.ok) fallo(resultado.simulado ? 'El correo no está configurado.' : 'No se pudo enviar el correo.', 503);
  return { mensaje: 'Correo de prueba enviado.' };
}
export async function avisoClientes(b) {
  if (typeof b?.asunto !== 'string' || !b.asunto.trim() || b.asunto.length > 120 || /[\r\n]/.test(b.asunto))
    fallo('Asunto inválido.');
  if (typeof b.mensaje !== 'string' || !b.mensaje.trim() || b.mensaje.length > 4000) fallo('Mensaje inválido.');
  if (b.titulo !== undefined && (typeof b.titulo !== 'string' || b.titulo.length > 120)) fallo('Título inválido.');
  if (!['evento', 'politica', 'urgente'].includes(b.tipo || 'evento')) fallo('Tipo de aviso inválido.');
  const resultado = await enviarAvisoMasivo({ ...b, tipo: b.tipo || 'evento', baseUrl: baseCliente() });
  if (resultado.motivo === 'cola_llena') fallo('La cola está llena.', 503);
  return { mensaje: resultado.ok ? `Aviso en cola para ${resultado.cantidad} suscriptores.` : 'No hay suscriptores.' };
}
export async function bajaAvisos(token, confirmar = false) {
  const id = idUsuarioDeTokenBajaAvisos(token);
  const u = id ? await Usuario.findByPk(id) : null;
  if (!u?.activo || u.rol !== 'comprador') fallo('El enlace no es válido o caducó.', 400);
  if (confirmar) await u.update({ recibir_avisos: false });
  return { mensaje: confirmar ? 'Ya no recibirás avisos por correo.' : 'Confirma la baja de avisos.' };
}
export async function descartarAviso(usuario) {
  await (await usuarioPorId(usuario.id)).update({ aviso_suscripcion_descartado: true });
}
