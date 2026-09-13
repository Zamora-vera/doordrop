# Ship24Go V1.4.13 — Reportes financieros tipo Excel

## Objetivo

Agregar una vista administrativa en `/admin/reports` para revisar cada envío con formato de tabla financiera paginada.

## Qué muestra

- Fecha del envío.
- Tracking Ship24Go y tracking del operador cuando exista.
- Cliente y correo.
- Courier real.
- Servicio contratado.
- Estado del envío.
- Estado del pago.
- Precio de compra al proveedor.
- Precio de venta al cliente.
- Descuento aplicado o descuento del plan activo.
- Total pagado por el cliente.
- Ganancia esperada.
- Ganancia cobrada.
- Pérdida, cuando el pago neto queda por debajo del costo.
- Origen y destino.
- Proveedor interno para control administrativo.

## Fuente de datos

La pantalla consume la API interna:

```text
GET /api/admin/reports
```

Parámetros soportados:

```text
period=today|week|month|year|all
page=1
limit=25|50|100|200
provider=all|parcelabc|genei|paccofacile|spedirepro
status=all|active|pending|processed|delivered|cancel
search=tracking, cliente, correo o servicio
dateFrom=YYYY-MM-DD
dateTo=YYYY-MM-DD
```

## Reglas financieras

- Compra proveedor: `quotes.base_price`.
- Precio cliente: `quotes.total_amount`.
- Descuento: diferencia entre precio de lista y precio cliente, más referencia del plan activo si existe.
- Pagado cliente: cargos reales registrados en monedero o pagos asociados al envío, descontando reembolsos.
- Ganancia esperada: precio cliente menos compra proveedor.
- Ganancia cobrada: pagado cliente menos compra proveedor.
- Pérdida: cuando el pago neto registrado queda por debajo de la compra proveedor.

## Exportación

El botón `Exportar CSV` descarga la vista actual para abrirla en Excel, LibreOffice o Google Sheets.

## Pantallas afectadas

- `/admin/reports`

No cambia el flujo de cotización, preparación de envíos, etiquetas ni webhooks.
