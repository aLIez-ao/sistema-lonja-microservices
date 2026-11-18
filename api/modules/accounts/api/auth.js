import { Router } from 'express';
import { entrar, renovar, salir, usuarioPublico } from '../services/sesiones.js';
import { autenticar } from '../../../middleware/autenticar.js';

export const auth = Router();
auth.post('/sesion', async (req, res) => {
  try {
    res.json(await entrar(req.body, req.ip));
  } catch (error) {
    if (error.estado === 429) res.set('Retry-After', '900');
    throw error;
  }
});
auth.post('/refresh', async (req, res) => res.json(await renovar(req.body?.refresh)));
auth.get('/yo', autenticar, (req, res) => res.json({ datos: usuarioPublico(req.usuario) }));
auth.delete('/sesion', autenticar, async (req, res) => {
  await salir(req.sesionApi.id);
  res.status(204).end();
});
