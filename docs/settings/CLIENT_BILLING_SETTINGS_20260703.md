# Configuración de cliente, moneda y facturación

## Cambio aplicado

La moneda ya no se decide manualmente dentro del formulario de cotización. El cotizador usa la moneda predeterminada guardada en la cuenta del cliente.

## Pantallas afectadas

- `/panel/settings`: el cliente configura datos de facturación, moneda predeterminada y método preferido de pago.
- `/panel/quote`: muestra la moneda de la cuenta y enlaza a configuración para cambiarla.
- Header del panel: muestra la moneda de la cuenta y el saldo en esa moneda.

## Datos guardados

En `users`:

- `currency`
- `country`
- `phone`
- `business_type`
- `preferred_payment_method`

En `companies`:

- `company_name`
- `email`
- `phone`
- `address`
- `city`
- `zip_code`
- `country`

## Endpoint nuevo

`POST /api/user/settings`

Actualiza configuración comercial del cliente y crea o actualiza sus datos de facturación.

## Regla de negocio

- Wallet: saldo exacto en la moneda del cliente.
- Cotización: toma la moneda del cliente.
- Método preferido: se guarda para el flujo de pago, sin pedir al cliente repetir datos cada vez.
