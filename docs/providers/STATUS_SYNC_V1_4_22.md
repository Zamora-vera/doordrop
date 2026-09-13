# Sincronización de estados V1.4.22

Esta versión agrega un flujo común para actualizar estados en todos los proveedores.

## Flujo

1. El proveedor puede enviar webhook cuando lo soporte.
2. El cron de Ship24Go revisa envíos recientes no finalizados.
3. Cada proveedor responde con su tracking/estado.
4. Ship24Go normaliza el estado a una etiqueta comercial.
5. El cliente ve el estado en `/tracking` y `/panel/shipments`.
6. El admin puede revisar actividad y ejecutar actualización manual.

## Estados comerciales

- `tramitado` → Etiqueta lista / Tramitado
- `en_transito` → En tránsito
- `en_reparto` → En reparto
- `entregado` → Entregado
- `incidencia` → Incidencia
- `devuelto` → Devuelto
- `cancelado` → Cancelado

## Proveedores

- Genei: tracking por código Genei.
- ParcelABC: tracking por parcelCode/orderNumber.
- Paccofacile: detalle shipment y label/tracking si aparece.
- SpedirePro: webhook + tracking.
- SpediamoPro: shipment + tracking API.
- EasyPost: tracker/webhook + shipment detail.

## Recomendación cron

Cada 15 minutos.

```bash
curl -fsS "https://ship24go.com/api/cron/shipments/status?key=TU_CRON_KEY" >/dev/null 2>&1
```
