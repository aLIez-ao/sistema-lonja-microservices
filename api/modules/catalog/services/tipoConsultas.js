import { Tipo, Especie, Lote, Compra } from '../../../models/index.js';

import { consultarListado } from '../../../shared/helpers/listado.js';
import { condicionBusqueda } from '../../../shared/helpers/busqueda.js';
import { literal } from 'sequelize';

export const ordenTipos = {
  id: 'id_tpo',
  nombre: 'nombre',
  especies: literal('(SELECT COUNT(*) FROM especie WHERE especie.id_tpo = `Tipo`.`id_tpo`)'),
};

export async function lista_listado(l, ORDEN) {
  return consultarListado(l, {
    modelo: Tipo,
    pk: 'id_tpo',
    include: [{ model: Especie, as: 'especies', attributes: ['id_epe'] }],
    includeOrden: [],
    where: await condicionBusqueda('tipos', l.q),
    orden: ORDEN,
  });
}

export function registrar_create(entrada_body) {
  return Tipo.create({ nombre: entrada_body.nombre });
}

export function tipo_findByPk(entrada_params) {
  return Tipo.findByPk(entrada_params.id);
}

export function tipo_findByPk2(entrada_params) {
  return Tipo.findByPk(entrada_params.id, {
    include: [
      {
        model: Especie,
        as: 'especies',
        include: [{ model: Lote, as: 'lote', include: [{ model: Compra, as: 'compra' }] }],
      },
    ],
  });
}

export function tipo_findByPk3(entrada_params) {
  return Tipo.findByPk(entrada_params.id);
}

export function actualizar_update(tipo, entrada_body) {
  return tipo.update({ nombre: entrada_body.nombre });
}

export function eliminar_destroy(entrada_params) {
  return Tipo.destroy({ where: { id_tpo: entrada_params.id } });
}
