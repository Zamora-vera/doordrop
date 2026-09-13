-- Ship24Go V1.3.9 - Estado, email y tracking público
CREATE TABLE IF NOT EXISTS email_logs (
  id CHAR(36) PRIMARY KEY,
  shipment_id CHAR(36) NULL,
  user_id CHAR(36) NULL,
  to_email VARCHAR(191) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'es',
  event_code VARCHAR(80) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  provider_code VARCHAR(80) NULL,
  message_id VARCHAR(191) NULL,
  error_message TEXT NULL,
  payload_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  INDEX idx_email_logs_shipment (shipment_id, event_code),
  INDEX idx_email_logs_created (created_at),
  UNIQUE KEY uq_email_shipment_event_to (shipment_id, event_code, to_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
