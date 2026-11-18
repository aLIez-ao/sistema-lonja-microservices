import { Router } from 'express';
import { proteger } from './cuenta.js';
import { ErrorApi } from '../api.js';

const esJson = (req) => req.is('json') || req.accepts(['html', 'json']) === 'json';
const volver = (req) => {
  try {
    const url = new URL(req.get('Referer'));
    if (url.host === req.get('host')) return url.pathname + url.search;
  } catch {
    /* sin referer */
  }
  return '/cuenta/listas';
};
export function crearRutasTiendaCuenta({ pedir }) {
  const rutas = Router();
  rutas.use(
    [
      '/carrito',
      '/cuenta/listas',
      '/cuenta/favoritos',
      '/cuenta/preguntas',
      '/cuenta/opiniones',
      '/avisos/descartar-suscripcion',
    ],
    proteger('comprador'),
  );
  const vista = (ruta, plantilla) => async (req, res) => {
    const { datos } = await pedir(req, ruta);
    res.render(plantilla, { ...datos, mensaje: req.query.mensaje, error: req.query.error });
  };
  rutas.get('/carrito', vista('carrito', 'cart/index'));
  const accion =
    (ruta, metodo, body = (req) => req.body, destino = volver, transformar = (datos) => datos) =>
    async (req, res) => {
      try {
        const resultado = await pedir(req, typeof ruta === 'function' ? ruta(req) : ruta, {
          method: metodo,
          ...(body && { body: body(req) }),
        });
        const datos = transformar(resultado?.datos || {});
        if (esJson(req)) return res.json({ ok: true, mensaje: 'Cambios guardados.', ...datos });
        res.redirect(typeof destino === 'function' ? destino(req) : destino);
      } catch (error) {
        if (!(error instanceof ErrorApi) || ![400, 403, 404, 409, 422, 429].includes(error.status)) throw error;
        if (esJson(req)) return res.status(error.status).json({ ok: false, mensaje: error.message });
        const ruta = typeof destino === 'function' ? destino(req) : destino;
        res.redirect(ruta + (ruta.includes('?') ? '&' : '?') + 'error=' + encodeURIComponent(error.message));
      }
    };
  rutas.post(
    '/carrito/agregar/:id_lte',
    accion('carrito/items', 'POST', (req) => ({ id_lte: Number(req.params.id_lte) }), '/carrito'),
  );
  const quitar = async (req, res, vaciar) => {
    await pedir(req, vaciar ? 'carrito' : 'carrito/items/' + encodeURIComponent(req.params.id_lte), {
      method: 'DELETE',
    });
    const { datos } = await pedir(req, 'cuenta/barra');
    if (esJson(req))
      res.json({ ok: true, cantidad: datos.carritoCount, mensaje: vaciar ? 'Carrito vacío.' : 'Lote quitado.' });
    else res.redirect('/carrito');
  };
  rutas.post('/carrito/quitar/:id_lte', (req, res) => quitar(req, res, false));
  rutas.post('/carrito/vaciar', (req, res) => quitar(req, res, true));
  rutas.get('/cuenta/listas.json', async (req, res) => {
    const { datos } = await pedir(req, 'cuenta/listas');
    res.json({ listas: datos.listas.map((l) => ({ id: l.id_lista, nombre: l.nombre, items: l.items })) });
  });
  rutas.get('/cuenta/listas', vista('cuenta/listas', 'account/listas'));
  rutas.get('/cuenta/listas/:id', async (req, res) => {
    const { datos } = await pedir(req, 'cuenta/listas/' + encodeURIComponent(req.params.id));
    res.render('account/lista', datos);
  });
  rutas.post(
    '/cuenta/listas',
    accion(
      'cuenta/listas',
      'POST',
      (req) => ({ nombre: req.body.nombre }),
      '/cuenta/listas',
      (datos) => ({ lista: { id: datos.id_lista, nombre: datos.nombre } }),
    ),
  );
  rutas.put(
    '/cuenta/listas/:id',
    accion(
      (req) => 'cuenta/listas/' + encodeURIComponent(req.params.id),
      'PATCH',
      (req) => ({ nombre: req.body.nombre }),
      (req) => '/cuenta/listas/' + req.params.id,
    ),
  );
  rutas.delete(
    '/cuenta/listas/:id',
    accion((req) => 'cuenta/listas/' + encodeURIComponent(req.params.id), 'DELETE', null, '/cuenta/listas'),
  );
  rutas.post(
    '/cuenta/listas/:id/items',
    accion((req) => 'cuenta/listas/' + encodeURIComponent(req.params.id) + '/items', 'POST'),
  );
  rutas.delete(
    '/cuenta/listas/:id/items',
    accion((req) => 'cuenta/listas/' + encodeURIComponent(req.params.id) + '/items', 'DELETE'),
  );
  rutas.post(
    '/cuenta/listas/:id/carrito',
    accion((req) => 'cuenta/listas/' + encodeURIComponent(req.params.id) + '/carrito', 'POST', null),
  );
  rutas.post('/cuenta/favoritos/alternar', accion('cuenta/favoritos/alternar', 'POST'));
  rutas.post('/cuenta/favoritos', accion('cuenta/favoritos', 'POST'));
  rutas.get('/cuenta/preguntas', vista('cuenta/preguntas', 'account/preguntas'));
  rutas.get('/cuenta/opiniones', vista('cuenta/opiniones', 'account/opiniones'));
  rutas.delete(
    '/cuenta/opiniones/:id',
    accion((req) => 'cuenta/opiniones/' + encodeURIComponent(req.params.id), 'DELETE', null, '/cuenta/opiniones'),
  );
  rutas.post(
    '/tienda/preguntas',
    proteger('comprador'),
    accion(
      'preguntas',
      'POST',
      (req) => ({
        texto: req.body.texto,
        ...(req.body.id_lte ? { id_lte: Number(req.body.id_lte) } : { id_cat: Number(req.body.id_cat) }),
      }),
      (req) =>
        req.body.id_lte
          ? '/tienda/lote/' + encodeURIComponent(req.body.id_lte)
          : '/tienda/especie/' + encodeURIComponent(req.body.id_cat),
    ),
  );
  rutas.post(
    '/tienda/especie/:id/opiniones',
    proteger('comprador'),
    accion(
      (req) => 'opiniones/' + encodeURIComponent(req.params.id),
      'POST',
      (req) => ({ estrellas: Number(req.body.estrellas), titulo: req.body.titulo, texto: req.body.texto }),
      (req) => '/tienda/especie/' + encodeURIComponent(req.params.id),
    ),
  );
  rutas.get('/preguntas', proteger('admin', 'capturista'), vista('preguntas', 'social/preguntas'));
  rutas.post(
    '/preguntas/:id',
    proteger('admin', 'capturista'),
    accion(
      (req) => 'preguntas/' + encodeURIComponent(req.params.id),
      'PATCH',
      (req) => ({ estado: req.body.estado || 'respondida', respuesta: req.body.respuesta }),
      '/preguntas',
    ),
  );
  rutas.get('/opiniones', proteger('admin', 'capturista'), vista('opiniones', 'social/opiniones'));
  rutas.post(
    '/opiniones/:id',
    proteger('admin', 'capturista'),
    accion(
      (req) => 'opiniones/' + encodeURIComponent(req.params.id),
      'PATCH',
      (req) => ({ visible: req.body.visible === 'on' || req.body.visible === 'true' }),
      '/opiniones',
    ),
  );
  rutas.post('/avisos/descartar-suscripcion', accion('configuracion/aviso-suscripcion/descartar', 'POST', null));
  return rutas;
}
