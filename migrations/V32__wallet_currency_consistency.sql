-- DoorDrop wallet currency consistency
-- users.balance is stored in users.currency. Historical wallet transactions are
-- preserved; only future wallet mutations and explicit currency changes use the
-- account currency and retain their source amount/rate when applicable.

CREATE TABLE IF NOT EXISTS wallet_currency_conversions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  from_currency CHAR(3) NOT NULL,
  to_currency CHAR(3) NOT NULL,
  from_balance DECIMAL(12,2) NOT NULL,
  to_balance DECIMAL(12,2) NOT NULL,
  exchange_rate DECIMAL(24,12) NOT NULL,
  rate_source VARCHAR(80) NOT NULL DEFAULT 'fx_provider',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallet_currency_conversion_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_wallet_currency_conversion_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS source_amount DECIMAL(12,2) NULL;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS source_currency CHAR(3) NULL;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS fx_rate DECIMAL(24,12) NULL;
