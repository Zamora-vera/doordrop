-- Ship24Go V1.4.1 - Solicitudes de cancelación con aprobación y reembolso manual
CREATE TABLE IF NOT EXISTS cancellation_requests (
  id CHAR(36) PRIMARY KEY,
  shipment_id CHAR(36) NOT NULL,
  ticket_id CHAR(36) NULL,
  user_id CHAR(36) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  status VARCHAR(40) NOT NULL DEFAULT 'pending_review',
  reason TEXT NULL,
  admin_note TEXT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  reviewed_by CHAR(36) NULL,
  refund_transaction_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cancellation_request_shipment (shipment_id),
  INDEX idx_cancellation_requests_user_status (user_id, status),
  INDEX idx_cancellation_requests_ticket (ticket_id),
  INDEX idx_cancellation_requests_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
