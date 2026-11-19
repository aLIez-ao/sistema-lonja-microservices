const locales = new Set(['localhost', '127.0.0.1', '[::1]']);

/** En desarrollo, abre las páginas locales desde el origen configurado para los formularios. */
export function redirigirOrigenLocal({
  url = process.env.CLIENTE_URL,
  habilitado = process.env.NODE_ENV === 'development',
} = {}) {
  const destino = url ? new URL(url) : null;
  return (req, res, next) => {
    if (!habilitado || !destino || !['GET', 'HEAD'].includes(req.method) || req.path === '/salud') return next();
    let actual;
    try {
      actual = new URL(`${req.protocol}://${req.get('host')}`);
    } catch {
      return next();
    }
    if (
      actual.origin !== destino.origin &&
      locales.has(actual.hostname) &&
      locales.has(destino.hostname) &&
      actual.protocol === destino.protocol &&
      actual.port === destino.port
    )
      return res.redirect(302, destino.origin + req.originalUrl);
    next();
  };
}
