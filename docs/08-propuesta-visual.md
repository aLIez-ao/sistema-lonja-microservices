# Propuesta visual: oficina y tienda

Propuesta para revisión, pendiente de implementación. Las aplicaciones, pantallas, permisos y recorridos actuales siguen vigentes. La corrección de sintaxis y el formato del CSS no aplican este rediseño.

## Dirección compartida

Conservar la marca Lonja Veracruz, reducir la saturación y usar un solo acento verde petróleo. Fondo claro neutro, texto gris oscuro y modo oscuro equivalente. Evitar degradados, sombras grandes, carruseles automáticos, botones excesivamente redondeados y bloques promocionales repetidos. Separar secciones con espacio y divisores finos.

Usar tipografía del sistema, cuerpo de 14–16 px, títulos contenidos y números alineados para precios, kilos e importes. Iconos de 16–20 px como apoyo; conservar etiquetas en acciones de trabajo. Un botón principal por sección y acciones secundarias discretas. Los estados necesitan texto además de color.

## Trabajadores: oficina operativa

- Navegación lateral estable por áreas: resumen, pedidos, compras, lotes, compradores, catálogo, reportes y usuarios. Mostrar solo las áreas permitidas por el rol. En móvil convertirla en un menú compacto accesible.
- Cabecera baja con marca, contexto y cuenta. Mantener accesos discretos a tienda y escritorio; las herramientas no compiten con el contenido.
- Listados como contenido principal: búsqueda, filtros de estado, tabla, paginación e importes alineados. Mantener búsqueda y filtros al abrir un registro o volver de una edición.
- Estados sobrios: pendiente, en preparación, entregado y cancelado. Reservar el color intenso para incidencias que requieren atención.
- Formularios con etiquetas arriba, campos agrupados por tarea y resumen de validación. Acción principal al final, cancelación visible y confirmación específica antes de borrar o cobrar.
- El resumen diario muestra solo los indicadores necesarios para operar; gráficos y comparaciones se consultan en reportes, sin llenar de tarjetas la pantalla de captura.

La vista de referencia es el seguimiento de pedidos: tabla central, filtros y detalle ligero. Los datos que aparecen en la propuesta son de muestra; sus interacciones no crean ventas ni cobran.

## Clientes: tienda minimalista

- Cabecera corta con marca, tienda, pedidos, cuenta y carrito. Opciones de idioma y moneda dentro de preferencias para reducir ruido, manteniéndolas accesibles.
- Sustituir el carrusel protagonista por un título breve y el buscador. Ofrecer categorías claras y el catálogo inmediatamente después.
- Cada lote muestra especie, disponibilidad, kilos, precio por kg, importe del lote y una sola acción para seleccionarlo. Conservar la compra por lote completo; el rediseño no inventa venta por kilos sueltos.
- Fotografías pequeñas y consistentes en una implementación posterior, sin superponer textos ni usar imágenes de fondo para información esencial. La propuesta usa una lista limpia para evaluar primero jerarquía y densidad.
- Carrito con contenido, subtotal y condiciones de envío visibles. No ocultar costes en iconos ni sustituir la confirmación final por una compra inmediata.
- Formularios de acceso, dirección y compra con pocas decisiones simultáneas y mensajes concretos. Sin ventanas promocionales ni animaciones decorativas.

## Criterios de implementación

Aplicar primero los elementos compartidos: colores, tipografía, botones, campos y foco. Después, separar el contenedor de trabajo y el de tienda; reutilizar componentes y datos sin duplicar lógica ni modificar los contratos REST.

Verificar 320, 375, 768, 1024 y 1440 px, zoom al 200 %, teclado, ambos temas y menús abiertos. No debe haber desbordamiento horizontal en formularios o cabeceras. Las tablas pueden pasar a filas apiladas con etiquetas, conservando todos los datos y acciones. Mantener contraste suficiente y objetivos táctiles de al menos 44 px.

Antes de aprobar el rediseño completo, revisar una pantalla de pedidos y una de catálogo, junto con sus estados de carga, vacío, error, validación y selección. Después extender el patrón a las demás vistas y repetir las pruebas de sesión, origen y compra. La propuesta visual no sustituye esas pruebas.
