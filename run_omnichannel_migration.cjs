const mysql = require("mysql2/promise");

async function run() {
  const conn = await mysql.createConnection({
    host: "127.0.0.1",
    user: "doordrop_ship24go",
    password: "e176335ba43abfece77d994f368ebc7c88e705ce0f3d002a4c37c60e902c82bc",
    database: "doordrop_ship24go"
  });

  console.log("Connected to MySQL successfully");

  // 1. omnichannel_subscriptions
  await conn.query(`
    CREATE TABLE IF NOT EXISTS omnichannel_subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      plan_code VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      channels_limit INT NOT NULL DEFAULT 1,
      ai_enabled TINYINT(1) NOT NULL DEFAULT 1,
      comment_automation TINYINT(1) NOT NULL DEFAULT 0,
      auto_publish TINYINT(1) NOT NULL DEFAULT 0,
      extra_channels_count INT NOT NULL DEFAULT 0,
      monthly_price DECIMAL(10,2) NOT NULL DEFAULT 9.99,
      currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
      renews_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 2. omnichannel_profiles (Zernio profile per user)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS omnichannel_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      zernio_profile_id VARCHAR(100) NOT NULL,
      profile_name VARCHAR(150) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      INDEX idx_zernio_profile (zernio_profile_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 3. omnichannel_accounts (Connected channels / social accounts)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS omnichannel_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      zernio_account_id VARCHAR(100) NOT NULL,
      platform VARCHAR(50) NOT NULL,
      account_name VARCHAR(150) NULL,
      username VARCHAR(150) NULL,
      phone_number VARCHAR(50) NULL,
      avatar_url TEXT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'connected',
      metadata_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_account (user_id, zernio_account_id),
      INDEX idx_user_platform (user_id, platform)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 4. omnichannel_conversations
  await conn.query(`
    CREATE TABLE IF NOT EXISTS omnichannel_conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      account_id INT NULL,
      platform VARCHAR(50) NOT NULL,
      zernio_conversation_id VARCHAR(150) NOT NULL,
      contact_id VARCHAR(150) NULL,
      contact_name VARCHAR(150) NULL,
      contact_avatar TEXT NULL,
      contact_phone VARCHAR(50) NULL,
      last_message TEXT NULL,
      last_message_at DATETIME NULL,
      unread_count INT NOT NULL DEFAULT 0,
      ai_active TINYINT(1) NOT NULL DEFAULT 1,
      status VARCHAR(50) NOT NULL DEFAULT 'open',
      tags_json TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_conv (user_id, zernio_conversation_id),
      INDEX idx_user_last (user_id, last_message_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 5. omnichannel_messages
  await conn.query(`
    CREATE TABLE IF NOT EXISTS omnichannel_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      zernio_message_id VARCHAR(150) NULL,
      direction VARCHAR(20) NOT NULL DEFAULT 'inbound',
      sender_type VARCHAR(30) NOT NULL DEFAULT 'contact',
      sender_name VARCHAR(100) NULL,
      text_content LONGTEXT NULL,
      media_type VARCHAR(50) NULL,
      media_url TEXT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'delivered',
      metadata_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_conv (conversation_id),
      INDEX idx_zernio_msg (zernio_message_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 6. omnichannel_comments
  await conn.query(`
    CREATE TABLE IF NOT EXISTS omnichannel_comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      platform VARCHAR(50) NOT NULL,
      zernio_post_id VARCHAR(150) NULL,
      zernio_comment_id VARCHAR(150) NOT NULL,
      author_name VARCHAR(150) NULL,
      author_username VARCHAR(150) NULL,
      comment_text TEXT NULL,
      post_caption TEXT NULL,
      reply_status VARCHAR(50) NOT NULL DEFAULT 'pending',
      reply_text TEXT NULL,
      is_hidden TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      INDEX idx_comment (zernio_comment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 7. omnichannel_comment_rules (Comment-to-DM automation)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS omnichannel_comment_rules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      platform VARCHAR(50) NOT NULL DEFAULT 'all',
      keywords_json TEXT NULL,
      match_all TINYINT(1) NOT NULL DEFAULT 0,
      public_reply_text TEXT NULL,
      dm_reply_text TEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 8. omnichannel_ai_settings
  await conn.query(`
    CREATE TABLE IF NOT EXISTS omnichannel_ai_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      agent_name VARCHAR(100) NOT NULL DEFAULT 'DoorDrop AI Assistant',
      tone VARCHAR(50) NOT NULL DEFAULT 'friendly_professional',
      language VARCHAR(10) NOT NULL DEFAULT 'it',
      system_prompt LONGTEXT NULL,
      business_info LONGTEXT NULL,
      faqs_json LONGTEXT NULL,
      website_url VARCHAR(255) NULL,
      knowledge_files_json LONGTEXT NULL,
      can_lookup_orders TINYINT(1) NOT NULL DEFAULT 1,
      can_lookup_tracking TINYINT(1) NOT NULL DEFAULT 1,
      can_quote_shipping TINYINT(1) NOT NULL DEFAULT 1,
      can_search_products TINYINT(1) NOT NULL DEFAULT 1,
      can_handoff_human TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 9. omnichannel_posts (Auto-publishing & scheduling)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS omnichannel_posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      caption LONGTEXT NULL,
      media_urls_json LONGTEXT NULL,
      target_platforms_json TEXT NULL,
      scheduled_at DATETIME NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'draft',
      zernio_post_id VARCHAR(150) NULL,
      error_message TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      INDEX idx_status_sched (status, scheduled_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 10. omnichannel_webhook_events (Deduplication and logging)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS omnichannel_webhook_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id VARCHAR(150) NOT NULL UNIQUE,
      event_type VARCHAR(100) NOT NULL,
      payload_json LONGTEXT NOT NULL,
      processed TINYINT(1) NOT NULL DEFAULT 0,
      error_message TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_event (event_id),
      INDEX idx_type (event_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 11. Ensure admin_settings table has zernio configuration
  await conn.query(`
    INSERT INTO admin_settings (setting_key, setting_value, is_secret)
    VALUES 
      ('zernio_api_key', 'sk_895a0c3cf6da498f854c000ef72860d0ca5f5c313464055e44e07454a50cfa7a', 1),
      ('zernio_webhook_secret', 'whsec_dd_omni_895a0c3cf6da498f854c000ef72860d0', 1),
      ('zernio_api_url', 'https://zernio.com/api/v1', 0),
      ('omnichannel_extra_channel_usd', '8.00', 0),
      ('omnichannel_default_currency', 'EUR', 0)
    ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;
  `);

  console.log("All omnichannel tables created and admin settings verified!");
  const [tables] = await conn.query("SHOW TABLES LIKE 'omnichannel%'");
  console.log("Omnichannel tables:", tables.map(t => Object.values(t)[0]));
  await conn.end();
}

run().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
