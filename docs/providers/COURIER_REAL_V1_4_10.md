# Courier real en cotizaciones y envíos — V1.4.10

## Objetivo

Mostrar el courier operativo real en todas las tarifas y envíos sin romper la marca blanca comercial.

## Comportamiento esperado

- Marca pública visible: `Logihub`.
- Courier visible: UPS, Poste Italiane, SDA, BRT, InPost, DHL, GLS, Correos, SEUR, FedEx, etc.
- Proveedor interno no visible para el cliente: Paccofacile, SpedirePro, Genei o ParcelABC.

## Pantallas tocadas

- `/panel/quote`
  - Badge superior con courier real.
  - Texto `Courier real: ...`.
  - Servicio real de la tarifa.

- `/panel/shipments`
  - Nueva columna `Courier` con courier real y marca pública.

- `/admin/shipments`
  - Detección más robusta del courier desde payload del proveedor y cotización guardada.

## Diagnóstico

Después de instalar, cotizar una ruta Italia → Italia y confirmar que las tarjetas muestran couriers reales distintos cuando el proveedor devuelve opciones diferentes.
