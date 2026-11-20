# Datos y vistas

## Fuente de datos

El cliente obtiene JSON de la API. No tiene esquema SQL ni migraciones. El modelo persistente está en [la documentación de API](../../api/docs/02-base-de-datos.md); los tipos, parámetros y respuestas HTTP se definen en [OpenAPI](../../contracts/openapi.yaml).

Las rutas preparan los valores que espera EJS: datos de página, errores del formulario, usuario visible, filtros y navegación. Las colecciones conservan metadatos de página, tamaño y total. Los servicios REST pueden devolver modelos de lectura para una pantalla, pero la plantilla no ejecuta consultas ni reglas de negocio.

## Organización de plantillas

| Grupo en `views/`                              | Contenido                                               |
| ---------------------------------------------- | ------------------------------------------------------- |
| `store`, `catalog`, `species`, `lots`, `types` | Tienda e inventario.                                    |
| `login`, `signup`, `account`, `users`          | Acceso, registro, cuenta y administración.              |
| `cart`, `order`, `orders`                      | Carrito, checkout y seguimiento de pedidos.             |
| `buyers`, `purchases`, `reports`               | Compradores, mostrador y reportes.                      |
| `settings`, `notices`, `social`                | Preferencias, comunicaciones, preguntas y opiniones.    |
| `partials`                                     | Cabecera, barra inferior móvil y elementos compartidos. |

`app.js` proporciona a las vistas el usuario actual, ruta, formato de fecha, iconos y contadores de carrito/favoritos. Reconstruye los favoritos como `Set` y los ayudantes de navegación como funciones locales: JSON no transmite esos objetos ejecutables.

## Formularios, listas y preferencias

Los formularios se validan antes del envío y muestran los errores devueltos por la API. Cambiar un filtro restablece la página cuando corresponde; los enlaces preservan el resto de parámetros. La paginación debe usar los metadatos recibidos, sin suponer que todos los resultados caben en la primera página.

Las ediciones que requieren concurrencia conservan el ETag leído para enviarlo como `If-Match`. Los flujos de pedido, pago y cobro transportan su clave de idempotencia. Los importes y permisos se resuelven en la API; la vista solo presenta y formatea.

Las preferencias de presentación se aplican mediante middleware. El consentimiento de cookies se refleja también en la respuesta del mismo formulario; no depende de una segunda navegación para tomar efecto. No uses cookies de preferencias para guardar tokens o credenciales.

EJS escapa valores de usuario. Los fragmentos HTML sin escapar deben ser contenido controlado del propio proyecto. Los recursos estáticos viven en `public/`; no agregues scripts o estilos inline que contradigan la CSP.

## Componentes y estilos del rediseño

| Pieza                                                          | Uso                                                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `partials/_cabecera.ejs`                                       | Cabecera azul marino; los enlaces cambian entre tienda y personal. Recibe `ruta` y `banderas` de `header.ejs`. |
| `partials/_barra-movil.ejs`                                    | Navegación inferior de la tienda y aviso de carrito; solo invitados y compradores, visible hasta 575 px.       |
| `store/_tarjeta-lote.ejs`, `_fila-lote.ejs`, `_media-lote.ejs` | Tarjeta de cuadrícula, fila del catálogo e imagen o pez de línea según el lote tenga foto propia.              |
| `orders/_estado.ejs`, `_linea-tiempo.ejs`                      | Chip de estado de pedido y seguimiento por pasos.                                                              |
| `public/css/rediseno.css`                                      | Tokens `--rd-*`, fuentes, tienda, oficina, tablas, ticket y reglas responsivas.                                |

Las proporciones (canal, mezcla por tipo, precio frente al promedio) usan `<progress>` porque la CSP no permite `style`. Las gráficas reciben sus datos en un `<script type="application/json">` y `public/js/lonja-graficas.js` las dibuja; `data-comparar` añade una serie punteada de referencia. Los importes llegan de la API como cadenas decimales: conviértelos con `Number` antes de sumarlos o graficarlos.

En la portada, `vistaCatalogo` decide entre «Mercado del día» y el catálogo con filtros. El parámetro `ordenar` (por ejemplo `precio-asc`) se traduce en `orden` y `dir` antes de consultar la API, y `vista=catalogo` se conserva en la paginación.

Continúa con [pantallas](03-rutas-y-pantallas.md) y [pruebas de presentación](06-pruebas.md).
