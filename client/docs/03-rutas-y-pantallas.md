# Rutas y pantallas

Las URL web conservan los nombres en español. Los directorios de los proyectos están en inglés. Esta guía agrupa la navegación; el inventario de operaciones HTTP de negocio está en [la referencia REST](../../api/docs/03-rutas-y-permisos.md).

## Mapa de navegación

| Rutas web                                                                                           | Implementación            | Uso                                                                                                      |
| --------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/`, `/tienda/lote/:id`, `/tienda/especie/:id`, `/tienda/sugerencias`                               | `app.js`                  | Tienda pública y búsqueda. `?vista=catalogo` abre el catálogo con filtros; `/tienda` redirige a `/`.     |
| `/acceso`, `/credenciales`, `/cerrarsesion`                                                         | `app.js`                  | Formulario, inicio y cierre de sesión. El cierre que modifica estado es POST.                            |
| `/registro`, `/olvide-password`, `/recuperar-password/:token`, `/verificar-email/:token`            | `routes/cuenta.js`        | Alta, recuperación y verificación.                                                                       |
| `/cuenta`, `/cuenta/datos`, `/cuenta/direcciones`                                                   | `routes/cuenta.js`        | Perfil y direcciones del comprador.                                                                      |
| `/configuracion`, `/avisos/baja/:token`                                                             | `routes/configuracion.js` | Preferencias, cuenta, contraseña y comunicaciones.                                                       |
| `/usuarios`                                                                                         | `routes/usuarios.js`      | Administración de usuarios.                                                                              |
| `/tipos`, `/catalogo`, `/especies`, `/lotes`, `/lotes/eliminacion`                                  | `routes/catalogo.js`      | Inventario, formularios y archivos; eliminación en bloque solo para admin.                               |
| `/dashboard`, `/compradores`, `/compras`, `/compras/:id/ticket`, `/reportes`, `/buscar/sugerencias` | `routes/ventas.js`        | Análisis mensual (`?mes=AAAA-MM`), ventas, ticket y reportes. `/inicio` redirige al panel.               |
| `/carrito`, `/cuenta/listas`, `/cuenta/favoritos`                                                   | `routes/tienda-cuenta.js` | Selección, listas y favoritos.                                                                           |
| `/cuenta/preguntas`, `/cuenta/opiniones`, `/preguntas`, `/opiniones`                                | `routes/tienda-cuenta.js` | Actividad propia y moderación del personal.                                                              |
| `/pedido/nuevo`, `/pedido/:id/pago`, `/cuenta/pedidos`, `/pedidos`                                  | `routes/pedidos.js`       | Checkout, pago simulado, historial y gestión del personal; `?ver=<id>` abre el detalle junto a la tabla. |
| `/uploads/*`, `/salud`                                                                              | `app.js`                  | Transmisión de imágenes y comprobación de dependencias.                                                  |

Las rutas de cada módulo incluyen formularios de creación y edición y las acciones correspondientes. Los permisos definitivos y la propiedad se comprueban en la API. Una persona compradora no adquiere acceso administrativo por conocer la URL.

## Flujos

Una compra web recorre tienda → carrito → pedido nuevo → pago → detalle del pedido → factura. El comprador debe tener la cuenta habilitada y cumplir los requisitos que valida la API. El personal puede atender pedidos y cobrar en mostrador; el total y la disponibilidad no se toman del formulario.

Los listados preservan filtros al cambiar de página y reconstruyen enlaces con los metadatos REST. Los formularios muestran errores de validación y conservan los datos que sea seguro devolver. Los enlaces de retorno solo aceptan rutas internas.

Las facturas de compras y pedidos y los reportes PDF/CSV se solicitan a la API y se transmiten al navegador. El ticket de mostrador es una página imprimible con los mismos datos de la factura. La exportación CSV de lotes seleccionados se genera en el navegador a partir de las filas visibles y antepone un apóstrofo a las celdas que empiezan con `=`, `+`, `-` o `@`. El cliente no genera documentos contables ni lee archivos directamente del volumen de la API.

La eliminación en bloque envía los lotes marcados a `POST /lotes/eliminacion`: se eliminan todos o ninguno, y el mensaje indica el motivo, por ejemplo un lote que aparece en pedidos anteriores.

## Errores y acceso

Un 401 elimina la sesión del cliente y conduce al acceso. Un problema de negocio se muestra con su estado y mensaje controlado; los fallos internos no presentan trazas. `/salud` devuelve 503 cuando falla la API o el almacén de sesiones.

Consulta [las vistas](02-datos-y-vistas.md), [la protección del navegador](05-seguridad.md) y [los recorridos probados](06-pruebas.md).
