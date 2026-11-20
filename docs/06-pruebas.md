# Pruebas

```sh
npm test
npm run test:cov
npm run lint
npm run format:check
npm run docs:check
```

Cada workspace ejecuta su suite con `node:test`. El ayudante `api/test/ayuda.js` usa SQLite en memoria por defecto y directorios temporales para archivos. Las credenciales de correo se sustituyen en pruebas; los envíos se capturan o se simulan.

Con solo Docker, construye `tools` y usa los comandos del [catálogo operativo](07-comandos.md). Ese contenedor incluye el módulo SQLite nativo que no se instala en los servicios de desarrollo. La API no carga el `.env` local bajo `node:test` ni con `NODE_ENV=test`; las pruebas reciben sus valores de ensayo explícitos. Redis se omite sin `SESSION_REDIS_TEST_URL` y el bloqueo de filas MariaDB se omite en SQLite; CI ejecuta esas integraciones con sus servicios reales.

`npm run format` aplica Prettier a JavaScript, JSON, YAML/YML, CSS y Markdown, y el motor oficial de HTML Language Features a HTML/HTM/EJS; `npm run format:check` valida sin escribir. Las exclusiones compartidas están en `tools/formato.js`; `.prettierignore` es solo una ampliación local opcional. La regresión `client/test/formato.test.js` comprueba que el formato conserve las etiquetas EJS, el HTML renderizado, los atributos dinámicos y el contenido preformateado, y que una segunda pasada sea estable. `views:check` revisa las vistas y `docs:check` el contrato y los enlaces; no sustituyen una revisión visual. SVG, DBML y shell quedan fuera del formateador.

## Alcance

`api/test/api-*.test.js` verifica respuestas reales por HTTP, Bearer, rotación y revocación, permisos y propiedad, catálogo, imágenes, perfiles, direcciones, carrito, listas, moderación, pedidos, idempotencia, cobros, facturas y reportes. `api/test/contrato.js` valida códigos, tipo de contenido y esquemas de respuesta contra OpenAPI usando Ajv.

Las pruebas HTML del monolito se conservan en el [repositorio original](https://github.com/aLIez-ao/sistema-lonja) y se retiraron de la suite activa. Se mantienen las pruebas unitarias útiles y las suites REST, cliente, contrato y migraciones. La cobertura activa ya no ejecuta legacy/app.js. La reversión de las migraciones 006 a 003 se comprueba antes de la histórica 002.

`test/system/client-api.test.js` arranca API y cliente reales: renderizado y CSP, sesión sin tokens en el navegador, CSRF, renovación concurrente, registro y verificación, cuenta y direcciones, carrito, pedido, pago, factura, mostrador y pantallas del personal.

`client/test/transporte.test.js` usa un servidor HTTP controlado con respuestas validadas contra los esquemas del contrato. Verifica la renovación única, correlación, ausencia de cookies hacia la API, mensajes del formulario, timeout y errores HTML del proxy.

La cobertura mide código del servidor de cada aplicación, incluyendo archivos no ejecutados y excluyendo pruebas, recursos estáticos y almacenamiento. `tools/cobertura.js` usa c8 compatible con Node 22/24, exige 80 % de líneas por aplicación y guarda informes en el directorio temporal del sistema.

## MariaDB y contenedores

CI ejecuta únicamente las suites de API y negocio relevantes sobre MariaDB real, en serie para no recrear simultáneamente el mismo esquema. Incluye competencia de dos compradores por el mismo lote y doble cobro. La prueba de bloqueo de filas se omite expresamente en SQLite.

`tools/prueba-despliegue.js` comprueba sobre las imágenes finales y HTTPS: registro → correo Mailpit → verificación → acceso con cookie → carrito → pedido → pago simulado → factura PDF. Solo admite localhost. `compose.test.yaml` usa puertos de localhost y una base temporal independiente.

El ensayo `backup:probar` importa un respaldo en una instancia efímera, compara conteos de todas las tablas y hashes de archivos y elimina solo su esquema de ensayo. Debe ejecutarse con las escrituras detenidas; véase [operación](04-instalacion-y-despliegue.md).

## Límites

Las comprobaciones HTTP no equivalen a una revisión visual manual de cada pantalla, tema o tamaño. Los pagos son simulados y no prueban cargos bancarios. La expiración se verifica mediante fechas controladas. Publicación de imágenes, Trivy y SSH se ejecutan en GitHub cuando se suba la entrega y se configure el servidor; las pruebas locales no acreditan un despliegue remoto.

## Regresiones recuperadas

Las suites REST recuperan correos y su contenido, avisos masivos y reintentos, filtros y paginación de las colecciones. Las pruebas del cliente recuperan la navegación de listados y el consentimiento de cookies. El detalle vigente está en [pruebas de API](../api/docs/06-pruebas.md) y [pruebas del cliente](../client/docs/06-pruebas.md). Los informes de la migración se conservan como archivo local y no sustituyen esas guías.

## Documentación

`npm run docs:api` deriva las operaciones, parámetros y cuerpos de OpenAPI. `npm run docs:check` comprueba enlaces locales de los README y capítulos públicos y verifica que la referencia generada coincida con el contrato. No necesita MariaDB ni Redis. Los cambios puramente documentales se verifican con esas comprobaciones y formato; no acreditan una nueva ejecución de los recorridos de negocio.
