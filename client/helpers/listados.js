export function listado(req, datos, meta) {
  const params = { ...req.query, tam: meta.tamano };
  const ruta = req.path.replace(/\/+$/, '') || '/';
  const filtros = Object.fromEntries(
    Object.entries(req.query).filter(([k]) => !['q', 'tam', 'pagina', 'orden', 'dir', 'mensaje', 'error'].includes(k)),
  );
  const l = {
    ruta,
    q: String(req.query.q || ''),
    tam: meta.tamano,
    porPagina: [10, 25, 50, 100],
    campo: String(req.query.orden || 'id'),
    dir: String(req.query.dir || 'desc'),
    pagina: meta.pagina,
    paginas: Math.max(1, Math.ceil(meta.total / meta.tamano)),
    total: meta.total,
    inicio: meta.total ? (meta.pagina - 1) * meta.tamano + 1 : 0,
    fin: Math.min(meta.total, meta.pagina * meta.tamano),
    params,
    filtros,
    filas: datos,
  };
  l.urlCon = (cambios = {}) => {
    const q = { ...params, ...cambios };
    if (Object.keys(cambios).some((k) => k !== 'pagina') && !('pagina' in cambios)) q.pagina = 1;
    return (
      ruta + '?' + new URLSearchParams(Object.entries(q).filter(([, v]) => v !== null && v !== undefined && v !== ''))
    );
  };
  return l;
}
export const consultaListado = (req) =>
  new URLSearchParams({
    ...Object.fromEntries(Object.entries(req.query).filter(([, v]) => typeof v === 'string')),
    tamano: req.query.tam || 25,
  });
export async function todos(pedir, req, recurso, query = {}) {
  const filas = [];
  let pagina = 1,
    total = 0;
  do {
    const r = await pedir(req, recurso + '?' + new URLSearchParams({ ...query, pagina, tamano: 100 }));
    filas.push(...r.datos);
    total = r.meta.total;
    pagina++;
    if (!r.datos.length) break;
  } while (filas.length < total);
  return filas;
}
export async function conVersion(pedir, req, ruta) {
  const respuesta = await pedir(req, ruta, { binario: true });
  const { datos } = await respuesta.json();
  return { datos, etag: respuesta.headers.get('etag') };
}
