import { Router } from 'express';
import { ErrorApi } from '../api.js';
import { ESTADOS, MUNICIPIOS_VERACRUZ } from '../helpers/mexico.js';

export const proteger =
  (...roles) =>
  (req, res, next) => {
    if (!req.sesion) return res.redirect('/acceso?volver=' + encodeURIComponent(req.originalUrl));
    if (roles.length && !roles.includes(req.sesion.usuario.rol))
      return res.status(403).render('error', { codigo: 403, mensaje: 'No tienes permiso para realizar esta acción.' });
    next();
  };
const errorFormulario = (error, res, vista, datos) => {
  if (!(error instanceof ErrorApi) || ![400, 409, 422, 429].includes(error.status)) throw error;
  return res
    .status(error.status)
    .render(vista, { ...datos, errores: error.errores.length ? error.errores.map((e) => e.mensaje) : [error.message] });
};
const camposDireccion = [
  'alias',
  'destinatario',
  'telefono',
  'calle',
  'num_ext',
  'num_int',
  'colonia',
  'cp',
  'municipio',
  'estado',
  'referencias',
];
const camposCuenta = ['nombre', 'apellido_paterno', 'apellido_materno', 'correo', 'telefono', 'rfc', 'razon_social'];
const recoger = (body, campos) =>
  Object.fromEntries(campos.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));

export function crearRutasCuenta({ pedir }) {
  const rutas = Router();
  rutas.get('/registro', (req, res) => res.render('signup/formulario', { datos: {}, errores: [] }));
  rutas.post('/registro', async (req, res) => {
    try {
      await pedir(req, 'registro', { method: 'POST', body: req.body });
      res.render('signup/revisa', { correo: req.body.correo, enlace: null });
    } catch (error) {
      errorFormulario(error, res, 'signup/formulario', { datos: req.body });
    }
  });
  rutas.get('/olvide-password', (req, res) => res.render('login/olvide-password', { mensaje: null, error: null }));
  rutas.post('/olvide-password', async (req, res) => {
    try {
      const datos = await pedir(req, 'auth/recuperacion', {
        method: 'POST',
        body: { identificador: req.body.identificador },
      });
      res.render('login/olvide-password', { mensaje: datos.mensaje, error: null });
    } catch (error) {
      if (!(error instanceof ErrorApi) || ![422, 429].includes(error.status)) throw error;
      res.status(error.status).render('login/olvide-password', { mensaje: null, error: error.message });
    }
  });
  rutas.get('/recuperar-password/:token', async (req, res) => {
    const { datos } = await pedir(req, 'auth/restablecer/' + encodeURIComponent(req.params.token));
    res.render('login/recuperar-password', { cuenta: datos, token: req.params.token, errores: [] });
  });
  rutas.post('/recuperar-password/:token', async (req, res) => {
    try {
      await pedir(req, 'auth/restablecer/' + encodeURIComponent(req.params.token), {
        method: 'POST',
        body: recoger(req.body, ['password', 'password_confirmar']),
      });
      res.redirect('/acceso?mensaje=' + encodeURIComponent('Tu contraseña quedó guardada. Ya puedes iniciar sesión.'));
    } catch (error) {
      if (!(error instanceof ErrorApi) || error.status !== 422) throw error;
      const { datos } = await pedir(req, 'auth/restablecer/' + encodeURIComponent(req.params.token));
      errorFormulario(error, res, 'login/recuperar-password', { cuenta: datos, token: req.params.token });
    }
  });
  rutas.get('/verificar-email/:token', async (req, res) => {
    const datos = await pedir(req, 'auth/verificacion/' + encodeURIComponent(req.params.token), { method: 'POST' });
    res.render('error', { codigo: 200, mensaje: datos.mensaje, accion: { texto: 'Iniciar sesión', url: '/acceso' } });
  });
  rutas.use('/cuenta', proteger('comprador'));
  rutas.get('/cuenta', async (req, res) => {
    const { datos } = await pedir(req, 'cuenta');
    res.render('account/resumen', { ...datos, mensaje: req.query.mensaje, error: req.query.error });
  });
  const datosPersonales = async (req) => {
    const { datos } = await pedir(req, 'cuenta');
    return {
      ...datos,
      direcciones: datos.direcciones.length,
      errores: [],
      mensaje: req.query.mensaje || null,
      enlaceVerificacion: null,
    };
  };
  rutas.get('/cuenta/datos', async (req, res) => res.render('account/datos', await datosPersonales(req)));
  rutas.post('/cuenta/datos', async (req, res) => {
    try {
      await pedir(req, 'cuenta', { method: 'PATCH', body: recoger(req.body, camposCuenta) });
      if (req.body.foto_data || req.body.foto_quitar === 'on')
        await pedir(req, 'cuenta/avatar', {
          method: 'PUT',
          body: { imagen_data: req.body.foto_data, quitar: req.body.foto_quitar === 'on' },
        });
      res.redirect('/cuenta/datos?mensaje=' + encodeURIComponent('Tus datos quedaron guardados.'));
    } catch (error) {
      const datos = await datosPersonales(req);
      errorFormulario(error, res, 'account/datos', {
        ...datos,
        datos: { ...datos.datos, ...recoger(req.body, camposCuenta) },
      });
    }
  });
  rutas.get('/cuenta/direcciones', async (req, res) => {
    const { datos } = await pedir(req, 'cuenta/direcciones');
    res.render('account/direcciones', {
      direcciones: datos,
      maximo: 10,
      mensaje: req.query.mensaje,
      error: req.query.error,
    });
  });
  const formulario = (res, direccion, errores = [], estado = 200) =>
    res.status(estado).render('account/direccion-formulario', {
      direccion,
      errores,
      estados: ESTADOS,
      municipios: MUNICIPIOS_VERACRUZ,
      action: direccion?.id_dir ? `/cuenta/direcciones/${direccion.id_dir}?_method=PUT` : '/cuenta/direcciones',
    });
  rutas.get('/cuenta/direcciones/nueva', (req, res) => formulario(res, null));
  rutas.get('/cuenta/direcciones/:id/editar', async (req, res) => {
    const { datos } = await pedir(req, 'cuenta/direcciones/' + encodeURIComponent(req.params.id));
    formulario(res, datos);
  });
  const guardar = async (req, res) => {
    try {
      await pedir(req, 'cuenta/direcciones' + (req.params.id ? '/' + encodeURIComponent(req.params.id) : ''), {
        method: req.params.id ? 'PATCH' : 'POST',
        body: { ...recoger(req.body, camposDireccion), principal: req.body.principal === 'on' },
      });
      res.redirect('/cuenta/direcciones?mensaje=' + encodeURIComponent('Dirección guardada.'));
    } catch (error) {
      if (!(error instanceof ErrorApi) || ![400, 409, 422].includes(error.status)) throw error;
      formulario(res, { ...req.body, id_dir: req.params.id }, [error.message], error.status);
    }
  };
  rutas.post('/cuenta/direcciones', guardar);
  rutas.put('/cuenta/direcciones/:id', guardar);
  rutas.delete('/cuenta/direcciones/:id', async (req, res) => {
    await pedir(req, 'cuenta/direcciones/' + encodeURIComponent(req.params.id), { method: 'DELETE' });
    res.redirect('/cuenta/direcciones');
  });
  rutas.post('/cuenta/direcciones/:id/principal', async (req, res) => {
    await pedir(req, 'cuenta/direcciones/' + encodeURIComponent(req.params.id), {
      method: 'PATCH',
      body: { principal: true },
    });
    res.redirect('/cuenta/direcciones');
  });
  return rutas;
}
