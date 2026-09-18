ALTER TABLE marketplace_seller_profiles
  ADD COLUMN IF NOT EXISTS terms_version VARCHAR(32) NULL AFTER terms_accepted_at,
  ADD COLUMN IF NOT EXISTS terms_language VARCHAR(5) NULL AFTER terms_version;
