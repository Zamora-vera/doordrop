# Ship24Go V1.4.14 — Finalización SpedirePro

## Objetivo

Corregir el flujo donde una tarifa de SpedirePro podía cotizarse, pero al crear el envío el sistema respondía como proveedor no disponible.

## Corrección principal

Se agregó `spedirepro` al flujo permitido de creación de envíos desde `/api/shipments`.

## Flujo final

1. Cliente cotiza en `/panel/quote`.
2. SpedirePro devuelve tarifas desde `/v1/get-quotes`.
3. Cliente selecciona tarifa.
4. Ship24Go crea el envío con `/v1/create-label`.
5. Ship24Go consulta detalle con `/v1/shipment`.
6. Ship24Go recupera la etiqueta con `/v1/get-label`.
7. Si la etiqueta aún no está disponible, queda pendiente y el cron reintenta.

## Reglas visuales

- El cliente ve courier real cuando existe.
- Si sólo llega broker genérico, el cliente ve Logihub.
- No se muestran credenciales ni errores internos en la UI.

## Diagnóstico

El instalador genera un archivo en:

`/www/wwwroot/ship24go.com/diagnostico/SPEDIREPRO_FIX_V1_4_14_*.md`
