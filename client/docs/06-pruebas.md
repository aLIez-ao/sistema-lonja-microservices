# Pruebas del cliente

Desde la raíz:

```sh
npm test -w @lonja/client
npm run test:cov -w @lonja/client
npm run lint
npm run format:check
```

## Suites

`test/system/client-api.test.js`, ubicado en la raíz y ejecutado con `npm run test:system`, arranca API y cliente reales con una base de ensayo. Comprueba renderizado, CSP, sesión sin tokens en el navegador, rechazo de escrituras por origen, renovación concurrente, registro y verificación, cuenta y direcciones, carrito, pedido, pago simulado, factura y pantallas del personal. Las pruebas propias de `client/test/` no importan código interno de API; las de sistema conservan la integración completa. La cobertura del cliente incluye ese recorrido sin rebajar el umbral.

Las regresiones de navegación comprueban que los listados conservan filtros, usan los metadatos de paginación y ofrecen las páginas esperadas. Las de preferencias comprueban el consentimiento de cookies y el estado de la misma respuesta, además de la navegación posterior.

`test/transporte.test.js` usa un servidor HTTP controlado con respuestas contrastadas contra OpenAPI. Comprueba renovación única, correlación, ausencia de cookies reenviadas, errores de formulario, timeout y respuestas HTML de un proxy que no cumplen el contrato JSON.

`test/redis-store.test.js` comprueba persistencia entre almacenes, coordinación de la rotación y que un cierre concurrente no resucite una sesión. Configura `SESSION_REDIS_TEST_URL` con un Redis de ensayo para ejecutarla. Sin esa variable se omite explícitamente; no confundas una suite sin Redis con la validación de persistencia de producción. La prueba emplea un prefijo propio para aislar sus claves.

## Cobertura y alcance

El ejecutor de c8 en `tools/cobertura.js` mide el servidor e incluye archivos no ejecutados. Excluye pruebas y recursos estáticos y exige 80 % de líneas por aplicación. Guarda los informes fuera del proyecto, en el directorio temporal del sistema.

La última revisión anterior a estos cambios documentales registró 26 pruebas correctas con Redis real y 85,22 % de líneas del cliente. Ese resultado no cubre la apariencia visual de todos los tamaños, temas o navegadores. Las comprobaciones HTTP no equivalen a automatización visual con un navegador.

El recorrido HTTPS de las imágenes finales verifica registro → correo Mailpit → verificación → acceso → carrito → pedido → pago → PDF. Su ejecución y restricciones se explican en [pruebas compartidas](../../docs/06-pruebas.md). Los pagos no hacen cargos reales.

Los casos de negocio, correos, avisos masivos, filtros y paginación REST pertenecen a [las suites de API](../../api/docs/06-pruebas.md). Al modificar una pantalla, revisa ambos lados del flujo y conserva el contrato como fuente compartida.
