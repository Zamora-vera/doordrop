# Ship24Go V1.4.36 — Suscripciones, PayPal, Polar y Wallet

## Cambios

- Cliente: `/panel/settings` muestra wallet, transferencia bancaria y planes de suscripción.
- Cliente: activación de plan con wallet, Polar o PayPal.
- Super Admin: `/admin/plans` permite activar métodos por plan y sincronizar IDs de Polar/PayPal.
- Super Admin: `/admin/settings` permite activar métodos globales y crear webhooks de Polar/PayPal.
- Backend: webhook PayPal agregado en `/api/webhooks/paypal`.
- Backend: endpoints de suscripción con wallet, Polar y PayPal.
- Migración segura para MySQL antiguo.

## Nota operativa

Primero guarda credenciales en `/admin/settings`, luego sincroniza planes en `/admin/plans`.
