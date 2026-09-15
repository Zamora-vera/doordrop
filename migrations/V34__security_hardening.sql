-- DoorDrop V34: session invalidation and authentication hardening.
-- initDb also applies this compatibility statement on existing installations.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_token_version INT NOT NULL DEFAULT 1;
