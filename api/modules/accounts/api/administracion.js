import { Router } from 'express';
import multer from 'multer';
import { autenticar, exigirRol } from '../../../middleware/autenticar.js';
import * as servicio from '../services/administracionRest.js';

export const administracion = Router();
administracion.get('/avisos/baja/:token', async (req, res) => res.json(await servicio.bajaAvisos(req.params.token)));
administracion.post('/avisos/baja/:token', async (req, res) =>
  res.json(await servicio.bajaAvisos(req.params.token, true)),
);
administracion.use(['/configuracion', '/usuarios'], autenticar);
administracion.get('/configuracion', async (req, res) =>
  res.json({ datos: await servicio.verConfiguracion(req.usuario) }),
);
administracion.patch('/configuracion', async (req, res) =>
  res.json({ datos: await servicio.actualizarConfiguracion(req.usuario, req.body) }),
);
administracion.patch('/configuracion/preferencias', async (req, res) =>
  res.json({ datos: await servicio.guardarPreferencias(req.usuario, req.body) }),
);
administracion.post('/configuracion/correo/prueba', exigirRol('admin'), async (req, res) =>
  res.json(await servicio.probarCorreo(req.usuario)),
);
administracion.post('/configuracion/avisos', exigirRol('admin'), async (req, res) =>
  res.status(202).json(await servicio.avisoClientes(req.body)),
);
administracion.post('/configuracion/aviso-suscripcion/descartar', exigirRol('comprador'), async (req, res) => {
  await servicio.descartarAviso(req.usuario);
  res.status(204).end();
});
administracion.use('/usuarios', exigirRol('admin'));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024, files: 1, fields: 2, parts: 3 },
});
administracion.put('/usuarios/:id/avatar', upload.single('imagen'), async (req, res) => {
  const data = req.file
    ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    : req.body?.imagen_data;
  res.json({
    datos: await servicio.avatarUsuario(req.params.id, data, req.body?.quitar === true || req.body?.quitar === 'true'),
  });
});
administracion.get('/usuarios', async (req, res) => res.json(await servicio.listarUsuarios(req.query)));
administracion.post('/usuarios', async (req, res) => {
  const datos = await servicio.guardarUsuario(req.usuario, req.body);
  res.location(`/api/v1/usuarios/${datos.id}`).status(201).json({ datos });
});
administracion.get('/usuarios/:id', async (req, res) => res.json({ datos: await servicio.verUsuario(req.params.id) }));
administracion.patch('/usuarios/:id', async (req, res) =>
  res.json({ datos: await servicio.guardarUsuario(req.usuario, req.body, req.params.id) }),
);
administracion.delete('/usuarios/:id', async (req, res) => {
  await servicio.eliminarUsuario(req.usuario, req.params.id);
  res.status(204).end();
});
administracion.post('/usuarios/:id/invitacion', async (req, res) =>
  res.status(202).json(await servicio.invitarUsuario(req.params.id)),
);
