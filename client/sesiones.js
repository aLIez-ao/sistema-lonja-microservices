import { randomBytes } from 'node:crypto';

/** Almacenamiento de una instancia; al escalar se inyecta un almacén compartido. */
export function crearSesiones({ almacen } = {}) {
  const sesiones = new Map();
  const opciones = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' };
  const duracion = 8 * 3600000;
  const limpiar = setInterval(() => {
    for (const [id, datos] of sesiones) if (datos.expira <= Date.now()) sesiones.delete(id);
  }, 60000);
  limpiar.unref();
  const store = almacen || {
    get: (id) => sesiones.get(id),
    set: (id, datos) => sesiones.set(id, datos),
    delete: (id) => sesiones.delete(id),
    usuario: (id, usuario) => {
      if (sesiones.has(id)) sesiones.get(id).usuario = usuario;
    },
    ping: async () => true,
    cerrar: () => sesiones.clear(),
  };
  const preparar = (id, sesion) => {
    if (store.rotar)
      Object.defineProperty(sesion, 'rotar', {
        enumerable: false,
        configurable: true,
        value: async (renovar) => Object.assign(sesion, await store.rotar(id, sesion.refresh, renovar)),
      });
    return sesion;
  };
  return {
    async middleware(req, res, next) {
      const id = req.cookies.lonja_sid;
      const valido = typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
      const sesion = valido ? await store.get(id) : null;
      if (sesion?.expira > Date.now()) {
        req.sesion = preparar(id, sesion);
        req.sesionId = id;
      } else if (id) {
        if (valido) await store.delete(id);
        res.clearCookie('lonja_sid', opciones);
      }
      next();
    },
    async iniciar(req, res, tokens) {
      if (/^[a-f0-9]{64}$/.test(req.cookies.lonja_sid || '')) await store.delete(req.cookies.lonja_sid);
      const id = randomBytes(32).toString('hex');
      req.sesion = preparar(id, { ...tokens, expira: Date.now() + duracion });
      req.sesionId = id;
      await store.set(id, req.sesion);
      res.cookie('lonja_sid', id, { ...opciones, maxAge: duracion });
    },
    async borrar(req, res) {
      if (/^[a-f0-9]{64}$/.test(req.cookies.lonja_sid || '')) await store.delete(req.cookies.lonja_sid);
      req.sesion = null;
      res.clearCookie('lonja_sid', opciones);
    },
    cerrar() {
      clearInterval(limpiar);
      return store.cerrar();
    },
    guardar: (req) => store.usuario(req.sesionId, req.sesion.usuario),
    salud: () => store.ping(),
  };
}
