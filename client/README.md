# Lonja Client · v3.0.0

Cliente web de Lonja: Express sirve páginas EJS y recursos propios, y consume la API por HTTP desde el servidor. No accede a MariaDB ni importa modelos o servicios de la API. El navegador recibe una cookie de sesión; los tokens permanecen en el servidor.

## Empezar

Desde la raíz del repositorio, instala dependencias y crea `client/.env` desde `client/.env.example` si aún no existe:

```sh
npm ci
cp client/.env.example client/.env
npm run dev -w @lonja/client
```

Configura `API_URL=http://127.0.0.1:2900/api/v1` y `CLIENTE_URL=http://localhost:3000`. Arranca también la API según [su README](../api/README.md). Abre [la tienda local](http://localhost:3000). `npm start -w @lonja/client` ejecuta sin nodemon; `npm run dev` desde la raíz arranca ambas aplicaciones.

En desarrollo puedes usar sesiones en memoria. Producción exige `SESSION_REDIS_URL`, HTTPS y Redis persistente. No copies las credenciales de MariaDB al cliente. `GET /salud` consulta Redis cuando está configurado y la salud de la API; un fallo devuelve 503.

## Documentación

La [guía del cliente](docs/README.md) contiene:

- [Arquitectura](docs/01-arquitectura.md) y [datos de presentación](docs/02-datos-y-vistas.md).
- [Pantallas y rutas](docs/03-rutas-y-pantallas.md).
- [Instalación y operación](docs/04-instalacion-y-operacion.md).
- [Seguridad](docs/05-seguridad.md) y [pruebas](docs/06-pruebas.md).

El contrato HTTP está en [OpenAPI](../contracts/openapi.yaml). La [documentación compartida](../docs/README.md) explica integración, Docker, entrega y recuperación.

## Organización

`index.js` carga configuración y arranca el servidor. `app.js` instala middleware y compone rutas; `routes/` adapta cada flujo web a la API; `views/` contiene EJS y `public/` los recursos del navegador. `api.js` centraliza transporte y renovación, `sesiones.js` el ciclo de sesión y `redis-store.js` su persistencia y coordinación. `helpers/` y `middleware/` contienen utilidades de presentación.

## Comprobaciones

```sh
npm test -w @lonja/client
npm run test:cov -w @lonja/client
npm run lint
npm run format:check
```

Las pruebas de Redis requieren `SESSION_REDIS_TEST_URL` apuntando a un Redis de ensayo. Los tests comprueban HTTP, EJS, cookies, renovación y flujos de compra; no sustituyen una revisión visual. Consulta [el alcance](docs/06-pruebas.md).

La imagen se construye con `client/Dockerfile` desde el contexto raíz. Usa la [guía de despliegue](../docs/04-instalacion-y-despliegue.md) para servicios, volúmenes y proxy.
