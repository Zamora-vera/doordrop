# Ship24Go — Proveedores producción V1.4.8

## Flujo único

ParcelABC, Genei y Paccofacile deben operar bajo el mismo flujo:

- Cliente cotiza.
- Cliente crea envío.
- El envío aparece en el panel.
- Cliente pulsa **Preparar** o el cron lo toma.
- Ship24Go descuenta saldo interno.
- Ship24Go crea/compra/tramita con proveedor.
- Ship24Go guarda el PDF internamente.
- Cliente ve estado comercial y botones de etiqueta.

## Reglas por proveedor

### ParcelABC

- Cotiza por `/quote`.
- Crea envío por `/order/create`.
- Si devuelve `labelUrl`, Ship24Go descarga y guarda el PDF.
- Si la etiqueta tarda, queda en **Etiqueta en preparación** y el cron reintenta.
- Al proveedor se envía `SHIP24GO_PROVIDER_CONTACT_EMAIL`.

### Genei

- Flujo V1 recomendado.
- Para sandbox:

```env
GENEI_V1_ALLOW_REAL_CREATE=false
GENEI_V1_CREATE_FUNCTION=crear_envio_sandbox
```

- Para producción:

```env
GENEI_V1_ALLOW_REAL_CREATE=true
GENEI_V1_CREATE_FUNCTION=crear_envio
```

- Ship24Go busca etiqueta por `obtener_codigo_envio` y guarda `base64_etiqueta` o `url_etiqueta`.

### Paccofacile

- Cotiza por `/service/shipment/quote`.
- Guarda por `/service/shipment/save`.
- Compra por `/service/shipment/buy` desde botón **Preparar** o cron.
- Consulta detalle por `/service/shipment/{shipment_id}`.
- Consulta etiqueta por `/service/shipment/{shipment_id}/label`.
- En sandbox compra sin gasto real aunque `PACCOFACILE_ALLOW_REAL_BUY=false`.
- En live compra sólo con `PACCOFACILE_ALLOW_REAL_BUY=true`.
- Si el PDF no llega inmediatamente, el envío queda en **Etiqueta en preparación** y el cron reintenta.

## Producción real Paccofacile

Antes de activar live:

```env
PACCOFACILE_MODE=live
PACCOFACILE_ALLOW_REAL_BUY=true
PACCOFACILE_LIVE_BASE_URL=https://paccofacile.tecnosogima.cloud/live
PACCOFACILE_API_VERSION=v1
```

Verificar:

```bash
cd /www/wwwroot/ship24go.com
node scripts/diagnostico-proveedores-produccion-v1.4.8.js
```

## Mensajes visibles para cliente

Usar siempre textos comerciales:

- No hay datos para mostrar.
- Tu envío fue recibido.
- Etiqueta en preparación.
- Etiqueta disponible.
- Pendiente de saldo.
- No se pudo completar la operación.

Detalles técnicos sólo en logs, README o diagnóstico.
