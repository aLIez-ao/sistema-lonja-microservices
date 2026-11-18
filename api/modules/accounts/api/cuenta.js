import { Router } from 'express';
import multer from 'multer';
import { autenticar, exigirRol } from '../../../middleware/autenticar.js';
import * as cuentas from '../services/cuentasRest.js';
import * as direcciones from '../services/direccionesRest.js';

export const cuenta = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024, files: 1, fields: 2, parts: 3 },
});
const limitada = (accion) => async (req, res) => {
  try {
    res.status(202).json(await accion(req));
  } catch (error) {
    if (error.estado === 429) res.set('Retry-After', '3600');
    throw error;
  }
};
cuenta.post(
  '/registro',
  limitada((req) => cuentas.registrarCuenta(req.body, req.ip)),
);
cuenta.post(
  '/auth/recuperacion',
  limitada((req) => cuentas.recuperarCuenta(req.body?.identificador, req.ip)),
);
cuenta.post('/auth/restablecer/:token', async (req, res) => {
  await cuentas.restablecer(req.params.token, req.body);
  res.status(204).end();
});
cuenta.get('/auth/restablecer/:token', async (req, res) =>
  res.json({ datos: await cuentas.verRestablecimiento(req.params.token) }),
);
cuenta.post('/auth/verificacion/:token', async (req, res) => res.json(await cuentas.verificarCorreo(req.params.token)));
cuenta.use('/cuenta', autenticar);
cuenta.get('/cuenta', async (req, res) => res.json({ datos: await cuentas.verCuenta(req.usuario) }));
cuenta.patch('/cuenta', async (req, res) => res.json({ datos: await cuentas.actualizarCuenta(req.usuario, req.body) }));
cuenta.post('/cuenta/verificacion', async (req, res) => {
  try {
    res.status(202).json(await cuentas.reenviarVerificacion(req.usuario));
  } catch (error) {
    if (error.estado === 429) res.set('Retry-After', '60');
    throw error;
  }
});
cuenta.put('/cuenta/avatar', upload.single('imagen'), async (req, res) => {
  const data = req.file
    ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    : req.body?.imagen_data;
  res.json({
    datos: await cuentas.cambiarAvatar(req.usuario, data, req.body?.quitar === true || req.body?.quitar === 'true'),
  });
});
cuenta.put('/cuenta/password', async (req, res) => {
  await cuentas.cambiarPassword(req.usuario, req.body);
  res.status(204).end();
});
cuenta.use('/cuenta/direcciones', exigirRol('comprador'));
cuenta.get('/cuenta/direcciones', async (req, res) => {
  const datos = await direcciones.listarDirecciones(req.usuario);
  res.json({ datos, meta: { pagina: 1, tamano: 10, total: datos.length } });
});
cuenta.get('/cuenta/direcciones/:id', async (req, res) =>
  res.json({ datos: await direcciones.obtenerDireccion(req.usuario, req.params.id) }),
);
cuenta.post('/cuenta/direcciones', async (req, res) => {
  const datos = await direcciones.guardarDireccion(req.usuario, req.body);
  res.location(`/api/v1/cuenta/direcciones/${datos.id_dir}`).status(201).json({ datos });
});
cuenta.patch('/cuenta/direcciones/:id', async (req, res) =>
  res.json({ datos: await direcciones.guardarDireccion(req.usuario, req.body, req.params.id) }),
);
cuenta.delete('/cuenta/direcciones/:id', async (req, res) => {
  await direcciones.borrarDireccion(req.usuario, req.params.id);
  res.status(204).end();
});
