import { Router } from 'express';
import { autenticar, exigirRol } from '../../../middleware/autenticar.js';
import * as acciones from '../services/accionesRest.js';
import { datosCarrito } from '../services/carritoDatos.js';
import { datosListas, datosLista, datosOpiniones } from '../services/socialDatos.js';

export const tiendaCuenta = Router();
tiendaCuenta.use(['/carrito', '/cuenta', '/preguntas', '/opiniones'], autenticar);
const comprador = exigirRol('comprador'),
  personal = exigirRol('admin', 'capturista');
tiendaCuenta.use(['/carrito', '/cuenta'], comprador);
tiendaCuenta.get('/cuenta/barra', async (req, res) => res.json({ datos: await acciones.barra(req.usuario) }));
tiendaCuenta.get('/carrito', async (req, res) => res.json({ datos: await datosCarrito(req.usuario) }));
tiendaCuenta.post('/carrito/items', async (req, res) =>
  res.status(201).json({ datos: await acciones.agregarCarrito(req.usuario, req.body?.id_lte) }),
);
tiendaCuenta.delete('/carrito/items/:id', async (req, res) => {
  await acciones.quitarCarrito(req.usuario, req.params.id);
  res.status(204).end();
});
tiendaCuenta.delete('/carrito', async (req, res) => {
  await acciones.quitarCarrito(req.usuario);
  res.status(204).end();
});
tiendaCuenta.get('/cuenta/listas', async (req, res) => res.json({ datos: await datosListas(req.usuario) }));
tiendaCuenta.post('/cuenta/listas', async (req, res) => {
  const datos = await acciones.guardarLista(req.usuario, req.body);
  res.location(`/api/v1/cuenta/listas/${datos.id_lista}`).status(201).json({ datos });
});
tiendaCuenta.get('/cuenta/listas/:id', async (req, res) =>
  res.json({ datos: await datosLista(req.usuario, req.params.id) }),
);
tiendaCuenta.patch('/cuenta/listas/:id', async (req, res) =>
  res.json({ datos: await acciones.guardarLista(req.usuario, req.body, req.params.id) }),
);
tiendaCuenta.delete('/cuenta/listas/:id', async (req, res) => {
  await acciones.borrarLista(req.usuario, req.params.id);
  res.status(204).end();
});
tiendaCuenta.post('/cuenta/listas/:id/items', async (req, res) => {
  await acciones.cambiarItem(req.usuario, req.params.id, req.body);
  res.status(204).end();
});
tiendaCuenta.delete('/cuenta/listas/:id/items', async (req, res) => {
  await acciones.cambiarItem(req.usuario, req.params.id, req.body, true);
  res.status(204).end();
});
tiendaCuenta.post('/cuenta/listas/:id/carrito', async (req, res) =>
  res.json({ datos: await acciones.listaAlCarrito(req.usuario, req.params.id) }),
);
tiendaCuenta.post('/cuenta/favoritos', async (req, res) =>
  res.json({ datos: await acciones.favorito(req.usuario, req.body) }),
);
tiendaCuenta.post('/cuenta/favoritos/alternar', async (req, res) =>
  res.json({ datos: await acciones.favorito(req.usuario, req.body, true) }),
);
tiendaCuenta.get('/cuenta/preguntas', async (req, res) =>
  res.json({ datos: { preguntas: await acciones.misPreguntas(req.usuario) } }),
);
tiendaCuenta.get('/cuenta/opiniones', async (req, res) => res.json({ datos: await datosOpiniones(req.usuario) }));
tiendaCuenta.delete('/cuenta/opiniones/:id', async (req, res) => {
  await acciones.borrarOpinion(req.usuario, req.params.id);
  res.status(204).end();
});
tiendaCuenta.post('/preguntas', comprador, async (req, res) => {
  try {
    await acciones.preguntar(req.usuario, req.body);
    res.status(204).end();
  } catch (error) {
    if (error.estado === 429) res.set('Retry-After', '3600');
    throw error;
  }
});
tiendaCuenta.get('/preguntas', personal, async (req, res) =>
  res.json({ datos: { preguntas: await acciones.moderarPreguntas() } }),
);
tiendaCuenta.patch('/preguntas/:id', personal, async (req, res) => {
  await acciones.responder(req.usuario, req.params.id, req.body);
  res.status(204).end();
});
tiendaCuenta.post('/opiniones/:id', comprador, async (req, res) => {
  await acciones.opinar(req.usuario, req.params.id, req.body);
  res.status(204).end();
});
tiendaCuenta.get('/opiniones', personal, async (req, res) =>
  res.json({ datos: { opiniones: await acciones.moderarOpiniones() } }),
);
tiendaCuenta.patch('/opiniones/:id', personal, async (req, res) => {
  await acciones.visibilidad(req.params.id, req.body);
  res.status(204).end();
});
