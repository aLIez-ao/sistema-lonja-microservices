# Seguridad

La API autentica mediante Bearer: JWT HS256 de 15 minutos con emisor, audiencia, usuario, sesión y versión. El refresh de ocho horas es opaco, solo se guarda su hash y rota de forma atómica. Cerrar sesión, cambiar contraseña, desactivar o borrar la cuenta revoca el acceso. Reutilizar un refresh ya rotado revoca la sesión completa; se conservan solo los hashes necesarios hasta su expiración. Cada petición consulta el rol actual en la base.

El cliente entrega únicamente `lonja_sid` httpOnly, SameSite=Strict y Secure en producción. Access y refresh permanecen en el servidor. Las escrituras comprueban Origin contra `CLIENTE_URL`. La API no usa cookies para autenticar; CORS utiliza una lista explícita, vacía por defecto.

Helmet aplica cabeceras y el cliente usa CSP con scripts y estilos propios. EJS escapa los datos. Los errores internos se registran con correlación y se presentan sin detalles privados como RFC 9457. Los cuerpos y las imágenes tienen límites; las imágenes se verifican por firma y los archivos no válidos se rechazan.

Las nuevas imágenes se recodifican a WebP sin EXIF/XMP: avatares hasta 256×256 y catálogo hasta 1600×1600 conservando proporciones. Las imágenes anteriores requieren tratamiento separado. Una caída temporal de SMTP se informa como correo degradado sin bloquear la tienda; los errores de configuración, autenticación o TLS impiden el arranque. Supervisa el campo `correo` de `/api/v1/salud` además del estado HTTP.

Las contraseñas usan bcrypt. Registro y recuperación responden sin revelar si existe una cuenta. Los enlaces de verificación y recuperación se guardan como hash y son de un solo uso. Cambiar el correo invalida enlaces de recuperación previos. Los recursos de cuentas ajenas responden 404. Solo administración gestiona usuarios; una cuenta no puede desactivarse o degradarse a sí misma.

Las transacciones y la unicidad de venta por lote evitan cobros duplicados. `Idempotency-Key` conserva el resultado de pedidos, pagos y cobros, incluso ante reintentos concurrentes; el hash del cuerpo detecta cambios y no almacena PAN ni CVV. ETag/If-Match protege las ediciones. Los importes se calculan en el servidor. PDF, CSV y archivos se transmiten en flujo.

Docker ejecuta API y cliente sin root, mantiene secretos fuera de imágenes y publica solamente el proxy. La base, archivos y respaldos usan volúmenes separados. La entrega exige CI, recorrido HTTPS y escaneo de imágenes antes de publicar.

## Responsabilidades y secretos

La API recibe los secretos de MariaDB, firma y correo; el cliente recibe únicamente su configuración y la conexión privada a Redis. No compartas un archivo de entorno con todas las credenciales entre ambos servicios. Los tokens almacenados en Redis también son secretos y requieren almacenamiento y respaldos protegidos.

Consulta [seguridad de API](../api/docs/05-seguridad.md) para autorización, idempotencia y archivos; [seguridad del cliente](../client/docs/05-seguridad.md) para cookies, origen y CSP; y [operación](04-instalacion-y-despliegue.md) para archivos `_FILE`, TLS y recuperación.

## Credenciales históricas

El historial heredado del proyecto original contuvo una credencial de base de datos. Se retiró del historial de este repositorio y la gestión del incidente se registra fuera de Git. Ninguna credencial debe versionarse: los valores reales se leen de `.env` local o de archivos `*_FILE` en producción.

## Límites conocidos

- Las sesiones del cliente persisten en Redis y la renovación se coordina entre procesos. Los límites de la API y la cola mantienen una sola instancia de API.
- Los límites en memoria se reinician con el proceso. No hay bitácora completa de auditoría administrativa.
- La pasarela y SPEI son simulados; las referencias del ejemplo no representan cobros reales.
- El escaneo de imágenes se ejecuta en CI; una vulnerabilidad alta bloqueará la publicación hasta resolverla. La auditoría local de dependencias de producción conserva los avisos moderados heredados de Sequelize/uuid.
- Los respaldos locales deben copiarse fuera del servidor. El rollback de imagen puede requerir restauración manual si una migración no es compatible hacia atrás.
