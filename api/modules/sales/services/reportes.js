import * as consultas from './reporteConsultas.js';
import {
  rangoDelDia,
  rangoDelAnio,
  partesFecha,
  formatoHora,
  formatoFecha,
  redondea,
  NOMBRES_MESES,
} from '../../../shared/helpers/fechas.js';
const aFila = (c) => ({
  id_cmp: c.id_cmp,
  fecha: formatoFecha(c.fecha),
  hora: formatoHora(c.fecha),
  marca: new Date(c.fecha).getTime(),
  lote: c.lote.id_lte,
  especies: c.lote.especies.map((e) => `${e.nombre} (${e.tipo.nombre})`).join(', ') || '—',
  nombresEspecies: c.lote.especies.map((e) => e.nombre),
  comprador: `${c.comprador.nombre} ${c.comprador.apellido_paterno} ${c.comprador.apellido_materno ?? ''}`.trim(),
  codigo_cpr: c.comprador.codigo_cpr,
  cajas: c.lote.numero_cajas,
  kilos: Number(c.lote.kilos),
  precio_salida: Number(c.lote.precio_kilo_salida),
  precio_final: Number(c.precio_kilo_final),
  total: Number(c.precio_total),
});

const sumar = (filas) => {
  const t = filas.reduce(
    (a, f) => ({
      compras: a.compras + 1,
      cajas: a.cajas + f.cajas,
      kilos: a.kilos + f.kilos,
      total: a.total + f.total,
    }),
    { compras: 0, cajas: 0, kilos: 0, total: 0 },
  );
  return {
    ...t,
    kilos: redondea(t.kilos),
    total: redondea(t.total),
    precioPromedio: t.kilos ? redondea(t.total / t.kilos) : 0,
  };
};

/** Agrupa por una llave y devuelve el ranking por importe. */
const ranking = (filas, llaves, limite = 5, orden = 'total') => {
  const mapa = new Map();
  for (const f of filas) {
    for (const [llave, nombre] of llaves(f)) {
      const acc = mapa.get(llave) ?? { nombre, compras: 0, kilos: 0, total: 0 };
      acc.compras += 1;
      acc.kilos += f.kilos;
      acc.total += f.total;
      mapa.set(llave, acc);
    }
  }
  return [...mapa.values()]
    .map((r) => ({ ...r, kilos: redondea(r.kilos), total: redondea(r.total) }))
    .sort((a, b) => b[orden] - a[orden])
    .slice(0, limite);
};

/** Compras de un día (se conserva para el CSV diario). */
export async function datosReporte(fecha) {
  const { inicio, fin } = rangoDelDia(fecha);
  const compras = await consultas.compras_findAll(inicio, fin);
  const filas = compras.map(aFila);
  return {
    filas,
    totales: sumar(filas),
    resumen: ranking(filas, (f) => [[f.codigo_cpr, f.comprador]], Infinity).map((r) => ({ ...r, comprador: r.nombre })),
  };
}

/** Años que tienen compras (más el actual), del más reciente al más antiguo. */
async function aniosConCompras() {
  const actual = partesFecha(new Date()).anio;
  const [primera, ultima] = await Promise.all([consultas.consulta_min(), consultas.consulta_max()]);
  if (!primera) return [actual];
  const desde = Math.min(partesFecha(primera).anio, actual);
  const hasta = Math.max(partesFecha(ultima).anio, actual);
  const anios = [];
  for (let a = hasta; a >= desde; a--) anios.push(a);
  return anios;
}

/** Reporte de un año: totales, desglose por mes con sus compras y rankings. */
export async function datosReporteAnual(anioPedido) {
  const aniosDisponibles = await aniosConCompras();
  const anio = aniosDisponibles.includes(Number(anioPedido)) ? Number(anioPedido) : aniosDisponibles[0];
  const { inicio, fin } = rangoDelAnio(anio);

  const compras = await consultas.compras_findAll2(inicio, fin);
  const filas = compras.map(aFila);

  const meses = NOMBRES_MESES.map((nombreMes, i) => {
    const delMes = filas.filter((f) => partesFecha(f.marca).mes === i + 1);
    return { numeroMes: i + 1, nombreMes, filas: delMes, ...sumar(delMes) };
  });

  const totalesAnio = sumar(filas);
  const mesesConCompras = meses.filter((m) => m.compras > 0);
  const mejorMes = mesesConCompras.length ? mesesConCompras.reduce((a, b) => (b.total > a.total ? b : a)) : null;

  return {
    anio,
    aniosDisponibles,
    meses,
    totalesAnio,
    mejorMes,
    topCompradores: ranking(filas, (f) => [[f.codigo_cpr, f.comprador]]),
    topEspecies: ranking(filas, (f) => [...new Set(f.nombresEspecies)].map((n) => [n, n]), 5, 'kilos'),
  };
}
