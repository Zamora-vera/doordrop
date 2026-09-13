-- Ship24Go V1.4.20 - EasyPost API v2
-- Integra EasyPost como broker logístico normal del flujo Ship24Go.

CREATE TABLE IF NOT EXISTS webhook_events (
  id CHAR(36) PRIMARY KEY,
  provider_code VARCHAR(80) NOT NULL,
  external_id VARCHAR(191) NULL,
  event_type VARCHAR(120) NULL,
  payload_json JSON NOT NULL,
  processed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_webhook_provider_external (provider_code, external_id),
  INDEX idx_webhook_provider_created (provider_code, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO providers (id, code, name, is_active, is_connected, margin_percent, currency, config_json, last_connection_status, last_connection_message)
VALUES (
  'prv_easypost',
  'easypost',
  'EasyPost',
  1,
  0,
  20.000,
  'USD',
  JSON_OBJECT(
    'mode','test',
    'baseUrl','https://api.easypost.com/v2',
    'allowRealBuy', false,
    'publicName','Logihub',
    'primaryColor','#111827',
    'secondaryColor','#2563eb',
    'maxResults',10,
    'priority',21,
    'webhookUrl','https://ship24go.com/api/webhooks/easypost'
  ),
  'not_tested',
  'EasyPost listo para validar tarifas, etiquetas y webhook'
)
ON DUPLICATE KEY UPDATE
  is_active = 1,
  currency = 'USD',
  config_json = JSON_MERGE_PATCH(
    COALESCE(config_json, JSON_OBJECT()),
    JSON_OBJECT(
      'mode','test',
      'baseUrl','https://api.easypost.com/v2',
      'allowRealBuy', false,
      'publicName','Logihub',
      'primaryColor','#111827',
      'secondaryColor','#2563eb',
      'maxResults',10,
      'priority',21,
      'webhookUrl','https://ship24go.com/api/webhooks/easypost'
    )
  ),
  last_connection_status = CASE WHEN last_connection_status = 'failed' THEN 'not_tested' ELSE last_connection_status END,
  updated_at = NOW();

INSERT IGNORE INTO app_versions (version, name, description)
VALUES ('V1.4.20', 'EasyPost API v2', 'Integra EasyPost con cotización, compra de etiqueta, tracking, webhook, conversión USD y PUDO preparado.');

INSERT IGNORE INTO admin_settings (id, settings_json) VALUES (1, JSON_OBJECT());
UPDATE admin_settings
SET settings_json = JSON_SET(
  COALESCE(settings_json, JSON_OBJECT()),
  '$.release_version', 'V1.4.20',
  '$.release_name', 'EasyPost API v2'
)
WHERE id = 1;
