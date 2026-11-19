# Seguridad del cliente

## Sesión del navegador

El navegador recibe `lonja_sid`, un identificador opaco en cookie httpOnly y SameSite=Strict, con Secure en producción. Access y refresh permanecen en el servidor. No los guardes en localStorage, HTML, cookies de preferencias o respuestas JavaScript.

Las sesiones tienen un vencimiento de ocho horas. Redis conserva el estado entre reinicios y coordina renovaciones concurrentes. Las confirmaciones condicionales impiden que una renovación tardía restaure una sesión cerrada. La API valida además su propia sesión: una cookie presente no garantiza acceso vigente.

Cerrar sesión utiliza POST. Ante una respuesta 401 definitiva se borra la sesión local. Los enlaces de retorno aceptan únicamente rutas internas, evitando enviar al usuario a un origen arbitrario.

## Formularios y recursos

Las escrituras comprueban que `Origin` coincida con el origen de `CLIENTE_URL`. Una petición sin ese origen válido se rechaza; el middleware no usa Referer como alternativa. Configura el origen público y la confianza del proxy correctamente para HTTPS.

La respuesta usa `Referrer-Policy: same-origin` para conservar el origen de los formularios enviados dentro del sitio y no enviar referencias a otros orígenes. `no-referrer` puede convertir `Origin` en `null` en un POST HTML normal y provocar un 403 incluso con credenciales correctas; véase [el comportamiento documentado por MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy). La protección sigue rechazando orígenes ausentes, nulos y ajenos.

Helmet aplica CSP con scripts y estilos del propio origen, sin manejadores inline, sin objetos incrustados y sin permiso para enmarcar páginas. Bootstrap y Chart.js se sirven localmente. EJS escapa los datos de usuario; mantén el contenido sin escapar limitado a fragmentos controlados del proyecto.

La validación del formulario reutiliza OpenAPI, pero la API conserva la validación definitiva de entradas, permisos, propiedad, importes e inventario. La navegación visible no sustituye autorización. Los archivos se validan y almacenan en la API; el cliente los transmite sin montar su volumen.

## Transporte y operación

`api.js` restringe las peticiones al origen y prefijo configurados, rechaza redirecciones y limita el tiempo de espera. No reenvía las cookies del navegador a la API. Propaga correlación y transforma errores en mensajes controlados; los fallos internos se registran sin mostrar trazas en las páginas.

Las respuestas de sesiones autenticadas usan `Cache-Control: no-store`. Protege Redis y sus respaldos porque contienen tokens del servidor. Separa sus datos de los entornos de ensayo. El cliente no debe recibir secretos de MariaDB, firma JWT o correo.

Consulta [seguridad de API](../../api/docs/05-seguridad.md), [configuración de producción](04-instalacion-y-operacion.md) y [seguridad compartida](../../docs/05-seguridad.md).
