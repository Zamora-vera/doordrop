# FLUJO OPERATIVO Y TÉCNICO: ZUBUY PRINT / CONTRADO HELIX POD

**Proveedor Oficial:** Contrado Helix API v1  
**Tienda en DoorDrop:** Zubuy Print (`/marketplace/sellers/zubuy-print`)  
**Store ID Contrado:** `61803`  
**Moneda Base:** EUR  
**Idiomas Soportados:** Italiano (`it-IT`), Español (`es-ES`), Inglés (`en-GB`), Alemán (`de-DE`), Francés (`fr-FR`)

---

## 1. Arquitectura de Cuentas y Roles

```
┌─────────────────────────────────────────────────────────────┐
│                    DOORDROP DATABASE                        │
│                                                             │
│  User: prints@doordrop.lat (Role: customer, is_seller: 1)   │
│         ↓                                                   │
│  Seller Profile: Zubuy Print (slug: zubuy-print)            │
│         ↓                                                   │
│  Listings POD: provider='contrado', listing_type='pod'      │
│         ↓                                                   │
│  Shipping: pod_shipping_cache (Tarifas oficiales Contrado)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Flujo de Sincronización Automática (Cron 12h)

1. El worker `PodSyncWorker` se ejecuta al inicio del servidor y programa un intervalo cíclico cada **12 horas**.
2. Consulta `GET /helix/v1/stores/products?PageNumber=1&PageSize=20` usando la cabecera `X-Store-Id: 61803`.
3. Para cada producto:
   - Consulta el detalle `GET /helix/v1/stores/products/{id}` para extraer imágenes en alta resolución y modelos 3D (`product3dImages`).
   - Consulta variantes y opciones de tallas/colores `GET /helix/v1/stores/products/{id}/option-variants`.
   - Aplica el margen configurado en Super Admin (por defecto **35%**) sobre el coste del fabricante:
     $$\text{Precio Venta} = \text{Coste Mayorista} \times (1 + \text{Margen} / 100)$$
   - Actualiza o inserta en `marketplace_listings`, `pod_products` y `pod_product_variants` sin duplicar registros.
4. Actualiza la fecha de próxima ejecución en `contrado_settings`.

---

## 3. Flujo de Compra y Producción

1. **Selección del Producto**:
   El comprador accede a `/marketplace/listings/{slug}` (marcado con el badge *Fabbricato su ordinazione* / *Fabricado bajo pedido*).
2. **Variantes y Opciones**:
   Selecciona talla, material o acabado según las opciones sincronizadas de Contrado.
3. **Cotización de Envío Real**:
   Al ingresar el país de destino (Italia, España, Alemania, USA, República Dominicana, etc.), DoorDrop consulta la tabla `pod_shipping_cache` sincronizada desde `/helix/v1/shipping/it-IT`.
4. **Pago con Wallet**:
   El comprador confirma el pedido con el saldo de su Wallet de DoorDrop.
   - Se genera el registro contable en DoorDrop.
5. **Despacho a Contrado**:
   DoorDrop llama a `POST /helix/v1/orders/create` enviando:
   - `externalReferenceId`: Código de orden de DoorDrop.
   - `recipient`: Dirección de entrega del cliente.
   - `lineItem`: ID de producto, ID de variante y opciones seleccionadas.
   - `currencyCode`: `EUR`.
6. **Seguimiento & Webhook**:
   Cuando Contrado comienza la fabricación o despacha el paquete con el transportista, envía un webhook a `https://doordrop.lat/api/webhooks/contrado`. DoorDrop actualiza automáticamente el estado y el tracking number.
