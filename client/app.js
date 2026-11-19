import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import methodOverride from 'method-override';
import { fileURLToPath } from 'node:url';
import { crearApi, ErrorApi } from './api.js';
import { crearSesiones } from './sesiones.js';
import { middlewarePreferencias } from './middleware/preferencias.js';
import { redirigirOrigenLocal } from './middleware/origen-local.js';
import { formatoFechaHora } from './helpers/fechas.js';
import { icono } from './helpers/iconos.js';
import { transmitir } from './descargas.js';
import { crearRutasCuenta } from './routes/cuenta.js';
import { crearRutasConfiguracion } from './routes/configuracion.js';
import { crearRutasUsuarios } from './routes/usuarios.js';
import { crearRutasTiendaCuenta } from './routes/tienda-cuenta.js';
import { crearRutasPedidos } from './routes/pedidos.js';
import { crearRutasCatalogo } from './routes/catalogo.js';
import { crearRutasVentas } from './routes/ventas.js';
import { randomUUID } from 'node:crypto';
import { registro } from './helpers/registro.js';

const archivo = (ruta) => fileURLToPath(new URL(ruta, import.meta.url));
const volver = (valor) => (typeof valor === 'string' && /^\/(?![/\\])[^\s\\]*$/.test(valor) ? valor : '/');

function reconstruirListado(l) {
  l.ruta = '/';
  l.urlCon = (cambios = {}) => {
    const params = { ...l.params, ...cambios };
    if (Object.keys(cambios).some((k) => k !== 'pagina') && !('pagina' in cambios)) params.pagina = 1;
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''),
    );
    return '/?' + query;
  };
  return l;
}

export function crearCliente({ api = crearApi(), sesiones = crearSesiones() } = {}) {
  const app = express();
  app.locals.sesiones = sesiones;
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const recibida = req.get('X-Request-Id');
    req.requestId = recibida && /^[a-zA-Z0-9._:-]{1,100}$/.test(recibida) ? recibida : randomUUID();
    res.set('X-Request-Id', req.requestId);
    next();
  });
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
  app.use(
    helmet({
      referrerPolicy: { policy: 'same-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(redirigirOrigenLocal());
  app.set('view engine', 'ejs');
  app.set('views', archivo('./views'));
  app.use(express.urlencoded({ extended: true, limit: '450kb' }));
  app.use(express.json({ limit: '450kb' }));
  app.use(cookieParser());
  app.use(methodOverride('_method'));
  app.use('/bootstrap', express.static(archivo('../node_modules/bootstrap/dist')));
  app.use('/vendor/chartjs', express.static(archivo('../node_modules/chart.js/dist')));
  app.use('/uploads', async (req, res) => {
    const respuesta = await api.pedir('archivos' + req.path, { binario: true });
    await transmitir(respuesta, res);
  });
  // Las imágenes subidas las entrega exclusivamente la API a través del proxy.
  app.use(express.static(archivo('./public')));
  app.use(sesiones.middleware);
  app.use(async (req, res, next) => {
    req.usuario = req.sesion?.usuario;
    Object.assign(res.locals, {
      usuario: req.usuario || null,
      fechaHora: formatoFechaHora,
      icono,
      rutaActual: req.path,
      qTienda: String(req.query.q || '').slice(0, 60),
      carritoCount: 0,
      favoritosCount: 0,
      favoritos: { lote: new Set(), especie: new Set() },
    });
    if (req.usuario?.rol === 'comprador') {
      try {
        const { datos } = await api.pedir('cuenta/barra', { sesion: req.sesion, requestId: req.requestId });
        Object.assign(res.locals, datos, {
          favoritos: { lote: new Set(datos.favoritos.lote), especie: new Set(datos.favoritos.especie) },
        });
      } catch (error) {
        if (error.status !== 401) throw error;
        await sesiones.borrar(req, res);
        req.usuario = null;
        res.locals.usuario = null;
      }
    }
    if (req.sesion) res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(middlewarePreferencias);
  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const permitido = process.env.CLIENTE_URL || `${req.protocol}://${req.get('host')}`;
    if (req.get('Origin') === new URL(permitido).origin) return next();
    res.status(403).render('error', { codigo: 403, mensaje: 'Origen de la solicitud no permitido.' });
  });
  const pedir = (req, ruta, opciones = {}) =>
    api.pedir(ruta, { sesion: req.sesion, requestId: req.requestId, ...opciones });
  app.get('/salud', async (req, res) => {
    try {
      await sesiones.salud();
      await pedir(req, 'salud', { sesion: null });
      res.json({ client: 'ok', api: 'ok' });
    } catch (error) {
      registro.warn('API no disponible en comprobación de salud', { error });
      res.status(503).json({ client: 'ok', api: 'unavailable', id: req.requestId });
    }
  });
  app.get('/tienda', (req, res) => res.redirect(301, '/'));
  app.get('/favicon.ico', (req, res) => res.redirect(301, '/img/favicon.svg'));
  app.get('/cerrarsesion', (req, res) => res.redirect('/'));
  app.get('/', async (req, res) => {
    const query = new URLSearchParams(Object.entries(req.query).filter(([, v]) => typeof v === 'string'));
    const { datos } = await pedir(req, 'tienda/portada?' + query);
    reconstruirListado(datos.l);
    res.render('store/index', datos);
  });
  app.get('/acceso', (req, res) =>
    req.sesion
      ? res.redirect(req.sesion.usuario.rol === 'comprador' ? '/' : '/dashboard')
      : res.render('login/login', {
          errores: [],
          mensaje: req.query.mensaje || null,
          volver: req.query.volver ? volver(req.query.volver) : '',
        }),
  );
  app.get('/tienda/lote/:id', async (req, res) => {
    const { datos } = await pedir(req, `tienda/lotes/${encodeURIComponent(req.params.id)}`);
    res.render('store/lote', datos);
  });
  app.get('/tienda/especie/:id', async (req, res) => {
    const { datos } = await pedir(req, `tienda/especies/${encodeURIComponent(req.params.id)}`);
    res.render('store/especie', datos);
  });
  app.get('/tienda/sugerencias', async (req, res) => {
    const { datos } = await pedir(req, 'tienda/sugerencias?' + new URLSearchParams({ q: String(req.query.q || '') }));
    res.json(datos);
  });
  app.post('/credenciales', async (req, res) => {
    try {
      const tokens = await pedir(req, 'auth/sesion', {
        method: 'POST',
        body: { usuario: req.body.usuario, password: req.body.password },
        sesion: null,
      });
      await sesiones.iniciar(req, res, tokens);
      res.redirect(req.body.volver ? volver(req.body.volver) : tokens.usuario.rol === 'comprador' ? '/' : '/dashboard');
    } catch (error) {
      if (!(error instanceof ErrorApi)) throw error;
      res
        .status(error.status)
        .render('login/login', { errores: [error.message], mensaje: null, volver: volver(req.body.volver) });
    }
  });
  app.post('/cerrarsesion', async (req, res) => {
    try {
      if (req.sesion) await pedir(req, 'auth/sesion', { method: 'DELETE' });
    } finally {
      await sesiones.borrar(req, res);
    }
    res.redirect('/');
  });
  app.use(crearRutasCuenta({ pedir }));
  app.use(crearRutasConfiguracion({ pedir, sesiones }));
  app.use(crearRutasUsuarios({ pedir }));
  app.use(crearRutasTiendaCuenta({ pedir }));
  app.use(crearRutasPedidos({ pedir }));
  app.use(crearRutasCatalogo({ pedir }));
  app.use(crearRutasVentas({ pedir }));
  app.use((req, res) => res.status(404).render('error', { codigo: 404, mensaje: 'Página no encontrada.' }));
  app.use(async (error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (!(error instanceof ErrorApi)) registro.error('Error cliente', { error });
    if (error.status === 401) {
      await sesiones.borrar(req, res);
      return res.redirect('/acceso');
    }
    const codigo = error instanceof ErrorApi ? error.status : 500;
    res
      .status(codigo)
      .render('error', { codigo, mensaje: error instanceof ErrorApi ? error.message : 'Error interno del servidor.' });
  });
  return app;
}
