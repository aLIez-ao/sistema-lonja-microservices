# Instalación y despliegue

Lonja requiere Node.js 20.19+ o 22, npm con workspaces y MariaDB 11. Docker es la opción principal de producción: Docker Engine 25+, Compose v2.24.4+ (el recorrido de prueba usa `!override`), un dominio apuntando al servidor y puertos 80/443 disponibles. CI y las imágenes usan Node 22.

## Desarrollo

```sh
npm ci
cp .env.example .env
cp client/.env.example client/.env
npm run dev
```

Configura `BD_*`, `SC_JWT` y `ADMIN_PASSWORD` en el entorno de la API; `API_URL=http://127.0.0.1:2900/api/v1` y `CLIENTE_URL=http://localhost:3000` en el cliente. `npm start -w @lonja/api` y `npm start -w @lonja/client` arrancan cada proyecto por separado. No copies credenciales de base de datos al cliente.

Los inventarios de variables y los diagnósticos particulares están en [operación de API](../api/docs/04-instalacion-y-operacion.md) y [operación del cliente](../client/docs/04-instalacion-y-operacion.md). Esta guía describe el entorno conjunto.

La alternativa completa usa MariaDB local en 3307, API en 2900, cliente en 3000, Mailpit en 8025 y Adminer en 8080. Solo se publican en localhost:

```sh
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml up
```

La cuenta inicial se toma de `ADMIN_USER` y `ADMIN_PASSWORD` del `.env` raíz. La API lee ese archivo montado usando dotenv; Compose ya no fija otra cuenta dentro del YAML. Exclusivamente en desarrollo, `.env.example` completa variables ausentes cuando no hay configuración propia. Esto conserva caracteres como `$` en las contraseñas sin interpolarlos mediante Compose. `--env-file deploy/compose.env.example` configura la interpolación de Compose y no sustituye el `.env` que lee la API.

Las credenciales iniciales solo crean la cuenta si no existe. Cambiar `.env` no restablece la contraseña de una cuenta existente ni elimina usuarios. Después de modificar ese archivo ejecuta `docker compose --env-file deploy/compose.env.example -f compose.dev.yaml up -d --force-recreate api client` para que los procesos reciban los valores nuevos. No borres el volumen de MariaDB para cambiar credenciales.

El código está montado con nodemon; los correos se capturan en Mailpit. Los datos usan volúmenes distintos de producción. Las variables de red del contenedor (`BD_HOST`, puerto y URL interna de API) siguen definidas en Compose para conectar con los servicios correctos. `npm run demo` genera datos locales; la limpieza explícita de demo se bloquea en producción.

## Configuración de producción

Guarda los secretos en `/etc/lonja/secrets/`, con el directorio accesible solo al administrador (0700). Cada archivo montado debe poder leerlo el usuario del contenedor; puede usar 0444 dentro de ese directorio privado. Crea claves aleatorias distintas para `bd_clave`, `bd_root`, `sc_jwt` y `admin_password`; `gmail_pass` contiene la contraseña de aplicación del correo o queda vacío si no se configura Gmail. No uses las credenciales de Compose de desarrollo.

La configuración pública `/etc/lonja/compose.env` parte de `deploy/compose.env.example` y añade rutas absolutas:

```dotenv
DOMINIO=lonja.ejemplo.mx
REGISTRO=ghcr.io/dueno
VERSION=sha-COMMIT_COMPLETO
ADMIN_USER=admin
GMAIL_USER=
SECRETO_BD_CLAVE=/etc/lonja/secrets/bd_clave
SECRETO_BD_ROOT=/etc/lonja/secrets/bd_root
SECRETO_SC_JWT=/etc/lonja/secrets/sc_jwt
SECRETO_ADMIN_PASSWORD=/etc/lonja/secrets/admin_password
SECRETO_GMAIL_PASS=/etc/lonja/secrets/gmail_pass
```

Sustituye `COMMIT_COMPLETO` por los 40 caracteres de una entrega publicada. Si GHCR es privado, autentica Docker en el servidor con un token de solo lectura de paquetes. No incluyas ese token en el repositorio.

La API admite `BD_CLAVE_FILE`, `SC_JWT_FILE`, `ADMIN_PASSWORD_FILE`, `GMAIL_PASS_FILE` y `RESTORE_CLAVE_FILE`; el archivo tiene precedencia. El cliente recibe su URL, el origen público, LOG_NIVEL y SESSION_REDIS_URL. Redis no publica puertos: usa una red interna exclusiva y un volumen persistente AOF.

Para el alta inicial, copia `compose.yaml` y `deploy/` a `/opt/lonja/releases/COMMIT_COMPLETO/` y ejecuta allí:

```sh
bash deploy/desplegar.sh COMMIT_COMPLETO /etc/lonja/compose.env /opt/lonja
```

El script usa `docker compose --project-name lonja`, descarga la etiqueta exacta, aplica migraciones, espera los healthchecks y verifica HTTPS y la tienda. Guarda la versión y el enlace `/opt/lonja/actual`. El primer arranque no tiene una versión previa que respaldar; las siguientes entregas exigen respaldo antes de actualizar.

Solo Caddy publica 80/443 y gestiona el certificado. MariaDB está en una red interna; API y cliente no publican puertos. Los volúmenes `bd`, `uploads`, `respaldos` y los de Caddy sobreviven a recreaciones. No uses `down --volumes` en producción.

Despliega una sola API: cola y límites se coordinan en memoria. El cliente comparte las sesiones en Redis y coordina su renovación con bloqueo y confirmación atómica. Se puede reiniciar o replicar conservando el mismo Redis. Mantén persistente y protegido el volumen sessions, que contiene tokens del servidor.

## Entrega desde GitHub Actions

`CI` ejecuta lint, formato y pruebas en Node 20/22, exige al menos 80 % de líneas por workspace, audita dependencias de producción y ejecuta la integración REST sobre MariaDB.

`Entrega` acepta CI correcto de un push a main del mismo repositorio o un tag semántico que pertenezca a main y tenga CI correcto. Al autorizar una entrega desde CI comprueba que el commit siga siendo la punta de main. La ejecución de main construye las imágenes, prueba el recorrido HTTPS, escanea HIGH/CRITICAL con Trivy, adjunta SBOM CycloneDX y publica `sha-<commit>` y `main`. Un tag no reconstruye: añade `vX.Y.Z` al digest ya publicado como `sha-<commit>` y falla si ese commit no se entregó antes desde main. Así la reversión por SHA descarga siempre la imagen probada, y la etiqueta de imagen `main` no se mueve.

El trabajo SSH se ejecuta únicamente desde `workflow_run`, nunca desde un evento de tag. Etiquetar un commit después de desplegarlo no vuelve a desplegarlo. Las ejecuciones de tags tienen grupos de concurrencia distintos para que no cancelen una entrega de main pendiente. El script del servidor conserva además su comprobación del SHA activo para que un reintento del mismo despliegue sea idempotente.

Para activar SSH configura las variables de repositorio `DEPLOY_HOST`, `DEPLOY_USER` y opcionalmente `DEPLOY_PATH` (por defecto `/opt/lonja`), y los secretos `DEPLOY_SSH_KEY` y `DEPLOY_KNOWN_HOSTS`. El trabajo utiliza el environment `produccion`; sus aprobaciones se configuran en GitHub. Sin `DEPLOY_HOST`, las imágenes se publican y el trabajo SSH se omite. El usuario debe tener acceso al directorio de entregas, Docker y la configuración privada. La llave solo debe autorizar ese usuario de despliegue.

El script realiza respaldo obligatorio, descarga por SHA, espera el arranque y comprueba el servicio. Si falla, vuelve a la imagen y configuración anteriores. Si una migración impide ejecutar la versión anterior, conserva el respaldo y sigue la restauración manual siguiente; no se destruyen datos automáticamente. El resumen del flujo informa el resultado.

Para rotar la llave: instala la nueva clave pública en el servidor, actualiza el secreto de GitHub, verifica una entrega y retira la clave anterior. Mantén `known_hosts` validado por un canal de confianza; no desactives la comprobación de identidad del servidor.

## Respaldos y ensayo semanal

El servicio `respaldo` usa la imagen API y ejecuta un respaldo al arrancar y cada 24 horas. Conserva siete conjuntos recientes y cuatro semanales adicionales en el volumen separado. Cada conjunto incluye `database.sql`, `uploads/` y un manifiesto; copia además los respaldos fuera del servidor.

```sh
docker compose --project-name lonja --env-file /etc/lonja/compose.env -f /opt/lonja/actual/compose.yaml exec -T api npm run backup
```

Instala `deploy/lonja-restauracion.service` y `.timer` en `/etc/systemd/system/`, adapta rutas si cambiaste `/opt/lonja`, y activa `systemctl enable --now lonja-restauracion.timer`. El domingo se detienen temporalmente las escrituras, se levanta `mariadb-ensayo` con almacenamiento efímero y se ejecuta `backup:probar`. Se comparan todas las filas y hashes de archivos; al terminar se retira únicamente la instancia de ensayo y se reinician los escritores, incluso ante error. Consulta `journalctl -u lonja-restauracion.service`.

El ensayo también se puede lanzar con `bash /opt/lonja/actual/deploy/ensayar-restauracion.sh`. No compara contra una base de producción mientras otros procesos escriben.

## Recuperación manual y vuelta a una versión anterior

Detén cliente, respaldo y API. Conserva una copia de los datos actuales antes de restaurar. Escoge un conjunto de respaldo completo y la versión de aplicación compatible con su esquema. Verifica el manifiesto y ensaya primero contra una instancia efímera.

Importa `database.sql` en la base vacía de recuperación con el cliente `mariadb`, leyendo la clave desde el archivo privado mediante `MYSQL_PWD` y entrada estándar (nunca como argumento). Restaura la carpeta `uploads/` del mismo conjunto en el volumen de archivos, respetando propietario y permisos. No mezcles el esquema de una fecha con archivos de otra. Este paso reemplaza datos: comprueba los nombres de proyecto, base y volumen antes de operarlo.

Para volver solo a una imagen compatible, ejecuta `deploy/desplegar.sh` con su SHA completo. El script respalda primero, descarga la etiqueta elegida y verifica el servicio. Si también recuperaste el esquema anterior, confirma qué migraciones aplicará esa imagen antes de arrancarla. Finaliza revisando `/api/v1/salud`, tienda, acceso, pedido y factura.

## Alternativa sin Docker

`deploy/lonja-api.service` y `deploy/lonja-cliente.service` usan usuarios y archivos de entorno separados. Solo la API escribe `UPLOADS_DIR` y conoce MariaDB. `deploy/nginx.conf` ilustra el enrutamiento tras un terminador TLS; Caddy es el proxy principal de Compose. Todas las pantallas ya usan el cliente. La unidad histórica se retiró; el monolito solo se conserva en el [repositorio original](https://github.com/aLIez-ao/sistema-lonja).
