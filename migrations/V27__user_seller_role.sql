-- =============================================================================
-- V27 — User Seller Role Extension
-- DoorDrop Marketplace Integration
-- Date: 2026-09-13
-- Description: Adds is_seller flag to users table so a customer can also be a
--              seller without changing their base role. Also adds seller-related
--              fields that the panel needs.
-- =============================================================================

-- Add seller flag to existing users table
ALTER TABLE users
  ADD COLUMN is_seller TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN seller_profile_id CHAR(36) NULL AFTER is_seller,
  ADD INDEX idx_users_seller (is_seller);

-- Record migration
INSERT IGNORE INTO schema_migrations (version, name, description) VALUES
  ('V27', 'user_seller_role', 'Adds is_seller flag and seller_profile_id to users table for marketplace vendor capability');
