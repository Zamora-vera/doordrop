-- Ship24Go V1.3.1 - dirección sugerida, número cívico y preparación con saldo pendiente
-- Ejecutar una vez después de subir esta versión.

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'address_book' AND COLUMN_NAME = 'civic_number') = 0,
  'ALTER TABLE address_book ADD COLUMN civic_number VARCHAR(30) NULL AFTER address',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'address_book' AND COLUMN_NAME = 'formatted_address') = 0,
  'ALTER TABLE address_book ADD COLUMN formatted_address VARCHAR(255) NULL AFTER civic_number',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'address_book' AND COLUMN_NAME = 'google_place_id') = 0,
  'ALTER TABLE address_book ADD COLUMN google_place_id VARCHAR(191) NULL AFTER formatted_address',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment_addresses' AND COLUMN_NAME = 'civic_number') = 0,
  'ALTER TABLE shipment_addresses ADD COLUMN civic_number VARCHAR(30) NULL AFTER address',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment_addresses' AND COLUMN_NAME = 'formatted_address') = 0,
  'ALTER TABLE shipment_addresses ADD COLUMN formatted_address VARCHAR(255) NULL AFTER civic_number',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment_addresses' AND COLUMN_NAME = 'google_place_id') = 0,
  'ALTER TABLE shipment_addresses ADD COLUMN google_place_id VARCHAR(191) NULL AFTER formatted_address',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE address_book
SET formatted_address = COALESCE(formatted_address, address)
WHERE formatted_address IS NULL AND address IS NOT NULL;

UPDATE shipments
SET status_label = 'Pendiente de saldo'
WHERE status IN ('pendiente_pago', 'pending_customer_balance')
  AND (label_url IS NULL OR label_url = '')
  AND (label_base64 IS NULL OR label_base64 = '');

UPDATE shipments
SET status = 'pending_customer_balance'
WHERE status = 'pendiente_pago'
  AND (label_url IS NULL OR label_url = '')
  AND (label_base64 IS NULL OR label_base64 = '');

INSERT IGNORE INTO app_versions (version, name, description)
VALUES ('V1.3.1', 'Direcciones verificadas y saldo pendiente', 'Envía la solicitud a preparación aunque el cliente no tenga saldo, guarda dirección sugerida y número cívico, y genera la etiqueta automáticamente al recargar.');

INSERT IGNORE INTO admin_settings (id, settings_json) VALUES (1, JSON_OBJECT());

UPDATE admin_settings
SET settings_json = JSON_SET(
  COALESCE(settings_json, JSON_OBJECT()),
  '$.release_version', 'V1.3.1',
  '$.release_name', 'Direcciones verificadas y saldo pendiente'
)
WHERE id = 1;
