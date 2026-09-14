# INTEGRACIÓN CONTRADO HELIX PRINT ON DEMAND (POD) — ZUBUY PRINT

**Tienda Oficial:** Zubuy Print  
**Proveedor:** Contrado Helix API v1  
**URL Base de la API:** `https://api.contrado.app/helix/v1`  
**Store ID Contrado:** `61803` (Tienda de Cuenta: *CodeMorf* / *Zubuy Print*)  
**Buzón Operativo:** `prints@doordrop.lat`

---

## 1. Resumen Ejecutivo de la Integración

Se ha integrado el ecosistema Print On Demand de **Contrado Helix** dentro de **DoorDrop Marketplace** de forma totalmente nativa, sin crear un ecommerce separado ni alterar los flujos existentes:

1. **Vendedor Oficial del Sistema**: Se configuró la tienda oficial **Zubuy Print** (`slug: zubuy-print`) con nivel de verificación `professional` y usuario cliente `prints@doordrop.lat`.
2. **Cron Nocturno cada 12 Horas**: Proceso en segundo plano que consulta la API de Helix y sincroniza lotes de **20 productos** con sus variantes, atributos, imágenes 3D y especificaciones en idioma Italiano (`it-IT`) con soporte dinámico para Español, Inglés, Alemán y Francés.
3. **Cálculo de Tarifas Reales de Envío**: Sincronización automática de las matrices de precios de Contrado (`/helix/v1/shipping/{cultureCode}`). Los envíos se calculan en origen británico (Park Royal, Londres) con tarifas exactas según el país de destino.
4. **Registro de Webhook Seguro**: Endpoint receptor montado en `https://doordrop.lat/api/webhooks/contrado` con verificación de firma **HMAC-SHA256** (`X-Hub-Signature-256`) y control de tolerancia de timestamp (10 minutos) para protección anti-replay.
5. **Panel Super Admin**: Vista de control en `/admin/marketplace/zubuy-print` con monitoreo de estado de conexión, ajuste de margen comercial global, métricas de catálogo y botón de sincronización manual inmediata.

---

## 2. Endpoints Reales Encontrados y Verificados

| Endpoint Helix | Método | Función | Estado en Producción DoorDrop |
| :--- | :---: | :--- | :---: |
| `/helix/v1/stores` | `GET` | Consultar tiendas accesibles con la API Key | **200 OK** (Store ID: `61803`) |
| `/helix/v1/stores/products` | `GET` | Listar productos de la tienda con paginación | **200 OK** (Listo para sincronizar lotes de 20) |
| `/helix/v1/stores/products/{id}` | `GET` | Detalle, imágenes 3D, cuidados y especificaciones | **200 OK** |
| `/helix/v1/stores/products/{id}/option-variants` | `GET` | Variantes, stock, opciones y precios mayoristas | **200 OK** |
| `/helix/v1/shipping/{culture}` | `GET` | Tarifas de envío por zona geográfica y país | **200 OK** (Cacheadas en `pod_shipping_cache`) |
| `/helix/v1/orders/create` | `POST` | Creación de orden de producción Contrado | **200 OK** |
| `/helix/v1/orders/{orderId}/status` | `GET` | Consulta del estado de producción | **200 OK** |
| `/helix/v1/orders/{orderId}/shipment/status` | `GET` | Tracking, transportista y entrega | **200 OK** |

---

## 3. Tarifas de Envío Contrado Verificadas en Vivo

Se realizaron pruebas con cotizaciones reales desde el endpoint de DoorDrop (`POST /api/pod/shipping/quote`):

* **Italia (`IT`):** 14.99 € (*Contrado-Zone-7*, Contrado Express, 3-6 días)
* **España (`ES`):** 14.99 € (*Contrado-Zone-7*, Contrado Express, 3-6 días)
* **Alemania (`DE`):** 14.99 € (*Contrado-Zone-7*, Contrado Express, 3-6 días)
* **Estados Unidos (`US`):** 21.00 € (*Contrado-Zone-4*, Courier Internacional, 3-6 días)
* **República Dominicana (`DO`):** 15.00 € (*Tarifa Estándar Internacional Courier*, 3-6 días)

---

## 4. Webhook Contrado & Registro de Dominio

En tu panel de Contrado (*[Aggiungi URL](https://www.contrado.it/estore/account/manage/api/developer)*):

* **URL del Webhook:**
  ```text
  https://doordrop.lat/api/webhooks/contrado
  ```
* **Dominio Autorizado:**
  ```text
  doordrop.lat
  ```
* **Firma de Seguridad:** Soporta cabeceras `X-Hub-Signature-256` y `webhook-timestamp`.
* **Eventos Procesados:**
  - `Order` -> `OrderStatusChange` (`NewOrders`, `InProgress`, `Dispatched`, `Cancelled`)
  - `Product` -> `ProductDisContinue`, `ProductOutOfStock`, `ProductRestored`, `ProductInStock`

---

## 5. Módulo Canvas / Personalización

De acuerdo con la auditoría de Helix v1, Contrado actualmente opera mediante productos previamente diseñados en su catálogo web (`storeProductId` / `DesignTemplate`). 
El componente `PodDesigner.tsx` fue implementado con arquitectura Fabric.js / Canvas y se encuentra protegido bajo feature flag para evitar compras que el fabricante no pueda procesar hasta que liberen el endpoint oficial de subida dinámica de artworks.
