import db from '../../../shared/config/db.js';
import { Compra, Comprador, Lote } from '../../../models/index.js';
import { ErrorDeUsuario } from '../../../shared/helpers/utiles.js';
import { etag } from '../../../shared/helpers/etag.js';
import { correoValido } from '../../../shared/helpers/validacion.js';
import { leerListado } from '../../../shared/helpers/listado.js';
import { filtroEntero, filtroFecha, filtroNumero, filtroSiNo } from '../../../shared/helpers/filtros.js';
import { reservasActivas } from '../../catalog/index.js';
import * as compras from './compraConsultas.js';
import * as compradores from './compradorConsultas.js';
import { registrarCompraMostrador } from './compras.js';
import { encolarTrabajo } from '../../../shared/helpers/colaTrabajos.js';
import { datosReporteAnual, datosReporte } from './reportes.js';
import { generarReporteAnualPDF } from '../helpers/reportePdf.js';

const fallo = (mensaje, estado = 422) => {
  throw new ErrorDeUsuario(mensaje, estado);
};
export const publicar = (fila) =>
  JSON.parse(
    JSON.stringify(fila, (k, v) =>
      ['precio_kilo_final', 'precio_kilo_salida', 'precio_total'].includes(k) && v !== null ? Number(v).toFixed(2) : v,
    ),
  );
export async function listar(recurso, query) {
  const tamano = Number(query.tamano || 25),
    pagina = Number(query.pagina || 1);
  if (
    !Number.isInteger(tamano) ||
    tamano < 1 ||
    tamano > 100 ||
    !Number.isSafeInteger(pagina) ||
    pagina < 1 ||
    pagina > 10000
  )
    fallo('Paginación inválida.');
  const consulta = recurso === 'compras' ? compras : compradores;
  const orden = recurso === 'compras' ? compras.ordenCompras : compradores.ordenCompradores;
  const filtros =
    recurso === 'compras'
      ? {
          desde: filtroFecha,
          hasta: filtroFecha,
          comprador: filtroEntero,
          tipo: filtroEntero,
          totalMin: filtroNumero,
          totalMax: filtroNumero,
        }
      : { compras: filtroSiNo, correo: filtroSiNo };
  const l = leerListado(
    { query: { ...query, tam: tamano }, baseUrl: '', path: '/' + recurso },
    {
      orden,
      ordenDefecto: { campo: recurso === 'compras' ? 'fecha' : 'codigo', dir: 'desc' },
      porPagina: Array.from({ length: 100 }, (_, i) => i + 1),
      filtros,
    },
  );
  await consulta.lista_listado(l, orden);
  return { datos: l.filas.map(publicar), meta: { pagina: l.pagina, tamano: l.tam, total: l.total } };
}
export async function obtener(recurso, id, transaction) {
  if (!/^\d+$/.test(String(id))) fallo('No existe ese recurso.', 404);
  const fila =
    recurso === 'compras'
      ? await Compra.findOne({ where: { id_cmp: id }, include: compras.incluye, transaction })
      : await compradores.comprador_findByPk2({ id });
  if (!fila) fallo('No existe ese recurso.', 404);
  return publicar(fila);
}
export async function guardarComprador(b, id) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) fallo('Envía los datos del comprador.');
  const anterior = id ? await Comprador.findByPk(id) : null;
  if (id && !anterior) fallo('No existe ese comprador.', 404);
  const entrada = { ...(anterior?.toJSON() || {}), ...b };
  if (
    Object.keys(b).some((k) => !['nombre', 'apellido_paterno', 'apellido_materno', 'correo', 'direccion'].includes(k))
  )
    fallo('Campos desconocidos.');
  for (const campo of ['nombre', 'apellido_paterno'])
    if (typeof entrada[campo] !== 'string' || !entrada[campo].trim() || entrada[campo].length > 40)
      fallo('Nombre y apellido son obligatorios (40 caracteres).');
  if (
    entrada.apellido_materno &&
    (typeof entrada.apellido_materno !== 'string' || entrada.apellido_materno.length > 40)
  )
    fallo('Apellido materno inválido.');
  if (entrada.direccion && (typeof entrada.direccion !== 'string' || entrada.direccion.length > 200))
    fallo('Dirección inválida.');
  if (typeof entrada.correo !== 'string' || !correoValido(entrada.correo) || entrada.correo.length > 80)
    fallo('Correo inválido.');
  const datos = {
    nombre: entrada.nombre.trim(),
    apellido_paterno: entrada.apellido_paterno.trim(),
    apellido_materno: entrada.apellido_materno?.trim() || null,
    correo: entrada.correo.trim().toLowerCase(),
    direccion: entrada.direccion?.trim() || null,
  };
  const fila = anterior ? await anterior.update(datos) : await Comprador.create(datos);
  return obtener('compradores', fila.codigo_cpr);
}
export async function crearCompra(b) {
  if (!b || typeof b !== 'object' || !/^\d+$/.test(String(b.id_cmp)) || !/^\d+$/.test(String(b.codigo_cpr)))
    fallo('Selecciona lote y comprador.');
  if (
    !['string', 'number'].includes(typeof b.precio_kilo_final) ||
    !/^\d+(?:\.\d{1,2})?$/.test(String(b.precio_kilo_final)) ||
    Number(b.precio_kilo_final) <= 0 ||
    Number(b.precio_kilo_final) > 99999999
  )
    fallo('Precio final inválido.');
  const resultado = await registrarCompraMostrador({
    idLote: b.id_cmp,
    codigoComprador: b.codigo_cpr,
    precioFinal: b.precio_kilo_final,
  });
  if (resultado.error) fallo(resultado.error, resultado.estado || 409);
  if (resultado.comprador.correo) await encolarTrabajo('factura_compra', { id_cmp: resultado.nuevaCompra.id_cmp });
  return obtener('compras', resultado.nuevaCompra.id_cmp);
}
export async function modificarCompra(id, b, ifMatch) {
  if (!ifMatch) fallo('Se requiere If-Match.', 428);
  return db.transaction(async (transaction) => {
    const fila = await Compra.findOne({ where: { id_cmp: id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!fila) fallo('No existe esa compra.', 404);
    if (fila.id_ped) fallo('Las compras de pedidos no se editan desde la caja.', 409);
    const actual = await obtener('compras', id, transaction);
    if (ifMatch !== etag(actual)) fallo('La compra cambió. Vuelve a cargarla.', 412);
    if (
      !b ||
      typeof b !== 'object' ||
      Array.isArray(b) ||
      Object.keys(b).some((k) => !['codigo_cpr', 'precio_kilo_final'].includes(k))
    )
      fallo('Campos de compra inválidos.');
    const codigo = b.codigo_cpr ?? fila.codigo_cpr,
      precio = b.precio_kilo_final ?? fila.precio_kilo_final;
    if (!/^\d+$/.test(String(codigo)) || !(await Comprador.findByPk(codigo, { transaction })))
      fallo('Selecciona un comprador existente.');
    if (
      !['string', 'number'].includes(typeof precio) ||
      !/^\d+(?:\.\d{1,2})?$/.test(String(precio)) ||
      Number(precio) <= 0 ||
      Number(precio) > 99999999
    )
      fallo('Precio final inválido.');
    const lote = await Lote.findByPk(id, { transaction });
    if (Number(lote.kilos) * Number(precio) > 9999999999.99) fallo('El total excede el importe permitido.');
    await Compra.update(
      { codigo_cpr: codigo, precio_kilo_final: precio, precio_total: (Number(lote.kilos) * Number(precio)).toFixed(2) },
      { where: { id_cmp: id }, transaction },
    );
    const cambiada = await Compra.findOne({ where: { id_cmp: id }, include: compras.incluye, transaction });
    return publicar(cambiada);
  });
}
export async function eliminar(recurso, id) {
  if (recurso === 'compradores') {
    const fila = await Comprador.findByPk(id);
    if (!fila) fallo('No existe ese comprador.', 404);
    await fila.destroy();
    return;
  }
  await db.transaction(async (transaction) => {
    const fila = await Compra.findOne({ where: { id_cmp: id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!fila) fallo('No existe esa compra.', 404);
    if (fila.id_ped) fallo('Las compras de pedidos no se borran desde la caja.', 409);
    await fila.destroy({ transaction });
  });
}
export async function catalogosCompra(id) {
  const [lotes, filas, reservas] = await Promise.all([
    compras.lotesDisponibles_findAll(compras.lotesDisponiblesWhere(id)),
    compras.catalogos_findAll(),
    reservasActivas(),
  ]);
  return {
    lotes: lotes.map((l) => ({ ...publicar(l), reservaActiva: reservas.get(Number(l.id_lte)) || null })),
    compradores: filas,
  };
}
const csvCelda = (valor) => {
  let texto = String(valor ?? '');
  if (/^[=+\-@\t\r]/.test(texto)) texto = "'" + texto;
  return '"' + texto.replaceAll('"', '""') + '"';
};
export async function reporte(anio, usuario, formato = 'json') {
  if (!/^\d{4}$/.test(String(anio)) || Number(anio) < 1900 || Number(anio) > 9998) fallo('Año inválido.');
  const datos = await datosReporteAnual(anio);
  if (datos.anio !== Number(anio)) fallo('No hay un reporte para ese año.', 404);
  if (formato === 'pdf') return generarReporteAnualPDF({ ...datos, emitidoPor: usuario.nombre_completo });
  if (formato === 'csv') {
    const lineas = [
      [
        'Mes',
        'Fecha',
        'Hora',
        'Lote',
        'Especies',
        'Comprador',
        'Cajas',
        'Kilos',
        'Precio salida/kg',
        'Precio final/kg',
        'Total',
      ],
    ];
    for (const mes of datos.meses)
      for (const f of mes.filas)
        lineas.push([
          mes.nombreMes,
          f.fecha,
          f.hora,
          f.lote,
          f.especies,
          f.comprador,
          f.cajas,
          f.kilos,
          f.precio_salida.toFixed(2),
          f.precio_final.toFixed(2),
          f.total.toFixed(2),
        ]);
    lineas.push([
      'TOTAL',
      '',
      '',
      '',
      '',
      '',
      datos.totalesAnio.cajas,
      datos.totalesAnio.kilos,
      '',
      '',
      datos.totalesAnio.total.toFixed(2),
    ]);
    return '\ufeff' + lineas.map((l) => l.map(csvCelda).join(',')).join('\r\n');
  }
  return {
    ...datos,
    graficas: {
      meses: datos.meses.map((m) => m.nombreMes.slice(0, 3)),
      importes: datos.meses.map((m) => m.total),
      kilos: datos.meses.map((m) => m.kilos),
      compradores: datos.topCompradores.map((c) => ({ nombre: c.nombre, total: c.total })),
      especies: datos.topEspecies.map((e) => ({ nombre: e.nombre, kilos: e.kilos })),
    },
  };
}
export async function reporteDiario(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) fallo('Fecha inválida.');
  const { filas, totales } = await datosReporte(fecha);
  const lineas = [
    ['Hora', 'Lote', 'Especies', 'Comprador', 'Cajas', 'Kilos', 'Precio salida/kg', 'Precio final/kg', 'Total'],
    ...filas.map((f) => [
      f.hora,
      f.lote,
      f.especies,
      f.comprador,
      f.cajas,
      f.kilos,
      f.precio_salida,
      f.precio_final,
      f.total.toFixed(2),
    ]),
    ['TOTAL', '', '', '', totales.cajas, totales.kilos, '', '', totales.total.toFixed(2)],
  ];
  return '\ufeff' + lineas.map((l) => l.map(csvCelda).join(',')).join('\r\n');
}
export async function enviarFactura(id) {
  const compra = await obtener('compras', id);
  if (!compra.comprador.correo) fallo('El comprador no tiene correo.');
  if (!(await encolarTrabajo('factura_compra', { id_cmp: compra.id_cmp }))) fallo('La cola está llena.', 503);
  return { mensaje: 'Factura en cola para envío.' };
}
