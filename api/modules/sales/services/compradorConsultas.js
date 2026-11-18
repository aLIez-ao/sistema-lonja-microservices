import { Comprador, Compra, Lote, Especie, Tipo, Usuario } from '../../../models/index.js';

import { consultarListado, combinarWhere } from '../../../shared/helpers/listado.js';
import { condicionBusqueda } from '../../../shared/helpers/busqueda.js';
import { condicionFiltros } from '../../../shared/helpers/filtros.js';
import { literal } from 'sequelize';

export const ordenCompradores = {
  codigo: 'codigo_cpr',
  nombre: 'apellido_paterno',
  correo: 'correo',
  compras: literal('(SELECT COUNT(*) FROM compra WHERE compra.codigo_cpr = `Comprador`.`codigo_cpr`)'),
};

export async function lista_listado(l, ORDEN) {
  return consultarListado(l, {
    modelo: Comprador,
    pk: 'codigo_cpr',
    include: [{ model: Compra, as: 'compras', attributes: ['id_cmp'] }],
    includeOrden: [],
    where: combinarWhere(await condicionBusqueda('compradores', l.q), await condicionFiltros('compradores', l.filtros)),
    orden: ORDEN,
  });
}

export function registrar_create(datos, entrada_body) {
  return Comprador.create(datos(entrada_body));
}

export function comprador_findByPk(entrada_params) {
  return Comprador.findByPk(entrada_params.id);
}

export function comprador_findByPk2(entrada_params) {
  return Comprador.findByPk(entrada_params.id, {
    include: [
      {
        model: Compra,
        as: 'compras',
        include: [
          {
            model: Lote,
            as: 'lote',
            include: [{ model: Especie, as: 'especies', include: [{ model: Tipo, as: 'tipo' }] }],
          },
        ],
      },
      {
        model: Usuario,
        as: 'cuenta',
        attributes: ['id', 'usuario', 'correo', 'email_verificado', 'activo'],
      },
    ],
  });
}

export function comprador_findByPk3(entrada_params) {
  return Comprador.findByPk(entrada_params.id);
}

export function actualizar_update(comprador, datos, entrada_body) {
  return comprador.update(datos(entrada_body));
}

export function eliminar_destroy(entrada_params) {
  return Comprador.destroy({ where: { codigo_cpr: entrada_params.id } });
}
