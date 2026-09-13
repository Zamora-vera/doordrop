# Prompt para Codex - Ship24go / Spedire365 MySQL full + APIs reales

Actúa como ingeniero full-stack senior. Trabaja sobre el proyecto React + Vite + Express + TypeScript del ZIP. Objetivo: dejar la plataforma lista para producción con MySQL real, control completo desde Super Admin e integración real de proveedores logísticos.

## Diagnóstico actual

El sistema no está listo al 100% todavía. Existe `mysql-adapter.ts`, pero el backend sigue trabajando primero con `database.json` y memoria, y luego intenta sincronizar. Eso no es MySQL full. Hay credenciales sensibles dentro del código, tablas incompletas, campos guardados como JSON sin normalizar, falta de transacciones, falta de índices/relaciones y no hay mecanismo limpio de migración.

El Super Admin existe y puede abrir estadísticas, clientes, envíos, proveedores, planes, ajustes, reportes y tickets. Pero hay que corregir seguridad: no crear administradores por contener la palabra “admin” en el correo, no usar el ID del usuario como token, aplicar JWT/sesiones seguras y proteger todos los endpoints administrativos.

Las APIs de proveedores no están completas. ParcelABC está parcialmente conectado en cotización y creación, pero faltan validaciones, tracking real, etiquetas, customs, status map y pruebas reales. Genei está casi como placeholder: falta login/token, parámetros de cotización, creación real, pago, etiqueta, consulta de envío y webhook. PaccoFacile y Poste Italiane no deben quedar como enlaces falsos: o se implementan con documentación real o se dejan desactivados en el panel.

## Trabajo obligatorio

1. Convertir toda la persistencia a MySQL real:
   - Eliminar `database.json` como base principal. Puede quedar sólo como backup opcional de emergencia, nunca como fuente principal.
   - Usar `mysql2/promise` con pool desde `.env`: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`.
   - No dejar credenciales reales hardcodeadas.
   - Crear carpeta `server/db` con conexión, migraciones/seeders y repositorios.
   - Crear migraciones SQL con tablas normalizadas: `users`, `companies`, `pickup_addresses`, `stores`, `providers`, `provider_credentials`, `quotes`, `shipments`, `shipment_packages`, `shipment_customs_items`, `tracking_events`, `webhook_events`, `wallet_transactions`, `payments`, `plans`, `subscriptions`, `tickets`, `ticket_replies`.
   - Usar el archivo `ship24go_mysql_full_schema.sql` como base de estructura, ajustando lo necesario al código.
   - Guardar credenciales de proveedores cifradas o, mínimo, nunca retornarlas completas al frontend.
   - Crear funciones CRUD reales por tabla. Nada de estado global `let db` para producción.
   - Usar transacciones al crear envío, descontar saldo, guardar paquetes y registrar eventos.
   - Agregar índices y claves foráneas.

2. Arreglar autenticación y seguridad:
   - Registro de cliente siempre con `role = customer`.
   - Super Admin sólo por seed/env o comando interno, no por correo.
   - Password con hash seguro.
   - Login con JWT o sesión segura, no usar `user.id` como token.
   - Middleware `requireAuth` y `requireSuperAdmin` separado.
   - Validar inputs con una capa central de validación.

3. Super Admin debe controlar todo:
   - Proveedores: activar/desactivar, moneda, margen, credenciales, ambiente sandbox/producción y botón “Probar conexión”.
   - Envíos: ver todos, filtrar por cliente/proveedor/estado/fecha, actualizar estado manual si hace falta y consultar tracking real.
   - Clientes: ver datos, saldo, tiendas conectadas, envíos y tickets.
   - Planes: CRUD real con MySQL.
   - Configuración: PayPal, Polar, Google Maps, FreeCurrencyAPI y proveedores logísticos sin exponer claves completas.
   - Reportes: ingresos, costo proveedor, margen, envíos por proveedor, estados y ventas por periodo.

4. Integración ParcelABC real:
   - Base: `https://www.parcelabc.com/api-pabc.php`.
   - Todas las llamadas son POST.
   - Implementar `/quote`, `/order/create`, `/tracking`, `/tracking/lastHour`, `/tracking/statusList`.
   - En `/quote` enviar `authToken`, `countryFrom`, `countryTo`, `zipFrom`, `zipTo`, `currency` y `packages`.
   - En `/order/create` enviar `authToken`, `manifest`, `orderNumber`, `orderCurrency`, `orderValue`, `reference`, `content`, `serviceId`, `recipient`, `sender`, `packages` y customs si aplica.
   - Corregir campos obligatorios: `sender.email`, `sender.full_name`, `recipient.full_name`, teléfonos, país, ciudad, código postal, medidas y peso.
   - Guardar `parcelCode`, `parcelTrackUrl`, `serviceName`, costos, `packageCode`, `manifestReference`, `finalMile`, `finalMileUrl`, `labelUrl`.
   - Mapear estados de ParcelABC a estados comerciales internos.

5. Integración Genei real:
   - Login en `https://apiv2.genei.es/api/v2/login` con email/password del proveedor y guardar Bearer con expiración de 15 días.
   - Implementar cotización `GET /agencies/prices` con los parámetros correctos según Swagger.
   - Implementar creación `POST /shipments` usando el id de agencia seleccionado.
   - Guardar `paymentUrl` y definir flujo: si la plataforma paga, ejecutar pago; si es prueba, permitir eliminar/cancelar.
   - Implementar `GET /shipments/{shipmentCode}/label` para PDF/ZPL base64/binario.
   - Implementar `GET /shipments/{shipmentCode}` para estado/tracking.
   - Agregar webhook `notificationUrl` para actualizar estado automáticamente.
   - Mapear estados Genei: pendiente de pago, pendiente de tramitar, tramitado, tránsito, reparto, entregado, devuelto, incidencia, etc.

6. APIs no confirmadas:
   - PaccoFacile y Poste Italiane no deben mostrarse como conectadas si no hay implementación/documentación real.
   - Si quedan pendientes, mostrarlas como “Disponible próximamente” o “No conectado todavía” en Admin, sin mensajes técnicos.

7. UI profesional sin mensajes internos:
   - No mostrar textos técnicos al usuario final ni en admin comercial: nada de “endpoint”, “schema”, “migration”, “debug”, “variable”, “tabla no existe”, “API key faltante” o errores internos.
   - En UI usar mensajes comerciales: “No hay datos para mostrar”, “Conexión pendiente de completar”, “No se pudo completar la operación”, “Proveedor no disponible todavía”, “Configura la conexión desde el panel”.
   - Detalles técnicos sólo en README, logs o archivo de diagnóstico.
   - Reemplazar la pantalla de `Google Maps API Key Required` por una pantalla profesional o degradar el mapa sin bloquear toda la app.

8. Pruebas obligatorias antes de entregar:
   - `npm run lint`
   - `npm run build`
   - Registro cliente -> login -> panel cliente.
   - Login Super Admin seed -> admin.
   - Crear/probar proveedor con credenciales sandbox.
   - Cotización real ParcelABC con token válido.
   - Creación real ParcelABC con `manifest=0` primero para prueba segura.
   - Tracking por ParcelABC.
   - Genei login, cotización y creación de envío de prueba sin pago automático.
   - Confirmar que reiniciar el servidor no pierde datos.
   - Confirmar que clientes sólo ven sus datos y Super Admin ve todo.

## Criterio de aceptación

La entrega sólo se considera completa cuando:

- La app funciona sin `database.json` como base principal.
- Todas las configuraciones del Super Admin persisten en MySQL.
- Los proveedores conectados se pueden probar desde Admin.
- ParcelABC queda funcionando con cotización, creación, tracking y etiqueta cuando el proveedor la devuelva.
- Genei queda funcionando con login/token, cotización, creación, etiqueta, tracking y webhook.
- No hay credenciales sensibles dentro del código.
- No hay mensajes técnicos visibles en la interfaz.
- README explica instalación, variables `.env`, migraciones, seed de super admin y pruebas.
