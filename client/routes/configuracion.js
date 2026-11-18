import { Router } from 'express';
import { proteger } from './cuenta.js';
import { ErrorApi } from '../api.js';
import { aplicarConsentimiento, guardarCookiePreferencia, CATEGORIAS, COOKIE_DE_PREF } from '../helpers/cookies.js';
import { prefValida } from '../middleware/preferencias.js';

const seleccionar = (b, campos) => Object.fromEntries(campos.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));
const preferencias = ['tema', 'idioma', 'moneda', 'tamanoFuente', 'tipoFuente'];

export function crearRutasConfiguracion({ pedir, sesiones }) {
  const rutas = Router();
  rutas.use('/configuracion', proteger());
  rutas.get('/configuracion', async (req, res) => {
    const { datos } = await pedir(req, 'configuracion');
    res.render('settings/index', { ...datos, mensaje: req.query.mensaje, error: req.query.error });
  });
  const guardarPrefs = async (req, res, cambios) => {
    await pedir(req, 'configuracion/preferencias', { method: 'PATCH', body: cambios });
    for (const [clave, valor] of Object.entries(cambios)) guardarCookiePreferencia(req, res, clave, valor);
    let anteriores = {};
    try {
      anteriores = JSON.parse(req.sesion.usuario.preferencias || '{}');
    } catch {
      /* se reemplazan preferencias corruptas */
    }
    req.sesion.usuario.preferencias = JSON.stringify({
      ...anteriores,
      ...cambios,
    });
    await sesiones.guardar(req);
  };
  rutas.post('/configuracion/guardar', async (req, res) => {
    await guardarPrefs(req, res, seleccionar(req.body, preferencias));
    res.redirect('/configuracion?mensaje=' + encodeURIComponent('Preferencias guardadas.'));
  });
  rutas.post('/configuracion/guardar-rapido', async (req, res) => {
    if (!prefValida(req.body.clave, req.body.valor)) return res.status(422).json({ ok: false });
    await guardarPrefs(req, res, { [req.body.clave]: req.body.valor });
    res.json({ ok: true });
  });
  rutas.post('/configuracion/cookies', (req, res) => {
    let categorias = req.body.categorias || [];
    if (req.body.nivel === 'all') categorias = CATEGORIAS.map((c) => c.id);
    if (req.body.nivel === 'essential') categorias = [];
    if (!Array.isArray(categorias)) categorias = [categorias];
    const consentimiento = aplicarConsentimiento(req, res, categorias);
    for (const [clave, { categoria }] of Object.entries(COOKIE_DE_PREF))
      if (consentimiento.permite(categoria) && req.pref[clave])
        guardarCookiePreferencia(req, res, clave, req.pref[clave]);
    if (req.is('json')) res.json({ ok: true, permitidas: consentimiento.permitidas });
    else res.redirect('/configuracion#pane-cookies');
  });
  const accion =
    (ruta, transformar = (b) => b, pane = 'cuenta') =>
    async (req, res) => {
      try {
        await pedir(req, ruta, { method: ruta === 'configuracion' ? 'PATCH' : 'POST', body: transformar(req.body) });
        res.redirect('/configuracion?mensaje=' + encodeURIComponent('Cambios guardados.') + '#pane-' + pane);
      } catch (error) {
        if (!(error instanceof ErrorApi) || ![400, 403, 409, 422, 429, 503].includes(error.status)) throw error;
        res.redirect('/configuracion?error=' + encodeURIComponent(error.message) + '#pane-' + pane);
      }
    };
  rutas.post('/configuracion/actualizar-cuenta', async (req, res) => {
    await pedir(req, 'configuracion', {
      method: 'PATCH',
      body: {
        ...seleccionar(req.body, ['nombre_completo', 'correo', 'telefono']),
        recibir_avisos: req.body.recibir_avisos === 'on',
      },
    });
    if (req.body.foto_data || req.body.foto_quitar === 'on')
      await pedir(req, 'cuenta/avatar', {
        method: 'PUT',
        body: { imagen_data: req.body.foto_data, quitar: req.body.foto_quitar === 'on' },
      });
    const { datos } = await pedir(req, 'auth/yo');
    req.sesion.usuario = { ...req.sesion.usuario, ...datos };
    await sesiones.guardar(req);
    res.redirect('/configuracion?mensaje=' + encodeURIComponent('Datos guardados.') + '#pane-cuenta');
  });
  rutas.post(
    '/configuracion/solicitar-verificacion',
    accion('cuenta/verificacion', () => ({})),
  );
  rutas.post(
    '/configuracion/correo/prueba',
    proteger('admin'),
    accion('configuracion/correo/prueba', () => ({}), 'correo'),
  );
  rutas.post(
    '/configuracion/enviar-aviso-clientes',
    proteger('admin'),
    accion('configuracion/avisos', (b) => seleccionar(b, ['asunto', 'titulo', 'mensaje', 'tipo']), 'avisos'),
  );
  rutas.post('/configuracion/cambiar-password', async (req, res) => {
    await pedir(req, 'cuenta/password', {
      method: 'PUT',
      body: {
        password_actual: req.body.password_actual,
        password: req.body.password_nuevo,
        password_confirmar: req.body.password_confirmar,
      },
    });
    await sesiones.borrar(req, res);
    res.redirect('/acceso?mensaje=' + encodeURIComponent('Contraseña guardada. Inicia sesión de nuevo.'));
  });
  rutas.post('/configuracion/aviso-suscripcion/descartar', proteger('comprador'), async (req, res) => {
    await pedir(req, 'configuracion/aviso-suscripcion/descartar', { method: 'POST' });
    res.json({ ok: true });
  });
  rutas.get('/avisos/baja/:token', async (req, res) => {
    await pedir(req, 'avisos/baja/' + encodeURIComponent(req.params.token));
    res.render('notices/baja', { token: req.params.token });
  });
  rutas.post('/avisos/baja/:token', async (req, res) => {
    const datos = await pedir(req, 'avisos/baja/' + encodeURIComponent(req.params.token), { method: 'POST' });
    res.render('error', { codigo: 200, mensaje: datos.mensaje, accion: { texto: 'Ir a la tienda', url: '/' } });
  });
  return rutas;
}
