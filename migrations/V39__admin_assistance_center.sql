-- DoorDrop V39: isolated Super Admin AI Assistance Center.
-- This bounded context is intentionally separate from the public Omnichannel
-- resale tables and settings. The runtime also applies the same DDL
-- idempotently for installations that do not run numbered migrations.

CREATE TABLE IF NOT EXISTS admin_assistance_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NULL,
  is_secret TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_assistance_channels (
  id CHAR(36) PRIMARY KEY,
  platform VARCHAR(32) NOT NULL,
  provider_profile_id VARCHAR(191) NULL,
  provider_account_id VARCHAR(191) NULL,
  display_name VARCHAR(191) NOT NULL,
  username VARCHAR(191) NULL,
  phone_number VARCHAR(80) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  metadata_json JSON NULL,
  connected_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assistance_profile (provider_profile_id),
  UNIQUE KEY uq_assistance_account (provider_account_id),
  INDEX idx_assistance_channel_platform_status (platform, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_assistance_conversations (
  id CHAR(36) PRIMARY KEY,
  channel_id CHAR(36) NULL,
  provider_conversation_id VARCHAR(255) NULL,
  platform VARCHAR(32) NOT NULL DEFAULT 'internal',
  contact_id VARCHAR(191) NULL,
  contact_name VARCHAR(191) NULL,
  contact_phone VARCHAR(80) NULL,
  contact_email VARCHAR(191) NULL,
  detected_language CHAR(2) NOT NULL DEFAULT 'es',
  identity_status VARCHAR(24) NOT NULL DEFAULT 'unverified',
  verified_customer_user_id CHAR(36) NULL,
  verification_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ticket_id CHAR(36) NULL,
  ai_active TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  last_message TEXT NULL,
  last_message_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assistance_conversation (channel_id, provider_conversation_id),
  INDEX idx_assistance_conversation_status (status, last_message_at),
  INDEX idx_assistance_conversation_identity (identity_status, contact_phone),
  INDEX idx_assistance_conversation_customer (verified_customer_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_assistance_messages (
  id CHAR(36) PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  provider_message_id VARCHAR(255) NULL,
  direction VARCHAR(16) NOT NULL,
  sender_type VARCHAR(32) NOT NULL,
  sender_name VARCHAR(191) NULL,
  text_content TEXT NOT NULL,
  media_type VARCHAR(40) NULL,
  media_url VARCHAR(1024) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'received',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assistance_provider_message (provider_message_id),
  INDEX idx_assistance_message_conversation (conversation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_assistance_webhook_events (
  event_id VARCHAR(191) PRIMARY KEY,
  event_type VARCHAR(120) NULL,
  payload_json JSON NULL,
  processed TINYINT(1) NOT NULL DEFAULT 0,
  error_message VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  INDEX idx_assistance_webhook_status (processed, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_assistance_verification_events (
  id CHAR(36) PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  identifier_hash CHAR(64) NOT NULL,
  method VARCHAR(24) NOT NULL,
  result VARCHAR(24) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_assistance_verification_conversation (conversation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_assistance_knowledge (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(191) NOT NULL,
  content TEXT NOT NULL,
  language CHAR(2) NOT NULL DEFAULT 'es',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_assistance_knowledge_active_language (is_active, language)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO admin_assistance_settings (setting_key, setting_value, is_secret) VALUES
  ('zernio_api_url', 'https://zernio.com/api/v1', 0),
  ('zernio_api_key', '', 1),
  ('zernio_webhook_secret', '', 1),
  ('ai_api_url', 'https://api.deepseek.com', 0),
  ('ai_api_key', '', 1),
  ('ai_model', 'deepseek-chat', 0),
  ('ai_enabled', '1', 0),
  ('default_language', 'es', 0);

INSERT IGNORE INTO schema_migrations (version, name, description)
VALUES ('V39', 'admin_assistance_center', 'Isolated Super Admin AI assistance center with private channels, identity gate, tickets and knowledge base');
