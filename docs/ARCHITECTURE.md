# Arquitectura y módulos de DoorDrop

Este documento describe la copia completa del código que sirve a `doordrop.lat` y la responsabilidad de cada módulo. La referencia de release documentada es `1.5.6`.

## 1. Vista general

```text
Navegador / PWA
      |
      v
React + Vite (src/)
      |
      v
Express (server.ts) ---- proveedores externos
      |                  |- transportistas / tracking / etiquetas
      v                  |- PayPal / Polar
MySQL + migraciones      |- correo / IMAP / SMTP
      |                  |- Google Maps / IA / WhatsApp
      v
Eventos, notificaciones, paneles y documentos legales
```

El frontend no debe considerarse una prueba de que una operación externa se completó. Una cotización, etiqueta, pago, tracking, webhook o entrega solo se confirma cuando el backend y el proveedor devuelven el resultado correspondiente y queda persistido.

## 2. Arranque, build y versión

| Módulo | Ubicación | Responsabilidad |
|---|---|---|
| Entrada backend | [`server.ts`](../server.ts) | Arranca Express, registra middleware/rutas, aplica autenticación/autorización, conecta el dominio de envíos, marketplace, pagos, correo, soporte y omnicanalidad. Es un backend amplio y actualmente concentra parte del orchestration del producto. |
| Entrada frontend | [`src/main.tsx`](../src/main.tsx) | Monta React, estilos globales y el árbol principal de la aplicación. |
| Router y shell | [`src/App.tsx`](../src/App.tsx) | Selecciona las áreas públicas, panel de cliente, marketplace, vendedor, omnicanalidad y administración. |
| Build | [`scripts/build.mjs`](../scripts/build.mjs), [`vite.config.ts`](../vite.config.ts) | Compila frontend y backend para obtener la salida productiva. |
| Versión | [`VERSION`](../VERSION), [`package.json`](../package.json), [`src/lib/appVersion.ts`](../src/lib/appVersion.ts) | Mantiene y expone la versión del producto; el backend también la devuelve por `/api/version`. |
| Proceso | [`ecosystem.config.cjs`](../ecosystem.config.cjs) | Configuración de proceso Node/PM2 usada por los entornos que la adopten. |
| Despliegue | [`scripts/deploy_from_github.sh`](../scripts/deploy_from_github.sh) | Actualiza el checkout autorizado, crea backup, instala dependencias, aplica comprobaciones/migraciones previstas, construye y reinicia el servicio. |

## 3. Frontend React

### 3.1 Páginas y áreas de producto

| Área | Archivos principales | Qué hace |
|---|---|---|
| Acceso | [`src/pages/Auth.tsx`](../src/pages/Auth.tsx) | Registro, inicio de sesión y recuperación/verificación de cuenta según el flujo habilitado por el backend. |
| Web pública | [`src/pages/Landing.tsx`](../src/pages/Landing.tsx), [`Public.tsx`](../src/pages/Public.tsx) | Presentación pública, navegación, contenido comercial y acceso a cotización/servicios. |
| Panel cliente | [`src/pages/CustomerPanel.tsx`](../src/pages/CustomerPanel.tsx) | Cotizaciones, envíos, saldo, pagos, documentos, tickets y seguimiento del cliente. |
| Cotización | [`src/pages/Tariffa.tsx`](../src/pages/Tariffa.tsx) | Recoge origen/destino y bultos, muestra opciones reales disponibles, precio, modalidad y tiempos que devuelve el flujo de proveedores. |
| Marketplace comprador | [`src/pages/Marketplace.tsx`](../src/pages/Marketplace.tsx), [`MarketplaceApp.tsx`](../src/pages/MarketplaceApp.tsx), [`ProductPage.tsx`](../src/pages/ProductPage.tsx) | Catálogo, ficha de producto, conversación/oferta, términos y checkout del marketplace. |
| Marketplace vendedor | [`src/pages/SellerPage.tsx`](../src/pages/SellerPage.tsx), [`SellerPanel.tsx`](../src/pages/SellerPanel.tsx) | Publicación y gestión de productos, ofertas, ventas, saldo y flujo de liquidación del vendedor. |
| Omnicanalidad | [`OmnichannelApp.tsx`](../src/pages/OmnichannelApp.tsx), [`OmnichannelSales.tsx`](../src/pages/OmnichannelSales.tsx), [`AdminOmnichannel.tsx`](../src/pages/AdminOmnichannel.tsx) | Bandeja unificada, canales, ventas, automatizaciones y capacidades de IA/atención. |
| Tiendas | [`src/pages/Stores.tsx`](../src/pages/Stores.tsx) | Conexión y administración de tiendas/canales integrados. |
| Integraciones | [`src/pages/IntegrationCallback.tsx`](../src/pages/IntegrationCallback.tsx) | Recibe callbacks OAuth/integración y devuelve el control al flujo de la plataforma. |
| Administración | [`AdminPanel.tsx`](../src/pages/AdminPanel.tsx), [`AdminDocs.tsx`](../src/pages/AdminDocs.tsx) | Panel de operación y documentación administrativa. |
| Soporte administrativo | [`AdminAssistanceCenter.tsx`](../src/pages/AdminAssistanceCenter.tsx) | Centro de asistencia, tickets y copilot operativo. |
| Correo/admin | [`src/pages/admin/Webmail.tsx`](../src/pages/admin/Webmail.tsx), [`SmtpSettings.tsx`](../src/pages/admin/SmtpSettings.tsx), [`EmailTemplates.tsx`](../src/pages/admin/EmailTemplates.tsx) | Webmail, configuración SMTP y plantillas autorizadas. |
| Equipo | [`src/pages/admin/Staff.tsx`](../src/pages/admin/Staff.tsx) | Gestión de usuarios internos y permisos operativos. |
| POD | [`src/pages/admin/AdminPodSettings.tsx`](../src/pages/admin/AdminPodSettings.tsx) | Configuración administrativa de impresión bajo demanda. |

### 3.2 Componentes reutilizables

En [`src/components/`](../src/components/) están los bloques comunes: autocompletado de dirección y código postal, selección de país/moneda, medición con cámara, cabecera/footer, banners PWA, boundaries de error, documentación y gates de términos legales, diseño POD y widgets de soporte. Se reutilizan para mantener consistentes validaciones, traducción y navegación.

### 3.3 Librerías de cliente

| Módulo | Responsabilidad |
|---|---|
| [`src/lib/api.ts`](../src/lib/api.ts) | Cliente de API principal y helpers de autenticación/recursos del panel. |
| [`src/lib/omnichannelApi.ts`](../src/lib/omnichannelApi.ts) | Cliente tipado/organizado para endpoints omnicanal. |
| [`src/lib/i18n.tsx`](../src/lib/i18n.tsx), [`src/lang/`](../src/lang/) | Idioma activo, textos visibles, módulos de traducción y fallback. |
| [`src/lib/autoTranslate.ts`](../src/lib/autoTranslate.ts) | Traducción asistida de textos donde el flujo la habilita; no sustituye la fuente legal autorizada. |
| [`src/lib/countries.ts`](../src/lib/countries.ts), [`currency.tsx`](../src/lib/currency.tsx) | Países, banderas, monedas y formato visible. |
| [`src/lib/postalCity.ts`](../src/lib/postalCity.ts) | Resolución de código postal/ciudad para formularios. |
| [`src/lib/carrierBrand.tsx`](../src/lib/carrierBrand.tsx) | Identidad visual y nombre de transportistas. |
| [`src/lib/guestQuoteSession.ts`](../src/lib/guestQuoteSession.ts) | Persistencia controlada del contexto de una cotización de invitado. |
| [`src/lib/marketplaceGuestChat.ts`](../src/lib/marketplaceGuestChat.ts) | Contexto de conversación invitado del marketplace. |
| [`src/lib/brand.tsx`](../src/lib/brand.tsx), [`supportContact.ts`](../src/lib/supportContact.ts) | Marca visible y canales de asistencia. |
| [`src/runtime/supportChannelsRuntime.ts`](../src/runtime/supportChannelsRuntime.ts) | Resolución en runtime de canales activos de soporte. |

Las traducciones están organizadas en [`src/lang/locales/`](../src/lang/locales/), [`src/lang/modules/`](../src/lang/modules/) y [`src/i18n/locales/`](../src/i18n/locales/). Los textos legales multilingües se guardan como documentos separados en `public/legal/` y se muestran mediante los componentes de términos.

## 4. Backend y API

### 4.1 Núcleo y persistencia

| Módulo | Responsabilidad |
|---|---|
| [`server.ts`](../server.ts) | API HTTP Express, middleware, sesiones/autenticación, control de rol, rutas de negocio y coordinación de servicios. |
| [`server/db/connection.ts`](../server/db/connection.ts) | Pool/conexión MySQL y configuración de acceso sin incluir secretos. |
| [`server/db/repos.ts`](../server/db/repos.ts) | Repositorios y consultas de persistencia reutilizadas por los flujos del backend. |
| [`server/docs/apiDocs.ts`](../server/docs/apiDocs.ts), [`swaggerUi.ts`](../server/docs/swaggerUi.ts) | Definición y exposición de documentación de API cuando el entorno lo permite. |
| [`server/docs/STATUS.md`](../server/docs/STATUS.md) | Estado/documentación operativa de endpoints y funcionalidades. |

El contrato de API real se determina por las rutas registradas y sus validaciones en el backend, no solo por una pantalla del frontend o por un nombre de tabla.

### 4.2 Envíos, proveedores y tracking

El backend calcula cotizaciones, crea órdenes, procesa etiquetas, guarda tracking, recibe webhooks y notifica eventos. El soporte específico de proveedores se encuentra en `server.ts`, [`server/providers/`](../server/providers/) y scripts/documentación de [`docs/providers/`](../docs/providers/). Entre las integraciones documentadas están LogiHub internacional, SpedirePro, Spediamopro, EasyPost, Genei, PaccoFacile y Contrado/Helix para POD.

[`server/providers/logihub-intl-sdk.js`](../server/providers/logihub-intl-sdk.js) encapsula el cliente internacional de LogiHub. Cada proveedor requiere credenciales, capacidad y modo de operación confirmados por entorno; una ruta presente no garantiza que una cuenta productiva esté autorizada.

### 4.3 Marketplace

El dominio se separa en:

- [`server/marketplace/routes.ts`](../server/marketplace/routes.ts): endpoints de catálogo, vendedores, ofertas, compras y operaciones marketplace.
- [`server/marketplace/repo.ts`](../server/marketplace/repo.ts): persistencia de productos, conversaciones, ofertas y órdenes.
- [`server/marketplace/types.ts`](../server/marketplace/types.ts): contratos TypeScript del dominio.
- [`server/marketplace/podRoutes.ts`](../server/marketplace/podRoutes.ts): rutas POD.
- [`server/marketplace/podSyncWorker.ts`](../server/marketplace/podSyncWorker.ts): sincronización/worker POD.

Las migraciones `V26`, `V27`, `V33`, `V40`, `V41` y `V44` cubren partes del modelo de marketplace, roles vendedores, categorías, aceptación de términos, liquidación/envío y operaciones administrativas.

### 4.4 Omnicanalidad, ventas e IA

En [`server/omnichannel/`](../server/omnichannel/) se agrupan:

- `routes.ts`: rutas HTTP.
- `service.ts`: servicio de dominio.
- `identity.ts`: identidad del agente/canal.
- `entitlements.ts`: planes y capacidades habilitadas.
- `readiness.ts`: comprobaciones de preparación.
- `agent_runtime.ts`: runtime del agente.
- `ai_tools.ts` y `ai_sales_tools.ts`: herramientas operativas y de ventas para el agente.
- `deepseek_service.ts`: integración de proveedor de IA configurada para el módulo.

Las conversaciones y operaciones permanecen limitadas al tenant/organización y al rol autorizado por el backend.

### 4.5 Pagos, billetera y liquidaciones

El flujo de pagos integra PayPal y Polar, y también mantiene rutas para billetera/saldo, transferencias y recibos según la configuración del entorno. Las migraciones `V20` a `V23`, `V32` y `V35` documentan la evolución de métodos de pago, webhooks, moneda de billetera y login OIDC de PayPal. No se deben registrar credenciales ni asumir que una captura de checkout prueba una liquidación real.

### 4.6 Correo, webmail, soporte y WhatsApp

| Módulo | Responsabilidad |
|---|---|
| [`server/services/emailService.ts`](../server/services/emailService.ts) | Envío de correo transaccional y plantillas configuradas. |
| [`server/services/webmailService.ts`](../server/services/webmailService.ts) | Acceso operativo a webmail/IMAP cuando está configurado. |
| [`server/services/contradoService.ts`](../server/services/contradoService.ts) | Integración del flujo Contrado/Helix POD. |
| [`server/admin/assistance.ts`](../server/admin/assistance.ts) | Soporte y asistencia administrativa. |
| `whatsappWebService.ts` | Conector de WhatsApp Web cuando el entorno lo habilita. |

Los tickets se guardan y se visualizan con el idioma/origen del cliente cuando esos datos están disponibles. La cola/notificación externa se considera completada solo cuando el servicio confirma el envío o el evento queda registrado como pendiente/error.

## 5. SQL, migraciones y dominios de datos

Las migraciones de [`migrations/`](../migrations/) forman el historial de evolución. Resumen por dominio:

| Migraciones | Dominio |
|---|---|
| `V1` a `V5` | Esquema base, SEO/marca, cola de etiquetas, direcciones, cotización, proveedor, wallet y diagnósticos. |
| `V6` a `V10` | IA segura, tracking/correo, cancelaciones/reembolsos y PaccoFacile sandbox. |
| `V11` a `V18` | Proveedores productivos, tracking/webhooks, reportes/finanzas, EasyPost y tiendas/órdenes. |
| `V19` a `V25` | Copilot IA, suscripciones, PayPal/Polar, transferencias, moneda/países y LogiHub internacional. |
| `V26` a `V33` | Marketplace, rol vendedor, recuperación de contraseña, SMTP, POD, notificaciones, omnicanalidad, moneda y categorías. |
| `V34` a `V39` | Hardening de seguridad, PayPal OIDC, verificación de email, bienvenida comercial, identidad omnicanal y asistencia administrativa. |
| `V40` a `V44` | Términos marketplace/omnicanal/envíos/globales y operaciones administrativas de envíos. |

Hay prefijos repetidos históricos (`V1`, `V30`, `V41`) con nombres de fichero diferentes. Antes de aplicar migraciones en un entorno se debe revisar el mecanismo de ejecución y el estado real de la base de datos; no se debe ordenar únicamente por el número del prefijo.

## 6. Legal, traducciones y assets

- `public/legal/`: documentos publicados de términos marketplace, omnichannel, envíos y términos globales.
- `public/marketing/`: imágenes y contenido comercial de omnicanalidad.
- `public/manifest.json`, `public/manifest.webmanifest`, `public/sw.js`: PWA y cache/runtime del navegador.
- `public/brand/`, `brand/`, `logos/` y archivos de raíz: iconos, logos y recursos de identidad.
- `src/lang/` y `src/i18n/`: idioma de interfaz.

Los documentos legales son fuente de contenido y los componentes de consentimiento controlan cuándo un usuario puede avanzar en un flujo que requiere aceptación. Una traducción de interfaz no debe reemplazar la versión legal aprobada.

## 7. Scripts operativos

Los scripts de raíz y [`scripts/`](../scripts/) cubren build, despliegue, backups, diagnóstico de proveedores, sincronización Matterhorn, seeds controlados, pruebas de EasyPost, sincronización Polar y verificaciones de idioma/configuración. Antes de ejecutar uno en producción se debe leer el script, confirmar el entorno/tenant y revisar si muta datos.

## 8. Roles y seguridad

El backend distingue usuarios finales, vendedores, soporte y administración. Las pantallas administrativas no constituyen por sí solas autorización: cada operación sensible debe validarse en el servidor, con tenant/usuario/rol derivado de la sesión. Entre los permisos operativos documentados se encuentran lectura/gestión de clientes, envíos y tickets; el conjunto efectivo debe verificarse en el backend y en la base de datos del entorno.

Los secretos, claves privadas, contraseñas, tokens y credenciales de proveedores quedan fuera de este repositorio. La configuración se inyecta por entorno. Los cambios de producción deben conservar backup, revisar el diff, ejecutar validaciones y comprobar el endpoint público después del reinicio.

## 9. Flujo de release

1. Revisar estado Git y alcance del cambio.
2. Validar frontend, backend, API, permisos y migraciones afectadas.
3. Ejecutar `npm run lint` y `npm run build`.
4. Crear backup antes de modificar producción.
5. Desplegar el commit autorizado y reiniciar el proceso/contenedor.
6. Confirmar `/api/version`, salud, login y el flujo real afectado.
7. Verificar proveedor/webhook/pago con una cuenta autorizada cuando aplique.
8. Registrar limitaciones: una build correcta o un HTTP 200 no demuestra por sí sola el E2E externo.

## 10. Estado de esta documentación

Esta documentación describe el código versionado y el despliegue de DoorDrop en la release `1.5.6`. Las capacidades de terceros pueden cambiar por credenciales, contrato, API, límites o estado del proveedor; por ello los documentos específicos bajo `docs/providers/`, `docs/subscriptions/`, `docs/support/`, `docs/settings/` y `docs/admin/` deben leerse junto con la configuración vigente antes de operar.
