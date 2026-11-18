import db from '../../../shared/config/db.js';
import { Pedido, Compra, Comprador, Lote, Especie, Tipo } from '../../../models/index.js';
import { crearPedido, pagarPedido, confirmarCobro } from './pedidos.js';
import * as propias from './pedidoConsultas.js';
import * as personal from './pedidoAdminConsultas.js';
import { costoEnvio, reservaMinutos, reservaEfectivoMinutos } from '../helpers/pedidos.js';
import { disponibilidadDeLotes, totalLineas } from '../../catalog/index.js';
import { prepararLote } from '../../../shared/helpers/tiendaVista.js';
import { ErrorDeUsuario } from '../../../shared/helpers/utiles.js';
import { encolarTrabajo } from '../../../shared/helpers/colaTrabajos.js';
import { datosFactura } from '../../../shared/helpers/factura.js';
import { generarFacturaPDF } from '../../../shared/helpers/facturaPdf.js';

const fallo = (mensaje, estado = 422) => {
  throw new ErrorDeUsuario(mensaje, estado);
};
const errorResultado = (estado, mensaje) => ({ estado, cuerpo: { mensaje } });
export async function checkout(usuario, entrega = 'recoger') {
  if (!usuario.email_verificado) fallo('Verifica tu correo antes de comprar.', 403);
  if (!usuario.codigo_cpr) fallo('Tu cuenta no está vinculada a un comprador.', 409);
  const filas = await propias.obtenerCarrito_findAll(usuario.id);
  const estados = await disponibilidadDeLotes(
    filas.map((f) => f.id_lte),
    { usuarioId: usuario.id },
  );
  const items = filas.map((f) => ({
    id_lte: f.id_lte,
    lote: f.lote ? prepararLote(f.lote) : null,
    reservado: !!estados.get(Number(f.id_lte))?.motivo,
  }));
  const subtotal = totalLineas(items.filter((i) => i.lote && !i.reservado).map((i) => i.lote));
  const envio = costoEnvio(subtotal, entrega);
  return {
    items,
    direcciones: await propias.direcciones_findAll(usuario),
    subtotal: subtotal.toFixed(2),
    envio: envio.toFixed(2),
    total: (subtotal + envio).toFixed(2),
    minutos: reservaMinutos(),
    entregaSeleccionada: entrega,
  };
}
export async function crear(usuario, b, transaction) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return errorResultado(422, 'Envía la forma de entrega.');
  try {
    const salida = await crearPedido({ usuario, entrega: b.entrega, idDireccion: b.id_dir, transaction });
    if (!salida.ok) return errorResultado(salida.estado || 400, salida.mensaje);
    return { estado: 201, cuerpo: { datos: salida.pedido } };
  } catch (error) {
    if (error instanceof ErrorDeUsuario) return errorResultado(error.estado, error.message);
    throw error;
  }
}
export async function pagar(usuario, id, b, transaction) {
  const salida = await pagarPedido({
    usuario,
    pedidoId: id,
    metodo: b?.metodo || 'tarjeta',
    tarjeta: b?.tarjeta || b,
    transaction,
  });
  const errores = {
    sin_verificar: [403, 'Verifica tu correo antes de pagar.'],
    metodo_invalido: [422, 'Método de pago inválido.'],
    no_encontrado: [404, 'No existe ese pedido.'],
    rechazado: [422, salida.motivo],
    intentos_agotados: [429, 'Se canceló el pedido tras cinco intentos rechazados.'],
    limite_efectivo: [409, 'Ya tienes tres pedidos pendientes de pago en la lonja.'],
    error: [500, 'No se pudo confirmar el pago.'],
  };
  if (errores[salida.estado]) return errorResultado(...errores[salida.estado]);
  if (!['pagado', 'ya_pagado', 'efectivo_pendiente'].includes(salida.estado))
    return errorResultado(409, 'La reserva venció o el pedido ya no admite pago.');
  if (salida.estado === 'pagado')
    await encolarTrabajo(
      'facturas_pedido',
      { pedidoId: salida.pedido.id_ped, usuarioId: usuario.id, compraIds: salida.compras.map((c) => c.id_cmp) },
      { transaction },
    );
  return { estado: 200, cuerpo: { datos: salida.pedido } };
}
export async function cobrar(id, transaction) {
  const salida = await confirmarCobro({ pedidoId: id, transaction });
  if (!salida.ok) return errorResultado(409, salida.mensaje);
  if (salida.items)
    await encolarTrabajo(
      'aviso_estado_pedido',
      {
        pedidoId: salida.pedido.id_ped,
        usuarioId: salida.pedido.id_usuario,
        asunto: 'Cobro confirmado',
        titulo: 'Pago en la lonja confirmado',
        parrafos: ['El personal confirmó el cobro de tu pedido.'],
      },
      { transaction },
    );
  return { estado: 200, cuerpo: { datos: salida.pedido } };
}
export async function listar(usuario, query) {
  const pagina = Number(query.pagina || 1),
    tamano = Number(query.tamano || 25);
  if (!Number.isSafeInteger(pagina) || pagina < 1 || !Number.isInteger(tamano) || tamano < 1 || tamano > 100)
    fallo('Paginación inválida.');
  const where = await personal.construirFiltros(query);
  if (usuario.rol === 'comprador') where.id_usuario = usuario.id;
  const orden = ['fecha', 'total', 'estado'].includes(query.orden) ? query.orden : 'fecha';
  const { count, rows } = await personal.consulta_findAndCountAll(
    where,
    orden,
    query.dir === 'asc' ? 'ASC' : 'DESC',
    tamano,
    pagina,
  );
  return { datos: rows, meta: { pagina, tamano, total: count } };
}
export async function obtener(usuario, id) {
  if (!/^\d+$/.test(String(id))) fallo('No existe ese pedido.', 404);
  const pedido =
    usuario.rol === 'comprador'
      ? await propias.pedido_findOne3({ id }, usuario)
      : await personal.pedido_findByPk({ id });
  if (!pedido) fallo('No existe ese pedido.', 404);
  const compras = await personal.compras_findAll(pedido);
  return {
    pedido,
    compras,
    siguiente: personal.avanzan[pedido.estado] || null,
    items: pedido.items,
    vence: pedido.reservado_hasta ? new Date(pedido.reservado_hasta).toISOString() : null,
    minutos: reservaMinutos(),
    minutosEfectivo: reservaEfectivoMinutos(),
  };
}
export async function cancelar(usuario, id) {
  await db.transaction(async (transaction) => {
    const pedido = await Pedido.findOne({
      where: { id_ped: id, id_usuario: usuario.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!pedido) fallo('No existe ese pedido.', 404);
    if (pedido.estado !== 'pendiente_pago') fallo('Solo puedes cancelar pedidos pendientes de pago.', 409);
    await pedido.update({ estado: 'cancelado' }, { transaction });
  });
}
export async function cambiarEstado(id, estado) {
  await db.transaction(async (transaction) => {
    const pedido = await Pedido.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!pedido) fallo('No existe ese pedido.', 404);
    if (personal.avanzan[pedido.estado] !== estado || !estado) fallo('No se permite esa transición de estado.', 409);
    await pedido.update({ estado }, { transaction });
    if (['enviado', 'entregado'].includes(estado))
      await encolarTrabajo(
        'aviso_estado_pedido',
        {
          pedidoId: pedido.id_ped,
          usuarioId: pedido.id_usuario,
          asunto: 'Actualización de pedido',
          titulo: 'Pedido ' + estado,
          parrafos: ['Tu pedido fue marcado como ' + estado + '.'],
        },
        { transaction },
      );
  });
}
export async function factura(usuario, id, formato) {
  const compra = await Compra.findOne({
    where: { id_cmp: id },
    include: [
      { model: Comprador, as: 'comprador' },
      {
        model: Lote,
        as: 'lote',
        include: [{ model: Especie, as: 'especies', include: [{ model: Tipo, as: 'tipo' }] }],
      },
    ],
  });
  if (!compra) fallo('No existe esa factura.', 404);
  if (usuario.rol === 'comprador') {
    if (!compra.id_ped) fallo('No existe esa factura en tu cuenta.', 404);
    const pedido = await Pedido.findOne({ where: { id_ped: compra.id_ped, id_usuario: usuario.id } });
    if (!pedido || pedido.estado === 'pendiente_pago') fallo('No existe esa factura en tu cuenta.', 404);
  }
  return formato === 'pdf' ? generarFacturaPDF(compra) : { compra, f: datosFactura(compra) };
}
