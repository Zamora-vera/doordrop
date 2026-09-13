-- Ship24Go V1.4.8 - flujo único de proveedores en producción
-- Ejecutar una vez después de subir el ZIP.

CREATE TABLE IF NOT EXISTS shipment_processing_jobs (
  id CHAR(36) PRIMARY KEY,
  shipment_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  job_type VARCHAR(60) NOT NULL DEFAULT 'provider_create',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 200,
  last_message VARCHAR(255) NULL,
  next_run_at DATETIME NULL,
  locked_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_jobs_status_next (status, next_run_at),
  INDEX idx_jobs_shipment (shipment_id),
  INDEX idx_jobs_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipments' AND COLUMN_NAME = 'label_status') = 0,
  'ALTER TABLE shipments ADD COLUMN label_status VARCHAR(50) NOT NULL DEFAULT ''pending''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipments' AND COLUMN_NAME = 'label_error') = 0,
  'ALTER TABLE shipments ADD COLUMN label_error TEXT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipments' AND COLUMN_NAME = 'provider_attempts') = 0,
  'ALTER TABLE shipments ADD COLUMN provider_attempts INT NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipments' AND COLUMN_NAME = 'last_provider_attempt_at') = 0,
  'ALTER TABLE shipments ADD COLUMN last_provider_attempt_at DATETIME NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE shipments
SET label_status = CASE
  WHEN label_base64 IS NOT NULL AND label_base64 <> '' THEN 'stored'
  WHEN label_url IS NOT NULL AND label_url <> '' THEN 'available'
  ELSE 'pending'
END
WHERE label_status IS NULL OR label_status = '';

INSERT INTO shipment_processing_jobs (id, shipment_id, user_id, job_type, status, last_message, next_run_at)
SELECT CONCAT('job_', REPLACE(UUID(), '-', '')), s.id, s.user_id,
       CASE WHEN s.status = 'pending_customer_balance' THEN 'payment_manifest' ELSE 'label_fetch' END,
       'pending',
       CASE WHEN s.status = 'pending_customer_balance' THEN 'Pendiente de saldo.' ELSE 'Etiqueta en preparación.' END,
       NOW()
FROM shipments s
LEFT JOIN shipment_processing_jobs j
  ON j.shipment_id = s.id
 AND j.job_type IN ('payment_manifest','provider_create','label_fetch')
 AND j.status IN ('pending','running')
WHERE s.provider_code IN ('parcelabc','genei','paccofacile')
  AND (s.label_base64 IS NULL OR s.label_base64 = '')
  AND (s.status IN ('pending_provider','pending_label','pending_customer_balance') OR s.label_status = 'pending')
  AND j.id IS NULL;

INSERT IGNORE INTO app_versions (version, name, description)
VALUES ('V1.4.8', 'Proveedores en flujo único', 'ParcelABC, Genei y Paccofacile quedan bajo el mismo flujo de preparación, reintento automático, saldo interno, etiqueta y tracking.');

INSERT IGNORE INTO admin_settings (id, settings_json) VALUES (1, JSON_OBJECT());

UPDATE admin_settings
SET settings_json = JSON_SET(
  COALESCE(settings_json, JSON_OBJECT()),
  '$.release_version', 'V1.4.8',
  '$.release_name', 'Proveedores en flujo único'
)
WHERE id = 1;
