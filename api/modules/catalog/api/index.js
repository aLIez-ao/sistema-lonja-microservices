import { Router } from 'express';
import multer from 'multer';
import { autenticar, exigirRol } from '../../../middleware/autenticar.js';
import { listar, obtener, guardar, eliminar, serializar, etag } from '../services/recursos.js';
import { actualizarImagen, quitarImagen } from '../services/imagen.js';

export const catalog = Router();
catalog.use(['/tipos', '/catalogo', '/especies', '/lotes'], autenticar, exigirRol('admin', 'capturista'));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 280 * 1024, files: 1, fields: 1, parts: 2 },
});
catalog.put('/catalogo/:id/imagen', upload.single('imagen'), async (req, res) => {
  const data = req.file
    ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    : req.body?.imagen_data;
  res.json({ datos: await actualizarImagen(req.params.id, data) });
});
catalog.delete('/catalogo/:id/imagen', async (req, res) => {
  await quitarImagen(req.params.id);
  res.status(204).end();
});
for (const recurso of ['tipos', 'catalogo', 'especies', 'lotes']) {
  catalog.get('/' + recurso, async (req, res) => res.json(await listar(recurso, req.query)));
  catalog.get('/' + recurso + '/:id', async (req, res) => {
    const datos = serializar(await obtener(recurso, req.params.id));
    res.set('ETag', etag(datos)).json({ datos });
  });
  catalog.post('/' + recurso, async (req, res) => {
    const datos = await guardar(recurso, req.body);
    const pk = { tipos: 'id_tpo', catalogo: 'id_cat', especies: 'id_epe', lotes: 'id_lte' }[recurso];
    res.location(`/api/v1/${recurso}/${datos[pk]}`).status(201).set('ETag', etag(datos)).json({ datos });
  });
  catalog.patch('/' + recurso + '/:id', async (req, res) => {
    const datos = await guardar(recurso, req.body, req.params.id, req.get('If-Match'));
    res.set('ETag', etag(datos)).json({ datos });
  });
  catalog.delete('/' + recurso + '/:id', exigirRol('admin'), async (req, res) => {
    await eliminar(recurso, req.params.id);
    res.status(204).end();
  });
}
