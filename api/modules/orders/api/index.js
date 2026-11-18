import { Router } from 'express';
import { autenticar, exigirRol } from '../../../middleware/autenticar.js';
import { idempotente } from '../../../shared/helpers/idempotencia.js';
import { ErrorDeUsuario } from '../../../shared/helpers/utiles.js';
import * as servicio from '../services/recursosRest.js';

export const pedidosApi = Router();
pedidosApi.use(['/pedidos', '/compras'], autenticar);
const comprador = exigirRol('comprador'),
  personal = exigirRol('admin', 'capturista');
const ejecutar = (ambito, accion) => async (req, res) => {
  const resultado = await idempotente(
    {
      usuario: req.usuario,
      ambito: typeof ambito === 'function' ? ambito(req) : ambito,
      clave: req.get('Idempotency-Key'),
      entrada: req.body,
    },
    (transaction) => accion(req, transaction),
  );
  if (resultado.estado >= 400) {
    if (resultado.estado === 429) res.set('Retry-After', '3600');
    throw new ErrorDeUsuario(resultado.cuerpo.mensaje, resultado.estado);
  }
  if (resultado.estado === 201) res.location(`/api/v1/pedidos/${resultado.cuerpo.datos.id_ped}`);
  res.status(resultado.estado).json(resultado.cuerpo);
};
pedidosApi.get('/pedidos/checkout', comprador, async (req, res) =>
  res.json({ datos: await servicio.checkout(req.usuario, req.query.entrega) }),
);
pedidosApi.get('/pedidos', async (req, res) => res.json(await servicio.listar(req.usuario, req.query)));
pedidosApi.post(
  '/pedidos',
  comprador,
  ejecutar('crear-pedido', (req, t) => servicio.crear(req.usuario, req.body, t)),
);
pedidosApi.get('/pedidos/:id', async (req, res) =>
  res.json({ datos: await servicio.obtener(req.usuario, req.params.id) }),
);
pedidosApi.post(
  '/pedidos/:id/pago',
  comprador,
  ejecutar(
    (req) => 'pago:' + req.params.id,
    (req, t) => servicio.pagar(req.usuario, req.params.id, req.body, t),
  ),
);
pedidosApi.post(
  '/pedidos/:id/cobro',
  personal,
  ejecutar(
    (req) => 'cobro:' + req.params.id,
    (req, t) => servicio.cobrar(req.params.id, t),
  ),
);
pedidosApi.post('/pedidos/:id/cancelacion', comprador, async (req, res) => {
  await servicio.cancelar(req.usuario, req.params.id);
  res.status(204).end();
});
pedidosApi.patch('/pedidos/:id', personal, async (req, res) => {
  await servicio.cambiarEstado(req.params.id, req.body?.estado);
  res.status(204).end();
});
pedidosApi.get('/compras/:id/factura', async (req, res) => {
  if (req.accepts(['application/pdf', 'application/json']) === 'application/pdf') {
    const pdf = await servicio.factura(req.usuario, req.params.id, 'pdf');
    res
      .type('application/pdf')
      .attachment(`Factura-Lonja-FAC-${String(Number(req.params.id)).padStart(6, '0')}.pdf`)
      .send(pdf);
  } else res.json({ datos: await servicio.factura(req.usuario, req.params.id) });
});
