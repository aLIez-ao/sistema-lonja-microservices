# Lonja API · v3.0.0

Servicio REST de inventario, cuentas, tienda, pedidos y ventas. Este proyecto contiene las reglas de negocio, MariaDB, archivos subidos, trabajos de correo, facturas y reportes.

El cliente web consume esta API por HTTP. Los contratos compartidos están en [contracts/openapi.yaml](../contracts/openapi.yaml); la API responde JSON, PDF, CSV o archivos y no genera páginas EJS.

## Empezar

Desde la raíz del repositorio:

```sh
npm ci
cp .env.example .env
npm run dev -w @lonja/api
```

Configura la conexión MariaDB y los secretos del archivo raíz `.env` antes de arrancar. No se lee `api/.env`: el cargador de la API utiliza el `.env` de la raíz. No sobrescribas uno existente al copiar el ejemplo.

La API escucha por defecto en `http://localhost:2900`. Comprueba `GET /salud` o `GET /api/v1/salud`. En desarrollo, Swagger está en `http://localhost:2900/api/docs`.

Para ejecución sin nodemon usa `npm start -w @lonja/api`. Dentro de la carpeta `api/`, `npm start` ejecuta el mismo servidor.

## Documentación

- [Índice](docs/README.md).
- [Arquitectura y módulos](docs/01-arquitectura.md).
- [Base de datos y migraciones](docs/02-base-de-datos.md).
- [Referencia REST generada](docs/03-rutas-y-permisos.md).
- [Configuración y operación](docs/04-instalacion-y-operacion.md).
- [Seguridad](docs/05-seguridad.md).
- [Pruebas y regresiones](docs/06-pruebas.md).

## Organización

`app.js` construye Express; `index.js` conecta los servicios e inicia el proceso. `modules/` agrupa accounts, catalog, store, orders y sales. `models/`, `migrations/` y `shared/` contienen persistencia e infraestructura; `scripts/` reúne tareas de operación.

Los controladores REST viven en `modules/*/api/`; los servicios consultan los modelos. ESLint vigila esa frontera. Los recursos de presentación pertenecen a [Lonja Client](../client/README.md).

## Contrato y pruebas

Las rutas tienen prefijo `/api/v1`. Las privadas exigen Bearer; los errores usan RFC 9457. Pedidos, pagos y cobros requieren `Idempotency-Key`; las ediciones de lotes y compras requieren `If-Match`.

```sh
npm test -w @lonja/api
npm run test:cov -w @lonja/api
npm run docs:api
```

La cobertura exige 80 % de líneas. Las pruebas HTTP validan las respuestas contra OpenAPI; CI repite las operaciones críticas sobre MariaDB.

## Despliegue

El [Dockerfile](Dockerfile) produce una imagen propia. Compose mantiene datos, uploads y respaldos en volúmenes y permite ejecutar una sola API. El procedimiento conjunto está en [despliegue del sistema](../docs/04-instalacion-y-despliegue.md).

Los pagos son simulados. Las claves, archivos de usuarios y respaldos quedan fuera de Git y de la imagen.
