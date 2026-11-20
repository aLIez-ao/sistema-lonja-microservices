// Estadísticas del tablero de inicio.
import { Op } from 'sequelize';
import { Compra, Lote, Comprador, Especie, Tipo, Pedido, Pregunta, Opinion } from '../../models/index.js';
import { hoy, rangoDelDia, redondea, formatoFecha, formatoHora, NOMBRES_MESES } from './fechas.js';
import { ESTADO_PEDIDO } from '../../models/Pedido.js';
import { ErrorDeUsuario } from './utiles.js';

const DIA = 24 * 60 * 60 * 1000;
const claveDia = (d) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TZ || 'America/Mexico_City' }).format(new Date(d));

const sumar = (compras) => {
  const kilos = compras.reduce((s, c) => s + Number(c.lote.kilos), 0);
  const total = compras.reduce((s, c) => s + Number(c.precio_total), 0);
  return {
    compras: compras.length,
    kilos: redondea(kilos),
    total: redondea(total),
    precioMedio: kilos ? redondea(total / kilos) : 0,
  };
};

/** Variación porcentual respecto a un valor anterior; null si no hay con qué comparar. */
const variacion = (actual, anterior) => (anterior > 0 ? redondea(((actual - anterior) / anterior) * 100) : null);

const top = (mapa, campo, n = 5) =>
  [...mapa.entries()]
    .map(([nombre, v]) => ({ nombre, ...v, [campo]: redondea(v[campo]) }))
    .sort((a, b) => b[campo] - a[campo])
    .slice(0, n);

export async function estadisticasInicio({ mes: mesPedido } = {}) {
  const fechaHoy = hoy();
  const { inicio: inicioHoy, fin: finHoy } = rangoDelDia(fechaHoy);
  const [anio, mes] = fechaHoy.split('-').map(Number);
  const inicioMes = rangoDelDia(`${fechaHoy.slice(0, 8)}01`).inicio;
  const mesAnterior = mes === 1 ? `${anio - 1}-12-01` : `${anio}-${String(mes - 1).padStart(2, '0')}-01`;
  const inicioMesAnterior = rangoDelDia(mesAnterior).inicio;
  const inicio30 = new Date(inicioHoy.getTime() - 29 * DIA);
  const desde = new Date(Math.min(inicioMesAnterior.getTime(), inicio30.getTime()));

  const [
    compras,
    totalLotes,
    lotesVendidos,
    compradores,
    especies,
    pedidosAtender,
    preguntasSinResponder,
    opinionesNuevas,
    comprasTienda,
    comprasMostrador,
  ] = await Promise.all([
    Compra.findAll({
      where: { fecha: { [Op.gte]: desde, [Op.lt]: finHoy } },
      order: [['fecha', 'DESC']],
      include: [
        { model: Comprador, as: 'comprador' },
        {
          model: Lote,
          as: 'lote',
          include: [{ model: Especie, as: 'especies', include: [{ model: Tipo, as: 'tipo' }] }],
        },
      ],
    }),
    Lote.count(),
    Compra.count(),
    Comprador.count(),
    Especie.count({ distinct: true, col: 'nombre' }),
    Pedido.count({
      where: { estado: { [Op.in]: [ESTADO_PEDIDO.PAGADO, ESTADO_PEDIDO.PREPARANDO, ESTADO_PEDIDO.ENVIADO] } },
    }),
    Pregunta.count({ where: { estado: 'pendiente' } }),
    Opinion.count({ where: { fecha: { [Op.gte]: new Date(Date.now() - 7 * DIA) } } }),
    Compra.count({ where: { id_ped: { [Op.ne]: null } } }),
    Compra.count({ where: { id_ped: null } }),
  ]);

  const entre = (a, b) => compras.filter((c) => c.fecha >= a && c.fecha < b);
  const deHoy = sumar(entre(inicioHoy, finHoy));
  const deAyer = sumar(entre(new Date(inicioHoy.getTime() - DIA), inicioHoy));
  const comprasMes = entre(inicioMes, finHoy);
  const delMes = sumar(comprasMes);
  const delMesAnterior = sumar(entre(inicioMesAnterior, inicioMes));
  const ultimos30 = entre(inicio30, finHoy);

  // Serie diaria de los últimos 30 días (los días sin compras cuentan como 0)
  const porDia = new Map();
  for (let i = 0; i < 30; i++) porDia.set(claveDia(new Date(inicio30.getTime() + i * DIA + DIA / 2)), 0);
  for (const c of ultimos30) {
    const k = claveDia(c.fecha);
    if (porDia.has(k)) porDia.set(k, porDia.get(k) + Number(c.precio_total));
  }

  const porEspecie = new Map();
  const porComprador = new Map();
  let sobreprecio = 0;
  let conSalida = 0;
  for (const c of ultimos30) {
    for (const nombre of new Set(c.lote.especies.map((e) => e.nombre))) {
      const acc = porEspecie.get(nombre) ?? { kilos: 0 };
      acc.kilos += Number(c.lote.kilos);
      porEspecie.set(nombre, acc);
    }
    const salida = Number(c.lote.precio_kilo_salida);
    if (salida > 0) {
      sobreprecio += (Number(c.precio_kilo_final) - salida) / salida;
      conSalida += 1;
    }
  }
  for (const c of comprasMes) {
    const nombre = `${c.comprador.nombre} ${c.comprador.apellido_paterno}`;
    const acc = porComprador.get(nombre) ?? { total: 0 };
    acc.total += Number(c.precio_total);
    porComprador.set(nombre, acc);
  }

  const periodo = periodoPedido(mesPedido, fechaHoy);
  const analitico = periodo.actual
    ? analisisMensual({
        comprasMes,
        comprasMesAnterior: entre(inicioMesAnterior, inicioMes),
        inicioMes,
        inicioMesAnterior,
        diaHoy: Number(fechaHoy.slice(8)),
      })
    : await analisisDeOtroMes(periodo);
  analitico.periodo = periodo;

  const topEspecies = top(porEspecie, 'kilos');
  const topCompradores = top(porComprador, 'total');
  const disponibles = Math.max(0, totalLotes - lotesVendidos);

  return {
    fecha: formatoFecha(inicioHoy.getTime() + DIA / 2),
    nombreMes: NOMBRES_MESES[mes - 1],
    hoy: { ...deHoy, variacionImporte: variacion(deHoy.total, deAyer.total) },
    mes: { ...delMes, variacionImporte: variacion(delMes.total, delMesAnterior.total), anterior: delMesAnterior.total },
    sobreprecioMedio: conSalida ? redondea((sobreprecio / conSalida) * 100) : null,
    lotes: {
      total: totalLotes,
      vendidos: lotesVendidos,
      disponibles,
      porcentajeVendido: totalLotes ? Math.round((lotesVendidos / totalLotes) * 100) : 0,
    },
    catalogo: { compradores, especies },
    pendientes: { pedidos: pedidosAtender, preguntas: preguntasSinResponder, opiniones: opinionesNuevas },
    ventas: { tienda: comprasTienda, mostrador: comprasMostrador, total: comprasTienda + comprasMostrador },
    ultimasCompras: compras.slice(0, 6).map((c) => ({
      id: c.id_cmp,
      fecha: formatoFecha(c.fecha),
      hora: formatoHora(c.fecha),
      especies: c.lote.especies.map((e) => e.nombre).join(', ') || '—',
      comprador: `${c.comprador.nombre} ${c.comprador.apellido_paterno}`,
      codigo_cpr: c.comprador.codigo_cpr,
      kilos: Number(c.lote.kilos),
      total: Number(c.precio_total),
    })),
    graficas: {
      dias: [...porDia.keys()].map((k) => `${k.slice(8)}/${k.slice(5, 7)}`),
      importesDia: [...porDia.values()].map(redondea),
      nombresEspecies: topEspecies.map((e) => e.nombre),
      kilosEspecies: topEspecies.map((e) => e.kilos),
      nombresCompradores: topCompradores.map((c) => c.nombre),
      totalesCompradores: topCompradores.map((c) => c.total),
    },
    hayActividad30: ultimos30.length > 0,
    analitico,
  };
}

const primerDia = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}-01`;
const mesPrevio = (anio, mes) => (mes === 1 ? [anio - 1, 12] : [anio, mes - 1]);
const MESES_ELEGIBLES = 12;

/** Valida ?mes=AAAA-MM: uno de los últimos 12 meses, incluido el actual. */
function periodoPedido(mesPedido, fechaHoy) {
  const [anioHoy, mesHoy] = fechaHoy.split('-').map(Number);
  const opciones = [];
  let [a, m] = [anioHoy, mesHoy];
  for (let i = 0; i < MESES_ELEGIBLES; i++) {
    opciones.push({ valor: `${a}-${String(m).padStart(2, '0')}`, nombre: `${NOMBRES_MESES[m - 1]} ${a}` });
    [a, m] = mesPrevio(a, m);
  }
  const valor = mesPedido === undefined || mesPedido === '' ? opciones[0].valor : String(mesPedido);
  const elegido = opciones.find((o) => o.valor === valor);
  if (!elegido) throw new ErrorDeUsuario('El mes debe ser uno de los últimos 12, con formato AAAA-MM.', 400);
  const [anio, mes] = valor.split('-').map(Number);
  return {
    mes: valor,
    nombre: elegido.nombre,
    nombreMes: NOMBRES_MESES[mes - 1],
    nombreAnterior: NOMBRES_MESES[mesPrevio(anio, mes)[1] - 1],
    actual: valor === opciones[0].valor,
    opciones,
  };
}

/** Análisis de un mes ya cerrado frente a su mes anterior completo. */
async function analisisDeOtroMes(periodo) {
  const [anio, mes] = periodo.mes.split('-').map(Number);
  const inicioMes = rangoDelDia(primerDia(anio, mes)).inicio;
  const inicioMesAnterior = rangoDelDia(primerDia(...mesPrevio(anio, mes))).inicio;
  const [as, ms] = mes === 12 ? [anio + 1, 1] : [anio, mes + 1];
  const finMes = rangoDelDia(primerDia(as, ms)).inicio;
  const compras = await Compra.findAll({
    where: { fecha: { [Op.gte]: inicioMesAnterior, [Op.lt]: finMes } },
    include: [
      { model: Comprador, as: 'comprador' },
      {
        model: Lote,
        as: 'lote',
        include: [{ model: Especie, as: 'especies', include: [{ model: Tipo, as: 'tipo' }] }],
      },
    ],
  });
  return analisisMensual({
    comprasMes: compras.filter((c) => c.fecha >= inicioMes),
    comprasMesAnterior: compras.filter((c) => c.fecha < inicioMes),
    inicioMes,
    inicioMesAnterior,
    diaHoy: diasDelMes(inicioMes),
  });
}

const diasDelMes = (inicio) => {
  const [a, m] = claveDia(inicio.getTime() + DIA / 2)
    .split('-')
    .map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
};

/**
 * Análisis del mes en curso frente al anterior: ingresos por día del mes,
 * mezcla por tipo, canal de venta y compradores principales.
 */
function analisisMensual({ comprasMes, comprasMesAnterior, inicioMes, inicioMesAnterior, diaHoy }) {
  const diasMes = diasDelMes(inicioMes);
  const diasAnterior = diasDelMes(inicioMesAnterior);
  const porDiaDelMes = (compras, dias) => {
    const serie = Array(dias).fill(0);
    for (const c of compras) serie[Number(claveDia(c.fecha).slice(8)) - 1] += Number(c.precio_total);
    return serie.map(redondea);
  };
  const actual = porDiaDelMes(comprasMes, diasMes).map((v, i) => (i < diaHoy ? v : null));
  const anterior = porDiaDelMes(comprasMesAnterior, diasAnterior);

  // Un lote con especies de varios tipos reparte sus kilos e importe en partes iguales.
  const porTipo = new Map();
  for (const c of comprasMes) {
    const tipos = [...new Set(c.lote.especies.map((e) => e.tipo?.nombre).filter(Boolean))];
    const partes = tipos.length ? tipos : ['Sin tipo'];
    for (const nombre of partes) {
      const acc = porTipo.get(nombre) ?? { kilos: 0, total: 0 };
      acc.kilos += Number(c.lote.kilos) / partes.length;
      acc.total += Number(c.precio_total) / partes.length;
      porTipo.set(nombre, acc);
    }
  }
  const kilosMes = [...porTipo.values()].reduce((s, v) => s + v.kilos, 0);
  const tipos = [...porTipo.entries()]
    .map(([nombre, v]) => ({
      nombre,
      kilos: redondea(v.kilos),
      total: redondea(v.total),
      porcentaje: kilosMes ? Math.round((v.kilos / kilosMes) * 100) : 0,
    }))
    .sort((a, b) => b.kilos - a.kilos);

  const canal = (lista) => ({
    compras: lista.length,
    total: redondea(lista.reduce((s, c) => s + Number(c.precio_total), 0)),
  });
  const tienda = canal(comprasMes.filter((c) => c.id_ped != null));
  const mostrador = canal(comprasMes.filter((c) => c.id_ped == null));

  const compradores = new Map();
  for (const c of comprasMes) {
    const clave = c.comprador.codigo_cpr;
    const acc = compradores.get(clave) ?? {
      codigo_cpr: clave,
      nombre: `${c.comprador.nombre} ${c.comprador.apellido_paterno}`,
      compras: 0,
      kilos: 0,
      total: 0,
    };
    acc.compras += 1;
    acc.kilos += Number(c.lote.kilos);
    acc.total += Number(c.precio_total);
    compradores.set(clave, acc);
  }
  const principales = [...compradores.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((v) => ({ ...v, kilos: redondea(v.kilos), total: redondea(v.total), ticket: redondea(v.total / v.compras) }));

  const resumen = (lista) => {
    const r = sumar(lista);
    return { ...r, ticketMedio: r.compras ? redondea(r.total / r.compras) : 0 };
  };
  // Comparación justa: el mes anterior se corta en el mismo día del mes.
  const mismoTramo = comprasMesAnterior.filter((c) => Number(claveDia(c.fecha).slice(8)) <= diaHoy);
  const ahora = resumen(comprasMes);
  const antes = resumen(mismoTramo);
  const cambio = (campo) => variacion(ahora[campo], antes[campo]);

  return {
    dias: Array.from({ length: Math.max(diasMes, diasAnterior) }, (_, i) => String(i + 1)),
    ingresosMes: actual,
    ingresosMesAnterior: anterior,
    kpis: {
      ...ahora,
      variacion: {
        total: cambio('total'),
        kilos: cambio('kilos'),
        compras: cambio('compras'),
        ticketMedio: cambio('ticketMedio'),
        precioMedio: cambio('precioMedio'),
      },
    },
    tipos,
    canales: { tienda, mostrador, total: redondea(tienda.total + mostrador.total) },
    compradores: principales,
  };
}
