-- V41 — DoorDrop Omnicanal: aceptación de términos por usuario
CREATE TABLE IF NOT EXISTS omnichannel_terms_acceptances (
  user_id CHAR(36) NOT NULL,
  terms_version VARCHAR(32) NOT NULL,
  terms_language VARCHAR(5) NOT NULL,
  accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
