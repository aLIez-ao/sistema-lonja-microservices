import * as consultas from './tiendaConsultas.js';
import { lotesDisponibles } from './portada.js';
import { preguntasPublicas } from './preguntas.js';
import { opinionesDeFicha as ponerOpinionesEnFicha } from './opiniones.js';
import { filtroEntero } from '../../../shared/helpers/filtros.js';
import { prepararLote, imagenDeEspecie } from '../../../shared/helpers/tiendaVista.js';
import { rangoDelDia, hoy, redondea, formatoFecha } from '../../../shared/helpers/fechas.js';
import { reservasActivas } from '../../catalog/index.js';
import { ErrorDeUsuario } from '../../../shared/helpers/utiles.js';
/** GET /tienda/lote/:id — detalle público de un lote. */
export const datosLote = async (idPedido, usuario = null) => {
  const req = { params: { id: idPedido }, usuario };
  const id = filtroEntero(req.params.id);
  const lote = id ? await consultas.lote_findByPk(id) : null;

  if (!lote) {
    throw new ErrorDeUsuario('No encontramos ese lote o especie disponible.', 404);
  }

  const reserva = (await reservasActivas()).get(Number(lote.id_lte));
  if (reserva && reserva.id_usuario !== req.usuario?.id) {
    throw new ErrorDeUsuario('No encontramos ese lote o especie disponible.', 404);
  }

  const hoyInicio = rangoDelDia(hoy()).inicio;
  const plano = prepararLote(lote, { hoyInicio });
  plano.vendido = Boolean(lote.compra);

  // Lotes parecidos: misma especie, todavía disponibles y distintos de este.
  const nombres = plano.especies.map((e) => e.nombre);
  const ids = nombres.length ? await consultas.idsNombresEspecies(nombres) : [];
  const otros = ids.filter((x) => x !== plano.id_lte);
  const parecidos = otros.length ? await lotesDisponibles({ idsLote: otros }, [['fecha', 'DESC']], 4, hoyInicio) : [];

  return { lote: plano, parecidos, preguntas: await preguntasPublicas({ id_lte: plano.id_lte }) };
};

/** GET /tienda/especie/:id — ficha pública de una especie del catálogo. */
export const datosEspecie = async (idPedido, usuario = null) => {
  const req = { params: { id: idPedido }, usuario };
  const id = filtroEntero(req.params.id);
  const catalogo = id ? await consultas.catalogo_findByPk(id) : null;
  if (!catalogo) {
    throw new ErrorDeUsuario('No encontramos ese lote o especie disponible.', 404);
  }

  const nombre = catalogo.nombre;
  const tipo = catalogo.tipo;
  const descripcion = catalogo.descripcion || '';
  const imagen = catalogo.imagen || imagenDeEspecie({ nombre, tipo });
  const ids = await consultas.idsCatalogoEspecie(catalogo.id_cat);
  const hoyInicio = rangoDelDia(hoy()).inicio;
  const lotes = await lotesDisponibles({ idsLote: ids }, [['fecha', 'DESC']], 24, hoyInicio);

  // Una especie retirada del catálogo solo conserva página pública mientras
  // tenga lotes activos disponibles para consultar.
  if (!catalogo.activo && lotes.length === 0) {
    throw new ErrorDeUsuario('No encontramos ese lote o especie disponible.', 404);
  }

  const [social, tendencia] = await Promise.all([
    ponerOpinionesEnFicha(catalogo.id_cat, req.usuario?.rol === 'comprador' ? req.usuario.id : null),
    tendenciaPrecio(catalogo.id_cat, hoyInicio),
  ]);
  return {
    especie: {
      id: catalogo.id_cat,
      nombre,
      tipo: tipo?.nombre || '',
      descripcion,
      imagen,
    },
    lotes,
    resumenLotes: resumirLotes(lotes),
    tendencia,
    ...social,
  };
};

const DIA = 24 * 60 * 60 * 1000;

/** Disponibilidad de la especie: lotes, kilos y precio de salida más bajo. */
export function resumirLotes(lotes) {
  const kilos = lotes.reduce((s, l) => s + Number(l.kilos), 0);
  const precios = lotes.map((l) => Number(l.precio_kilo_salida));
  return {
    lotes: lotes.length,
    kilos: redondea(kilos),
    precioDesde: precios.length ? Math.min(...precios) : null,
    precioMedio: kilos ? redondea(lotes.reduce((s, l) => s + Number(l.total), 0) / kilos) : null,
  };
}

/** Precio final medio por kilo (ponderado por kilos) de los últimos 7 días; null si ese día no hubo ventas. */
export async function tendenciaPrecio(idCat, hoyInicio) {
  const desde = new Date(hoyInicio.getTime() - 6 * DIA);
  const compras = await consultas.comprasRecientesDeCatalogo(idCat, desde);
  const dias = Array.from({ length: 7 }, (_, i) => new Date(desde.getTime() + i * DIA));
  return dias.map((inicio) => {
    const fin = new Date(inicio.getTime() + DIA);
    const delDia = compras.filter((c) => c.fecha >= inicio && c.fecha < fin);
    const kilos = delDia.reduce((s, c) => s + Number(c.lote.kilos), 0);
    const importe = delDia.reduce((s, c) => s + Number(c.lote.kilos) * Number(c.precio_kilo_final), 0);
    return {
      fecha: formatoFecha(inicio.getTime() + DIA / 2),
      precioMedio: kilos ? redondea(importe / kilos) : null,
      kilos: redondea(kilos),
    };
  });
}
