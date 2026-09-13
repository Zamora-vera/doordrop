-- Ship24Go V1.3.3
-- Ajustes seguros para monedero, tiempos de entrega, diagnóstico y reintentos de etiqueta.

SET @db_name := DATABASE();

SET @stmt := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'wallet_topups' AND COLUMN_NAME = 'payment_provider') = 0,
  'ALTER TABLE wallet_topups ADD COLUMN payment_provider VARCHAR(80) NULL AFTER status',
  'SELECT 1'
);
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'wallet_topups' AND COLUMN_NAME = 'provider_reference') = 0,
  'ALTER TABLE wallet_topups ADD COLUMN provider_reference VARCHAR(191) NULL AFTER payment_provider',
  'SELECT 1'
);
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'wallet_transactions' AND COLUMN_NAME = 'status') = 0,
  'ALTER TABLE wallet_transactions ADD COLUMN status VARCHAR(30) NULL AFTER reference_id',
  'SELECT 1'
);
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE shipment_addresses
SET email = 'cliente@ship24go.com'
WHERE (email IS NULL OR email = '')
  AND shipment_id IN (
    SELECT id FROM shipments WHERE provider_code = 'parcelabc' AND label_url IS NULL
  );

UPDATE shipments
SET sender_json = JSON_SET(COALESCE(sender_json, JSON_OBJECT()), '$.email', 'cliente@ship24go.com')
WHERE provider_code = 'parcelabc'
  AND label_url IS NULL
  AND (JSON_UNQUOTE(JSON_EXTRACT(COALESCE(sender_json, JSON_OBJECT()), '$.email')) IS NULL
       OR JSON_UNQUOTE(JSON_EXTRACT(COALESCE(sender_json, JSON_OBJECT()), '$.email')) = '');

UPDATE shipments
SET recipient_json = JSON_SET(COALESCE(recipient_json, JSON_OBJECT()), '$.email', 'cliente@ship24go.com')
WHERE provider_code = 'parcelabc'
  AND label_url IS NULL
  AND (JSON_UNQUOTE(JSON_EXTRACT(COALESCE(recipient_json, JSON_OBJECT()), '$.email')) IS NULL
       OR JSON_UNQUOTE(JSON_EXTRACT(COALESCE(recipient_json, JSON_OBJECT()), '$.email')) = '');

UPDATE shipment_processing_jobs j
JOIN shipments s ON s.id = j.shipment_id
SET j.status = 'pending',
    j.next_run_at = NOW(),
    j.last_message = 'Preparando etiqueta.',
    j.updated_at = NOW()
WHERE s.provider_code = 'parcelabc'
  AND s.label_url IS NULL
  AND (s.label_error LIKE '%Correo electrónico no puede ser nulo%' OR s.label_error IS NULL OR s.label_error = '');

UPDATE shipments
SET label_error = NULL,
    status = IF(status IN ('draft','pending_customer_balance'), status, 'pending_provider'),
    status_label = IF(status IN ('draft','pending_customer_balance'), status_label, 'Preparando etiqueta'),
    updated_at = NOW()
WHERE provider_code = 'parcelabc'
  AND label_url IS NULL
  AND label_error LIKE '%Correo electrónico no puede ser nulo%';
