# Documentación de Lonja v3

## Guías por proyecto

- [API](../api/README.md) y [su documentación](../api/docs/README.md): arquitectura, base de datos, referencia REST, operación, seguridad y pruebas.
- [Cliente](../client/README.md) y [su documentación](../client/docs/README.md): arquitectura, datos de presentación, pantallas, operación, seguridad y pruebas.
- [OpenAPI](../contracts/openapi.yaml): fuente única del contrato. `npm run docs:api` genera la referencia REST en `api/docs/`.

## Integración compartida

- [Arquitectura del sistema](01-arquitectura.md): límites entre aplicaciones y comunicación.
- [Instalación y entrega](04-instalacion-y-despliegue.md): entorno completo, Docker, TLS, CI y recuperación.
- [Seguridad](05-seguridad.md): fronteras, secretos y límites conjuntos.
- [Pruebas](06-pruebas.md): comandos, CI y recorrido HTTPS.
- [Catálogo de comandos](07-comandos.md): inicio con Docker, datos demo, formato, pruebas y operación.

El [esquema de datos](../api/docs/02-base-de-datos.md), el [DBML](../api/docs/sistema-lonja.dbml) y el [SVG](../api/docs/sistema-lonja.svg) pertenecen a la API. La raíz enlaza esos documentos en lugar de mantener copias. `npm run docs:check` verifica enlaces locales públicos y detecta una referencia REST desactualizada.

## Documentación local

La guía detallada de `docs/code-guide/`, los planes de `docs/.plan/` y los informes de `docs/.reports/` permanecen excluidos de Git. Cada carpeta privada tiene su índice local. Los planes e informes históricos se conservan en subcarpetas `archive/`; `docs/.reports/TODO.md` reúne los pendientes de producción y no se publica. El historial de revisiones no se presenta como documentación operativa vigente.

El historial de este repositorio empieza en v3.0.0. Las versiones anteriores (v1 y el monolito v2) y su historial están en el [repositorio original](https://github.com/aLIez-ao/sistema-lonja); este repositorio no los replica.

Los controladores REST están en `api/modules/*/api/` y las reglas de negocio en `api/modules/*/services/`. Las pantallas pertenecen a `client/routes/`, `client/views/` y `client/public/`. `contracts/openapi.yaml` es la fuente compartida del contrato.
