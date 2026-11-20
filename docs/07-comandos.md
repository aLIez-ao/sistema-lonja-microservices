# Catálogo de comandos

Ejecuta desde la raíz del repositorio, donde están `package.json` y `compose.dev.yaml`. Los bloques Docker funcionan en PowerShell y Bash sin instalar Node ni npm en el equipo. Se requiere Compose v2.24.4 o superior. La primera descarga necesita internet; los cambios de dependencias también.

## Levantar, comprobar y detener desarrollo

```sh
docker compose version
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml config --quiet
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml up -d --wait --wait-timeout 300
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml ps
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml exec -T client node -e "fetch('http://localhost:3000/salud').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
```

Tienda: <http://localhost:3000>; Swagger: <http://localhost:2900/api/docs>; Mailpit: <http://localhost:8025>; Adminer: <http://localhost:8080>. MariaDB se publica en `127.0.0.1:3307`; desde Adminer el servidor es `mariadb`, la base `lonja_dev`, usuario `lonja` y contraseña `desarrollo_local`. Estos valores son exclusivos de desarrollo.

El inicio crea esquema, migraciones y cuenta administrativa si faltan. API y cliente instalan dependencias en volúmenes Linux separados del `node_modules` del equipo. Espera a que ambos estén sanos antes de cargar datos. Si una instalación lenta supera 300 segundos, inspecciona los registros y repite el comando de inicio con un tiempo mayor.

```sh
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml logs --tail 100 api client mariadb
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml logs -f api client
```

`Ctrl+C` termina el seguimiento de registros. Para detener o volver a iniciar conservando datos:

```sh
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml down
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml up -d --wait --wait-timeout 300
```

No añadas `--volumes` para una parada normal: eliminaría los datos. Los servicios de desarrollo pertenecen al proyecto `lonja-dev`; producción usa `lonja` y sus propios volúmenes.

## Llenar la base con demostración

```sh
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml exec -T api npm run demo
```

Crea catálogo, compradores, lotes, compras, pedidos, preguntas y opiniones. Reutiliza registros identificados de demostración; no es un borrado general de la base. Las cuentas públicas de prueba son `demo_capturista` y `demo_comprador1` a `demo_comprador6`, contraseña `LonjaDemo2026`; la sexta está sin verificar. El administrador sigue siendo el definido en el `.env` raíz o, si falta, en `.env.example`. La carga no cambia contraseñas de cuentas existentes.

Para reemplazar solo los datos que el generador marcó como demo, con confirmación explícita y únicamente en desarrollo:

```sh
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml exec -T api npm run demo -- --limpio --confirmar
```

La carga completa y la limpieza se rechazan en producción. Si la base contiene ventas reales no ejecutes tareas de demostración ni elimines volúmenes. Para desarrollo con Node fuera de Docker, los equivalentes son `npm run demo` y `npm run demo -- --limpio --confirmar`, después de configurar la conexión local.

## Cuenta inicial y cambios de configuración

El `.env` raíz configura la API; `client/.env` configura el cliente. No los copies encima de archivos existentes. Cambiar `ADMIN_PASSWORD` solo afecta al alta de una cuenta inexistente: no restablece una cuenta ya creada.

`--env-file deploy/compose.env.example` sirve para interpolar Compose. No sustituye al `.env` leído por la API. Dentro de Docker, Compose establece la conexión a MariaDB y la URL interna de la API. Para aplicar cambios de entorno:

```sh
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml up -d --force-recreate --wait --wait-timeout 300 api client
```

Si un puerto está ocupado, copia `deploy/compose.env.example` fuera del repositorio y añade `DEV_CLIENT_PORT`, `DEV_API_PORT`, `DEV_BD_PORT`, `DEV_MAIL_PORT` o `DEV_ADMINER_PORT`. Usa la ruta de esa copia en todos los comandos `--env-file`. El origen del cliente se adapta a `DEV_CLIENT_PORT`; los puertos internos permanecen iguales.

## Formato, documentación y pruebas con Docker

El servicio `tools` es opcional y no arranca con la aplicación. Construye sus dependencias de desarrollo, incluido SQLite nativo para pruebas. Monta el código del equipo; `format` y `docs:api` escriben sobre ese código. Las pruebas usan SQLite temporal, no `lonja_dev`.

```sh
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml build tools
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml run --rm tools run lint
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml run --rm tools run format:check
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml run --rm tools run format
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml run --rm tools run docs:api
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml run --rm tools run docs:check
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml run --rm tools run views:check
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml run --rm tools test
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml run --rm tools run test:system
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml run --rm tools run test:cov
```

Tras cambiar `package-lock.json`, actualiza el volumen de herramientas con `docker compose --env-file deploy/compose.env.example -f compose.dev.yaml run --rm tools ci`. Las aplicaciones ejecutan `npm ci` en su próximo arranque. No uses `npm test` dentro del servicio `api` de desarrollo: allí se omiten scripts de instalación y el módulo nativo SQLite de pruebas no está preparado; utiliza `tools`.

Con Node instalado, `npm ci` y los mismos comandos `npm run ...` funcionan en el equipo. `npm test -w @lonja/api` y `npm test -w @lonja/client` limitan la suite a una aplicación. La [guía de pruebas](06-pruebas.md) explica Redis, MariaDB y los casos omitidos sin esos servicios.

`format` y `format:check` usan `tools/formato.js`: Prettier para JavaScript, JSON, YAML/YML, CSS y Markdown; el motor oficial de **HTML Language Features** para HTML, HTM y EJS. En EJS se activa el modo de plantillas y se comprueba que ninguna etiqueta `<% … %>` cambie. El contenido de `pre`, `code`, `textarea` y `script` se conserva. No se aplica el parser HTML de Prettier directamente a EJS.

La configuración de Prettier está en `package.json`; las opciones HTML y las exclusiones públicas están en `tools/formato.js`. `.prettierignore` es opcional y local: se respeta si existe, pero CI y los clones limpios no dependen de él. Los comandos revisan los archivos versionados; para uno nuevo que aún no está preparado en Git puedes pasar su ruta, por ejemplo `npm run format -- client/views/store/nueva.ejs`. También puedes prepararlo con `git add` antes de ejecutar el formato general.

Los archivos conservan sus finales de línea LF o CRLF. Así un checkout de Windows no genera diferencias de formato por sí solo; el contenido de las etiquetas EJS se comprueba normalizando únicamente esos finales de línea.

La referencia REST generada también se formatea antes de escribirse. `format:check` detecta diferencias y no modifica archivos; `format` prepara los resultados y después los escribe. `views:check` verifica el inventario de vistas; DBML, SVG y shell no se formatean con estos comandos.

Para usar el mismo formateador de HTML en VS Code, configura el espacio de trabajo con estas opciones. En este equipo están en `.vscode/settings.json`, conservado solo localmente:

```json
{
  "files.associations": { "*.ejs": "html" },
  "[html]": {
    "editor.defaultFormatter": "vscode.html-language-features",
    "editor.formatOnSave": true,
    "editor.tabSize": 2,
    "editor.insertSpaces": true
  },
  "html.format.templating": true,
  "html.format.wrapLineLength": 120,
  "html.format.contentUnformatted": "pre,code,textarea,script",
  "html.format.maxPreserveNewLines": 2,
  "html.format.endWithNewline": true
}
```

Abre un `.ejs` y utiliza **Formatear documento** (`Shift+Alt+F` en Windows), o guarda para aplicar el formato. La asociación cambia el modo de lenguaje a HTML: una extensión específica de EJS podría ofrecer otro resaltado. El formateador preserva las etiquetas de servidor, pero no sustituye la comprobación de EJS ni las pruebas de renderizado. [Documentación oficial de HTML en VS Code](https://code.visualstudio.com/docs/languages/html).

## Migraciones, correo y operación

En desarrollo, el arranque aplica migraciones. Para repetir explícitamente la aplicación:

```sh
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml exec -T api npm run migrar
```

En el equipo, `npm run migrar:revertir -- --confirmar` revierte la última migración si sus restricciones lo permiten. No es una operación de mantenimiento rutinario: revisa compatibilidad y respaldo antes. `npm run correo:configurar -- --help` describe el asistente local; con Docker de desarrollo el correo ya usa Mailpit y no requiere credenciales externas.

Producción usa `compose.yaml`, secretos por archivo y las imágenes publicadas; no contiene npm. Los comandos son distintos:

```sh
docker compose --project-name lonja --env-file /etc/lonja/compose.env -f /opt/lonja/actual/compose.yaml ps
docker compose --project-name lonja --env-file /etc/lonja/compose.env -f /opt/lonja/actual/compose.yaml logs --tail 100 api client
docker compose --project-name lonja --env-file /etc/lonja/compose.env -f /opt/lonja/actual/compose.yaml exec -T api node scripts/backup.js
```

El despliegue, archivos de secretos, migraciones previas al servidor, restauración y systemd requieren la [guía de instalación y despliegue](04-instalacion-y-despliegue.md). `npm run backup` y `npm run backup:probar` son equivalentes para ejecución local con Node y los binarios MariaDB instalados; no equivalen a un respaldo externo ni deben apuntar al desarrollo por accidente.

## Git local

Con Git y Node instalados, `npm run setup:git` configura exclusiones y opciones locales sin versionar `.gitignore`. Se ejecuta en el equipo: el contenedor de herramientas no necesita acceso al almacén de credenciales Git. No publica cambios ni reescribe el historial.
