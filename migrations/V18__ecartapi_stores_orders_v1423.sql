-- Ship24Go V1.4.23 — Ecart API Stores + Ecommerce Orders
-- Safe additive migration. It does not modify provider label flow.

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS ecartApiClientId VARCHAR(255) NULL;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS ecartClientSecret VARCHAR(255) NULL;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS ecartAppUrl VARCHAR(255) NULL;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS ecartRedirectUrl VARCHAR(255) NULL;

UPDATE api_keys
SET ecartApiClientId = COALESCE(NULLIF(ecartApiClientId, ''), 'D32kBQglwHbylGMYnlwMLcOWD6fsGb2o'),
    ecartAppUrl = COALESCE(NULLIF(ecartAppUrl, ''), 'https://ship24go.com'),
    ecartRedirectUrl = 'https://ship24go.com/api/integrations/ecartapi/callback'
WHERE id = 1;

CREATE TABLE IF NOT EXISTS ecart_pending_connections (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  nonce_hash VARCHAR(191) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME NULL,
  INDEX idx_ecart_pending_nonce (nonce_hash),
  INDEX idx_ecart_pending_user (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS store_orders (
  id CHAR(36) PRIMARY KEY,
  store_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  external_order_id VARCHAR(191) NOT NULL,
  order_number VARCHAR(191) NULL,
  ecommerce VARCHAR(80) NULL,
  order_status VARCHAR(80) NULL,
  fulfillment_status VARCHAR(80) NULL,
  customer_name VARCHAR(191) NULL,
  customer_email VARCHAR(191) NULL,
  customer_phone VARCHAR(80) NULL,
  currency CHAR(3) NULL,
  total_amount DECIMAL(12,2) NULL,
  shipping_name VARCHAR(191) NULL,
  shipping_phone VARCHAR(80) NULL,
  shipping_address1 VARCHAR(255) NULL,
  shipping_address2 VARCHAR(255) NULL,
  shipping_city VARCHAR(120) NULL,
  shipping_state VARCHAR(120) NULL,
  shipping_postal_code VARCHAR(50) NULL,
  shipping_country VARCHAR(10) NULL,
  address_quality VARCHAR(40) NOT NULL DEFAULT 'ready',
  address_alerts_json JSON NULL,
  package_json JSON NULL,
  raw_json JSON NULL,
  shipment_id CHAR(36) NULL,
  fulfillment_status_ship24go VARCHAR(40) NOT NULL DEFAULT 'pending',
  fulfillment_pushed_at DATETIME NULL,
  imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_store_order (store_id, external_order_id),
  INDEX idx_store_orders_user (user_id, imported_at),
  INDEX idx_store_orders_store (store_id, imported_at),
  INDEX idx_store_orders_quality (address_quality),
  INDEX idx_store_orders_shipment (shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS store_sync_logs (
  id CHAR(36) PRIMARY KEY,
  store_id CHAR(36) NULL,
  user_id CHAR(36) NULL,
  direction VARCHAR(40) NOT NULL,
  action VARCHAR(80) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ok',
  message VARCHAR(255) NULL,
  payload_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_store_sync_store (store_id, created_at),
  INDEX idx_store_sync_user (user_id, created_at),
  INDEX idx_store_sync_action (action, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
