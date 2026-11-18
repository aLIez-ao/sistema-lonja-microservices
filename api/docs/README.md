# Documentación de Lonja API

- [01 · Arquitectura](01-arquitectura.md): arranque, módulos, transacciones y trabajos.
- [02 · Datos](02-base-de-datos.md): modelo, relaciones, migraciones e integridad.
- [03 · REST](03-rutas-y-permisos.md): operaciones, autenticación, cuerpos y respuestas desde OpenAPI.
- [04 · Operación](04-instalacion-y-operacion.md): variables, comandos, almacenamiento y diagnóstico.
- [05 · Seguridad](05-seguridad.md): autorización, sesiones, entradas, archivos y secretos.
- [06 · Pruebas](06-pruebas.md): contrato, casos de regresión y límites de la verificación.
- Diagramas: [DBML](sistema-lonja.dbml) y [SVG](sistema-lonja.svg).

[README del proyecto](../README.md) · [Documentación del cliente](../../client/docs/README.md) · [Integración y despliegue conjunto](../../docs/README.md).

El contrato se mantiene en [OpenAPI](../../contracts/openapi.yaml). `npm run docs:api` regenera únicamente el inventario REST; los demás capítulos explican su implementación y operación.
