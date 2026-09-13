# SpedirePro en Ship24Go V1.4.9

## Flujo comercial

SpedirePro queda integrado como proveedor normal del flujo Ship24Go:

1. Cliente cotiza desde `/panel/quote`.
2. Cliente crea el envío.
3. El envío aparece en `/panel/shipments`.
4. El cliente pulsa **Preparar** o el cron lo procesa.
5. Ship24Go descuenta saldo interno del cliente.
6. Ship24Go compra/tramita la etiqueta con SpedirePro.
7. Ship24Go guarda referencia, tracking, etiqueta y estado.
8. Cliente ve “Etiqueta lista” o “Etiqueta en preparación”.

## Variables

```env
SPEDIREPRO_BASE_URL=https://www.spedirepro.com/public-api
SPEDIREPRO_API_KEY=...
SPEDIREPRO_ALLOW_REAL_BUY=true
```

## Webhook

URL recomendada en SpedirePro:

```text
https://ship24go.com/api/webhooks/spedirepro
```

Eventos soportados:

- Spedizione creata
- Aggiornamenti spedizione
- Esito prenotazione pickup contestuale

## Saldos

`/admin/providers` consulta el saldo del proveedor y lo presenta de forma comercial en la tarjeta del proveedor.

## Diagnóstico

El instalador genera:

```text
/www/wwwroot/ship24go.com/diagnostico/PROVEEDORES_PRODUCCION_V149_*.md
```

Ese archivo incluye variables activas enmascaradas, proveedores, últimos envíos, trabajos, webhooks y logs recientes.
