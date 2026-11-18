import { Op } from 'sequelize';
import { Usuario } from '../../../models/index.js';

import { hashToken } from '../../../shared/helpers/seguridad.js';

export function us_findOne(usuario) {
  return Usuario.findOne({
    where: { [Op.or]: [{ usuario }, { correo: usuario.toLowerCase() }] },
  });
}

export function us_findOne2(identificador) {
  return Usuario.findOne({
    where: { [Op.or]: [{ correo: identificador.toLowerCase() }, { usuario: identificador }] },
  });
}

export function usuarioDeEnlace_findOne(token) {
  return Usuario.findOne({
    where: { token_recuperacion: hashToken(token), token_recuperacion_expira: { [Op.gt]: new Date() }, activo: true },
  });
}

export function restablecerPassword_save(us) {
  return us.save();
}

export function us_findOne3(hash) {
  return Usuario.findOne({ where: { token_verificacion: hash, activo: true } });
}

export function verificarEmailToken_save(us) {
  return us.save();
}
