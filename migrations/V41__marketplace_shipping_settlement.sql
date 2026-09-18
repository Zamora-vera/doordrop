-- Marketplace checkout, real shipment preparation and delayed PayPal settlement.
ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS paypal_capture_id VARCHAR(191) NULL AFTER payment_reference,
  ADD COLUMN IF NOT EXISTS package_weight_kg DECIMAL(10,3) NULL AFTER shipping_provider_code,
  ADD COLUMN IF NOT EXISTS package_length_cm DECIMAL(10,2) NULL AFTER package_weight_kg,
  ADD COLUMN IF NOT EXISTS package_width_cm DECIMAL(10,2) NULL AFTER package_length_cm,
  ADD COLUMN IF NOT EXISTS package_height_cm DECIMAL(10,2) NULL AFTER package_width_cm,
  ADD COLUMN IF NOT EXISTS package_confirmed_at DATETIME NULL AFTER package_height_cm,
  ADD COLUMN IF NOT EXISTS carrier_cost_minor INT NULL AFTER package_confirmed_at,
  ADD COLUMN IF NOT EXISTS shipping_block_reason VARCHAR(191) NULL AFTER carrier_cost_minor,
  ADD COLUMN IF NOT EXISTS delivered_at DATETIME NULL AFTER protection_ends_at,
  ADD INDEX IF NOT EXISTS idx_mp_orders_protection (status, protection_ends_at);

CREATE TABLE IF NOT EXISTS marketplace_payout_requests (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  seller_id CHAR(36) NOT NULL,
  paypal_email VARCHAR(191) NOT NULL,
  amount_minor INT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  status ENUM('requested','eligible','processing','paid','failed','cancelled') NOT NULL DEFAULT 'requested',
  eligible_at DATETIME NOT NULL,
  paypal_batch_id VARCHAR(191) NULL,
  paypal_item_id VARCHAR(191) NULL,
  failure_reason VARCHAR(500) NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mp_payout_order FOREIGN KEY (order_id) REFERENCES marketplace_orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_mp_payout_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_mp_payout_order (order_id),
  INDEX idx_mp_payout_status_due (status, eligible_at),
  INDEX idx_mp_payout_seller (seller_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
