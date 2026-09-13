# Ship24Go V1.4.34 — Suscripciones Polar, PayPal, Wallet

## Objetivo

Preparar el sistema comercial SaaS sin romper el flujo actual de envíos, cotizaciones, tickets, EasyPost ni Copilot.

## Incluye

- Planes base en USD desde `/admin/plans`.
- Campos de sincronización Polar por plan.
- Campos de sincronización PayPal por plan.
- Configuración PayPal en `/admin/settings`.
- Configuración Polar en `/admin/settings`.
- Webhook PayPal: `/api/webhooks/paypal`.
- Webhook Polar: `/api/webhooks/polar`.
- Pago de suscripción con wallet.
- Checkout de suscripción con Polar.
- Checkout de suscripción con PayPal/tarjeta.
- Reportes administrativos con resumen de suscripciones y wallet.

## Librerías sugeridas

```bash
npm install @polar-sh/sdk@^0.48.1 @paypal/paypal-server-sdk@latest --save
```

La integración actual usa REST seguro desde backend para mantener compatibilidad con el código existente, pero las librerías quedan instaladas para futuras ampliaciones.

## Configuración en Super Admin

1. Entrar en `/admin/settings`.
2. Pegar credenciales Polar.
3. Pegar credenciales PayPal.
4. Seleccionar ambiente sandbox o producción.
5. Guardar.
6. Crear webhook PayPal.
7. Crear webhook Polar.
8. Sincronizar planes Polar.
9. Sincronizar planes PayPal.

## Planes

Los planes se editan desde `/admin/plans` con precio base en USD.

Cada plan puede guardar:

- Polar Product ID.
- PayPal Product ID.
- PayPal Plan ID.
- Frecuencia mensual o anual.
- Descuento global.
- Estado activo o pausado.

## Wallet

El cliente puede pagar una suscripción usando su saldo disponible. El sistema descuenta la wallet, registra el pago y activa la suscripción.

## PayPal tarjeta

PayPal se usa para abrir checkout de suscripción. Permite pagar con tarjeta cuando el método está disponible para el país/cuenta del comprador.

## Seguridad

- Las claves no se muestran al cliente.
- Los webhooks guardan eventos para revisión.
- Los pagos internos quedan ligados a usuario, plan y proveedor.
- La UI muestra mensajes comerciales, no detalles internos.
