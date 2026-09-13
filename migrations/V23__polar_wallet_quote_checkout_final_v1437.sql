-- Ship24Go V1.4.37 final compatibility patch
-- Polar checkout, wallet, payments and plan discounts.

ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(80) NULL;
ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(191) NULL;
ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS external_reference VARCHAR(191) NULL;
ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS method VARCHAR(80) NULL;
ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS receipt_id CHAR(36) NULL;
ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS proof_url VARCHAR(600) NULL;
ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS metadata_json LONGTEXT NULL;

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'completed' AFTER currency;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS admin_note TEXT NULL;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS metadata_json LONGTEXT NULL;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS purpose VARCHAR(80) NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS plan_id CHAR(36) NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS subscription_id CHAR(36) NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payment_id VARCHAR(190) NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_url TEXT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata_json LONGTEXT NULL;

UPDATE plans
SET is_active = 1,
    price = 0,
    currency = COALESCE(NULLIF(currency, ''), 'EUR'),
    wallet_enabled = 0,
    polar_enabled = 0,
    paypal_enabled = 0,
    polar_sync_status = COALESCE(NULLIF(polar_sync_status, ''), 'synced')
WHERE id = 'plan_basic';

UPDATE plans
SET discount_percent = 10,
    wallet_enabled = 1,
    polar_enabled = 1,
    paypal_enabled = 1
WHERE id = 'plan_pro';

UPDATE plans
SET discount_percent = 20,
    wallet_enabled = 1,
    polar_enabled = 1,
    paypal_enabled = 1
WHERE id = 'plan_enterprise';
