-- Ship24Go V1.4.32 — AI Copilot + Human Support Escalation

CREATE TABLE IF NOT EXISTS ai_conversations (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'es',
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  ticket_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ai_conversations_user_created (user_id, created_at),
  INDEX idx_ai_conversations_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_messages (
  id CHAR(36) PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  role VARCHAR(30) NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_messages_conversation_created (conversation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_handoffs (
  id CHAR(36) PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  ticket_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'es',
  reason VARCHAR(120) NULL,
  summary TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_handoffs_user_created (user_id, created_at),
  INDEX idx_ai_handoffs_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
