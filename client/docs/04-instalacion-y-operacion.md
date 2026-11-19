# Instalación y operación del cliente

## Desarrollo

Requiere Node.js 22 o superior y la API disponible. Desde la raíz ejecuta `npm ci`, crea `client/.env` a partir de `client/.env.example` si no existe y arranca:

```sh
npm run dev -w @lonja/client
```

`npm start -w @lonja/client` ejecuta sin nodemon. El cliente lee su propio `.env`; no carga el archivo raíz de la API. Las variables ya presentes en el proceso prevalecen. Para levantar el entorno completo con MariaDB y correo de ensayo usa [Compose de desarrollo](../../docs/04-instalacion-y-despliegue.md).

## Configuración

| Variable            | Uso                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `API_URL`           | Base REST accesible desde el servidor cliente; por defecto `http://127.0.0.1:2900/api/v1`.             |
| `CLIENTE_URL`       | Origen público, por ejemplo `http://localhost:3000`; debe coincidir con los formularios del navegador. |
| `CLIENTE_PORT`      | Puerto de escucha; 3000 por defecto.                                                                   |
| `SESSION_REDIS_URL` | Conexión al Redis de sesiones; obligatoria en producción.                                              |
| `LOG_NIVEL`         | `error`, `warn` o `info`.                                                                              |
| `APP_TZ`            | Zona usada al presentar fechas.                                                                        |
| `TRUST_PROXY`       | Confianza explícita en el proxy que termina HTTPS; configúrala según la red real.                      |
| `NODE_ENV`          | `production` activa las exigencias de producción, incluida la cookie Secure.                           |

No necesita `BD_*`, `SC_JWT` ni credenciales de correo. En Compose, `API_URL` usa el nombre interno del servicio API y `CLIENTE_URL` la URL pública HTTPS. `localhost` dentro de un contenedor designa ese contenedor, no el servicio vecino.

## Sesiones, salud y registros

En desarrollo sin Redis las sesiones viven en memoria y se pierden al reiniciar. En producción el arranque falla si falta `SESSION_REDIS_URL`. Configura Redis persistente, protegido y sin puerto público: guarda tokens de acceso y renovación. Las réplicas del cliente deben compartir el mismo almacén.

`GET /salud` comprueba el almacén y consulta `/api/v1/salud`. Un fallo devuelve 503; un proceso que escucha no garantiza que sus dependencias funcionen. Los registros usan `helpers/registro.js` con nivel configurable. Las peticiones reciben un identificador propagado a la API.

Si una escritura devuelve 403 por origen, revisa `CLIENTE_URL` y la configuración del proxy. En desarrollo, las páginas abiertas mediante `127.0.0.1`, `localhost` o `::1` se redirigen al host local configurado cuando coinciden protocolo y puerto. Así el formulario y su origen coinciden; las escrituras siguen exigiendo el origen exacto. Abre de nuevo `/acceso` si conservas una pestaña anterior al cambio. `/salud` no redirige y producción no aplica esta adaptación local.

Si aparecen 503, comprueba la conectividad con API y Redis antes de repetir operaciones de pago. No registres cookies, tokens ni cuerpos con contraseñas.

## Producción

La imagen usa `client/Dockerfile`, se construye desde el contexto raíz y ejecuta con usuario sin privilegios. Solo el proxy publica el servicio. Los recursos subidos y documentos se obtienen de la API por HTTP; el cliente no requiere un volumen de uploads.

SIGTERM detiene el servidor y cierra el almacén de sesiones. Docker, TLS, systemd, healthchecks y recuperación están en [la operación conjunta](../../docs/04-instalacion-y-despliegue.md). La restricción de una sola API se mantiene aunque se replique el cliente.

Para iniciar con solo Docker, cambiar puertos, cargar datos desde API o ejecutar las comprobaciones del cliente, sigue el [catálogo de comandos](../../docs/07-comandos.md). `DEV_CLIENT_PORT` cambia el puerto publicado y el origen de ambas aplicaciones; `API_URL` dentro de Docker continúa usando `http://api:2900/api/v1`. Los recursos estáticos y plantillas se editan en el equipo mediante el montaje del código.
