import * as consultas from './carritoConsultas.js';
import { disponibilidadDeLotes, totalLineas } from '../../catalog/index.js';
import { prepararLote } from '../../../shared/helpers/tiendaVista.js';
export const datosCarrito = async (usuario) => {
  const filas = await consultas.filas_findAll(usuario);
  const estados = await disponibilidadDeLotes(
    filas.map((fila) => fila.id_lte),
    { usuarioId: usuario.id },
  );
  const items = filas.map((fila) => {
    const lote = fila.lote;
    const estado = estados.get(Number(fila.id_lte));
    const reserva = estado?.reserva;
    const problema = !lote
      ? 'El lote ya no existe'
      : estado?.motivo === 'vendido'
        ? 'Este lote ya fue vendido'
        : reserva && reserva.id_usuario !== usuario.id
          ? 'Está reservado por otro comprador'
          : reserva
            ? 'Ya está en un pedido tuyo'
            : null;
    return { id_lte: fila.id_lte, lote: lote ? prepararLote(lote) : null, problema };
  });
  const disponibles = items.filter((i) => !i.problema && i.lote);
  const subtotal = totalLineas(
    disponibles.map((i) => ({
      kilos: i.lote.kilos,
      precio_kilo_salida: i.lote.precio_kilo_salida,
    })),
  );
  return {
    items,
    subtotal,
  };
};
