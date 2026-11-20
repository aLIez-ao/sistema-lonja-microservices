// Datos de la factura calculados una sola vez para la vista web y para el PDF,
// de modo que ambos muestren exactamente lo mismo.
import crypto from 'crypto';
import { formatoFechaHora, dinero } from './fechas.js';
import { EMISOR } from './pdfComun.js';

export function datosFactura(compra) {
  const comprador = compra.comprador || {};
  const lote = compra.lote || {};
  const total = Number(compra.precio_total || 0);
  const folio = `FAC-${String(compra.id_cmp).padStart(6, '0')}`;
  const fechaISO = new Date(compra.fecha || Date.now()).toISOString();

  const especies = lote.especies?.length
    ? lote.especies.map((e) => `${e.nombre}${e.tipo ? ` (${e.tipo.nombre})` : ''}`).join(', ')
    : 'Especies varias del Golfo';

  const cadena = `||1.1|${folio}|${fechaISO}|${total.toFixed(2)}|MXN|${comprador.codigo_cpr ?? 0}|${EMISOR.rfc.replaceAll('-', '')}||`;
  // Sello reproducible: la misma factura siempre produce el mismo sello
  const sello =
    crypto
      .createHmac('sha256', process.env.SC_JWT || 'lonja')
      .update(cadena)
      .digest('base64') + crypto.createHash('sha256').update(cadena).digest('base64');

  return {
    emisor: EMISOR,
    id: compra.id_cmp,
    folio,
    fecha: formatoFechaHora(compra.fecha || new Date()),
    cliente: {
      nombre:
        [comprador.nombre, comprador.apellido_paterno, comprador.apellido_materno].filter(Boolean).join(' ') ||
        'Consumidor final',
      codigo: comprador.codigo_cpr ?? '—',
      correo: comprador.correo || 'No registrado',
      direccion: comprador.direccion || 'Veracruz, Ver.',
      usoCfdi: 'G01 - Adquisición de mercancías',
      metodoPago: 'PUE - Pago en una sola exhibición',
    },
    concepto: {
      lote: `Lote #${compra.id_cmp}`,
      especies,
      nota: 'Captura ribereña certificada',
      cajas: String(lote.numero_cajas ?? 0),
      kilos: Number(lote.kilos || 0).toFixed(2),
      salida: dinero(lote.precio_kilo_salida || 0),
      final: dinero(compra.precio_kilo_final || 0),
      total: dinero(total),
    },
    pedido: compra.id_ped ? `PED-${String(compra.id_ped).padStart(6, '0')}` : null,
    canal: compra.id_ped ? 'Pedido en línea' : 'Venta en mostrador',
    importeLetra: importeConLetra(total),
    subtotal: dinero(total),
    iva: dinero(0),
    total: `${dinero(total)} MXN`,
    notasFiscales: [
      'Tasa IVA 0% de conformidad con el Art. 2o.-A Fracc. I inciso b) de la LIVA (productos marinos no industrializados).',
      'Producto fresco del día desembarcado bajo normas sanitarias de pesca ribereña y de altura.',
    ],
    cadena,
    sello,
    leyenda:
      'Este documento es un comprobante digital de compra-venta expedido por el Sistema de la Lonja Pesquera de Veracruz.',
  };
}

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const ESPECIALES = [
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISÉIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
];
const VEINTES = [
  'VEINTE',
  'VEINTIUNO',
  'VEINTIDÓS',
  'VEINTITRÉS',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISÉIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

/** 0–999 en letras. */
function centenas(n) {
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let texto;
  if (resto < 10) texto = UNIDADES[resto];
  else if (resto < 20) texto = ESPECIALES[resto - 10];
  else if (resto < 30) texto = VEINTES[resto - 20];
  else texto = DECENAS[Math.floor(resto / 10)] + (resto % 10 ? ` Y ${UNIDADES[resto % 10]}` : '');
  return [CENTENAS[c], texto].filter(Boolean).join(' ');
}

// «UNO» y «VEINTIUNO» se apocopan delante de un sustantivo: UN MIL → MIL, VEINTIÚN MIL, UN PESO.
const apocope = (texto) => texto.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN');

/** Entero en el rango de DECIMAL(12,2), expresado en letras mayúsculas. */
export function enteroALetras(n) {
  if (!Number.isSafeInteger(n) || n < 0 || n > 9_999_999_999) throw new RangeError('Importe fuera del rango admitido.');
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1e6);
  const miles = Math.floor((n % 1e6) / 1000);
  const resto = n % 1000;
  const partes = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${apocope(enteroALetras(millones))} MILLONES`);
  if (miles) partes.push(miles === 1 ? 'MIL' : `${apocope(centenas(miles))} MIL`);
  if (resto) partes.push(centenas(resto));
  return partes.join(' ');
}

/** Importe en pesos con letra, como en los comprobantes: «CIEN PESOS 50/100 M.N.». */
export function importeConLetra(importe) {
  const centavos = Math.round(Number(importe) * 100);
  if (!Number.isSafeInteger(centavos) || centavos < 0 || centavos > 999_999_999_999)
    throw new RangeError('Importe fuera del rango admitido.');
  const pesos = Math.floor(centavos / 100);
  const letras = apocope(enteroALetras(pesos));
  const unidad = pesos === 1 ? 'PESO' : pesos > 0 && pesos % 1e6 === 0 ? 'DE PESOS' : 'PESOS';
  return `${letras} ${unidad} ${String(centavos % 100).padStart(2, '0')}/100 M.N.`;
}
