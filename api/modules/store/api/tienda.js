import { Router } from 'express';
import { datosPortada } from '../services/portada.js';
import { datosLote, datosEspecie } from '../services/fichas.js';
import * as consultas from '../services/tiendaConsultas.js';
import { prepararLote } from '../../../shared/helpers/tiendaVista.js';
import { autenticar } from '../../../middleware/autenticar.js';
import { crearLimite } from '../../../shared/helpers/seguridad.js';
import { ErrorDeUsuario } from '../../../shared/helpers/utiles.js';

export const tienda = Router();
export const limiteSugerencias = crearLimite({ max: 30, ventanaMs: 60000 });
tienda.use((req, res, next) => (req.get('Authorization') ? autenticar(req, res, next) : next()));
tienda.get('/portada', async (req, res) => res.json({ datos: await datosPortada(req.query) }));
tienda.get('/lotes', async (req, res) => {
  const portada = await datosPortada(req.query);
  res.json({
    datos: portada.l.filas,
    meta: { pagina: portada.l.pagina, tamano: portada.l.tam, total: portada.l.total },
  });
});
tienda.get('/lotes/:id', async (req, res) => res.json({ datos: await datosLote(req.params.id, req.usuario) }));
tienda.get('/especies/:id', async (req, res) => res.json({ datos: await datosEspecie(req.params.id, req.usuario) }));
tienda.get('/sugerencias', async (req, res) => {
  if (limiteSugerencias.bloqueado(req.ip)) {
    res.set('Retry-After', '60');
    throw new ErrorDeUsuario('Espera un minuto.', 429);
  }
  limiteSugerencias.fallo(req.ip);
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
  if (q.length < 2) return res.json({ datos: [] });
  const where = await consultas.whereDeFiltros({ q, filtros: {} });
  const filas = await consultas.filas_findAll3(where);
  res.json({
    datos: filas.map((fila) => {
      const lote = prepararLote(fila);
      return {
        id: lote.id_lte,
        titulo: `Lote #${lote.id_lte} · ${lote.nombresEspecies}`,
        subtitulo: `${lote.kilos} kg`,
        url: `/tienda/lote/${lote.id_lte}`,
      };
    }),
  });
});
