# Seguridad de la API

## Identidad y autorización

El acceso privado usa JWT HS256 de 15 minutos con emisor, audiencia, usuario, sesión y versión. El refresh es opaco, dura ocho horas y solo se persiste su hash. Cada renovación consume el valor anterior; reutilizarlo revoca la sesión completa. Cerrar sesión, cambiar contraseña, desactivar o eliminar la cuenta invalida el acceso. Los permisos consultan el rol vigente en la base.

El registro público crea compradores. Administración gestiona usuarios; el personal autorizado gestiona inventario y ventas. Las comprobaciones de propiedad se aplican en servicios y los recursos de otra cuenta responden 404. Ocultar un botón en el cliente no concede ni revoca permisos. Consulta [operaciones y respuestas](03-rutas-y-permisos.md) y [OpenAPI](../../contracts/openapi.yaml).

Las contraseñas se almacenan con bcrypt. Verificación de correo y recuperación usan enlaces de un solo uso cuyo token se guarda como hash. Registro y recuperación evitan revelar si existe una cuenta. Cambiar el correo invalida los enlaces de recuperación anteriores. Los diagnósticos de correo requieren administración.

## Integridad de operaciones

Las transacciones y el índice de venta única por lote protegen el inventario. Los precios, kilos, envío y total se calculan en el servidor. Los pagos actuales son simulados.

Crear pedido, pagar y cobrar exige `Idempotency-Key`. Un reintento conserva la misma clave y el mismo cuerpo; una clave reutilizada con datos distintos produce 409. La persistencia conserva el resultado y un hash de la entrada; no almacena PAN ni CVV. No crees una clave nueva al reintentar una petición cuya respuesta se perdió.

Las modificaciones protegidas de lotes y compras requieren `If-Match` con el ETag obtenido en la lectura: 428 si falta y 412 si otra operación cambió el recurso. Después de un conflicto, vuelve a leer y presenta los datos vigentes antes de repetir la edición.

## Superficie HTTP y archivos

La API no autentica cookies. CORS permite únicamente los orígenes configurados y no sustituye la autorización Bearer. Helmet aplica cabeceras. Los cuerpos tienen límites; las imágenes se validan por tamaño y firma antes de almacenarlas. Solo la API escribe el directorio de archivos; el cliente los transmite por HTTP.

Los errores usan `application/problem+json`, identificador de correlación y mensajes sin trazas privadas. No envíes claves, tokens ni datos de tarjetas en URL, documentación o logs. Mantén los secretos fuera de Git y de las imágenes; utiliza archivos privados y las variables `_FILE` en producción.

## Límites operativos

La cola persistente no convierte el coordinador en un sistema distribuido. Usa una sola API mientras los límites y la coordinación sean locales al proceso. No existe una bitácora administrativa completa. Los respaldos deben salir del servidor y un rollback de imagen puede requerir restaurar un esquema compatible.

La limpieza del historial no revoca credenciales. El estado de la exposición histórica se documenta en [seguridad compartida](../../docs/05-seguridad.md). Las garantías de sesión del navegador pertenecen al [cliente](../../client/docs/05-seguridad.md).

Los avatares nuevos se decodifican y recodifican en WebP, con límite de píxeles, tamaño máximo de 256 y eliminación de metadatos. Las fotos ya existentes requieren una migración separada. Los límites utilizan la IP reenviada solo cuando la conexión proviene de un proxy de confianza; el límite adicional por cuenta se conserva deliberadamente.
