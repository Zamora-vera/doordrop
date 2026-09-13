-- Ship24Go / EnvioX V1.0.0 - patch seguro para base existente
-- No guarda credenciales reales. Ejecutar sobre la base ship24go.
USE ship24go;

CREATE TABLE IF NOT EXISTS app_versions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  version VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  INDEX idx_address_book_user_type (user_id, type),
  INDEX idx_address_book_default (user_id, is_default)
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
  INDEX idx_stores_user (user_id),
  INDEX idx_stores_platform (platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO providers (id, code, name, margin_percent, currency, is_active) VALUES
('prv_genei', 'genei', 'Genei', 25.000, 'EUR', 1),
('prv_parcelabc', 'parcelabc', 'ParcelABC', 20.000, 'EUR', 1),
('prv_ecart', 'ecart', 'Ecart API', 0.000, 'EUR', 1);

INSERT IGNORE INTO api_keys (id, googleMaps, genei, parcelAbc, posteItaliane, paccoFacile, paypalClientId, paypalClientSecret, polarApiToken, polarProductId, freeCurrencyApiKey, ecartApiClientId, ecartClientSecret, ecartAppUrl, ecartRedirectUrl)
VALUES (1, '', '', '', '', '', '', '', '', '', '', '', '', 'https://ship24go.com', 'https://ship24go.com/es/customer/integeration');

INSERT IGNORE INTO admin_settings (id, settings_json) VALUES (1, JSON_OBJECT('mode','production'));

INSERT IGNORE INTO app_versions (version, name, description)
VALUES ('V1.0.0', 'Ship24Go Producción Real', 'MySQL real, proveedores reales, wallet, borradores, libreta, tracking, etiquetas, reportes y Ecart API.');

UPDATE admin_settings
SET settings_json = JSON_SET(COALESCE(settings_json, JSON_OBJECT()), '$.release_version', 'V1.0.0', '$.release_name', 'Ship24Go Producción Real')
WHERE id = 1;

-- Ajustes Super Admin clientes / saldo / acceso cliente
ALTER TABLE users ADD COLUMN IF NOT EXISTS currency CHAR(3) DEFAULT 'EUR';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status ENUM('active','suspended','closed') NOT NULL DEFAULT 'active';
ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(80) NULL;
ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(191) NULL;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(30) NULL;

-- Configuración central de marca y SEO
CREATE TABLE IF NOT EXISTS admin_settings (
  id INT PRIMARY KEY,
  settings_json JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO admin_settings (id, settings_json) VALUES (1, JSON_OBJECT());

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
