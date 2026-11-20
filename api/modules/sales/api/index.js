import { Router } from 'express';
import { autenticar, exigirRol } from '../../../middleware/autenticar.js';
import { etag } from '../../../shared/helpers/etag.js';
import { ErrorDeUsuario } from '../../../shared/helpers/utiles.js';
import { ENTIDADES, sugerencias } from '../../../shared/helpers/busqueda.js';
import { estadisticasInicio } from '../../../shared/helpers/estadisticas.js';
import * as servicio from '../services/recursosRest.js';

export const ventasApi = Router();
ventasApi.use(
  ['/compradores', '/compras', '/reportes', '/buscar', '/dashboard'],
  autenticar,
  exigirRol('admin', 'capturista'),
);
ventasApi.get('/dashboard', async (req, res) =>
  res.json({ datos: await estadisticasInicio({ mes: typeof req.query.mes === 'string' ? req.query.mes : undefined }) }),
);
ventasApi.get('/buscar/sugerencias', async (req, res) => {
  const entidad = typeof req.query.entidad === 'string' ? req.query.entidad : '';
  if (!ENTIDADES.includes(entidad)) return res.json({ datos: [] });
  if (entidad === 'usuarios' && req.usuario.rol !== 'admin')
    throw new ErrorDeUsuario('No puedes buscar usuarios.', 403);
  res.json({ datos: (await sugerencias(entidad, req.query.q, req.usuario)) || [] });
});
ventasApi.get('/compras/catalogos', async (req, res) =>
  res.json({ datos: await servicio.catalogosCompra(req.query.incluir) }),
);
ventasApi.post('/compras/:id/correo', async (req, res) =>
  res.status(202).json(await servicio.enviarFactura(req.params.id)),
);
for (const recurso of ['compradores', 'compras']) {
  ventasApi.get('/' + recurso, async (req, res) => res.json(await servicio.listar(recurso, req.query)));
  ventasApi.get('/' + recurso + '/:id', async (req, res) => {
    const datos = await servicio.obtener(recurso, req.params.id);
    res.set('ETag', etag(datos)).json({ datos });
  });
  ventasApi.post('/' + recurso, async (req, res) => {
    const datos =
      recurso === 'compras' ? await servicio.crearCompra(req.body) : await servicio.guardarComprador(req.body);
    res
      .status(201)
      .location(`/api/v1/${recurso}/${datos[recurso === 'compras' ? 'id_cmp' : 'codigo_cpr']}`)
      .set('ETag', etag(datos))
      .json({ datos });
  });
  ventasApi.patch('/' + recurso + '/:id', async (req, res) => {
    const datos =
      recurso === 'compras'
        ? await servicio.modificarCompra(req.params.id, req.body, req.get('If-Match'))
        : await servicio.guardarComprador(req.body, req.params.id);
    res.set('ETag', etag(datos)).json({ datos });
  });
  ventasApi.delete('/' + recurso + '/:id', exigirRol('admin'), async (req, res) => {
    await servicio.eliminar(recurso, req.params.id);
    res.status(204).end();
  });
}
ventasApi.get('/reportes/dia/:fecha', async (req, res) =>
  res
    .type('text/csv')
    .attachment(`reporte-compras-${req.params.fecha}.csv`)
    .send(await servicio.reporteDiario(req.params.fecha)),
);
ventasApi.get('/reportes/:anio', async (req, res) => {
  const formato = req.accepts(['application/json', 'text/csv', 'application/pdf']);
  if (!formato) throw new ErrorDeUsuario('Formato de reporte no admitido.', 406);
  const tipo = formato === 'application/pdf' ? 'pdf' : formato === 'text/csv' ? 'csv' : 'json';
  const datos = await servicio.reporte(req.params.anio, req.usuario, tipo);
  if (tipo === 'json') return res.json({ datos });
  res.type(formato).attachment(`Reporte-Anual-Lonja-${req.params.anio}.${tipo}`).send(datos);
});
