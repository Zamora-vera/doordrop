-- Ship24Go V1.4.15 - SpedirePro webhooks, tracking y movimientos
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

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS reference VARCHAR(191) NULL;
ALTER TABLE shipments ADD INDEX IF NOT EXISTS idx_shipments_reference (reference);
ALTER TABLE shipments ADD INDEX IF NOT EXISTS idx_shipments_provider_tracking (provider_code, provider_tracking_code);

INSERT IGNORE INTO app_versions (version, name, description)
VALUES ('V1.4.15', 'SpedirePro Webhooks y Tracking', 'Agrega panel de webhooks, movimientos de saldo y tracking público actualizado por eventos SpedirePro.');
