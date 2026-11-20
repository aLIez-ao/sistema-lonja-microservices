# Referencia de Lonja API

Generado desde `contracts/openapi.yaml` con `node tools/documentar-api.js`. No editar el inventario manualmente.
Contrato completo: [OpenAPI 3.1](../../contracts/openapi.yaml).

Versión 3.0.0. Prefijo `/api/v1`. Documentación interactiva en `/api/docs` únicamente en desarrollo.

Las rutas privadas reciben `Authorization: Bearer <access>`. El access vence en 15 minutos; el refresh opaco vence a las ocho horas y rota una sola vez por uso. La API no autentica cookies.

Colecciones: `{datos, meta: {pagina, tamano, total}}`; `tamano` máximo 100. Los importes son cadenas decimales y la moneda es MXN. Los errores usan `application/problem+json` y `X-Request-Id`.

`Idempotency-Key` es obligatorio al crear pedidos, pagar y cobrar. Reutiliza la misma clave para el mismo intento; cambiar el cuerpo con esa clave devuelve 409. La edición de lotes y compras exige `If-Match` con el ETag de la lectura (428 si falta, 412 si cambió).

El registro público crea compradores. Catálogo, compradores, ventas y reportes requieren personal; usuarios y operaciones administrativas requieren admin. Los recursos de una cuenta ajena responden 404. El contrato enumera 401/403; los permisos se comprueban siempre en el servidor.

## Operaciones

### `/salud`

- **GET** · pública · respuestas: 200, 400, 401, 403, 404, 409, 413, 422, 429, 500, 503.

### `/auth/sesion`

- **POST** · pública · respuestas: 200, 400, 401, 403, 404, 409, 413, 422, 429, 500.
  Cuerpo obligatorio: application/json.
  Campos JSON: `usuario` (obligatorio), `password` (obligatorio).
- **DELETE** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 413, 422, 429, 500.

### `/auth/refresh`

- **POST** · pública · respuestas: 200, 400, 401, 403, 404, 409, 413, 422, 429, 500.
  Cuerpo obligatorio: application/json.
  Campos JSON: `refresh` (obligatorio).

### `/auth/yo`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 413, 422, 429, 500.

### `/tipos`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `pagina` (query), `tamano` (query), `q` (query), `orden` (query), `tipo` (query), `activo` (query).
- **POST** · Bearer · respuestas: 201, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Cuerpo obligatorio: application/json.
  Campos JSON: `nombre` (obligatorio).

### `/tipos/{id}`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `id` (path, obligatorio).
- **PATCH** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `id` (path, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `nombre`.
- **DELETE** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `id` (path, obligatorio).

### `/catalogo`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `pagina` (query), `tamano` (query), `q` (query), `orden` (query), `tipo` (query), `activo` (query).
- **POST** · Bearer · respuestas: 201, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Cuerpo obligatorio: application/json.
  Campos JSON: `nombre` (obligatorio), `id_tpo` (obligatorio), `descripcion`, `activo`.

### `/catalogo/{id}`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `id` (path, obligatorio).
- **PATCH** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `id` (path, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `nombre`, `id_tpo`, `descripcion`, `activo`.
- **DELETE** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `id` (path, obligatorio).

### `/especies`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `pagina` (query), `tamano` (query), `q` (query), `orden` (query), `tipo` (query), `activo` (query).
- **POST** · Bearer · respuestas: 201, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Cuerpo obligatorio: application/json.
  Campos JSON: `id_lte` (obligatorio), `id_cat` (obligatorio).

### `/especies/{id}`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `id` (path, obligatorio).
- **PATCH** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `id` (path, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `id_lte`, `id_cat`.
- **DELETE** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `id` (path, obligatorio).

### `/lotes`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `pagina` (query), `tamano` (query), `q` (query), `orden` (query), `tipo` (query), `activo` (query).
- **POST** · Bearer · respuestas: 201, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Cuerpo obligatorio: application/json.
  Campos JSON: `kilos` (obligatorio), `numero_cajas` (obligatorio), `precio_kilo_salida` (obligatorio), `especies` (obligatorio).

### `/lotes/eliminacion`

- **POST** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 429, 500.
  Solo admin. Elimina de 1 a 100 lotes en una transacción: si alguno no existe (404), está reservado o vendido (409) o aparece en pedidos anteriores (409), no se elimina ninguno.
  Cuerpo obligatorio: application/json.
  Campos JSON: `ids` (obligatorio).

### `/lotes/{id}`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `id` (path, obligatorio).
- **PATCH** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `id` (path, obligatorio), `If-Match` (header, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `kilos`, `numero_cajas`, `precio_kilo_salida`, `especies`.
- **DELETE** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `id` (path, obligatorio).

### `/tienda/portada`

- **GET** · pública · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Lotes disponibles paginados, categorías, destacados y `limites` del universo disponible (precio mínimo, máximo y medio por kilo, kilos totales).

### `/tienda/lotes`

- **GET** · pública · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.

### `/tienda/lotes/{id}`

- **GET** · pública · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Ficha pública de un lote con sus especies, preguntas respondidas y `parecidos`: hasta cuatro lotes disponibles que comparten especie, aunque el lote esté a la venta.
  Parámetros: `id` (path, obligatorio).

### `/tienda/especies/{id}`

- **GET** · pública · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Ficha pública de una especie: lotes disponibles, `resumenLotes` (lotes, kilos, precio desde y medio) y `tendencia` de 7 días con el precio final medio por kilo ponderado por kilos (null si no hubo ventas).
  Parámetros: `id` (path, obligatorio).

### `/tienda/sugerencias`

- **GET** · pública · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.

### `/catalogo/{id}/imagen`

- **PUT** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 500.
  Parámetros: `id` (path, obligatorio).
  Cuerpo obligatorio: application/json, multipart/form-data.
  Campos JSON: `imagen_data` (obligatorio).
- **DELETE** · Bearer · respuestas: 204, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.
  Parámetros: `id` (path, obligatorio).

### `/registro`

- **POST** · pública · respuestas: 202, 400, 401, 403, 404, 409, 413, 422, 429, 500.
  Cuerpo obligatorio: application/json.
  Campos JSON: `nombre` (obligatorio), `apellido_paterno` (obligatorio), `apellido_materno`, `correo` (obligatorio), `telefono`, `password` (obligatorio), `password_confirmar` (obligatorio), `aviso_privacidad` (obligatorio), `recibir_avisos`.

### `/auth/recuperacion`

- **POST** · pública · respuestas: 202, 400, 401, 403, 404, 409, 413, 422, 429, 500.
  Cuerpo obligatorio: application/json.
  Campos JSON: `identificador` (obligatorio).

### `/auth/restablecer/{token}`

- **POST** · pública · respuestas: 204, 400, 401, 403, 404, 409, 413, 422, 429, 500.
  Parámetros: `token` (path, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `password` (obligatorio), `password_confirmar` (obligatorio).
- **GET** · pública · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500, 503.
  Parámetros: `token` (path, obligatorio).

### `/auth/verificacion/{token}`

- **POST** · pública · respuestas: 200, 400, 401, 403, 404, 409, 413, 422, 429, 500.
  Parámetros: `token` (path, obligatorio).

### `/cuenta`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 413, 422, 429, 500.
- **PATCH** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 413, 422, 429, 500.
  Cuerpo obligatorio: application/json.
  Campos JSON: `nombre`, `apellido_paterno`, `apellido_materno`, `correo`, `telefono`, `rfc`, `razon_social`.

### `/cuenta/verificacion`

- **POST** · Bearer · respuestas: 202, 400, 401, 403, 404, 409, 413, 422, 429, 500.

### `/cuenta/password`

- **PUT** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 413, 422, 429, 500.
  Cuerpo obligatorio: application/json.
  Campos JSON: `password_actual` (obligatorio), `password` (obligatorio), `password_confirmar` (obligatorio).

### `/cuenta/avatar`

- **PUT** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 413, 422, 429, 500.
  Cuerpo obligatorio: application/json, multipart/form-data.
  Campos JSON: `imagen_data`, `quitar`.

### `/cuenta/direcciones`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 413, 422, 429, 500.
- **POST** · Bearer · respuestas: 201, 400, 401, 403, 404, 409, 413, 422, 429, 500.
  Cuerpo obligatorio: application/json.
  Campos JSON: `alias` (obligatorio), `destinatario` (obligatorio), `telefono` (obligatorio), `calle` (obligatorio), `num_ext` (obligatorio), `num_int`, `colonia` (obligatorio), `cp` (obligatorio), `municipio` (obligatorio), `estado` (obligatorio), `referencias`, `principal`.

### `/cuenta/direcciones/{id}`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 413, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).
- **PATCH** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 413, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `alias`, `destinatario`, `telefono`, `calle`, `num_ext`, `num_int`, `colonia`, `cp`, `municipio`, `estado`, `referencias`, `principal`.
- **DELETE** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 413, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).

### `/configuracion`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500, 503.
- **PATCH** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500, 503.
  Cuerpo obligatorio: application/json.
  Campos JSON: `nombre_completo` (obligatorio), `correo`, `telefono`, `recibir_avisos`.

### `/configuracion/preferencias`

- **PATCH** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500, 503.
  Cuerpo obligatorio: application/json.
  Campos JSON: `tema`, `idioma`, `moneda`, `tamanoFuente`, `tipoFuente`.

### `/configuracion/correo/prueba`

- **POST** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500, 503.

### `/configuracion/avisos`

- **POST** · Bearer · respuestas: 202, 400, 401, 403, 404, 409, 422, 429, 500, 503.
  Cuerpo obligatorio: application/json.
  Campos JSON: `asunto` (obligatorio), `mensaje` (obligatorio), `titulo`, `tipo`.

### `/configuracion/aviso-suscripcion/descartar`

- **POST** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 422, 429, 500, 503.

### `/usuarios`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500, 503.
- **POST** · Bearer · respuestas: 201, 400, 401, 403, 404, 409, 422, 429, 500, 503.
  Cuerpo obligatorio: application/json.
  Campos JSON: `usuario` (obligatorio), `nombre_completo` (obligatorio), `correo`, `telefono`, `puesto`, `rol` (obligatorio), `activo`, `password`, `password_confirmar`.

### `/usuarios/{id}`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500, 503.
  Parámetros: `id` (path, obligatorio).
- **PATCH** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500, 503.
  Parámetros: `id` (path, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `usuario`, `nombre_completo`, `correo`, `telefono`, `puesto`, `rol`, `activo`, `password`, `password_confirmar`.
- **DELETE** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 422, 429, 500, 503.
  Parámetros: `id` (path, obligatorio).

### `/usuarios/{id}/invitacion`

- **POST** · Bearer · respuestas: 202, 400, 401, 403, 404, 409, 422, 429, 500, 503.
  Parámetros: `id` (path, obligatorio).

### `/avisos/baja/{token}`

- **GET** · pública · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500, 503.
  Parámetros: `token` (path, obligatorio).
- **POST** · pública · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500, 503.
  Parámetros: `token` (path, obligatorio).

### `/usuarios/{id}/avatar`

- **PUT** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 413, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).
  Cuerpo obligatorio: application/json, multipart/form-data.
  Campos JSON: `imagen_data`, `quitar`.

### `/cuenta/barra`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.

### `/carrito`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.
- **DELETE** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 422, 429, 500.

### `/carrito/items`

- **POST** · Bearer · respuestas: 201, 400, 401, 403, 404, 409, 422, 429, 500.
  Cuerpo obligatorio: application/json.
  Campos JSON: `id_lte` (obligatorio).

### `/carrito/items/{id}`

- **DELETE** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).

### `/cuenta/listas`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.
- **POST** · Bearer · respuestas: 201, 400, 401, 403, 404, 409, 422, 429, 500.
  Cuerpo obligatorio: application/json.
  Campos JSON: `nombre` (obligatorio).

### `/cuenta/listas/{id}`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).
- **PATCH** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `nombre` (obligatorio).
- **DELETE** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).

### `/cuenta/listas/{id}/items`

- **POST** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `tipo` (obligatorio), `id_ref` (obligatorio).
- **DELETE** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `tipo` (obligatorio), `id_ref` (obligatorio).

### `/cuenta/listas/{id}/carrito`

- **POST** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).

### `/cuenta/favoritos`

- **POST** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.
  Cuerpo obligatorio: application/json.
  Campos JSON: `tipo` (obligatorio), `id_ref` (obligatorio).

### `/cuenta/favoritos/alternar`

- **POST** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.
  Cuerpo obligatorio: application/json.
  Campos JSON: `tipo` (obligatorio), `id_ref` (obligatorio).

### `/cuenta/preguntas`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.

### `/cuenta/opiniones`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.

### `/cuenta/opiniones/{id}`

- **DELETE** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).

### `/preguntas`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.
- **POST** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 422, 429, 500.
  Cuerpo obligatorio: application/json.

### `/preguntas/{id}`

- **PATCH** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).
  Cuerpo obligatorio: application/json.

### `/opiniones`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.

### `/opiniones/{id}`

- **POST** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).
  Cuerpo obligatorio: application/json.
- **PATCH** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `visible` (obligatorio).

### `/pedidos/checkout`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.

### `/pedidos`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.
- **POST** · Bearer · respuestas: 201, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `Idempotency-Key` (header, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `entrega` (obligatorio), `id_dir`.

### `/pedidos/{id}`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).
- **PATCH** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `estado` (obligatorio).

### `/pedidos/{id}/pago`

- **POST** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio), `Idempotency-Key` (header, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `metodo`, `tarjeta`.

### `/pedidos/{id}/cobro`

- **POST** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio), `Idempotency-Key` (header, obligatorio).

### `/pedidos/{id}/cancelacion`

- **POST** · Bearer · respuestas: 204, 400, 401, 403, 404, 409, 422, 429, 500.
  Parámetros: `id` (path, obligatorio).

### `/compras/{id}/factura`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 409, 422, 429, 500.
  Datos de la factura comercial (`compra` y `f`, con folio, pedido, canal e importe con letra) o el PDF carta con `Accept: application/pdf`; ambos comparten la misma distribución.
  Parámetros: `id` (path, obligatorio).

### `/compradores`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.
- **POST** · Bearer · respuestas: 201, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.
  Cuerpo obligatorio: application/json.
  Campos JSON: `nombre`, `apellido_paterno`, `apellido_materno`, `correo`, `direccion`.

### `/compradores/{id}`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.
  Parámetros: `id` (path, obligatorio).
- **PATCH** · Bearer · respuestas: 200, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.
  Parámetros: `id` (path, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `nombre`, `apellido_paterno`, `apellido_materno`, `correo`, `direccion`.
- **DELETE** · Bearer · respuestas: 204, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.
  Parámetros: `id` (path, obligatorio).

### `/compras`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.
- **POST** · Bearer · respuestas: 201, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.
  Cuerpo obligatorio: application/json.
  Campos JSON: `id_cmp`, `codigo_cpr`, `precio_kilo_final`.

### `/compras/{id}`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.
  Parámetros: `id` (path, obligatorio).
- **PATCH** · Bearer · respuestas: 200, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.
  Parámetros: `id` (path, obligatorio), `If-Match` (header, obligatorio).
  Cuerpo obligatorio: application/json.
  Campos JSON: `id_cmp`, `codigo_cpr`, `precio_kilo_final`.
- **DELETE** · Bearer · respuestas: 204, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.
  Parámetros: `id` (path, obligatorio).

### `/compras/catalogos`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.

### `/compras/{id}/correo`

- **POST** · Bearer · respuestas: 202, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.
  Parámetros: `id` (path, obligatorio).

### `/dashboard`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.
  Resumen del día, últimos 30 días y bloque `analitico` del mes elegido: ingresos por día frente al mes anterior, indicadores con variación, mezcla por tipo, canal (tienda/mostrador), compradores principales y `periodo` con los 12 meses elegibles. El mes en curso se compara con los mismos días del anterior; un mes cerrado, con el anterior completo.
  Parámetros: `mes` (query).

### `/buscar/sugerencias`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.

### `/reportes/{anio}`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.
  Parámetros: `anio` (path, obligatorio).

### `/reportes/dia/{fecha}`

- **GET** · Bearer · respuestas: 200, 400, 401, 403, 404, 406, 409, 412, 422, 428, 429, 500, 503.
  Parámetros: `fecha` (path, obligatorio).
