import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { proteger } from './cuenta.js';
import { ErrorApi } from '../api.js';
import { transmitir } from '../descargas.js';

export function crearRutasPedidos({ pedir }) {
  const rutas = Router();
  rutas.use(['/pedido', '/cuenta/pedidos'], proteger('comprador'));
  rutas.use('/pedidos', proteger('admin', 'capturista'));
  rutas.get('/pedido/nuevo', async (req, res) => {
    const { datos } = await pedir(
      req,
      'pedidos/checkout?' + new URLSearchParams({ entrega: String(req.query.entrega || 'recoger') }),
    );
    res.render('order/nuevo', {
      ...datos,
      claveOperacion: randomUUID(),
      mensaje: req.query.mensaje || null,
      error: req.query.error || null,
    });
  });
  const ejecutar = (ruta, body, destinoError, destinoExito) => async (req, res) => {
    try {
      const { datos } = await pedir(req, typeof ruta === 'function' ? ruta(req) : ruta, {
        method: 'POST',
        body: body(req),
        headers: { 'Idempotency-Key': req.body.clave_operacion || randomUUID() },
      });
      res.redirect(destinoExito(datos, req));
    } catch (error) {
      if (!(error instanceof ErrorApi) || ![400, 403, 409, 422, 429].includes(error.status)) throw error;
      res.redirect(destinoError(req) + '?error=' + encodeURIComponent(error.message));
    }
  };
  rutas.post(
    '/pedido',
    ejecutar(
      'pedidos',
      (req) => ({ entrega: req.body.entrega, ...(req.body.id_dir && { id_dir: Number(req.body.id_dir) }) }),
      () => '/pedido/nuevo',
      (datos) => `/pedido/${datos.id_ped}/pago`,
    ),
  );
  rutas.get('/pedido/:id/pago', async (req, res) => {
    const { datos } = await pedir(req, 'pedidos/' + encodeURIComponent(req.params.id));
    if (datos.pedido.estado !== 'pendiente_pago') return res.redirect('/cuenta/pedidos/' + req.params.id);
    res.render('order/pago', { ...datos, error: req.query.error || null, claveOperacion: randomUUID() });
  });
  rutas.post(
    '/pedido/:id/pagar',
    ejecutar(
      (req) => 'pedidos/' + encodeURIComponent(req.params.id) + '/pago',
      (req) => ({
        metodo: req.body.metodo || 'tarjeta',
        tarjeta: Object.fromEntries(
          ['numero', 'mes', 'anio', 'cvv'].filter((k) => req.body[k] !== undefined).map((k) => [k, req.body[k]]),
        ),
      }),
      (req) => `/pedido/${req.params.id}/pago`,
      (datos) => `/cuenta/pedidos/${datos.id_ped}`,
    ),
  );
  rutas.post('/pedido/:id/cancelar', async (req, res) => {
    await pedir(req, 'pedidos/' + encodeURIComponent(req.params.id) + '/cancelacion', { method: 'POST' });
    res.redirect('/cuenta/pedidos/' + req.params.id);
  });
  rutas.get('/cuenta/pedidos', async (req, res) => {
    const { datos, meta } = await pedir(
      req,
      'pedidos?' + new URLSearchParams({ pagina: String(req.query.pagina || 1), tamano: 100 }),
    );
    res.render('account/pedidos', {
      pedidos: datos,
      meta,
      mensaje: req.query.mensaje || null,
      error: req.query.error || null,
    });
  });
  rutas.get('/cuenta/pedidos/:id', async (req, res) => {
    const { datos } = await pedir(req, 'pedidos/' + encodeURIComponent(req.params.id));
    res.render('account/pedido', { ...datos, mensaje: req.query.mensaje || null, error: req.query.error || null });
  });
  const factura = async (req, res, pdf) => {
    // La comprobación del pedido y la propiedad de la factura se hacen en la API.
    const { datos: detalle } = await pedir(req, 'pedidos/' + encodeURIComponent(req.params.id));
    if (!detalle.compras.some((c) => String(c.id_cmp) === String(req.params.id_cmp)))
      throw new ErrorApi(404, { detail: 'No existe esa factura en el pedido.' });
    if (pdf) {
      const respuesta = await pedir(req, 'compras/' + encodeURIComponent(req.params.id_cmp) + '/factura', {
        binario: true,
        headers: { Accept: 'application/pdf' },
      });
      await transmitir(respuesta, res);
    } else {
      const { datos } = await pedir(req, 'compras/' + encodeURIComponent(req.params.id_cmp) + '/factura');
      res.render('purchases/factura', { ...datos, mensaje: null, error: null, soloLectura: true });
    }
  };
  rutas.get('/cuenta/pedidos/:id/factura/:id_cmp.pdf', (req, res) => factura(req, res, true));
  rutas.get('/cuenta/pedidos/:id/factura/:id_cmp', (req, res) => factura(req, res, false));
  rutas.get('/pedidos', async (req, res) => {
    const query = new URLSearchParams(
      Object.entries(req.query).filter(([k, v]) => typeof v === 'string' && k !== 'ver'),
    );
    // ?ver=<id> abre el panel de detalle junto a la tabla sin perder filtros ni página.
    const ver = /^\d+$/.test(String(req.query.ver || '')) ? req.query.ver : null;
    const [{ datos, meta }, seleccionado] = await Promise.all([
      pedir(req, 'pedidos?' + query),
      ver ? pedir(req, 'pedidos/' + ver).then((r) => r.datos) : null,
    ]);
    res.render('orders/index', {
      pedidos: datos,
      seleccionado,
      estados: ['pendiente_pago', 'pagado', 'preparando', 'enviado', 'entregado', 'cancelado', 'expirado'],
      filtros: req.query,
      pagina: meta.pagina,
      paginas: Math.max(1, Math.ceil(meta.total / meta.tamano)),
      total: meta.total,
    });
  });
  rutas.get('/pedidos/:id', async (req, res) => {
    const { datos } = await pedir(req, 'pedidos/' + encodeURIComponent(req.params.id));
    res.render('orders/detalle', {
      ...datos,
      claveOperacion: randomUUID(),
      mensaje: req.query.mensaje,
      error: req.query.error,
    });
  });
  rutas.post(
    '/pedidos/:id/confirmar-cobro',
    ejecutar(
      (req) => 'pedidos/' + encodeURIComponent(req.params.id) + '/cobro',
      () => ({}),
      (req) => '/pedidos/' + req.params.id,
      (datos, req) => '/pedidos/' + req.params.id,
    ),
  );
  rutas.post('/pedidos/:id/estado', async (req, res) => {
    await pedir(req, 'pedidos/' + encodeURIComponent(req.params.id), {
      method: 'PATCH',
      body: { estado: req.body.estado },
    });
    res.redirect('/pedidos/' + req.params.id);
  });
  return rutas;
}
