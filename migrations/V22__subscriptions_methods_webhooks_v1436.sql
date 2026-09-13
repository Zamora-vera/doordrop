-- Ship24Go V1.4.37 — V22 safe compatibility for subscriptions/payment methods
CREATE TABLE IF NOT EXISTS admin_settings (
  id INT NOT NULL PRIMARY KEY,
  settings_json JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS s24_add_col;
DELIMITER $$
CREATE PROCEDURE s24_add_col(IN p_table VARCHAR(120), IN p_column VARCHAR(120), IN p_definition TEXT)
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = p_table)
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = p_table AND column_name = p_column) THEN
    SET @sql_add_col = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt_add_col FROM @sql_add_col;
    EXECUTE stmt_add_col;
    DEALLOCATE PREPARE stmt_add_col;
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS s24_add_idx;
DELIMITER $$
CREATE PROCEDURE s24_add_idx(IN p_table VARCHAR(120), IN p_index VARCHAR(120), IN p_definition TEXT)
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = p_table)
     AND NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = p_table AND index_name = p_index) THEN
    SET @sql_add_idx = CONCAT('ALTER TABLE `', p_table, '` ADD ', p_definition);
    PREPARE stmt_add_idx FROM @sql_add_idx;
    EXECUTE stmt_add_idx;
    DEALLOCATE PREPARE stmt_add_idx;
  END IF;
END$$
DELIMITER ;

CALL s24_add_col('admin_settings', 'setting_key', 'VARCHAR(120) NULL');
CALL s24_add_col('admin_settings', 'setting_value', 'TEXT NULL');
CALL s24_add_col('admin_settings', 'setting_group', 'VARCHAR(80) NULL');
CALL s24_add_col('admin_settings', 'is_secret', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL s24_add_col('admin_settings', 'created_at', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP');
UPDATE admin_settings SET setting_key = CONCAT('legacy.', id) WHERE setting_key IS NULL OR setting_key = '';
CALL s24_add_idx('admin_settings', 'uniq_setting_key', 'UNIQUE KEY `uniq_setting_key` (`setting_key`)');

CALL s24_add_col('api_keys', 'paypalEnvironment', 'VARCHAR(30) NULL DEFAULT "sandbox"');
CALL s24_add_col('api_keys', 'paypalWebhookId', 'VARCHAR(255) NULL');
CALL s24_add_col('api_keys', 'paypalWebhookSecret', 'VARCHAR(255) NULL');
CALL s24_add_col('api_keys', 'paypalWebhookUrl', 'VARCHAR(255) NULL');
CALL s24_add_col('api_keys', 'polarWalletProductId', 'VARCHAR(255) NULL');
CALL s24_add_col('api_keys', 'polarSubscriptionProductId', 'VARCHAR(255) NULL');
CALL s24_add_col('api_keys', 'polarWebhookId', 'VARCHAR(255) NULL');
CALL s24_add_col('api_keys', 'polarWebhookSecret', 'VARCHAR(255) NULL');
CALL s24_add_col('api_keys', 'polarWebhookUrl', 'VARCHAR(255) NULL');
CALL s24_add_col('api_keys', 'polarEnvironment', 'VARCHAR(30) NULL DEFAULT "sandbox"');
CALL s24_add_col('api_keys', 'paymentWalletEnabled', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL s24_add_col('api_keys', 'paymentPolarEnabled', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL s24_add_col('api_keys', 'paymentPaypalEnabled', 'TINYINT(1) NOT NULL DEFAULT 1');

CALL s24_add_col('plans', 'billing_interval', 'VARCHAR(30) NOT NULL DEFAULT "month"');
CALL s24_add_col('plans', 'wallet_enabled', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL s24_add_col('plans', 'polar_enabled', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL s24_add_col('plans', 'paypal_enabled', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL s24_add_col('plans', 'polar_product_id', 'VARCHAR(255) NULL');
CALL s24_add_col('plans', 'polar_price_id', 'VARCHAR(255) NULL');
CALL s24_add_col('plans', 'polar_sync_status', 'VARCHAR(30) NOT NULL DEFAULT "pending"');
CALL s24_add_col('plans', 'polar_last_synced_at', 'DATETIME NULL');
CALL s24_add_col('plans', 'paypal_product_id', 'VARCHAR(255) NULL');
CALL s24_add_col('plans', 'paypal_plan_id', 'VARCHAR(255) NULL');
CALL s24_add_col('plans', 'paypal_sync_status', 'VARCHAR(30) NOT NULL DEFAULT "pending"');
CALL s24_add_col('plans', 'paypal_last_synced_at', 'DATETIME NULL');
CALL s24_add_col('plans', 'discount_percent', 'DECIMAL(8,2) NOT NULL DEFAULT 0');

CALL s24_add_col('payments', 'metadata_json', 'LONGTEXT NULL');
CALL s24_add_col('payments', 'purpose', 'VARCHAR(80) NULL');
CALL s24_add_col('payments', 'plan_id', 'CHAR(36) NULL');
CALL s24_add_col('payments', 'subscription_id', 'CHAR(36) NULL');
CALL s24_add_col('payments', 'provider_payment_id', 'VARCHAR(190) NULL');
CALL s24_add_col('payments', 'checkout_url', 'TEXT NULL');
CALL s24_add_col('subscriptions', 'metadata_json', 'LONGTEXT NULL');
CALL s24_add_col('subscriptions', 'external_customer_id', 'VARCHAR(191) NULL');
CALL s24_add_col('subscriptions', 'provider_subscription_id', 'VARCHAR(190) NULL');
CALL s24_add_col('subscriptions', 'payment_provider', 'VARCHAR(40) NULL');
CALL s24_add_col('subscriptions', 'billing_currency', 'VARCHAR(10) NULL DEFAULT "EUR"');
CALL s24_add_col('wallet_topups', 'metadata_json', 'LONGTEXT NULL');
CALL s24_add_col('wallet_transactions', 'metadata_json', 'LONGTEXT NULL');

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(40) NOT NULL,
  event_id VARCHAR(190) NULL,
  event_type VARCHAR(190) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'received',
  payload_json LONGTEXT NULL,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_provider_event (provider, event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subscription_payments (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(80) NOT NULL,
  plan_id VARCHAR(80) NULL,
  provider VARCHAR(40) NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  provider_payment_id VARCHAR(190) NULL,
  provider_subscription_id VARCHAR(190) NULL,
  checkout_url TEXT NULL,
  metadata_json LONGTEXT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(80) NOT NULL,
  plan_id VARCHAR(80) NULL,
  provider VARCHAR(40) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
  started_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  current_period_start TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  current_period_end TIMESTAMP NULL,
  provider_subscription_id VARCHAR(190) NULL,
  metadata_json LONGTEXT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

UPDATE plans SET wallet_enabled = COALESCE(wallet_enabled, 1), polar_enabled = COALESCE(polar_enabled, 1), paypal_enabled = COALESCE(paypal_enabled, 1);
UPDATE api_keys SET paymentWalletEnabled = COALESCE(paymentWalletEnabled, 1), paymentPolarEnabled = COALESCE(paymentPolarEnabled, 1), paymentPaypalEnabled = COALESCE(paymentPaypalEnabled, 1), paypalWebhookUrl = COALESCE(NULLIF(paypalWebhookUrl,''), 'https://ship24go.com/api/webhooks/paypal'), polarWebhookUrl = COALESCE(NULLIF(polarWebhookUrl,''), 'https://ship24go.com/api/webhooks/polar') WHERE id = 1;

DROP PROCEDURE IF EXISTS s24_add_col;
DROP PROCEDURE IF EXISTS s24_add_idx;
