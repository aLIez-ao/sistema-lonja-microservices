import { col, fn, where as sqlWhere } from 'sequelize';
import db from '../../../shared/config/db.js';
import { Usuario, Comprador } from '../../../models/index.js';

import { compradorPorCorreo } from '../helpers/comprador.js';

export function consulta_findOne(candidato, transaction) {
  return Usuario.findOne({ where: { usuario: candidato }, transaction });
}

export function existente_findOne(correo) {
  return Usuario.findOne({ where: sqlWhere(fn('LOWER', col('correo')), correo) });
}

export async function registrar_transaction(correo, usuarioLibre, nombre, paterno, materno, entrada_body) {
  return db.transaction(async (t) => {
    const yaRegistrado = await Usuario.findOne({
      where: sqlWhere(fn('LOWER', col('correo')), correo),
      transaction: t,
    });
    if (yaRegistrado) return { existente: true };
    const nuevo = await Usuario.create(
      {
        usuario: await usuarioLibre(correo, t),
        nombre_completo: `${nombre} ${paterno}${materno ? ` ${materno}` : ''}`,
        correo,
        telefono: String(entrada_body.telefono ?? '').trim() || null,
        recibir_avisos: entrada_body.recibir_avisos === 'on',
        rol: 'comprador',
        password: entrada_body.password,
      },
      { transaction: t },
    );

    // Si ya existe un comprador de mostrador con ese correo, se vincula al
    // verificar el correo (no antes), para no apropiarse de historiales ajenos.
    const previo = await compradorPorCorreo(correo, { transaction: t });
    if (!previo) {
      const cpr = await Comprador.create(
        {
          nombre,
          apellido_paterno: paterno,
          apellido_materno: materno,
          correo,
        },
        { transaction: t },
      );
      nuevo.codigo_cpr = cpr.codigo_cpr;
      await nuevo.save({ transaction: t });
    }
    return { us: nuevo };
  });
}
