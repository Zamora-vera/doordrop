# CONTRADO HELIX API — CAPABILITIES & ARCHITECTURE MATRIX
**Proyecto:** DoorDrop — Integración Zubuy Print (Contrado Helix POD)  
**Fecha:** Septiembre 2026  
**Documentación Base Oficial:** `https://api.contrado.app/helix/docs/`  
**OpenAPI / Swagger:** `https://api.contrado.app/helix/swagger/v1/swagger.json`  
**Base URL:** `https://api.contrado.app/helix/v1`

---

## 1. Resumen de Capacidades Oficiales (SUPPORTED / NOT SUPPORTED / UNKNOWN)

A partir del análisis minucioso de la especificación OpenAPI (`swagger.json`) de Contrado Helix v1, se identifican las siguientes capacidades reales:

| Funcionalidad | Estado en Helix | Endpoint Oficial / Detalle |
| :--- | :---: | :--- |
| **Autenticación con Token Privado** | **SUPPORTED** | Header `X-API-Key: <private_token>` (Store o Account level) con `X-Store-Id: <store_id>`. |
| **Listar Tiendas (Stores)** | **SUPPORTED** | `GET /helix/v1/stores` (requiere scope `StoresRead`). |
| **Crear Tiendas vía API** | **NOT SUPPORTED** | Helix **NO** tiene endpoint `POST /stores`. Las tiendas deben crearse en el panel web de Contrado (*Contrado Store Account → My Stores*). |
| **Listar Colecciones de Tienda** | **SUPPORTED** | `GET /helix/v1/stores/collections` y `GET /helix/v1/stores/collections/{id}`. |
| **Listar Productos de Tienda** | **SUPPORTED** | `GET /helix/v1/stores/products` y `GET /helix/v1/stores/collections/{id}/products`. |
| **Detalle de Producto de Tienda** | **SUPPORTED** | `GET /helix/v1/stores/products/{storeProductId}` (devuelve `productThumb`, `productImages`, `product3dImages`, `careInstruction`, `productSpecification`, `sizeChart`, `productionTime`, `isOutOfStock`, etc.). |
| **Variantes y Opciones de Producto** | **SUPPORTED** | `GET /helix/v1/stores/products/{storeProductId}/option-variants` (devuelve `productOptions`, `productVariants`, stock, atributos). |
| **Listar Países y Provincias Soportadas** | **SUPPORTED** | `GET /helix/v1/countries`. |
| **Grupos de Precio de Envío / Tarifas Regionales** | **SUPPORTED** | `GET /helix/v1/shipping/{cultureCode}` (devuelve tarifas por grupo y región para `en-GB`, `it-IT`, `es-ES`, `de-DE`, `fr-FR`, etc.). |
| **Creación de Órdenes de Producción** | **SUPPORTED** | `POST /helix/v1/orders/create` (acepta `externalReferenceId`, `recipient`, `lineItem` con `storeProductId`, `variantId`, `selectedOptions`, `quantity`, `price`, `totalAmount`, `currencyCode`). |
| **Listado y Detalle de Órdenes** | **SUPPORTED** | `GET /helix/v1/orders` y `GET /helix/v1/orders/{orderId}`. |
| **Tracking y Estado de Envíos** | **SUPPORTED** | `GET /helix/v1/orders/{orderId}/status` y `GET /helix/v1/orders/{orderId}/shipment/status`. |
| **Webhooks Oficiales con Firma HMAC-SHA256** | **SUPPORTED** | Eventos `Order`, `Product`, `DesignTemplate`, `OptionValue` con headers `X-Hub-Signature-256` y `webhook-timestamp`. |
| **Envío / Creación de Diseños / Canvas vía API (Custom Artwork API)** | **NOT SUPPORTED / UNKNOWN** | **Helix v1 NO tiene endpoints para subir archivos de artwork, coordenadas de print areas, máscaras de corte (bleed), ni renderizar mockups al vuelo.** Helix v1 funciona exclusivamente sincronizando productos ya diseñados y guardados en tu tienda Contrado (`DesignTemplate` / `StoreProductId`). |

---

## 2. Hallazgo Crítico sobre Personalización / Canvas en Helix v1

> [!WARNING]
> **COMPROBACIÓN OFICIAL HELIX:**
> En Helix v1, los productos de la API son `storeProducts` (que corresponden internamente a `DesignTemplates` creados y guardados dentro de la tienda Contrado).
> 
> En la especificación oficial:
> 1. `POST /orders/create` **no recibe** archivos de artwork ni URLs de diseño; recibe únicamente `storeProductId`, `variantId` y `selectedOptions` (tallas, acabados, colores del producto ya diseñado en Contrado).
> 2. No existen endpoints como `/designs/create`, `/artworks/upload` o `/products/{id}/print-areas`.
> 
> **Cumplimiento de la regla del usuario:**
> *"Si después de estudiar Helix comprobamos que la API actual sólo sincroniza productos ya diseñados en Contrado y NO permite enviar un nuevo diseño/artwork desde DoorDrop: NO crear una integración falsa.*
> *En ese caso: 1. implementar catálogo, órdenes, shipping y sync; 2. dejar el módulo Canvas protegido por feature flag; 3. documentar exactamente qué falta para habilitarlo; 4. no permitir al cliente comprar una personalización que Contrado no pueda fabricar."*

Por lo tanto:
- Desarrollaremos el componente `PodDesigner.tsx` con Fabric.js/Canvas estructurado y preparado, pero quedará protegido bajo la feature flag `CANVAS_ENABLED = false` o `POD_CANVAS_MODE = 'preview_only'` hasta que Contrado libere su API de artwork dinámico.
- En el marketplace, **Zubuy Print** presentará los productos POD oficiales del catálogo sincronizado de Contrado, permitiendo seleccionar variantes, tallas, consultar tablas de medidas, tiempos de producción, calcular el envío real por país/región (`/helix/v1/shipping/{culture}`), pagar con el Wallet de DoorDrop y despachar la orden a Contrado (`/helix/v1/orders/create`).

---

## 3. Arquitectura de Integración en DoorDrop

```
┌─────────────────────────────────────────────────────────────┐
│                       CONTRADO HELIX API                    │
│            https://api.contrado.app/helix/v1                 │
│              (Store: Zubuy Print / Account)                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
               Sync / Orders / Shipping / Webhooks
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    DOORDROP BACKEND                         │
│  - server/services/contradoService.ts (Cliente Helix)       │
│  - server/marketplace/podRoutes.ts (APIs Zubuy Print)       │
│  - server/marketplace/podSyncWorker.ts (Cron catálogo)      │
│  - Webhook: POST /api/webhooks/contrado (HMAC-SHA256)       │
│  - System Seller: slug 'zubuy-print' (Marketplace Seller)   │
│  - Ledger Wallet: 'pod_purchase', 'pod_refund'              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    DOORDROP FRONTEND                        │
│  - Tienda Oficial: /marketplace/sellers/zubuy-print         │
│  - Vista Producto POD: /marketplace/listings/:slug          │
│    (Selector variantes, size chart, badges POD, mockup)     │
│  - Admin Panel: /admin/marketplace/zubuy-print              │
│    (Conexión, catálogo sincronizado, márgenes, órdenes)     │
│  - Multimoneda (EUR, USD, DOP, GBP) e i18n (es, it, en, de) │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Correo Operativo: `prints@doordrop.lat`
- En el VPS verificamos que el correo de DoorDrop se gestiona centralmente mediante relay SMTP externo (Amazon SES a través de Truobox). No hay servidor IMAP/Postfix local expuesto para aprovisionamiento directo por terminal.
- El buzón/alias `prints@doordrop.lat` debe ser dado de alta en la consola de Truobox / proveedor DNS del dominio.
- En el código de DoorDrop se dejará configurado como `POD_OPERATIONS_EMAIL = process.env.POD_OPERATIONS_EMAIL || 'prints@doordrop.lat'`.
