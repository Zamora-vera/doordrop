-- Ship24Go V1.4.34 — Suscripciones, Polar, PayPal, wallet y reportes comerciales
-- Preparación segura: no guarda credenciales; sólo agrega columnas y estado comercial.

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS paypalEnvironment VARCHAR(30) NULL DEFAULT 'sandbox';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS paypalWebhookId VARCHAR(255) NULL;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS paypalWebhookSecret VARCHAR(255) NULL;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS paypalWebhookUrl VARCHAR(255) NULL;

ALTER TABLE plans ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(30) NOT NULL DEFAULT 'month';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS polar_product_id VARCHAR(255) NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS polar_price_id VARCHAR(255) NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS polar_sync_status VARCHAR(30) NOT NULL DEFAULT 'pending';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS polar_last_synced_at DATETIME NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS paypal_product_id VARCHAR(255) NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS paypal_plan_id VARCHAR(255) NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS paypal_sync_status VARCHAR(30) NOT NULL DEFAULT 'pending';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS paypal_last_synced_at DATETIME NULL;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS plan_id CHAR(36) NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS subscription_id CHAR(36) NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS purpose VARCHAR(80) NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata_json JSON NULL;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS external_customer_id VARCHAR(191) NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS metadata_json JSON NULL;

ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS processed_status VARCHAR(30) NULL;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(191) NULL;

UPDATE plans SET currency = 'USD' WHERE currency <> 'USD';
UPDATE plans SET billing_interval = 'month' WHERE billing_interval IS NULL OR billing_interval = '';
UPDATE api_keys SET paypalEnvironment = COALESCE(NULLIF(paypalEnvironment, ''), 'sandbox'), paypalWebhookUrl = COALESCE(NULLIF(paypalWebhookUrl, ''), 'https://ship24go.com/api/webhooks/paypal') WHERE id = 1;
UPDATE api_keys SET polarEnvironment = COALESCE(NULLIF(polarEnvironment, ''), 'sandbox'), polarWebhookUrl = COALESCE(NULLIF(polarWebhookUrl, ''), 'https://ship24go.com/api/webhooks/polar') WHERE id = 1;

INSERT IGNORE INTO app_versions (version, name, description)
VALUES ('V1.4.34', 'Suscripciones Polar PayPal Wallet', 'Planes en USD, preparación de credenciales en Super Admin, webhooks Polar/PayPal, pagos de suscripción con wallet y sincronización de IDs externos.');

UPDATE admin_settings
SET settings_json = JSON_SET(
  COALESCE(settings_json, JSON_OBJECT()),
  '$.release_version', 'V1.4.34',
  '$.release_name', 'Suscripciones Polar PayPal Wallet'
)
WHERE id = 1;
