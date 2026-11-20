# Pruebas de la API

Desde la raíz:

```sh
npm test -w @lonja/api
npm run test:cov -w @lonja/api
npm run lint
npm run format:check
npm run docs:api
```

## Entorno y contrato

Las suites usan `node:test`. `api/test/ayuda.js` prepara SQLite en memoria y almacenamiento temporal por defecto. Los transportes de correo se capturan o sustituyen. No dirijas las pruebas a una base con información útil: recrean el esquema.

Las suites `api-*.test.js` arrancan HTTP real y comprueban Bearer, renovación y revocación, permisos, propiedad, catálogo, imágenes, direcciones, listas, carrito, moderación, pedidos, cobros y reportes. `test/contrato.js` contrasta códigos, contenido y esquemas contra OpenAPI mediante Ajv. La referencia Markdown se genera del mismo contrato; no la edites a mano.

## Regresiones conservadas

| Suite                            | Comportamiento protegido                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `api-correo-regresion.test.js`   | Contenido y enlaces de verificación, recuperación y notificaciones; ciclo de vida de los enlaces y diagnóstico autorizado. |
| `api-avisos-regresion.test.js`   | Destinatarios, suscripciones, avisos masivos y reintentos.                                                                 |
| `api-filtros-regresion.test.js`  | Búsquedas, filtros y combinaciones sin convertir entradas en patrones inesperados.                                         |
| `api-listados-regresion.test.js` | Tamaños, páginas, límites y metadatos de colecciones.                                                                      |
| `api-ventas.test.js`             | Análisis mensual: suma de ingresos por día, canales, mezcla por tipo, meses elegibles y rechazo de meses inválidos.        |
| `api-store.test.js`              | Tendencia de 7 días ponderada por kilos, resumen de disponibilidad, precio medio de la portada y lotes parecidos.          |
| `api-catalogo.test.js`           | Eliminación en bloque atómica: validación, lote vendido o con pedidos anteriores y eliminación correcta.                   |
| `factura-letra.test.js`          | Importe con letra: apócopes, cientos, miles y millones.                                                                    |

Las pruebas de negocio y migraciones comprueban integridad, reservas, unicidad y reversión. Las suites HTML históricas quedan en el monolito del [repositorio original](https://github.com/aLIez-ao/sistema-lonja); las regresiones activas ejercitan REST y el cliente actual.

## MariaDB y cobertura

CI prepara MariaDB aislada y ejecuta en serie las suites REST, migraciones y servicios modulares. La serialización evita que dos pruebas recreen el mismo esquema simultáneamente. La competencia por el mismo lote y el doble cobro se comprueban sobre MariaDB; la prueba que necesita bloqueo de filas se omite explícitamente en SQLite.

El comando del job, ejecutado desde `api/` y con las variables de la base de ensayo, es:

```sh
node --test --test-concurrency=1 test/api-*.test.js test/migraciones.test.js test/servicios-modulares.test.js
```

`tools/cobertura.js` incluye código del servidor no ejecutado y exige al menos 80 % de líneas. Los informes se guardan en el directorio temporal del sistema. La revisión del 18 de noviembre de 2026 registró 154 pruebas correctas y una omisión esperada de SQLite en la suite API completa; el job MariaDB registró 121 correctas. La cobertura de líneas fue 86,02 %. La revisión del 19 de noviembre, en SQLite, registró 160 correctas, la misma omisión y 86,64 % de líneas; el job MariaDB no se ejecutó en esa revisión. Se comprobó además una copia de los archivos versionados, sin `.env` ni vistas locales ignoradas, reutilizando las dependencias instaladas. Estos resultados no acreditan una instalación independiente de dependencias ni un servidor publicado.

Los recorridos que incluyen páginas, cookie y descargas se explican en [pruebas del cliente](../../client/docs/06-pruebas.md). CI, cobertura conjunta y el ensayo HTTPS están en [la guía compartida](../../docs/06-pruebas.md).
