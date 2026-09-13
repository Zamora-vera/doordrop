const mysql = require("mysql2/promise");

async function run() {
  const conn = await mysql.createConnection({
    host: "127.0.0.1",
    user: "doordrop_ship24go",
    password: "e176335ba43abfece77d994f368ebc7c88e705ce0f3d002a4c37c60e902c82bc",
    database: "doordrop_ship24go"
  });

  const tables = [
    'omnichannel_subscriptions',
    'omnichannel_profiles',
    'omnichannel_accounts',
    'omnichannel_conversations',
    'omnichannel_comments',
    'omnichannel_comment_rules',
    'omnichannel_ai_settings',
    'omnichannel_posts'
  ];

  for (const t of tables) {
    try {
      await conn.query(`ALTER TABLE ${t} MODIFY user_id VARCHAR(100) NOT NULL`);
      console.log(`Updated ${t}.user_id to VARCHAR(100)`);
    } catch (e) {
      console.error(`Error altering ${t}:`, e.message);
    }
  }

  // Ensure unique index on omnichannel_subscriptions (user_id)
  try {
    await conn.query("ALTER TABLE omnichannel_subscriptions ADD UNIQUE INDEX uq_sub_user (user_id)");
  } catch (e) {
    console.log("Unique index note:", e.message);
  }

  // Activate Omni 3 Plan with 10 channels for moda@doordrop.lat
  const userId = 'usr_cd9c5499356269546b7c9aa27e0adebe';
  await conn.query(`
    INSERT INTO omnichannel_subscriptions 
      (user_id, plan_code, status, channels_limit, ai_enabled, comment_automation, auto_publish, extra_channels_count, monthly_price, currency)
    VALUES 
      (?, 'omni3', 'active', 10, 1, 1, 1, 5, 24.99, 'EUR')
    ON DUPLICATE KEY UPDATE 
      plan_code = 'omni3',
      status = 'active',
      channels_limit = 10,
      ai_enabled = 1,
      comment_automation = 1,
      auto_publish = 1,
      extra_channels_count = 5,
      monthly_price = 24.99,
      updated_at = CURRENT_TIMESTAMP
  `, [userId]);

  console.log("Omni 3 plan assigned to moda@doordrop.lat!");
  const [sub] = await conn.query("SELECT * FROM omnichannel_subscriptions WHERE user_id = ?", [userId]);
  console.log("Current Subscription for moda@doordrop.lat:", sub[0]);

  await conn.end();
}

run().catch(console.error);
