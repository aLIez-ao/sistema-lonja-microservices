# Sistema Lonja · v3.0.0

Dos aplicaciones Node.js que se comunican por HTTP:

- [api/](api/README.md): API REST, reglas de negocio, MariaDB, archivos, correo, facturas y reportes.
- [client/](client/README.md): servidor Express + EJS, pantallas y recursos del navegador. Consume la API sin acceder a la base de datos.
- `contracts/`: especificación OpenAPI 3.1 compartida.

Cada aplicación tiene su propio `package.json`, servidor y Dockerfile. El `package.json` raíz coordina los npm workspaces.

## Iniciar con Docker

Necesitas Docker Engine/Desktop con Compose v2.24.4 o superior, Git para obtener el repositorio y conexión para descargar imágenes y dependencias la primera vez. No necesitas Node, npm ni MariaDB instalados en el equipo. Ejecuta desde la raíz:

```sh
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml up -d --wait --wait-timeout 300
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml exec -T api npm run demo
```

Abre http://localhost:3000. Mailpit: http://localhost:8025; Adminer: http://localhost:8080. La cuenta inicial usa `ADMIN_USER` y `ADMIN_PASSWORD` del `.env` raíz; sin ese archivo usa `.env.example`. Las credenciales de los servicios de desarrollo figuran en Compose y no se usan en producción. Consulta [la configuración de desarrollo](docs/04-instalacion-y-despliegue.md) para aplicar cambios a contenedores existentes.

La carga demo crea `demo_capturista` y `demo_comprador1` a `demo_comprador6`, con contraseña pública de demostración `LonjaDemo2026`. El sexto comprador no está verificado. Son cuentas de desarrollo y no sustituyen al administrador configurado.

Para ver registros y detener conservando los datos:

```sh
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml logs --tail 100 api client
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml down
```

El [catálogo de comandos](docs/07-comandos.md) incluye carga y regeneración de datos, migraciones, formato, pruebas, respaldos y diagnóstico. El modo local con Node y la producción con HTTPS están en [instalación y despliegue](docs/04-instalacion-y-despliegue.md).

## Calidad

Con solo Docker, construye una vez el servicio de herramientas y ejecuta los mismos scripts:

```sh
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml build tools
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml run --rm tools run format:check
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml run --rm tools test
```

Con Node 22/24 instalado, ejecuta `npm ci` y después:

```sh
npm run lint
npm run format:check
npm test
npm run test:cov
```

La cobertura exige al menos 80 % de líneas en cada aplicación. Las pruebas HTTP verifican el contrato y los recorridos de compra; CI también comprueba MariaDB. Los pagos son simulados.

`npm run views:check` comprueba que las vistas utilizadas estén en Git, y `npm run test:system` ejercita el cliente y la API juntos. Los requisitos pendientes para admitir datos reales están en el seguimiento local de `docs/.reports/TODO.md`.

Consulta [la documentación compartida](docs/README.md), [la guía de API](api/docs/README.md), [la guía del cliente](client/docs/README.md), [OpenAPI](contracts/openapi.yaml) y [el despliegue](docs/04-instalacion-y-despliegue.md). Cada aplicación tiene capítulos de arquitectura, datos, rutas, operación, seguridad y pruebas. `npm run docs:api` regenera la referencia REST; `npm run docs:check` comprueba enlaces y su vigencia.

Este proyecto parte del monolito del [repositorio original](https://github.com/aLIez-ao/sistema-lonja), cuyo historial no se trae aquí: allí siguen el monolito (`main`) y la entrega v1 (`entrega/v1`). Ejecuta `npm run setup:git` para instalar las exclusiones locales sin versionar `.gitignore`. Producción utiliza Redis persistente para conservar las sesiones del cliente y coordinar su renovación.
