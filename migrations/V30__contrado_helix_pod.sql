-- Migration V30: Contrado Helix Print On Demand (POD) & Zubuy Print System Store
-- DoorDrop Marketplace Integration

-- 1. Table for Contrado Stores & Global Sync Settings
CREATE TABLE IF NOT EXISTS contrado_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_id INT NOT NULL,
  store_name VARCHAR(150) NOT NULL DEFAULT 'Zubuy Print',
  culture_code VARCHAR(10) NOT NULL DEFAULT 'it-IT',
  base_currency VARCHAR(5) NOT NULL DEFAULT 'EUR',
  global_margin_percent DECIMAL(5,2) NOT NULL DEFAULT 35.00,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  canvas_enabled TINYINT(1) NOT NULL DEFAULT 0,
  sync_batch_size INT NOT NULL DEFAULT 20,
  last_synced_at DATETIME NULL,
  next_sync_at DATETIME NULL,
  last_sync_status VARCHAR(50) DEFAULT 'idle',
  last_sync_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_store_id (store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert initial setting if not exists
INSERT INTO contrado_settings (store_id, store_name, culture_code, base_currency, global_margin_percent, is_active, canvas_enabled)
VALUES (61803, 'Zubuy Print', 'it-IT', 'EUR', 35.00, 1, 0)
ON DUPLICATE KEY UPDATE store_name = VALUES(store_name);

-- 2. Table for Contrado POD Products metadata & sync tracking
CREATE TABLE IF NOT EXISTS pod_products (
  id VARCHAR(36) PRIMARY KEY,
  listing_id VARCHAR(36) NOT NULL,
  store_id INT NOT NULL,
  contrado_product_id INT NOT NULL,
  base_product_id INT NULL,
  design_pattern_id INT NULL,
  collection_id INT NULL,
  name VARCHAR(255) NOT NULL,
  description LONGTEXT NULL,
  product_thumb VARCHAR(500) NULL,
  product_images_json LONGTEXT NULL,
  product_3d_images_json LONGTEXT NULL,
  care_instruction_json LONGTEXT NULL,
  specifications_json LONGTEXT NULL,
  size_chart_json LONGTEXT NULL,
  production_time VARCHAR(100) NULL,
  is_out_of_stock TINYINT(1) NOT NULL DEFAULT 0,
  shipping_price_group_id INT NULL,
  provider_cost_minor INT NOT NULL DEFAULT 0,
  provider_currency VARCHAR(5) NOT NULL DEFAULT 'EUR',
  retail_price_minor INT NOT NULL DEFAULT 0,
  retail_currency VARCHAR(5) NOT NULL DEFAULT 'EUR',
  margin_percent DECIMAL(5,2) NOT NULL DEFAULT 35.00,
  sync_status VARCHAR(30) NOT NULL DEFAULT 'synced',
  last_synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_contrado_product (contrado_product_id),
  KEY idx_listing (listing_id),
  KEY idx_store (store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Table for Contrado Product Variants & Options
CREATE TABLE IF NOT EXISTS pod_product_variants (
  id VARCHAR(36) PRIMARY KEY,
  pod_product_id VARCHAR(36) NOT NULL,
  contrado_variant_id VARCHAR(100) NOT NULL,
  sku VARCHAR(100) NULL,
  price_minor INT NOT NULL,
  currency VARCHAR(5) NOT NULL DEFAULT 'EUR',
  is_in_stock TINYINT(1) NOT NULL DEFAULT 1,
  attributes_json LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pod_product (pod_product_id),
  KEY idx_variant_id (contrado_variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Table for Contrado Shipping Price Groups cache
CREATE TABLE IF NOT EXISTS pod_shipping_cache (
  id INT PRIMARY KEY AUTO_INCREMENT,
  shipping_price_group_id INT NOT NULL,
  region_name VARCHAR(100) NOT NULL,
  culture_code VARCHAR(10) NOT NULL,
  country_code VARCHAR(5) NOT NULL,
  price_minor INT NOT NULL,
  increment_value_minor INT NOT NULL DEFAULT 0,
  currency VARCHAR(5) NOT NULL DEFAULT 'EUR',
  is_home_country TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_shipping_country (shipping_price_group_id, culture_code, country_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Table for Contrado Production Orders
CREATE TABLE IF NOT EXISTS pod_orders (
  id VARCHAR(36) PRIMARY KEY,
  doordrop_order_id VARCHAR(36) NOT NULL,
  contrado_order_id INT NULL,
  external_reference_id VARCHAR(100) NOT NULL,
  contrado_status VARCHAR(50) NOT NULL DEFAULT 'Created',
  production_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
  culture_code VARCHAR(10) NOT NULL DEFAULT 'it-IT',
  currency VARCHAR(5) NOT NULL DEFAULT 'EUR',
  total_provider_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  shipping_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  tracking_number VARCHAR(100) NULL,
  tracking_url VARCHAR(500) NULL,
  carrier VARCHAR(100) NULL,
  recipient_json LONGTEXT NOT NULL,
  line_items_json LONGTEXT NOT NULL,
  raw_response_json LONGTEXT NULL,
  dispatched_at DATETIME NULL,
  delivered_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doordrop_order (doordrop_order_id),
  KEY idx_contrado_order (contrado_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Table for Webhook Events received from Contrado
CREATE TABLE IF NOT EXISTS pod_webhook_events (
  id VARCHAR(36) PRIMARY KEY,
  event_id VARCHAR(100) NULL,
  entity_id INT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_action VARCHAR(100) NOT NULL,
  latest_status VARCHAR(100) NULL,
  description TEXT NULL,
  payload_json LONGTEXT NOT NULL,
  signature VARCHAR(255) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'processed',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Add columns to marketplace_listings for POD items if not present
ALTER TABLE marketplace_listings 
  ADD COLUMN IF NOT EXISTS listing_type VARCHAR(20) NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS provider VARCHAR(30) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS external_product_id VARCHAR(100) NULL DEFAULT NULL;
