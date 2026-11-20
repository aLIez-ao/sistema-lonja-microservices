# Diseño visual: oficina y tienda

El rediseño está implementado en el cliente desde el 19 de noviembre de 2026. Esta guía resume las decisiones, dónde viven en el código y lo que quedó fuera. Los permisos, recorridos y contratos REST no cambiaron salvo por las ampliaciones descritas en [Datos nuevos de la API](#datos-nuevos-de-la-api).

## Dirección compartida

Se conserva la marca Lonja Veracruz con un acento verde petróleo (`#087e8b`) sobre azul marino (`#0b3954`), fondo claro neutro y un modo oscuro equivalente. No hay carruseles, degradados decorativos ni bloques promocionales repetidos; las secciones se separan con espacio y divisores finos.

Tipografía: Inter para el texto y Space Grotesk para títulos y cifras destacadas, servidas desde `client/public/fonts/` porque la CSP solo admite recursos del propio origen. Si la persona elige otra fuente en Configuración, títulos y cuerpo usan esa fuente. Los números de precios, kilos e importes usan cifras tabulares. Los estados llevan siempre texto además de color.

Los estilos del rediseño están en `client/public/css/rediseno.css`, cargado después de `lonja.css`, `tienda.css` y `header.css`. Define tokens propios (`--rd-*`) para los fondos oscuros, porque `--lonja-navy` se aclara en el tema oscuro. La CSP prohíbe estilos en línea: las barras de proporción usan `<progress>` y las gráficas, Chart.js.

## Tienda

| Pantalla                                  | Vista                                     | Contenido                                                                                                                                                                                        |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Portada «Mercado del día» (`/`)           | `store/index.ejs`                         | Héroe claro con lotes disponibles, kilos en venta y precio más bajo; lote destacado; chips de tipo; «Ordenar por»; cuadrícula de cuatro columnas; «Cómo comprar en la lonja».                    |
| Catálogo con filtros (`/?vista=catalogo`) | `store/index.ejs`, `store/_fila-lote.ejs` | Se abre también con búsqueda o con filtros distintos del tipo. Filtros de tipo, especie, precio «Desde / Hasta» y peso mínimo; chips de lo activo; filas con barra «Frente al promedio del día». |
| Ficha de lote                             | `store/lote.ejs`                          | Imagen, panel de compra del lote completo, especies, preguntas y otros lotes de la misma especie.                                                                                                |
| Ficha de especie                          | `store/especie.ejs`                       | Banda con disponibilidad, tabla de lotes con «Mejor precio», tendencia de 7 días y opiniones.                                                                                                    |

La cabecera (`partials/_cabecera.ejs`) es azul marino con la marca, «Lotes del día / Catálogo / Cómo comprar» y, para compradores, «Mis pedidos», el buscador, favoritos y el carrito con contador. Los invitados ven «Acceder». Las tarjetas (`store/_tarjeta-lote.ejs`) llevan fondo tenue por tipo; si el lote no tiene foto propia, `store/_media-lote.ejs` dibuja el pez de línea en lugar de la ilustración genérica.

En pantallas de hasta 575 px la portada sigue la variante móvil: banda «¿Qué llegó esta mañana?», chips en una línea deslizable, lotes como filas con botón «+» y barra inferior (`partials/_barra-movil.ejs`) con Tienda, Favoritos, Pedidos y Cuenta. Cuando hay lotes en el carrito aparece un aviso para abrirlo. La cabecera móvil deja solo marca, avatar y menú; moneda e idioma quedan en Configuración.

Se mantiene la compra por lote completo: no hay selector de cajas ni venta por kilos sueltos.

## Oficina

| Pantalla                        | Vista                                          | Contenido                                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Análisis mensual (`/dashboard`) | `dashboard.ejs`                                | Selector de los últimos 12 meses, indicadores con variación, pendientes de operación, ingresos por día frente al mes anterior, canal, mezcla por tipo, especies y compradores. |
| Lotes (`/lotes`)                | `lots/index.ejs`, `public/js/lonja-lotes.js`   | Pestañas Todos / Disponibles / Vendidos, chips de estado, selección múltiple, exportación CSV de lo seleccionado y eliminación en bloque para administradores.                 |
| Pedidos (`/pedidos`)            | `orders/index.ejs`, `orders/_linea-tiempo.ejs` | Pestañas por estado y panel de detalle (`?ver=<id>`) con línea de tiempo, contenido y totales sin perder filtros ni página.                                                    |
| Factura carta                   | `purchases/_hoja-factura.ejs`                  | Folio con pedido, tarjetas «Facturado a» y «Entrega y pago», importe con letra y «Página 1 de 1». El PDF de la API dibuja la misma distribución.                               |
| Ticket (`/compras/:id/ticket`)  | `purchases/ticket.ejs`                         | Comprobante de 80 mm para imprimir, con los mismos datos que la factura.                                                                                                       |

Las cuentas del personal usan la misma cabecera azul marino con sus enlaces de trabajo; sin buscador de tienda, la navegación ocupa el ancho disponible. La confirmación de cobro en efectivo y la eliminación en bloque piden confirmación antes de enviarse.

## Datos nuevos de la API

Las ampliaciones son campos adicionales en respuestas existentes y una operación nueva; están en [OpenAPI](../contracts/openapi.yaml) y en la [referencia REST](../api/docs/03-rutas-y-permisos.md).

- `GET /dashboard?mes=AAAA-MM` añade `analitico`. El mes en curso se compara con los mismos días del mes anterior; un mes cerrado, con el anterior completo.
- `GET /tienda/portada` añade a `limites` el precio medio por kilo y los kilos totales disponibles.
- `GET /tienda/especies/{id}` añade `resumenLotes` y `tendencia`, el precio final medio de 7 días ponderado por kilos.
- `GET /tienda/lotes/{id}` devuelve `parecidos` también cuando el lote sigue a la venta.
- `GET /compras/{id}/factura` añade pedido, canal e importe con letra.
- `POST /lotes/eliminacion` elimina varios lotes de forma atómica. Un lote reservado, vendido o que aparece en pedidos anteriores bloquea la operación completa; la eliminación individual informa el mismo motivo.

## Fuera del alcance

- Selección de varios tipos a la vez en el catálogo: la API filtra un solo tipo.
- Hora de cierre de reservas en la portada: el sistema no la maneja.
- Código QR en la factura: no hay un servicio que lo genere o valide.
- Acciones en bloque distintas de exportar y eliminar.

## Verificación

Se revisaron en navegador la portada, el catálogo, las fichas, el análisis mensual, lotes, pedidos, factura y ticket a 390 y 1440 px, con invitado, comprador y administrador, sin desbordamiento horizontal. No se revisaron el modo oscuro, zoom al 200 % ni todos los tamaños intermedios; la tabla de [pruebas del cliente](../client/docs/06-pruebas.md) recoge el alcance automático.
