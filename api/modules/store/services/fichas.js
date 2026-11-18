import * as consultas from './tiendaConsultas.js';
import { lotesDisponibles } from './portada.js';
import { preguntasPublicas } from './preguntas.js';
import { opinionesDeFicha as ponerOpinionesEnFicha } from './opiniones.js';
import { filtroEntero } from '../../../shared/helpers/filtros.js';
import { prepararLote, imagenDeEspecie } from '../../../shared/helpers/tiendaVista.js';
import { rangoDelDia, hoy } from '../../../shared/helpers/fechas.js';
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

  // Lotes parecidos: misma especie y todavía disponibles (solo si el lote se vendió).
  let parecidos = [];
  if (plano.vendido) {
    const nombres = plano.especies.map((e) => e.nombre);
    const ids = nombres.length ? await consultas.idsNombresEspecies(nombres) : [];
    parecidos = await lotesDisponibles(
      { idsLote: ids.filter((x) => x !== plano.id_lte) },
      [['fecha', 'DESC']],
      4,
      hoyInicio,
    );
  }

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

  const social = await ponerOpinionesEnFicha(catalogo.id_cat, req.usuario?.rol === 'comprador' ? req.usuario.id : null);
  return {
    especie: {
      id: catalogo.id_cat,
      nombre,
      tipo: tipo?.nombre || '',
      descripcion,
      imagen,
    },
    lotes,
    ...social,
  };
};
