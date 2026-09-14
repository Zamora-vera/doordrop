-- =============================================================================
-- V31 — DoorDrop Omnicanal: catálogo y entitlements respaldados por Polar
-- =============================================================================

ALTER TABLE omnichannel_subscriptions
  ADD COLUMN IF NOT EXISTS provider VARCHAR(40) NULL AFTER status,
  ADD COLUMN IF NOT EXISTS provider_subscription_id VARCHAR(190) NULL AFTER provider,
  ADD COLUMN IF NOT EXISTS provider_customer_id VARCHAR(190) NULL AFTER provider_subscription_id,
  ADD COLUMN IF NOT EXISTS polar_product_id VARCHAR(190) NULL AFTER provider_customer_id,
  ADD COLUMN IF NOT EXISTS current_period_start DATETIME NULL AFTER renews_at,
  ADD COLUMN IF NOT EXISTS current_period_end DATETIME NULL AFTER current_period_start,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0 AFTER current_period_end,
  ADD COLUMN IF NOT EXISTS last_payment_status VARCHAR(40) NULL AFTER cancel_at_period_end,
  ADD COLUMN IF NOT EXISTS last_provider_event_id VARCHAR(190) NULL AFTER last_payment_status,
  ADD COLUMN IF NOT EXISTS metadata_json LONGTEXT NULL AFTER last_provider_event_id,
  ADD INDEX IF NOT EXISTS idx_omni_provider_subscription (provider, provider_subscription_id),
  ADD INDEX IF NOT EXISTS idx_omni_provider_status (provider, status);

CREATE TABLE IF NOT EXISTS omnichannel_plan_catalog (
  id VARCHAR(80) PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  billing_interval VARCHAR(20) NOT NULL DEFAULT 'month',
  channels_limit INT NOT NULL DEFAULT 1,
  included_platforms_json LONGTEXT NOT NULL,
  features_json LONGTEXT NOT NULL,
  polar_product_id VARCHAR(190) NULL,
  polar_price_id VARCHAR(190) NULL,
  polar_enabled TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_omni_plan_code (code),
  KEY idx_omni_plan_active (is_active, polar_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS omnichannel_addon_catalog (
  id VARCHAR(80) PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  billing_interval VARCHAR(20) NOT NULL DEFAULT 'month',
  polar_product_id VARCHAR(190) NULL,
  polar_price_id VARCHAR(190) NULL,
  polar_enabled TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_omni_addon_code (code),
  KEY idx_omni_addon_active (is_active, polar_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO omnichannel_plan_catalog
  (id, code, name, description, price, currency, billing_interval, channels_limit, included_platforms_json, features_json)
VALUES
  ('omni_plan_whatsapp', 'whatsapp', 'WhatsApp Dedicated', 'Un canal WhatsApp dedicado con bandeja y empleado AI.', 10.99, 'USD', 'month', 1,
   '["whatsapp"]',
   '["1 canal WhatsApp dedicado","Bandeja de conversaciones unificada","Gestión de contactos y clientes","Empleado AI disponible 24/7 (DeepSeek)","Conocimiento del negocio y FAQs ilimitadas","Control total y traspaso a humano en DoorDrop","Mensajes ilimitados"]'),
  ('omni_plan_duo', 'duo', 'DoorDrop Duo', 'WhatsApp y un canal adicional a elección.', 19.99, 'USD', 'month', 2,
   '["whatsapp","instagram | facebook | telegram"]',
   '["WhatsApp + 1 canal a elección del cliente","Bandeja omnicanal combinada","Empleado AI en ambos canales (DeepSeek)","Historial de pedidos y tracking conectado","Filtros inteligentes y etiquetas","Mensajes ilimitados"]'),
  ('omni_plan_omni3', 'omni3', 'DoorDrop Omni 3', 'WhatsApp, Instagram y Facebook en una sola bandeja.', 27.99, 'USD', 'month', 3,
   '["whatsapp","instagram","facebook"]',
   '["WhatsApp + Instagram + Facebook incluidos","Empleado AI multicanal sincronizado (DeepSeek)","Soporte prioritario DoorDrop","Cotizador de envíos y catálogo integrado","Respuestas rápidas y notas internas","Mensajes ilimitados"]')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  price = VALUES(price),
  currency = VALUES(currency),
  billing_interval = VALUES(billing_interval),
  channels_limit = VALUES(channels_limit),
  included_platforms_json = VALUES(included_platforms_json),
  features_json = VALUES(features_json),
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO omnichannel_addon_catalog
  (id, code, name, description, price, currency, billing_interval)
VALUES
  ('omni_addon_extra_channel', 'extra_channel', 'Canal adicional', 'Suma una red social adicional a la suscripción.', 8.00, 'USD', 'month'),
  ('omni_addon_comment_automation', 'comment_automation', 'Comment-to-DM Automation', 'Convierte comentarios de publicaciones en conversaciones y ventas por DM.', 2.20, 'USD', 'month'),
  ('omni_addon_auto_publish', 'auto_publish', 'Auto-Publishing Multicanal', 'Programa publicaciones y promociones en las redes conectadas.', 2.20, 'USD', 'month')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  price = VALUES(price),
  currency = VALUES(currency),
  billing_interval = VALUES(billing_interval),
  updated_at = CURRENT_TIMESTAMP;

-- Conserva todo el historial, pero evita que una activación antigua sin pago
-- siga otorgando acceso como si Polar la hubiera confirmado.
UPDATE omnichannel_subscriptions
SET provider = 'legacy',
    status = 'legacy_unverified',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'active'
  AND (provider IS NULL OR provider = '')
  AND (provider_subscription_id IS NULL OR provider_subscription_id = '');
