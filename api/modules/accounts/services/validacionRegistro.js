import * as consultas from './registroConsultas.js';
import { problemasPassword } from '../../../shared/helpers/seguridad.js';
import { correoValido, telefonoValido } from '../../../shared/helpers/validacion.js';
/** Parte local del correo convertida en un nombre de usuario único. */
export async function usuarioLibre(correo, transaction) {
  const base =
    String(correo)
      .split('@')[0]
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 30) || 'comprador';
  let candidato = base;
  let n = 0;
  while (await consultas.consulta_findOne(candidato, transaction)) {
    n += 1;
    candidato = `${base.slice(0, 36)}${n}`;
  }
  return candidato;
}

export function erroresRegistro(b) {
  const errs = [];
  const nombre = String(b.nombre ?? '').trim();
  const paterno = String(b.apellido_paterno ?? '').trim();
  const materno = String(b.apellido_materno ?? '').trim();
  const correo = String(b.correo ?? '').trim();

  if (!nombre) errs.push('El nombre es obligatorio');
  else if (nombre.length > 40) errs.push('Nombre: máximo 40 caracteres');
  if (!paterno) errs.push('El apellido paterno es obligatorio');
  else if (paterno.length > 40) errs.push('Apellido paterno: máximo 40 caracteres');
  if (materno.length > 40) errs.push('Apellido materno: máximo 40 caracteres');
  if (!correoValido(correo) || correo.length > 80)
    errs.push('Escribe un correo electrónico válido (máximo 80 caracteres)');
  if (b.telefono && !telefonoValido(b.telefono)) {
    errs.push('Teléfono: entre 7 y 20 caracteres (dígitos, espacios, +, paréntesis o guiones)');
  }
  if (`${nombre} ${paterno} ${materno}`.trim().length > 80) errs.push('El nombre completo admite máximo 80 caracteres');

  errs.push(...problemasPassword(b.password));
  if (b.password !== b.password_confirmar) errs.push('Las contraseñas no coinciden');
  if (b.aviso_privacidad !== 'on') errs.push('Debes aceptar el aviso de privacidad para crear tu cuenta');
  return errs;
}
