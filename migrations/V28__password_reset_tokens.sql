-- =============================================================================
-- V28 — Password Reset Tokens Table
-- DoorDrop Real Password Recovery via SMTP
-- Date: 2026-09-14
-- Description: Stores SHA-256 hashed password recovery tokens with expiration,
--              usage tracking, and request IP for rate limiting / auditing.
-- =============================================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_ip VARCHAR(45) NULL,
  INDEX idx_prt_token_hash (token_hash),
  INDEX idx_prt_user_id (user_id),
  INDEX idx_prt_expires_used (expires_at, used_at),
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
