-- DoorDrop V35: PayPal Login (OAuth/OpenID Connect) identity linking.
-- No PayPal access/refresh token is persisted. Runtime initDb applies the same
-- idempotent DDL for existing installations.

CREATE TABLE IF NOT EXISTS user_auth_identities (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  provider_code VARCHAR(40) NOT NULL,
  provider_subject VARCHAR(255) NOT NULL,
  email VARCHAR(191) NULL,
  display_name VARCHAR(191) NULL,
  avatar_url VARCHAR(1024) NULL,
  profile_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auth_identity_provider_subject (provider_code, provider_subject),
  UNIQUE KEY uq_auth_identity_user_provider (user_id, provider_code),
  INDEX idx_auth_identity_user (user_id),
  CONSTRAINT fk_auth_identity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oauth_login_states (
  id CHAR(36) PRIMARY KEY,
  provider_code VARCHAR(40) NOT NULL,
  user_id CHAR(36) NULL,
  state_hash CHAR(64) NOT NULL,
  flow VARCHAR(20) NOT NULL DEFAULT 'login',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  UNIQUE KEY uq_oauth_state_hash (state_hash),
  INDEX idx_oauth_state_expiry (expires_at, consumed_at),
  CONSTRAINT fk_oauth_state_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oauth_login_handoffs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  return_path VARCHAR(191) NOT NULL DEFAULT '/panel',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  UNIQUE KEY uq_oauth_handoff_token (token_hash),
  INDEX idx_oauth_handoff_expiry (expires_at, consumed_at),
  CONSTRAINT fk_oauth_handoff_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
