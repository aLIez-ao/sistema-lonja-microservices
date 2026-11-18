import { Router } from 'express';
import { proteger } from './cuenta.js';
import { ErrorApi } from '../api.js';
import { listado, consultaListado, todos, conVersion } from '../helpers/listados.js';

const singular = { tipos: 'tipo', catalogo: 'item', especies: 'especie', lotes: 'lote' };
const campos = {
  tipos: ['nombre'],
  catalogo: ['nombre', 'id_tpo', 'descripcion'],
  especies: ['id_lte', 'id_cat'],
  lotes: ['kilos', 'numero_cajas', 'precio_kilo_salida', 'especies'],
};
const seleccionar = (b, claves) => Object.fromEntries(claves.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));

export function crearRutasCatalogo({ pedir }) {
  const rutas = Router();
  rutas.use(['/tipos', '/catalogo', '/especies', '/lotes'], proteger('admin', 'capturista'));
  for (const recurso of Object.keys(singular)) {
    rutas.get('/' + recurso, async (req, res) => {
      const query = consultaListado(req);
      if (recurso === 'catalogo' && ['activo', 'inactivo'].includes(query.get('activo')))
        query.set('activo', query.get('activo') === 'activo' ? 'true' : 'false');
      const { datos, meta } = await pedir(req, recurso + '?' + query);
      const tipos = recurso === 'tipos' ? datos : await todos(pedir, req, 'tipos');
      const filtros = [];
      if (recurso !== 'tipos')
        filtros.push({
          clave: 'tipo',
          etiqueta: 'Tipo',
          tipo: 'select',
          opciones: tipos.map((t) => ({ valor: t.id_tpo, texto: t.nombre })),
        });
      if (['especies', 'lotes'].includes(recurso))
        filtros.push({
          clave: 'estado',
          etiqueta: 'Estado',
          tipo: 'select',
          opciones: [
            { valor: 'disponibles', texto: 'Disponibles' },
            { valor: 'vendidos', texto: 'Vendidos' },
          ],
        });
      if (recurso === 'lotes')
        filtros.push(
          { clave: 'desde', etiqueta: 'Desde', tipo: 'fecha' },
          { clave: 'hasta', etiqueta: 'Hasta', tipo: 'fecha' },
          { clave: 'kilosMin', etiqueta: 'Kilos mínimo', tipo: 'numero' },
          { clave: 'kilosMax', etiqueta: 'Kilos máximo', tipo: 'numero' },
        );
      if (recurso === 'catalogo')
        filtros.push({
          clave: 'activo',
          etiqueta: 'Estado',
          tipo: 'select',
          opciones: [
            { valor: 'activo', texto: 'Activas' },
            { valor: 'inactivo', texto: 'Inactivas' },
          ],
        });
      res.render({ tipos: 'types', catalogo: 'catalog', especies: 'species', lotes: 'lots' }[recurso] + '/index', {
        [recurso]: datos,
        l: listado(req, datos, meta),
        tipos,
        filtros,
        uso: new Map(datos.map((f) => [String(f.id_cat), f.en_uso || 0])),
        mensaje: req.query.mensaje,
        error: req.query.error,
      });
    });
    const formulario = async (req, res, registro, errores = [], estado = 200, etag = null) => {
      const datos = {
        [singular[recurso]]: registro,
        action: '/' + recurso + (req.params.id ? '/' + req.params.id + '?_method=PUT' : ''),
        errores,
        mensaje: null,
        etag,
        method: 'POST',
      };
      if (recurso !== 'tipos') {
        datos.tipos = await todos(pedir, req, 'tipos');
        if (['lotes', 'especies'].includes(recurso)) datos.catalogo = await todos(pedir, req, 'catalogo');
        if (recurso === 'lotes')
          datos.seleccion = Array.isArray(registro?.especies)
            ? registro.especies.map((e) => String(typeof e === 'object' ? e.id_cat : e))
            : [];
        if (recurso === 'especies') datos.lotes = await todos(pedir, req, 'lotes', { estado: 'disponibles' });
        if (datos.catalogo) {
          const actuales = new Set(recurso === 'lotes' ? datos.seleccion : [String(registro?.id_cat)]);
          datos.catalogo = datos.catalogo.filter((c) => c.activo || actuales.has(String(c.id_cat)));
        }
      }
      res
        .status(estado)
        .render(
          { tipos: 'types', catalogo: 'catalog', especies: 'species', lotes: 'lots' }[recurso] + '/formulario',
          datos,
        );
    };
    rutas.get('/' + recurso + '/crear', async (req, res) =>
      formulario(req, res, recurso === 'especies' && req.query.lote ? { id_lte: req.query.lote } : null),
    );
    rutas.get('/' + recurso + '/:id/editar', async (req, res) => {
      const { datos, etag } = await conVersion(pedir, req, recurso + '/' + encodeURIComponent(req.params.id));
      if ((recurso === 'lotes' && datos.compra) || (recurso === 'especies' && datos.lote?.compra))
        throw new ErrorApi(409, { detail: 'El lote vendido no se puede editar.' });
      await formulario(req, res, datos, req.query.error ? [String(req.query.error)] : [], 200, etag);
    });
    if (recurso !== 'catalogo')
      rutas.get('/' + recurso + '/:id', async (req, res) => {
        const { datos } = await pedir(req, recurso + '/' + encodeURIComponent(req.params.id));
        res.render({ tipos: 'types', catalogo: 'catalog', especies: 'species', lotes: 'lots' }[recurso] + '/detalle', {
          [singular[recurso]]: datos,
          ...(recurso === 'tipos' && { especies: datos.especies }),
          mensaje: req.query.mensaje,
          error: req.query.error,
        });
      });
    const guardar = async (req, res) => {
      let guardado;
      try {
        const b = seleccionar(req.body, campos[recurso]);
        if (recurso === 'lotes') {
          b.especies = (Array.isArray(b.especies) ? b.especies : String(b.especies || '').split(','))
            .filter(Boolean)
            .map(Number);
          b.numero_cajas = Number(b.numero_cajas);
        }
        for (const campo of ['id_tpo', 'id_lte', 'id_cat']) if (b[campo] !== undefined) b[campo] = Number(b[campo]);
        if (recurso === 'lotes' && /^\d+(?:\.\d{1,2})?$/.test(String(b.precio_kilo_salida)))
          b.precio_kilo_salida = Number(b.precio_kilo_salida).toFixed(2);
        const { datos } = await pedir(req, recurso + (req.params.id ? '/' + encodeURIComponent(req.params.id) : ''), {
          method: req.params.id ? 'PATCH' : 'POST',
          body: b,
          ...(recurso === 'lotes' && req.params.id && { headers: { 'If-Match': req.body._etag || '' } }),
        });
        guardado = datos;
        if (recurso === 'catalogo') {
          if (req.body.imagen_data)
            await pedir(req, `catalogo/${datos.id_cat}/imagen`, {
              method: 'PUT',
              body: { imagen_data: req.body.imagen_data },
            });
          else if (req.body.imagen_quitar === 'on')
            await pedir(req, `catalogo/${datos.id_cat}/imagen`, { method: 'DELETE' });
          if (req.is('json') || req.get('accept')?.includes('application/json')) {
            const actual = (await pedir(req, `catalogo/${datos.id_cat}`)).datos;
            return res.status(req.params.id ? 200 : 201).json({ ok: true, especie: actual });
          }
        }
        res.redirect('/' + recurso + '?mensaje=' + encodeURIComponent('Registro guardado.'));
      } catch (error) {
        if (!(error instanceof ErrorApi) || ![400, 409, 412, 422, 428].includes(error.status)) throw error;
        if (req.is('json')) return res.status(error.status).json({ ok: false, errores: [error.message] });
        if (recurso === 'catalogo' && guardado?.id_cat)
          return res.redirect(
            `/catalogo/${guardado.id_cat}/editar?error=` +
              encodeURIComponent('Los datos se guardaron; la imagen no pudo guardarse: ' + error.message),
          );
        const pk = { tipos: 'id_tpo', catalogo: 'id_cat', especies: 'id_epe', lotes: 'id_lte' }[recurso];
        await formulario(
          req,
          res,
          { ...req.body, ...(req.params.id && { [pk]: Number(req.params.id) }) },
          [error.message],
          error.status,
          req.body._etag,
        );
      }
    };
    rutas.post('/' + recurso, guardar);
    rutas.put('/' + recurso + '/:id', guardar);
    rutas.delete('/' + recurso + '/:id', async (req, res) => {
      await pedir(
        req,
        recurso + '/' + encodeURIComponent(req.params.id),
        recurso === 'catalogo' ? { method: 'PATCH', body: { activo: false } } : { method: 'DELETE' },
      );
      res.redirect('/' + recurso);
    });
  }
  rutas.post('/catalogo/:id/activar', async (req, res) => {
    await pedir(req, 'catalogo/' + encodeURIComponent(req.params.id), { method: 'PATCH', body: { activo: true } });
    res.redirect('/catalogo');
  });
  return rutas;
}
