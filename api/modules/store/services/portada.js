import * as consultas from './tiendaConsultas.js';
import { leerListado } from '../../../shared/helpers/listado.js';
import { filtroEntero, filtroNumero } from '../../../shared/helpers/filtros.js';
import { rangoDelDia, hoy } from '../../../shared/helpers/fechas.js';
import { prepararLote, precioMinimo } from '../../../shared/helpers/tiendaVista.js';
/** Límites de precio y peso sobre el universo completo de lotes disponibles. */
export async function limitesDisponibles() {
  const fila = await consultas.fila_findOne();
  if (fila?.precioMin == null) {
    return { hayLotes: false, precioMin: 0, precioMax: 0, kilosMin: 0, kilosMax: 0, pasoPrecio: 1 };
  }

  const precioRawMin = Number(fila.precioMin);
  const precioRawMax = Number(fila.precioMax);
  const pasoPrecio = precioRawMax - precioRawMin < 50 ? 0.5 : 1;
  return {
    hayLotes: true,
    precioMin: Math.floor(precioRawMin / pasoPrecio) * pasoPrecio,
    precioMax: Math.ceil(precioRawMax / pasoPrecio) * pasoPrecio,
    kilosMin: Math.floor(Number(fila.kilosMin)),
    kilosMax: Math.ceil(Number(fila.kilosMax)),
    pasoPrecio,
  };
}

function normalizarFiltrosTienda(l, limites) {
  const limitar = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, Number(valor)));
  if (!limites.hayLotes) return;

  let minimo =
    l.filtros.precioMin === undefined
      ? limites.precioMin
      : limitar(l.filtros.precioMin, limites.precioMin, limites.precioMax);
  let maximo =
    l.filtros.precioMax === undefined
      ? limites.precioMax
      : limitar(l.filtros.precioMax, limites.precioMin, limites.precioMax);
  if (minimo > maximo) [minimo, maximo] = [maximo, minimo];
  const filtros = { precioMin: minimo, precioMax: maximo };
  for (const [clave, valor] of Object.entries(filtros)) {
    const extremo = clave === 'precioMin' ? limites.precioMin : limites.precioMax;
    if (valor === extremo) {
      delete l.filtros[clave];
      delete l.params[clave];
    } else {
      l.filtros[clave] = valor;
      l.params[clave] = valor;
    }
  }

  if (l.filtros.kilosMin !== undefined) {
    const kilos = Math.round(limitar(l.filtros.kilosMin, limites.kilosMin, limites.kilosMax));
    if (kilos === limites.kilosMin) {
      delete l.filtros.kilosMin;
      delete l.params.kilosMin;
    } else {
      l.filtros.kilosMin = kilos;
      l.params.kilosMin = kilos;
    }
  }
}

/** Lotes disponibles con sus especies, ordenados y limitados. */
export async function lotesDisponibles(where = {}, order = [['fecha', 'DESC']], limit = 8, hoyInicio = null) {
  const filas = await consultas.filas_findAll(where, order, limit, hoyInicio);
  const preparados = filas.map((l) => prepararLote(l, { hoyInicio }));
  const min = precioMinimo(preparados);
  return preparados.map((l) => prepararLote(l, { hoyInicio, minPrecio: min }));
}

/** Ids de lotes que tienen alguna especie con la condición indicada. */
/** GET / — portada pública de la tienda. */
export const datosPortada = async (query) => {
  const req = { query, baseUrl: '', path: '/' };
  const inicioHoy = rangoDelDia(hoy()).inicio;
  const l = leerListado(req, {
    porPagina: [24],
    tamDefecto: 24,
    orden: consultas.ordenPortada,
    ordenDefecto: { campo: 'nuevos', dir: 'desc' },
    filtros: {
      tipo: filtroEntero,
      especie: filtroEntero,
      precioMin: filtroNumero,
      precioMax: filtroNumero,
      kilosMin: filtroNumero,
    },
  });

  const limites = await limitesDisponibles();
  normalizarFiltrosTienda(l, limites);

  const where = await consultas.whereDeFiltros(l);
  await consultas.portada_listado(l, where, consultas.ordenPortada);

  const min = precioMinimo(l.filas.map((f) => ({ precio_kilo_salida: f.precio_kilo_salida })));
  l.filas = l.filas.map((f) => prepararLote(f, { hoyInicio: inicioHoy, minPrecio: min }));

  const [recien, baratos, grandes, pequenos, tipos, catalogo, totalDisponibles, conteosTipo] = await Promise.all([
    lotesDisponibles({ fechaDesde: inicioHoy }, [['fecha', 'DESC']], 8, inicioHoy),
    lotesDisponibles({}, [['precio_kilo_salida', 'ASC']], 8, inicioHoy),
    lotesDisponibles({}, [['kilos', 'DESC']], 8, inicioHoy),
    lotesDisponibles({}, [['kilos', 'ASC']], 8, inicioHoy),
    consultas.portada_findAll(),
    consultas.portada_findAll2(),
    consultas.portada_count(),
    consultas.portada_findAll3(),
  ]);

  // Contador por categoría (lotes distintos, no especies).
  const porTipo = new Map(conteosTipo.map((fila) => [fila.id_tpo, Number(fila.total)]));
  const categorias = tipos.map((tp) => ({
    ...tp.get({ plain: true }),
    total: porTipo.get(tp.id_tpo) || 0,
  }));

  // Héroe: hasta 4 destacados de hoy; si faltan, los de mejor precio.
  const vistos = new Set();
  const destacados = [...recien, ...baratos]
    .filter((lote) => {
      if (vistos.has(lote.id_lte)) return false;
      vistos.add(lote.id_lte);
      return true;
    })
    .slice(0, 4);

  return {
    l,
    categorias,
    catalogo,
    recien,
    baratos,
    grandes,
    pequenos,
    destacados,
    totalDisponibles,
    limites,
    categoriaActiva: l.filtros.tipo || null,
    hayFiltros: Boolean(l.q || Object.keys(l.filtros).length),
    mensaje: req.query.mensaje || null,
  };
};
