import { Router } from 'express';
import { proteger } from './cuenta.js';
import { ErrorApi } from '../api.js';

const nombreRol = { admin: 'Administrador', capturista: 'Capturista', comprador: 'Comprador' };
export function crearRutasUsuarios({ pedir }) {
  const rutas = Router();
  rutas.use('/usuarios', proteger('admin'));
  rutas.get('/usuarios', async (req, res) => {
    const seccion = async (prefijo, extra) => {
      const q = String(req.query['q' + prefijo] || req.query.q || '').slice(0, 60),
        pagina = Math.max(1, Number.parseInt(req.query['pagina' + prefijo], 10) || 1);
      const query = new URLSearchParams({
        ...extra,
        q,
        pagina,
        tamano: 20,
        orden: String(req.query['orden' + prefijo] || 'nombre'),
        dir: String(req.query['dir' + prefijo] || 'asc').toLowerCase(),
        verificado: String(req.query['verificado' + prefijo] || req.query.verificado || ''),
      });
      const { datos, meta } = await pedir(req, 'usuarios?' + query);
      return {
        filas: datos,
        q,
        pagina: meta.pagina,
        paginas: Math.max(1, Math.ceil(meta.total / 20)),
        total: meta.total,
      };
    };
    const [trabajadores, clientes] = await Promise.all([
      seccion('T', req.query.rol ? { rol: String(req.query.rol) } : { seccion: 'personal' }),
      seccion('C', { rol: 'comprador' }),
    ]);
    const url = (cambios) => '/usuarios?' + new URLSearchParams({ ...req.query, ...cambios });
    res.render('users/index', {
      trabajadores,
      clientes,
      nombreRol,
      query: req.query,
      pedidosPorUsuario: Object.fromEntries(clientes.filas.map((u) => [u.id, u.pedidos || 0])),
      paginaUrl: (p, n) => url({ ['pagina' + p]: n }),
      ordenUrl: (p, c) =>
        url({ ['orden' + p]: c, ['dir' + p]: req.query['dir' + p] === 'asc' ? 'desc' : 'asc', ['pagina' + p]: 1 }),
      mensaje: req.query.mensaje,
      error: req.query.error,
    });
  });
  const formulario = (res, us, errores = [], estado = 200) =>
    res.status(estado).render('users/formulario', {
      us,
      errores,
      roles: us?.rol === 'comprador' ? ['comprador'] : ['admin', 'capturista'],
      nombreRol,
      bloqueadoRol: us?.rol === 'comprador',
      action: us?.id ? `/usuarios/${us.id}?_method=PUT` : '/usuarios',
    });
  rutas.get('/usuarios/crear', (req, res) => formulario(res, null));
  rutas.get('/usuarios/:id/editar', async (req, res) => {
    const { datos } = await pedir(req, 'usuarios/' + encodeURIComponent(req.params.id));
    formulario(res, datos);
  });
  const guardar = async (req, res) => {
    let guardado;
    try {
      const b = req.body;
      const body = Object.fromEntries(
        ['usuario', 'nombre_completo', 'correo', 'telefono', 'puesto', 'rol']
          .filter((k) => b[k] !== undefined)
          .map((k) => [k, b[k]]),
      );
      if (req.params.id) body.activo = b.activo === 'on';
      if (b.password && (req.params.id || b.acceso === 'manual')) {
        body.password = b.password;
        body.password_confirmar = b.password_confirmar;
      }
      const { datos } = await pedir(req, 'usuarios' + (req.params.id ? '/' + encodeURIComponent(req.params.id) : ''), {
        method: req.params.id ? 'PATCH' : 'POST',
        body,
      });
      guardado = datos;
      if (b.foto_data || b.foto_quitar === 'on')
        await pedir(req, `usuarios/${datos.id}/avatar`, {
          method: 'PUT',
          body: { imagen_data: b.foto_data, quitar: b.foto_quitar === 'on' },
        });
      res.redirect('/usuarios?mensaje=' + encodeURIComponent('Usuario guardado.'));
    } catch (error) {
      if (!(error instanceof ErrorApi) || ![400, 409, 422].includes(error.status)) throw error;
      if (guardado?.id)
        return res.redirect(
          '/usuarios?error=' + encodeURIComponent('El usuario se guardó; la foto no pudo guardarse: ' + error.message),
        );
      formulario(
        res,
        { ...req.body, id: req.params.id, password: '', activo: req.body.activo === 'on' },
        [error.message],
        error.status,
      );
    }
  };
  rutas.post('/usuarios', guardar);
  rutas.put('/usuarios/:id', guardar);
  rutas.delete('/usuarios/:id', async (req, res) => {
    await pedir(req, 'usuarios/' + encodeURIComponent(req.params.id), { method: 'DELETE' });
    res.redirect('/usuarios');
  });
  rutas.post('/usuarios/:id/restablecer', async (req, res) => {
    await pedir(req, 'usuarios/' + encodeURIComponent(req.params.id) + '/invitacion', { method: 'POST' });
    res.redirect('/usuarios?mensaje=' + encodeURIComponent('Enlace enviado.'));
  });
  return rutas;
}
