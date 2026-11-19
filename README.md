# Sistema Lonja · v3.0.0

Dos aplicaciones Node.js que se comunican por HTTP:

- [api/](api/README.md): API REST, reglas de negocio, MariaDB, archivos, correo, facturas y reportes.
- [client/](client/README.md): servidor Express + EJS, pantallas y recursos del navegador. Consume la API sin acceder a la base de datos.
- `contracts/`: especificación OpenAPI 3.1 compartida.

Cada aplicación tiene su propio `package.json`, servidor y Dockerfile. El `package.json` raíz coordina los npm workspaces.

```sh
npm ci
npm run dev
```

Configura la API con `.env.example` y el cliente con `client/.env.example`. API: puerto 2900; cliente: puerto 3000. Para ejecutar solo una aplicación: `npm start -w @lonja/api` o `npm start -w @lonja/client`.

El entorno completo de desarrollo incluye MariaDB, Mailpit y Adminer:

```sh
docker compose --env-file deploy/compose.env.example -f compose.dev.yaml up
```

Abre http://localhost:3000. Mailpit: http://localhost:8025; Adminer: http://localhost:8080. La cuenta inicial usa `ADMIN_USER` y `ADMIN_PASSWORD` del `.env` raíz; sin ese archivo usa `.env.example`. Las credenciales de los servicios de desarrollo figuran en Compose y no se usan en producción. Consulta [la configuración de desarrollo](docs/04-instalacion-y-despliegue.md) para aplicar cambios a contenedores existentes.

```sh
npm run lint
npm run format:check
npm test
npm run test:cov
```

La cobertura exige al menos 80 % de líneas en cada aplicación. Las pruebas HTTP verifican el contrato y los recorridos de compra; CI también comprueba MariaDB. Los pagos son simulados.

`npm run views:check` comprueba que las vistas utilizadas estén en Git, y `npm run test:system` ejercita el cliente y la API juntos. Los requisitos pendientes para admitir datos reales están en [TODO.md](TODO.md).

Consulta [la documentación compartida](docs/README.md), [la guía de API](api/docs/README.md), [la guía del cliente](client/docs/README.md), [OpenAPI](contracts/openapi.yaml) y [el despliegue](docs/04-instalacion-y-despliegue.md). Cada aplicación tiene capítulos de arquitectura, datos, rutas, operación, seguridad y pruebas. `npm run docs:api` regenera la referencia REST; `npm run docs:check` comprueba enlaces y su vigencia.

Este proyecto parte del monolito del [repositorio original](https://github.com/aLIez-ao/sistema-lonja), cuyo historial no se trae aquí: allí siguen el monolito (`main`) y la entrega v1 (`entrega/v1`). Ejecuta `npm run setup:git` para instalar las exclusiones locales sin versionar `.gitignore`. Producción utiliza Redis persistente para conservar las sesiones del cliente y coordinar su renovación.
