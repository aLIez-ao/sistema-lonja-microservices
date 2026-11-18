import { Router } from 'express';
import { proteger } from './cuenta.js';
import { ErrorApi } from '../api.js';
import { listado, consultaListado, todos, conVersion } from '../helpers/listados.js';
import { transmitir } from '../descargas.js';
import { hoy } from '../helpers/fechas.js';

export function crearRutasVentas({ pedir }) {
  const rutas = Router();
  rutas.use(
    ['/compradores', '/compras', '/dashboard', '/inicio', '/reportes', '/buscar'],
    proteger('admin', 'capturista'),
  );
  rutas.get('/dashboard', async (req, res) => {
    const { datos } = await pedir(req, 'dashboard');
    res.render('dashboard', datos);
  });
  rutas.get('/inicio', (req, res) => res.redirect(301, '/dashboard'));
  rutas.get('/buscar/sugerencias', async (req, res) => {
    const { datos } = await pedir(
      req,
      'buscar/sugerencias?' +
        new URLSearchParams({ entidad: String(req.query.entidad || ''), q: String(req.query.q || '') }),
    );
    res.json(datos);
  });
  for (const recurso of ['compradores', 'compras']) {
    rutas.get('/' + recurso, async (req, res) => {
      const { datos, meta } = await pedir(req, recurso + '?' + consultaListado(req));
      const filtros =
        recurso === 'compradores'
          ? [
              {
                clave: 'compras',
                etiqueta: 'Compras',
                tipo: 'select',
                opciones: [
                  { valor: 'con', texto: 'Con compras' },
                  { valor: 'sin', texto: 'Sin compras' },
                ],
              },
              {
                clave: 'correo',
                etiqueta: 'Correo',
                tipo: 'select',
                opciones: [
                  { valor: 'con', texto: 'Con correo' },
                  { valor: 'sin', texto: 'Sin correo' },
                ],
              },
            ]
          : [
              { clave: 'desde', etiqueta: 'Desde', tipo: 'fecha' },
              { clave: 'hasta', etiqueta: 'Hasta', tipo: 'fecha' },
              { clave: 'totalMin', etiqueta: 'Total mínimo', tipo: 'numero' },
              { clave: 'totalMax', etiqueta: 'Total máximo', tipo: 'numero' },
            ];
      if (recurso === 'compras') {
        const [compradores, tipos] = await Promise.all([todos(pedir, req, 'compradores'), todos(pedir, req, 'tipos')]);
        filtros.push(
          {
            clave: 'comprador',
            etiqueta: 'Comprador',
            tipo: 'select',
            opciones: compradores.map((c) => ({ valor: c.codigo_cpr, texto: c.nombre + ' ' + c.apellido_paterno })),
          },
          {
            clave: 'tipo',
            etiqueta: 'Tipo',
            tipo: 'select',
            opciones: tipos.map((t) => ({ valor: t.id_tpo, texto: t.nombre })),
          },
        );
      }
      res.render({ compras: 'purchases', compradores: 'buyers' }[recurso] + '/index', {
        [recurso]: datos,
        l: listado(req, datos, meta),
        filtros,
        mensaje: req.query.mensaje,
        error: req.query.error,
      });
    });
    const formulario = async (req, res, registro, errores = [], estado = 200, etag = null) => {
      const datos = {
        [recurso === 'compras' ? 'compra' : 'comprador']: registro,
        editando: !!req.params.id,
        action: '/' + recurso + (req.params.id ? '/' + req.params.id + '?_method=PUT' : ''),
        errores,
        etag,
        mensaje: null,
      };
      if (recurso === 'compras')
        Object.assign(
          datos,
          (
            await pedir(
              req,
              'compras/catalogos' + (req.params.id ? '?incluir=' + encodeURIComponent(req.params.id) : ''),
            )
          ).datos,
        );
      res.status(estado).render({ compras: 'purchases', compradores: 'buyers' }[recurso] + '/formulario', datos);
    };
    rutas.get('/' + recurso + '/crear', (req, res) =>
      formulario(req, res, recurso === 'compras' && req.query.lote ? { id_cmp: req.query.lote } : null),
    );
    rutas.get('/' + recurso + '/:id/editar', async (req, res) => {
      const { datos, etag } = await conVersion(pedir, req, recurso + '/' + encodeURIComponent(req.params.id));
      if (recurso === 'compras' && datos.id_ped)
        throw new ErrorApi(409, { detail: 'Las compras de pedidos no se editan desde la caja.' });
      await formulario(req, res, datos, [], 200, etag);
    });
    const guardar = async (req, res) => {
      try {
        const campos =
          recurso === 'compras'
            ? ['codigo_cpr', 'precio_kilo_final', ...(!req.params.id ? ['id_cmp'] : [])]
            : ['nombre', 'apellido_paterno', 'apellido_materno', 'correo', 'direccion'];
        const body = Object.fromEntries(campos.filter((k) => req.body[k] !== undefined).map((k) => [k, req.body[k]]));
        if (recurso === 'compras' && /^\d+(?:\.\d{1,2})?$/.test(String(body.precio_kilo_final)))
          body.precio_kilo_final = Number(body.precio_kilo_final).toFixed(2);
        const { datos } = await pedir(req, recurso + (req.params.id ? '/' + encodeURIComponent(req.params.id) : ''), {
          method: req.params.id ? 'PATCH' : 'POST',
          body,
          ...(recurso === 'compras' && req.params.id && { headers: { 'If-Match': req.body._etag || '' } }),
        });
        res.redirect(recurso === 'compras' ? `/compras/${datos.id_cmp}/factura` : '/compradores');
      } catch (error) {
        if (!(error instanceof ErrorApi) || ![400, 409, 412, 422, 428].includes(error.status)) throw error;
        await formulario(
          req,
          res,
          {
            ...req.body,
            ...(req.params.id && { [recurso === 'compras' ? 'id_cmp' : 'codigo_cpr']: Number(req.params.id) }),
          },
          [error.message],
          error.status,
          req.body._etag,
        );
      }
    };
    rutas.post('/' + recurso, guardar);
    rutas.put('/' + recurso + '/:id', guardar);
    rutas.delete('/' + recurso + '/:id', proteger('admin'), async (req, res) => {
      await pedir(req, recurso + '/' + encodeURIComponent(req.params.id), { method: 'DELETE' });
      res.redirect('/' + recurso);
    });
  }
  rutas.get('/compradores/:id', async (req, res) => {
    const { datos: comprador } = await pedir(req, 'compradores/' + encodeURIComponent(req.params.id));
    const compras = (comprador.compras || []).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    res.render('buyers/detalle', {
      comprador,
      compras,
      kilos: compras.reduce((s, c) => s + Number(c.lote?.kilos || 0), 0),
      total: compras.reduce((s, c) => s + Number(c.precio_total), 0),
      ultima: compras[0]?.fecha || null,
      mensaje: req.query.mensaje,
      error: req.query.error,
    });
  });
  rutas.get('/compras/:id/factura', async (req, res) => {
    const { datos } = await pedir(req, 'compras/' + encodeURIComponent(req.params.id) + '/factura');
    res.render(req.query.parcial === '1' ? 'purchases/factura-parcial' : 'purchases/factura', {
      ...datos,
      mensaje: req.query.mensaje,
      error: req.query.error,
    });
  });
  rutas.get('/compras/:id/factura.pdf', async (req, res) => {
    const respuesta = await pedir(req, 'compras/' + encodeURIComponent(req.params.id) + '/factura', {
      binario: true,
      headers: { Accept: 'application/pdf' },
    });
    await transmitir(respuesta, res);
  });
  rutas.post('/compras/:id/enviar-correo', async (req, res) => {
    const datos = await pedir(req, 'compras/' + encodeURIComponent(req.params.id) + '/correo', { method: 'POST' });
    res.redirect(`/compras/${req.params.id}/factura?mensaje=` + encodeURIComponent(datos.mensaje));
  });
  rutas.get('/reportes', (req, res) => res.redirect('/reportes/diario'));
  const anio = (req) => String(req.query.anio || hoy().slice(0, 4));
  rutas.get('/reportes/diario', async (req, res) => {
    const { datos } = await pedir(req, 'reportes/' + encodeURIComponent(anio(req)));
    res.render('reports/anual', datos);
  });
  rutas.get('/reportes/anual.pdf', async (req, res) => {
    const respuesta = await pedir(req, 'reportes/' + encodeURIComponent(anio(req)), {
      binario: true,
      headers: { Accept: 'application/pdf' },
    });
    await transmitir(respuesta, res);
  });
  rutas.get('/reportes/diario.csv', async (req, res) => {
    const ruta = req.query.anio
      ? 'reportes/' + encodeURIComponent(anio(req))
      : 'reportes/dia/' + encodeURIComponent(String(req.query.fecha || hoy()));
    const respuesta = await pedir(req, ruta, { binario: true, headers: { Accept: 'text/csv' } });
    await transmitir(respuesta, res);
  });
  return rutas;
}
