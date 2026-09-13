-- Ship24Go / EnvioX V1.0.0 - MySQL production schema
-- Release: production-real
-- No guardar credenciales reales en este archivo.

CREATE DATABASE IF NOT EXISTS doordrop_ship24go CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE doordrop_ship24go;


CREATE TABLE IF NOT EXISTS app_versions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  version VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(191) NOT NULL,
  phone VARCHAR(50) NULL,
  country CHAR(2) DEFAULT 'ES',
  currency CHAR(3) DEFAULT 'EUR',
  role ENUM('customer','support','super_admin') NOT NULL DEFAULT 'customer',
  business_type VARCHAR(100) NULL,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  card_connected TINYINT(1) NOT NULL DEFAULT 0,
  card_details_json JSON NULL,
  paypal_connected TINYINT(1) NOT NULL DEFAULT 0,
  paypal_email VARCHAR(191) NULL,
  status ENUM('active','suspended','closed') NOT NULL DEFAULT 'active',
  preferred_payment_method VARCHAR(30) NOT NULL DEFAULT 'wallet',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_country (country)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS companies (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  company_name VARCHAR(191) NULL,
  address VARCHAR(255) NULL,
  city VARCHAR(120) NULL,
  zip_code VARCHAR(30) NULL,
  country CHAR(2) DEFAULT 'ES',
  phone VARCHAR(50) NULL,
  email VARCHAR(191) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_companies_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_companies_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS address_book (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  type ENUM('sender','recipient','company') NOT NULL DEFAULT 'sender',
  full_name VARCHAR(191) NOT NULL,
  company VARCHAR(191) NULL,
  country CHAR(2) NOT NULL DEFAULT 'ES',
  city VARCHAR(120) NULL,
  zip_code VARCHAR(30) NULL,
  address VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  email VARCHAR(191) NULL,
  observations TEXT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_address_book_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_address_book_user_type (user_id, type),
  INDEX idx_address_book_default (user_id, is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pickup_addresses (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  company_id CHAR(36) NULL,
  label VARCHAR(120) NULL,
  full_name VARCHAR(191) NULL,
  phone VARCHAR(50) NULL,
  email VARCHAR(191) NULL,
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255) NULL,
  city VARCHAR(120) NOT NULL,
  zip_code VARCHAR(30) NOT NULL,
  country CHAR(2) NOT NULL DEFAULT 'ES',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pickup_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pickup_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  INDEX idx_pickup_user_default (user_id, is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stores (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  platform VARCHAR(80) NOT NULL,
  external_store_id VARCHAR(191) NULL,
  store_name VARCHAR(191) NULL,
  status ENUM('pending','connected','inactive','error') NOT NULL DEFAULT 'pending',
  access_token_enc TEXT NULL,
  refresh_token_enc TEXT NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stores_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_stores_user (user_id),
  INDEX idx_stores_platform (platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS providers (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(191) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_connected TINYINT(1) NOT NULL DEFAULT 0,
  margin_percent DECIMAL(8,3) NOT NULL DEFAULT 20.000,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  config_json JSON NULL,
  last_connection_status ENUM('not_tested','ok','failed') NOT NULL DEFAULT 'not_tested',
  last_connection_message VARCHAR(255) NULL,
  last_tested_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_providers_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_credentials (
  id CHAR(36) PRIMARY KEY,
  provider_id CHAR(36) NOT NULL,
  key_name VARCHAR(120) NOT NULL,
  key_value_enc TEXT NOT NULL,
  environment ENUM('sandbox','production') NOT NULL DEFAULT 'production',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_provider_credentials_provider FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
  UNIQUE KEY uq_provider_key_env (provider_id, key_name, environment)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_services (
  id CHAR(36) PRIMARY KEY,
  provider_id CHAR(36) NOT NULL,
  external_service_id VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  required_fields_json JSON NULL,
  config_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_provider_services_provider FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
  UNIQUE KEY uq_provider_service (provider_id, external_service_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_keys (
  id INT PRIMARY KEY,
  googleMaps VARCHAR(255) NULL,
  genei VARCHAR(255) NULL,
  parcelAbc VARCHAR(255) NULL,
  posteItaliane VARCHAR(255) NULL,
  paccoFacile VARCHAR(255) NULL,
  paypalClientId VARCHAR(255) NULL,
  paypalClientSecret VARCHAR(255) NULL,
  polarApiToken VARCHAR(255) NULL,
  polarProductId VARCHAR(255) NULL,
  freeCurrencyApiKey VARCHAR(255) NULL,
  ecartApiClientId VARCHAR(255) NULL,
  ecartClientSecret VARCHAR(255) NULL,
  ecartAppUrl VARCHAR(255) NULL,
  ecartRedirectUrl VARCHAR(255) NULL,
  extra_json JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotes (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NULL,
  provider_id CHAR(36) NULL,
  provider_code VARCHAR(80) NULL,
  service_id VARCHAR(191) NULL,
  service_name VARCHAR(191) NULL,
  origin_country CHAR(2) NOT NULL,
  origin_zip VARCHAR(30) NOT NULL,
  dest_country CHAR(2) NOT NULL,
  dest_zip VARCHAR(30) NOT NULL,
  base_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  margin_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  taxes_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  estimated_days_min INT NULL,
  estimated_days_max INT NULL,
  provider_payload_json JSON NULL,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_quotes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_quotes_provider FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL,
  INDEX idx_quotes_user_created (user_id, created_at),
  INDEX idx_quotes_provider (provider_id),
  INDEX idx_quotes_provider_code (provider_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipments (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  quote_id CHAR(36) NULL,
  provider_id CHAR(36) NULL,
  provider_code VARCHAR(80) NULL,
  provider_shipment_code VARCHAR(191) NULL,
  provider_tracking_code VARCHAR(191) NULL,
  tracking_code VARCHAR(191) NOT NULL UNIQUE,
  order_number VARCHAR(191) NULL,
  reference VARCHAR(191) NULL,
  status VARCHAR(80) NOT NULL DEFAULT 'created',
  status_label VARCHAR(191) NOT NULL DEFAULT 'Creado',
  sender_json JSON NOT NULL,
  recipient_json JSON NOT NULL,
  label_url TEXT NULL,
  label_base64 LONGTEXT NULL,
  track_url TEXT NULL,
  payment_url TEXT NULL,
  provider_payload_json JSON NULL,
  label_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  label_error TEXT NULL,
  provider_attempts INT NOT NULL DEFAULT 0,
  last_provider_attempt_at DATETIME NULL,
  customer_payload_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shipments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_shipments_quote FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL,
  CONSTRAINT fk_shipments_provider FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL,
  INDEX idx_shipments_user_created (user_id, created_at),
  INDEX idx_shipments_status (status),
  INDEX idx_shipments_provider_code (provider_code, provider_shipment_code),
  INDEX idx_shipments_label_status (label_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipment_addresses (
  id CHAR(36) PRIMARY KEY,
  shipment_id CHAR(36) NOT NULL,
  type ENUM('sender','recipient') NOT NULL,
  full_name VARCHAR(191) NOT NULL,
  company VARCHAR(191) NULL,
  country CHAR(2) NOT NULL,
  city VARCHAR(120) NULL,
  zip_code VARCHAR(30) NULL,
  address VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  email VARCHAR(191) NULL,
  observations TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_shipment_addresses_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
  INDEX idx_shipment_addresses_shipment (shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipment_packages (
  id CHAR(36) PRIMARY KEY,
  shipment_id CHAR(36) NOT NULL,
  package_code VARCHAR(191) NULL,
  manifest_reference VARCHAR(191) NULL,
  final_mile_code VARCHAR(191) NULL,
  final_mile_url TEXT NULL,
  width_cm DECIMAL(10,2) NOT NULL,
  height_cm DECIMAL(10,2) NOT NULL,
  length_cm DECIMAL(10,2) NOT NULL,
  weight_kg DECIMAL(10,3) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  label_url TEXT NULL,
  provider_payload_json JSON NULL,
  label_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  label_error TEXT NULL,
  provider_attempts INT NOT NULL DEFAULT 0,
  last_provider_attempt_at DATETIME NULL,
  customer_payload_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_packages_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
  INDEX idx_packages_shipment (shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipment_customs_items (
  id CHAR(36) PRIMARY KEY,
  shipment_package_id CHAR(36) NOT NULL,
  description VARCHAR(255) NOT NULL,
  origin_country CHAR(2) NOT NULL,
  quantity INT NOT NULL,
  weight_kg DECIMAL(10,3) NULL,
  value_amount DECIMAL(12,2) NOT NULL,
  hs_code VARCHAR(20) NULL,
  sku VARCHAR(80) NULL,
  export_reason VARCHAR(80) NULL,
  terms_of_trade VARCHAR(20) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_customs_package FOREIGN KEY (shipment_package_id) REFERENCES shipment_packages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


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
  CONSTRAINT fk_processing_jobs_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
  CONSTRAINT fk_processing_jobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_jobs_status_next (status, next_run_at),
  INDEX idx_jobs_shipment (shipment_id),
  INDEX idx_jobs_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipment_drafts (
  id CHAR(36) PRIMARY KEY,
  shipment_id CHAR(36) NULL,
  user_id CHAR(36) NOT NULL,
  quote_id CHAR(36) NULL,
  reason VARCHAR(120) NOT NULL DEFAULT 'pending',
  payload_json JSON NOT NULL,
  status ENUM('open','finalized','deleted') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_drafts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_drafts_quote FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL,
  CONSTRAINT fk_drafts_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL,
  INDEX idx_drafts_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipment_labels (
  id CHAR(36) PRIMARY KEY,
  shipment_id CHAR(36) NOT NULL,
  format VARCHAR(20) NOT NULL DEFAULT 'pdf',
  label_url TEXT NULL,
  label_base64 LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_labels_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
  INDEX idx_labels_shipment (shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tracking_events (
  id CHAR(36) PRIMARY KEY,
  shipment_id CHAR(36) NOT NULL,
  provider_event_id VARCHAR(191) NULL,
  tracking_code VARCHAR(191) NULL,
  status_code VARCHAR(80) NULL,
  status_label VARCHAR(191) NOT NULL,
  description TEXT NULL,
  location VARCHAR(191) NULL,
  event_time DATETIME NOT NULL,
  raw_payload_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tracking_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
  INDEX idx_tracking_shipment_time (shipment_id, event_time),
  INDEX idx_tracking_code (tracking_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  type ENUM('credit','debit','refund','hold','release') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  description VARCHAR(255) NULL,
  reference_type VARCHAR(80) NULL,
  reference_id CHAR(36) NULL,
  status VARCHAR(30) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_wallet_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_topups (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  method VARCHAR(80) NULL,
  status ENUM('pending','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  external_reference VARCHAR(191) NULL,
  payment_provider VARCHAR(80) NULL,
  provider_reference VARCHAR(191) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_topups_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_topups_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  shipment_id CHAR(36) NULL,
  provider VARCHAR(80) NOT NULL,
  external_payment_id VARCHAR(191) NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  raw_payload_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL,
  INDEX idx_payments_user_created (user_id, created_at),
  INDEX idx_payments_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_logs (
  id CHAR(36) PRIMARY KEY,
  provider_code VARCHAR(80) NOT NULL,
  action_type VARCHAR(80) NOT NULL,
  request_payload JSON NULL,
  response_payload JSON NULL,
  http_status INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_provider_logs_provider_action (provider_code, action_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS plans (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(191) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  discount_percent DECIMAL(8,3) NOT NULL DEFAULT 0.000,
  features_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  plan_id CHAR(36) NOT NULL,
  provider VARCHAR(80) NULL,
  external_subscription_id VARCHAR(191) NULL,
  status ENUM('active','trialing','past_due','canceled','expired') NOT NULL DEFAULT 'active',
  current_period_start DATETIME NULL,
  current_period_end DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
  INDEX idx_subscriptions_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_tickets (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  subject VARCHAR(191) NOT NULL,
  category VARCHAR(100) NULL,
  description TEXT NOT NULL,
  tracking_code VARCHAR(191) NULL,
  status ENUM('open','pending','resolved','closed') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_support_tickets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_support_tickets_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tickets LIKE support_tickets;

CREATE TABLE IF NOT EXISTS ticket_replies (
  id CHAR(36) PRIMARY KEY,
  ticket_id CHAR(36) NOT NULL,
  sender_user_id CHAR(36) NULL,
  sender_role ENUM('customer','support','super_admin','system') NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_replies_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_replies_user FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ticket_replies_ticket_created (ticket_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_settings (
  id INT PRIMARY KEY,
  settings_json JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO providers (id, code, name, margin_percent, currency, is_active) VALUES
('prv_genei', 'genei', 'Genei', 25.000, 'EUR', 1),
('prv_parcelabc', 'parcelabc', 'ParcelABC', 20.000, 'EUR', 1),
('prv_paccofacile', 'paccofacile', 'PaccoFacile.it', 15.000, 'EUR', 0),
('prv_poste_italiane', 'poste_italiane', 'Poste Italiane', 15.000, 'EUR', 0),
('prv_ecart', 'ecart', 'Ecart API', 0.000, 'EUR', 1);

INSERT IGNORE INTO api_keys (id, googleMaps, genei, parcelAbc, posteItaliane, paccoFacile, paypalClientId, paypalClientSecret, polarApiToken, polarProductId, freeCurrencyApiKey, ecartApiClientId, ecartClientSecret, ecartAppUrl, ecartRedirectUrl)
VALUES (1, '', '', '', '', '', '', '', '', '', '', '', '', 'https://ship24go.com', 'https://ship24go.com/es/customer/integeration');

INSERT IGNORE INTO plans (id, code, name, price, currency, discount_percent, features_json, is_active) VALUES
('plan_basic', 'basic', 'Plan Básico', 0.00, 'EUR', 0.000, JSON_ARRAY('Soporte estándar','Cotización real'), 1),
('plan_pro', 'pro', 'Plan Pro', 29.99, 'EUR', 10.000, JSON_ARRAY('Soporte prioritario','Envíos internacionales','10% descuento'), 1),
('plan_enterprise', 'enterprise', 'Plan Enterprise', 99.99, 'EUR', 20.000, JSON_ARRAY('Soporte 24/7','Integraciones','20% descuento'), 1);

INSERT IGNORE INTO admin_settings (id, settings_json) VALUES (1, JSON_OBJECT('mode','production'));

INSERT IGNORE INTO app_versions (version, name, description)
VALUES ('V1.0.0', 'Ship24Go Producción Real', 'MySQL real, proveedores reales, wallet, borradores, libreta, tracking, etiquetas, reportes y Ecart API.');

UPDATE admin_settings
SET settings_json = JSON_SET(COALESCE(settings_json, JSON_OBJECT()), '$.release_version', 'V1.0.0', '$.release_name', 'Ship24Go Producción Real')
WHERE id = 1;

-- Configuración central de marca y SEO
UPDATE admin_settings
SET settings_json = JSON_SET(
  COALESCE(settings_json, JSON_OBJECT()),
  '$.brand',
  COALESCE(
    JSON_EXTRACT(settings_json, '$.brand'),
    JSON_OBJECT(
      'siteName', 'Ship24go',
      'shortName', 'Ship24go',
      'tagline', 'Inteligencia en Envíos',
      'seoTitle', 'Ship24go - Inteligencia en Envíos',
      'seoDescription', 'La plataforma inteligente definitiva de envíos ecommerce.',
      'seoKeywords', 'envíos ecommerce, logística, tracking, paquetería, cotizador de envíos',
      'logoUrl', '',
      'faviconUrl', '/icon.svg',
      'ogImageUrl', '',
      'themeColor', '#2563eb'
    )
  )
)
WHERE id = 1;
