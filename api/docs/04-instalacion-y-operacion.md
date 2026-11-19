# Instalación y operación de la API

## Arranque local

Instala Node.js 22 o superior y MariaDB 11. Desde la raíz ejecuta `npm ci`. Copia `.env.example` a `.env` únicamente si todavía no existe y configura una base y un usuario propios. La API carga el `.env` de la raíz; no busca `api/.env`.

```sh
npm run migrar
npm run dev -w @lonja/api
```

`npm start -w @lonja/api` ejecuta sin nodemon. El arranque comprueba secretos, autentica la conexión, sincroniza tablas faltantes, aplica migraciones pendientes, crea el administrador inicial si falta e inicia los trabajos de correo y limpieza de reservas. Un error de conexión o configuración impide escuchar peticiones.

## Variables

| Variable                                      | Uso                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| `API_PORT`                                    | Puerto HTTP; 2900 por defecto.                                                  |
| `BD_NOMBRE`, `BD_USUARIO`, `BD_CLAVE`         | Base y credenciales de MariaDB.                                                 |
| `BD_HOST`, `BD_PORT`, `BD_DIALEC`             | Servidor, puerto y dialecto; usa MariaDB en producción.                         |
| `BD_TIMEZONE`, `APP_TZ`                       | Zona de persistencia y presentación de fechas.                                  |
| `BD_SYNC`                                     | `safe` crea tablas faltantes; `alter` y `force` están prohibidos en producción. |
| `SC_JWT`                                      | Secreto de firma; usa al menos 32 caracteres aleatorios.                        |
| `ADMIN_USER`, `ADMIN_PASSWORD`                | Alta inicial; no cambia la contraseña de una cuenta existente.                  |
| `CLIENTE_URL`                                 | URL pública del cliente para enlaces de correos.                                |
| `CORS_ORIGENES`                               | Orígenes permitidos separados por coma; vacío por defecto.                      |
| `LOG_NIVEL`                                   | `error`, `warn` o `info`.                                                       |
| `UPLOADS_DIR`, `BACKUP_DIR`                   | Almacenamiento de archivos y respaldos; directorios persistentes en producción. |
| `SMTP_HOST`, `SMTP_PORT`                      | Transporte SMTP de desarrollo, por ejemplo Mailpit.                             |
| `GMAIL_USER`, `GMAIL_PASS`                    | Cuenta y contraseña de aplicación para Gmail.                                   |
| `ENVIO_COSTO`, `ENVIO_GRATIS_DESDE`           | Reglas del envío calculado por la API.                                          |
| `RESERVA_MINUTOS`, `RESERVA_EFECTIVO_MINUTOS` | Vencimientos de las reservas de pedidos.                                        |

Las variables del proceso prevalecen sobre `.env`. En `NODE_ENV=development`, `.env.example` completa valores ausentes después de leer `.env`; producción no aplica ese respaldo. Compose de desarrollo fija la red y los puertos internos, pero deja las credenciales administrativas al cargador de la API. `BD_CLAVE_FILE`, `SC_JWT_FILE`, `ADMIN_PASSWORD_FILE`, `GMAIL_PASS_FILE` y `RESTORE_CLAVE_FILE` leen archivos privados y prevalecen sobre el valor directo. Las claves de ejemplo no son credenciales de producción.

## Salud, correo y registros

`GET /api/v1/salud` comprueba la base e incluye el estado observado del correo (`ok`, `degradado`, `simulado` o `sin-comprobar`), sin contactar al SMTP por petición. Con base disponible y correo degradado devuelve 200 para mantener la tienda accesible; el monitor externo debe inspeccionar también `correo`. La documentación interactiva `/api/docs` solo está habilitada fuera de producción. Los registros usan nivel configurable y los errores HTTP incluyen `X-Request-Id` para correlación. No publiques cuerpos de acceso ni tokens en los registros.

El diagnóstico detallado de correo es exclusivo de administración. En desarrollo, sin transporte se usa el simulador; producción rechaza la configuración ausente o inválida y los errores permanentes de autenticación o TLS. Una caída temporal de red o una respuesta SMTP 4xx permite iniciar con correo degradado. Se comprueba su recuperación cada minuto; un envío correcto también restablece su estado. Los trabajos se persisten y se reintentan a los 1, 5 y 15 minutos, sin bloquear el arranque mientras se procesan. Tras agotar los reintentos quedan fallidos y requieren atención: no se promete entrega indefinida. Despliega una sola instancia de API: el coordinador de trabajos y los límites de peticiones mantienen estado en memoria.

Las nuevas imágenes del catálogo se recodifican a WebP sin EXIF/XMP, con orientación aplicada y un máximo de 1600×1600, conservando proporciones. Los avatares usan 256×256. Las imágenes almacenadas anteriormente requieren un tratamiento separado; no se sobrescriben durante el arranque.

El SMTP genérico admite `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `SMTP_USER`, `SMTP_PASS_FILE` y `SMTP_FROM`. Configura TLS y credenciales reales de tu proveedor; Mailpit se limita al desarrollo y al ensayo aislado. Gmail sigue siendo compatible. Elegir proveedor y completar DNS/entregabilidad permanece en el seguimiento local de `docs/.reports/TODO.md`.

El arranque de producción comprueba que las migraciones estén aplicadas y no ejecuta `db.sync()`. `npm run migrar` sigue siendo el paso explícito de creación/actualización antes del servidor; su bootstrap inicial todavía depende de modelos y requiere DDL versionado antes de retirar totalmente esa dependencia.

## Esquema y recuperación

`npm run migrar` aplica cambios; `npm run migrar:revertir -- --confirmar` revierte la última migración. Revisa primero las restricciones de cada migración: algunas rechazan perder trabajos, idempotencia o sesiones. `BD_SYNC=safe` no sustituye las migraciones de columnas existentes.

`npm run backup` genera un conjunto de base, archivos y manifiesto. `npm run backup:probar` crea una copia de ensayo y compara filas y archivos; configura `RESTORE_HOST`, `RESTORE_PORT`, `RESTORE_USUARIO` y `RESTORE_CLAVE_FILE` para usar una instancia efímera separada. El procedimiento operativo, Docker, systemd, retención y recuperación están en [la guía compartida](../../docs/04-instalacion-y-despliegue.md). Conserva una copia fuera del servidor y detén escrituras durante la comprobación de restauración.

Continúa con [seguridad](05-seguridad.md), [pruebas](06-pruebas.md) y [el esquema](02-base-de-datos.md).
