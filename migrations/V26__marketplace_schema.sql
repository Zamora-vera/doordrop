-- =============================================================================
-- V26 — Marketplace Schema
-- DoorDrop Marketplace Integration
-- Date: 2026-09-13
-- Description: Creates all marketplace tables linked to the existing users table.
--              All user FKs reference users(id) CHAR(36) for unified accounts.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Seller Profiles — extends existing users with seller-specific data
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_seller_profiles (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  display_name VARCHAR(191) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  description TEXT NULL,
  avatar_url TEXT NULL,
  logo_url TEXT NULL,
  phone VARCHAR(50) NULL,
  country CHAR(2) NOT NULL DEFAULT 'IT',
  city VARCHAR(120) NULL,
  region VARCHAR(120) NULL,
  zip_code VARCHAR(30) NULL,
  address VARCHAR(255) NULL,
  seller_type ENUM('individual','business') NOT NULL DEFAULT 'individual',
  verification_level ENUM('unverified','verified','professional') NOT NULL DEFAULT 'unverified',
  verified_at DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  avg_response_time_minutes INT NULL,
  total_sales INT NOT NULL DEFAULT 0,
  total_ratings INT NOT NULL DEFAULT 0,
  avg_rating DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  terms_accepted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_seller_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_seller_user (user_id),
  UNIQUE KEY uq_seller_slug (slug),
  INDEX idx_seller_country (country),
  INDEX idx_seller_verification (verification_level),
  INDEX idx_seller_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Categories — hierarchical product categories with i18n
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(96) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  icon VARCHAR(32) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  parent_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mp_categories_parent FOREIGN KEY (parent_id) REFERENCES marketplace_categories(id) ON DELETE SET NULL,
  INDEX idx_mp_categories_parent (parent_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketplace_category_translations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  locale VARCHAR(5) NOT NULL,
  name VARCHAR(128) NOT NULL,
  CONSTRAINT fk_mp_cat_trans_category FOREIGN KEY (category_id) REFERENCES marketplace_categories(id) ON DELETE CASCADE,
  UNIQUE KEY uq_mp_cat_trans (category_id, locale)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Listings — product publications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id CHAR(36) PRIMARY KEY,
  seller_id CHAR(36) NOT NULL,
  category_id INT NULL,
  title VARCHAR(180) NOT NULL,
  slug VARCHAR(200) NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  `condition` ENUM('new','like_new','excellent','good','used','repair') NOT NULL,
  price_minor INT NOT NULL COMMENT 'Price in smallest currency unit (cents)',
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  city VARCHAR(120) NOT NULL,
  region VARCHAR(120) NULL,
  country_code CHAR(2) NOT NULL,
  postal_code VARCHAR(24) NULL,
  original_language VARCHAR(5) NOT NULL DEFAULT 'it',
  weight_grams INT NULL,
  length_cm INT NULL,
  width_cm INT NULL,
  height_cm INT NULL,
  quantity INT NOT NULL DEFAULT 1,
  negotiable TINYINT(1) NOT NULL DEFAULT 1,
  shipping_available TINYINT(1) NOT NULL DEFAULT 1,
  pickup_available TINYINT(1) NOT NULL DEFAULT 0,
  shipping_from_minor INT NULL COMMENT 'Estimated shipping cost in minor units',
  status ENUM('draft','pending_review','active','rejected','reserved','sold','paused','archived') NOT NULL DEFAULT 'draft',
  risk_score INT NOT NULL DEFAULT 0,
  moderation_notes VARCHAR(300) NULL,
  moderated_at DATETIME NULL,
  view_count INT NOT NULL DEFAULT 0,
  favorite_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mp_listings_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_mp_listings_category FOREIGN KEY (category_id) REFERENCES marketplace_categories(id) ON DELETE SET NULL,
  INDEX idx_mp_listings_seller (seller_id),
  INDEX idx_mp_listings_search (status, category_id, city),
  INDEX idx_mp_listings_created (created_at),
  INDEX idx_mp_listings_slug (slug),
  INDEX idx_mp_listings_country (country_code, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketplace_listing_translations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  listing_id CHAR(36) NOT NULL,
  locale VARCHAR(5) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  source ENUM('manual','machine') NOT NULL DEFAULT 'machine',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mp_listing_trans FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  UNIQUE KEY uq_mp_listing_trans (listing_id, locale)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Listing Images
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_listing_images (
  id CHAR(36) PRIMARY KEY,
  listing_id CHAR(36) NOT NULL,
  file_key VARCHAR(255) NULL,
  url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_cover TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mp_images_listing FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  INDEX idx_mp_images_listing (listing_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Favorites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_favorites (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  listing_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mp_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mp_favorites_listing FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  UNIQUE KEY uq_mp_favorites (user_id, listing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Conversations (Chat between buyer and seller per listing)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_conversations (
  id CHAR(36) PRIMARY KEY,
  listing_id CHAR(36) NOT NULL,
  buyer_id CHAR(36) NOT NULL,
  seller_id CHAR(36) NOT NULL,
  last_message_at DATETIME NULL,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mp_conv_listing FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id) ON DELETE RESTRICT,
  CONSTRAINT fk_mp_conv_buyer FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_mp_conv_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_mp_conv (listing_id, buyer_id, seller_id),
  INDEX idx_mp_conv_participants (buyer_id, seller_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_messages (
  id CHAR(36) PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  sender_id CHAR(36) NOT NULL,
  body TEXT NOT NULL,
  message_type ENUM('text','image','offer','system') NOT NULL DEFAULT 'text',
  delivered_at DATETIME NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mp_messages_conv FOREIGN KEY (conversation_id) REFERENCES marketplace_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_mp_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_mp_messages_conv (conversation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Offers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_offers (
  id CHAR(36) PRIMARY KEY,
  listing_id CHAR(36) NOT NULL,
  buyer_id CHAR(36) NOT NULL,
  seller_id CHAR(36) NOT NULL,
  amount_minor INT NOT NULL COMMENT 'Offer amount in smallest currency unit',
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  status ENUM('pending','accepted','rejected','countered','cancelled','expired') NOT NULL DEFAULT 'pending',
  counter_of_id CHAR(36) NULL COMMENT 'Points to the offer being countered',
  message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mp_offers_listing FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id) ON DELETE RESTRICT,
  CONSTRAINT fk_mp_offers_buyer FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_mp_offers_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_mp_offers_listing (listing_id, created_at),
  INDEX idx_mp_offers_buyer (buyer_id, created_at),
  INDEX idx_mp_offers_seller (seller_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Marketplace Orders — links marketplace purchases to DoorDrop shipments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_orders (
  id CHAR(36) PRIMARY KEY,
  order_number VARCHAR(20) NOT NULL UNIQUE,
  listing_id CHAR(36) NOT NULL,
  buyer_id CHAR(36) NOT NULL,
  seller_id CHAR(36) NOT NULL,
  shipment_id CHAR(36) NULL COMMENT 'Links to existing DoorDrop shipments table',
  quote_id CHAR(36) NULL COMMENT 'Links to existing DoorDrop quotes table',
  product_amount_minor INT NOT NULL,
  shipping_amount_minor INT NOT NULL DEFAULT 0,
  commission_amount_minor INT NOT NULL DEFAULT 0,
  protection_amount_minor INT NOT NULL DEFAULT 0,
  total_amount_minor INT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  status ENUM(
    'pending_payment',
    'paid',
    'preparing',
    'shipped',
    'in_transit',
    'delivered',
    'protection_period',
    'completed',
    'dispute',
    'refunded',
    'cancelled'
  ) NOT NULL DEFAULT 'pending_payment',
  payment_method VARCHAR(30) NULL,
  payment_reference VARCHAR(191) NULL,
  buyer_address_json JSON NULL,
  seller_address_json JSON NULL,
  shipping_service_name VARCHAR(191) NULL,
  shipping_provider_code VARCHAR(80) NULL,
  tracking_code VARCHAR(191) NULL,
  label_url TEXT NULL,
  protection_ends_at DATETIME NULL,
  dispute_reason TEXT NULL,
  dispute_opened_at DATETIME NULL,
  completed_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mp_orders_listing FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id) ON DELETE RESTRICT,
  CONSTRAINT fk_mp_orders_buyer FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_mp_orders_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_mp_orders_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL,
  CONSTRAINT fk_mp_orders_quote FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL,
  INDEX idx_mp_orders_buyer (buyer_id, status),
  INDEX idx_mp_orders_seller (seller_id, status),
  INDEX idx_mp_orders_status (status, created_at),
  INDEX idx_mp_orders_shipment (shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Reviews — buyer reviews seller after completed order
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  reviewer_id CHAR(36) NOT NULL COMMENT 'The buyer',
  seller_id CHAR(36) NOT NULL,
  rating TINYINT NOT NULL COMMENT '1-5 stars',
  title VARCHAR(191) NULL,
  body TEXT NULL,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mp_reviews_order FOREIGN KEY (order_id) REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_mp_reviews_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mp_reviews_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_mp_reviews_order (order_id),
  INDEX idx_mp_reviews_seller (seller_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Marketplace Settings — per-country configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  country_code CHAR(2) NOT NULL,
  commission_percent DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  protection_days INT NOT NULL DEFAULT 3,
  min_price_minor INT NOT NULL DEFAULT 100,
  max_images_per_listing INT NOT NULL DEFAULT 8,
  auto_approve_listings TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mp_settings_country (country_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Seed default categories (Italian + translations)
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO marketplace_categories (slug, name, icon, sort_order) VALUES
  ('elettronica', 'Elettronica', '📱', 1),
  ('moda', 'Moda e Abbigliamento', '👗', 2),
  ('casa', 'Casa e Giardino', '🏠', 3),
  ('sport', 'Sport e Tempo Libero', '⚽', 4),
  ('veicoli', 'Veicoli e Ricambi', '🚗', 5),
  ('libri', 'Libri e Media', '📚', 6),
  ('giocattoli', 'Giocattoli e Bambini', '🧸', 7),
  ('animali', 'Animali', '🐾', 8),
  ('arte', 'Arte e Collezionismo', '🎨', 9),
  ('altro', 'Altro', '📦', 10);

-- Spanish translations
INSERT IGNORE INTO marketplace_category_translations (category_id, locale, name)
SELECT id, 'es', CASE slug
  WHEN 'elettronica' THEN 'Electrónica'
  WHEN 'moda' THEN 'Moda y Ropa'
  WHEN 'casa' THEN 'Hogar y Jardín'
  WHEN 'sport' THEN 'Deporte y Ocio'
  WHEN 'veicoli' THEN 'Vehículos y Repuestos'
  WHEN 'libri' THEN 'Libros y Medios'
  WHEN 'giocattoli' THEN 'Juguetes y Niños'
  WHEN 'animali' THEN 'Mascotas'
  WHEN 'arte' THEN 'Arte y Colección'
  WHEN 'altro' THEN 'Otros'
END FROM marketplace_categories;

-- English translations
INSERT IGNORE INTO marketplace_category_translations (category_id, locale, name)
SELECT id, 'en', CASE slug
  WHEN 'elettronica' THEN 'Electronics'
  WHEN 'moda' THEN 'Fashion & Clothing'
  WHEN 'casa' THEN 'Home & Garden'
  WHEN 'sport' THEN 'Sports & Leisure'
  WHEN 'veicoli' THEN 'Vehicles & Parts'
  WHEN 'libri' THEN 'Books & Media'
  WHEN 'giocattoli' THEN 'Toys & Kids'
  WHEN 'animali' THEN 'Pets'
  WHEN 'arte' THEN 'Art & Collectibles'
  WHEN 'altro' THEN 'Other'
END FROM marketplace_categories;

-- German translations
INSERT IGNORE INTO marketplace_category_translations (category_id, locale, name)
SELECT id, 'de', CASE slug
  WHEN 'elettronica' THEN 'Elektronik'
  WHEN 'moda' THEN 'Mode & Kleidung'
  WHEN 'casa' THEN 'Haus & Garten'
  WHEN 'sport' THEN 'Sport & Freizeit'
  WHEN 'veicoli' THEN 'Fahrzeuge & Ersatzteile'
  WHEN 'libri' THEN 'Bücher & Medien'
  WHEN 'giocattoli' THEN 'Spielzeug & Kinder'
  WHEN 'animali' THEN 'Haustiere'
  WHEN 'arte' THEN 'Kunst & Sammeln'
  WHEN 'altro' THEN 'Sonstiges'
END FROM marketplace_categories;

-- Seed default marketplace settings for initial countries
INSERT IGNORE INTO marketplace_settings (country_code, commission_percent, protection_days, is_active) VALUES
  ('IT', 5.00, 3, 1),
  ('ES', 5.00, 3, 1),
  ('DE', 5.00, 3, 1),
  ('GB', 5.00, 3, 1);

-- Record migration
INSERT IGNORE INTO schema_migrations (version, name, description) VALUES
  ('V26', 'marketplace_schema', 'Marketplace tables: sellers, categories, listings, images, favorites, conversations, messages, offers, orders, reviews, settings');
