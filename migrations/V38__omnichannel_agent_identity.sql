-- DoorDrop V38: identity verification, client codes and real agent handoff.
-- The runtime also applies these additive changes idempotently for installations
-- that do not execute numbered migrations during startup.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS client_code VARCHAR(32) NULL;

UPDATE users
   SET client_code = CONCAT('DD-', UPPER(SUBSTRING(MD5(id), 1, 12)))
 WHERE client_code IS NULL OR client_code = '';

ALTER TABLE omnichannel_conversations
  ADD COLUMN IF NOT EXISTS identity_status VARCHAR(20) NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_customer_user_id VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS verification_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_requested_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS verified_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS detected_language CHAR(2) NULL,
  ADD COLUMN IF NOT EXISTS ticket_id CHAR(36) NULL,
  ADD INDEX IF NOT EXISTS idx_omni_identity (user_id, identity_status, contact_phone);

ALTER TABLE omnichannel_team
  ADD COLUMN IF NOT EXISTS specialty VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS languages_json TEXT NULL;

CREATE TABLE IF NOT EXISTS omnichannel_contact_verifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  merchant_user_id VARCHAR(100) NOT NULL,
  contact_phone VARCHAR(80) NULL,
  channel VARCHAR(40) NOT NULL,
  requested_language CHAR(2) NOT NULL DEFAULT 'es',
  identifier_type VARCHAR(20) NOT NULL,
  identifier_hash CHAR(64) NOT NULL,
  result VARCHAR(20) NOT NULL,
  verified_user_id VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_omni_verification_conversation (conversation_id, created_at),
  INDEX idx_omni_verification_merchant (merchant_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version, name, description)
VALUES ('V38', 'omnichannel_agent_identity', 'Client codes, multilingual contact verification and ticket-backed agent handoff');
