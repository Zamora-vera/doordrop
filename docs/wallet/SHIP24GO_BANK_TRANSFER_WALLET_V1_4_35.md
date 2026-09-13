# Ship24Go V1.4.35 — Bancos, transferencias y comprobantes de wallet

## Alcance

Esta versión agrega un flujo completo para recargas de wallet por transferencia bancaria, sin romper envíos, cotizaciones, EasyPost, tickets, Copilot ni suscripciones existentes.

## Super Admin

Nueva ruta:

- `/admin/banks`

Incluye:

- Bancos por moneda.
- Cuentas Wise EUR, Wise GBP, Wise USD y Banco BHD DOP precargadas.
- Activar o desactivar cuentas bancarias.
- Ver comprobantes de pago enviados por clientes.
- Aprobar comprobante y acreditar saldo automáticamente.
- Marcar comprobante para revisión.
- Ajustar saldo por cliente: acreditar, descontar o fijar saldo.

## Cliente

Nueva ruta:

- `/panel/settings/wallet`

Incluye:

- Muestra cuentas bancarias según moneda del cliente.
- Permite indicar monto transferido.
- Permite referencia del pago.
- Permite subir comprobante en imagen o PDF.
- El saldo queda pendiente hasta revisión del Super Admin.

## Idiomas

Textos agregados en el sistema i18n para:

- Español
- Inglés
- Italiano
- Francés
- Alemán
- Chino

## Base de datos

Nueva migración:

- `migrations/V21__bank_transfer_wallet_receipts_v1435.sql`

Tablas nuevas:

- `bank_accounts`
- `payment_receipts`

Columnas compatibles agregadas:

- `wallet_topups.receipt_id`
- `wallet_topups.proof_url`
- `wallet_transactions.admin_note`

## Endpoints

Cliente:

- `GET /api/bank-accounts`
- `POST /api/user/wallet/transfer-proof`

Super Admin:

- `GET /api/admin/bank-accounts`
- `POST /api/admin/bank-accounts`
- `GET /api/admin/payment-receipts`
- `POST /api/admin/payment-receipts/:id/approve`
- `POST /api/admin/payment-receipts/:id/reject`
- `POST /api/admin/clients/:id/adjust-balance`

## Notas

Los datos bancarios fueron cargados como cuentas administrables desde Super Admin. El cliente sólo ve cuentas activas y compatibles con su moneda.
