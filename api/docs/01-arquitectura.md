# Arquitectura de la API

La API es un servicio Express modular. Atiende HTTP/JSON y produce archivos; las páginas HTML pertenecen al cliente. Las operaciones que afectan reservas, precios, propiedad y permisos se resuelven aquí.

## Arranque y aplicación

`api/app.js` instala correlación, Helmet, CORS explícito, parseo JSON, salud, límites y routers. Se puede importar en pruebas sin abrir el puerto de producción.

`api/index.js` valida configuración, conecta MariaDB, sincroniza de forma segura, aplica migraciones y prepara semillas. Inicia la cola y programa la limpieza de reservas y sesiones vencidas. Al recibir SIGTERM espera los trabajos en curso antes de cerrar.

## Módulos

| Módulo     | Recursos y reglas                                                         |
| ---------- | ------------------------------------------------------------------------- |
| `accounts` | Acceso, registro, recuperación, perfiles, direcciones, usuarios y avisos. |
| `catalog`  | Tipos, fichas maestras, especies, lotes y disponibilidad.                 |
| `store`    | Portada, fichas públicas, carrito, favoritos, listas y comunidad.         |
| `orders`   | Checkout, reservas, pago, cobro y estados de pedidos.                     |
| `sales`    | Compradores, ventas de mostrador, facturas, búsquedas y reportes.         |

Los routers `modules/*/api/` traducen solicitudes a servicios. `services/` consulta modelos y abre transacciones; `helpers/` contiene reglas del módulo. Los cruces de módulos usan sus `index.js`. ESLint impide que los controladores importen Sequelize, conexión o modelos de entidades.

`shared/` aporta infraestructura sin depender de módulos de negocio. `models/` declara tablas y asociaciones; `migrations/` mantiene su evolución versionada.

## Transacciones y concurrencia

Un lote se vende completo una sola vez. La reserva y el pago vuelven a comprobar disponibilidad dentro de transacciones; MariaDB aplica bloqueos y la venta tiene una restricción de unicidad.

`shared/helpers/idempotencia.js` confirma clave, hash de entrada, operación y respuesta en la misma transacción. Un reintento con la misma clave y cuerpo recupera el resultado; cambiar el cuerpo produce conflicto.

Las ediciones de lotes y compras comparan ETag/If-Match. Una versión antigua no se sustituye silenciosamente por la versión actual.

## Sesión

`accounts/services/sesiones.js` emite access de 15 minutos y refresh opaco de ocho horas. La base guarda el hash del refresh y su sesión. Una rotación conserva el hash consumido para detectar su reutilización y revocar la sesión.

Cada petición privada comprueba usuario activo, rol actual, sesión y versión. La API no utiliza cookies para autenticar al navegador.

## Trabajos y archivos

La tabla `trabajo` conserva estado, carga, intentos y próxima ejecución. Los procesadores envían facturas, avisos y notificaciones de pedido. Si el trabajo depende de una transacción se programa después del commit.

Uploads y respaldos pertenecen a la API. Las imágenes se validan antes de guardarlas; los PDF y CSV se construyen en servicios y ayudantes. El cliente recibe esos recursos mediante HTTP.

La API se ejecuta con una sola instancia: la cola y los límites no constituyen una coordinación distribuida. El Redis del cliente guarda sus sesiones y no convierte la cola de la API en multiinstancia.

## Ejemplo de recorrido

Crear un pedido sigue router REST → autenticación de comprador → clave de idempotencia → servicio de pedidos → bloqueos y copia de precios/dirección → commit → respuesta JSON. El correo se programa a partir de una operación confirmada.

Consulta la [referencia REST](03-rutas-y-permisos.md), los [datos](02-base-de-datos.md) y la [arquitectura conjunta](../../docs/01-arquitectura.md).
