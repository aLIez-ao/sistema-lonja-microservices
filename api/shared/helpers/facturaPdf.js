import PDFDocument from 'pdfkit';
import { datosFactura } from './factura.js';
import { COLOR, dibujarLogo } from './pdfComun.js';

// Columnas de la tabla (pt). La vista web usa los mismos anchos (views/purchases/factura.ejs).
const COLS = [
  { clave: 'lote', titulo: 'LOTE', ancho: 55 },
  { clave: 'especies', titulo: 'ESPECIES / DESCRIPCIÓN', ancho: 165 },
  { clave: 'cajas', titulo: 'CAJAS', ancho: 50, der: true },
  { clave: 'kilos', titulo: 'PESO (KG)', ancho: 65, der: true },
  { clave: 'salida', titulo: 'SALIDA/KG', ancho: 65, der: true },
  { clave: 'final', titulo: 'FINAL/KG', ancho: 65, der: true },
  { clave: 'total', titulo: 'TOTAL', ancho: 67, der: true },
];

/**
 * Genera el PDF de la factura de una compra. Mismo contenido y distribución que la vista web.
 */
export async function generarFacturaPDF(compra) {
  return new Promise((resolve, reject) => {
    try {
      const f = datosFactura(compra);
      const doc = new PDFDocument({
        margin: 40,
        size: 'LETTER',
        info: {
          Title: `Factura ${f.folio} - Lonja de Veracruz`,
          Author: f.emisor.nombre,
          Subject: 'Factura de compra de productos pesqueros',
        },
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const X = 40;
      const W = 532;

      // --- Encabezado ---
      dibujarLogo(doc, X, 40, 46);

      doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(9).text(f.emisor.lema, X, 94, { lineBreak: false });
      doc
        .fillColor(COLOR.texto)
        .font('Helvetica')
        .fontSize(7.5)
        .text(`RFC: ${f.emisor.rfc}  ·  ${f.emisor.regimen}`, X, 107, { lineBreak: false })
        .text(f.emisor.direccion, X, 117, { lineBreak: false })
        .text(f.emisor.contacto, X, 127, { lineBreak: false });

      // Recuadro de folio: título sobre fondo marino y filas folio, fecha y, si existe, pedido
      const filasFolio = [
        ['FOLIO', f.folio, COLOR.marino, 'Helvetica-Bold'],
        ['FECHA', f.fecha, COLOR.texto, 'Helvetica'],
        ...(f.pedido ? [['PEDIDO', f.pedido, COLOR.texto, 'Helvetica']] : []),
      ];
      const altoFolio = 22 + filasFolio.length * 18 + 6;
      doc.save();
      doc.roundedRect(380, 40, 192, altoFolio, 6).clip();
      doc.rect(380, 40, 192, 22).fill(COLOR.marino);
      doc.restore();
      doc.roundedRect(380, 40, 192, altoFolio, 6).lineWidth(0.75).strokeColor(COLOR.borde).stroke();
      doc
        .fillColor(COLOR.blanco)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('FACTURA COMERCIAL', 380, 47, { width: 192, align: 'center', characterSpacing: 0.6 });
      filasFolio.forEach(([rotulo, valor, color, fuente], i) => {
        const fy = 70 + i * 18;
        doc.fillColor(COLOR.tenue).font('Helvetica-Bold').fontSize(8.5).text(rotulo, 392, fy, { lineBreak: false });
        doc.fillColor(color).font(fuente).text(valor, 392, fy, { width: 168, align: 'right' });
        if (i < filasFolio.length - 1) doc.rect(392, fy + 12.5, 168, 0.5).fill(COLOR.borde);
      });

      // --- Tarjetas: facturado a / entrega y pago ---
      let y = 150;
      const anchoTarjeta = (W - 12) / 2;
      const par = (etiqueta, valor, px, py, ancho) => {
        doc.font('Helvetica').fontSize(8.5);
        const rotulo = `${etiqueta}: `;
        const anchoRotulo = doc.widthOfString(rotulo);
        doc.fillColor(COLOR.tenue).text(rotulo, px, py, { lineBreak: false });
        // Una sola línea; si no cabe se corta con puntos suspensivos (igual que en la vista web)
        doc
          .fillColor(COLOR.texto)
          .text(String(valor), px + anchoRotulo, py, { width: ancho - anchoRotulo, height: 10, ellipsis: true });
      };
      const tarjeta = (px, titulo, nombre, lineas) => {
        doc.roundedRect(px, y, anchoTarjeta, 70, 6).lineWidth(0.75).strokeColor(COLOR.borde).stroke();
        doc
          .fillColor(COLOR.tenue)
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text(titulo, px + 12, y + 9, { characterSpacing: 0.4 });
        doc
          .fillColor(COLOR.marino)
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(nombre, px + 12, y + 20, { width: anchoTarjeta - 24, height: 12, ellipsis: true });
        lineas.forEach(([etiqueta, valor], i) => par(etiqueta, valor, px + 12, y + 35 + i * 12, anchoTarjeta - 24));
      };
      tarjeta(X, 'FACTURADO A', f.cliente.nombre, [
        ['Código de comprador', `#${f.cliente.codigo}`],
        ['Correo', f.cliente.correo],
        ['Uso CFDI', f.cliente.usoCfdi],
      ]);
      tarjeta(X + anchoTarjeta + 12, 'ENTREGA Y PAGO', f.canal, [
        ['Dirección', f.cliente.direccion],
        ['Método de pago', f.cliente.metodoPago],
        ['Moneda', 'MXN'],
      ]);

      // --- Tabla de conceptos ---
      y = 236;
      doc.rect(X, y + 21, W, 1.5).fill(COLOR.marino);
      doc.fillColor(COLOR.marino).font('Helvetica-Bold').fontSize(8);
      let cx = X;
      for (const col of COLS) {
        doc.text(col.titulo, cx + 8, y + 7.5, {
          width: col.ancho - 16,
          align: col.der ? 'right' : 'left',
          lineBreak: false,
        });
        cx += col.ancho;
      }

      y += 22;
      doc.font('Helvetica-Bold').fontSize(8.5);
      const altoEspecies = doc.heightOfString(f.concepto.especies, { width: COLS[1].ancho - 16 });
      const altoFila = Math.max(40, altoEspecies + 26);
      doc.rect(X, y + altoFila - 0.75, W, 0.75).fill(COLOR.borde);
      cx = X;
      for (const col of COLS) {
        const opciones = { width: col.ancho - 16, align: col.der ? 'right' : 'left' };
        if (col.clave === 'especies') {
          doc
            .font('Helvetica-Bold')
            .fontSize(8.5)
            .fillColor(COLOR.texto)
            .text(f.concepto.especies, cx + 8, y + 8, opciones);
          doc
            .font('Helvetica')
            .fontSize(7)
            .fillColor(COLOR.tenue)
            .text(f.concepto.nota, cx + 8, y + 10 + altoEspecies, opciones);
        } else {
          const negrita = ['lote', 'final', 'total'].includes(col.clave);
          const color =
            col.clave === 'lote' || col.clave === 'total'
              ? COLOR.marino
              : col.clave === 'salida'
                ? COLOR.tenue
                : COLOR.texto;
          doc
            .font(negrita ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8.5)
            .fillColor(color)
            .text(f.concepto[col.clave], cx + 8, y + altoFila / 2 - 4, { ...opciones, lineBreak: false });
        }
        cx += col.ancho;
      }

      // --- Importe con letra, notas fiscales y totales ---
      y += altoFila + 14;
      const titulo = (texto, ty) =>
        doc.fillColor(COLOR.tenue).font('Helvetica-Bold').fontSize(7.5).text(texto, X, ty, { characterSpacing: 0.4 });
      titulo('IMPORTE CON LETRA', y);
      doc
        .fillColor(COLOR.texto)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text(f.importeLetra, X, y + 11, { width: 320 });
      titulo('INFORMACIÓN FISCAL Y GARANTÍA', doc.y + 8);
      doc.fillColor(COLOR.texto).font('Helvetica').fontSize(7.5);
      let ny = doc.y + 2;
      for (const nota of f.notasFiscales) {
        doc.text(`•  ${nota}`, X, ny, { width: 320 });
        ny = doc.y + 2;
      }
      const finNotas = doc.y;

      const tx = 375;
      doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.tenue).text('Subtotal', tx, y, { lineBreak: false });
      doc.fillColor(COLOR.texto).text(f.subtotal, tx, y, { width: 197, align: 'right' });
      doc.fillColor(COLOR.tenue).text('IVA (0 %)', tx, y + 14, { lineBreak: false });
      doc.fillColor(COLOR.texto).text(f.iva, tx, y + 14, { width: 197, align: 'right' });
      doc.rect(tx, y + 30, 197, 1.5).fill(COLOR.marino);
      doc
        .fillColor(COLOR.marino)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('TOTAL', tx, y + 38, { lineBreak: false });
      doc.fontSize(11).text(f.total, tx, y + 37.5, { width: 197, align: 'right' });

      // --- Cadena y sello ---
      y = Math.max(finNotas, y + 52) + 18;
      doc.rect(X, y, W, 0.75).fill(COLOR.borde);
      doc
        .fillColor(COLOR.texto)
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .text('CADENA ORIGINAL DEL COMPROBANTE DE SUBASTA:', X, y + 10);
      doc
        .font('Courier')
        .fontSize(6.5)
        .fillColor(COLOR.tenue)
        .text(f.cadena, X, y + 21, { width: W });
      const ySello = doc.y + 8;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR.texto).text('SELLO DIGITAL DE LA LONJA:', X, ySello);
      doc
        .font('Courier')
        .fontSize(6.5)
        .fillColor(COLOR.tenue)
        .text(f.sello, X, ySello + 11, { width: W });

      doc
        .font('Helvetica-Oblique')
        .fontSize(7.5)
        .fillColor(COLOR.tenue)
        .text(f.leyenda, X, doc.y + 14, { width: W, align: 'center' });
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(COLOR.tenue)
        .text('Página 1 de 1', X, doc.y + 6, { width: W, align: 'right' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
