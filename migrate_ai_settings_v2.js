import { pool } from './server/db/connection.js';

async function migrate() {
  const columns = [
    { name: 'response_delay_seconds', query: "ALTER TABLE omnichannel_ai_settings ADD COLUMN response_delay_seconds INT NOT NULL DEFAULT 3" },
    { name: 'personality_instructions', query: "ALTER TABLE omnichannel_ai_settings ADD COLUMN personality_instructions LONGTEXT NULL" },
    { name: 'auto_learn_conversations', query: "ALTER TABLE omnichannel_ai_settings ADD COLUMN auto_learn_conversations TINYINT(1) NOT NULL DEFAULT 1" }
  ];

  for (const c of columns) {
    try {
      await pool.query(c.query);
      console.log(`Added column ${c.name}`);
    } catch (e) {
      console.log(`Column ${c.name} note:`, e.message);
    }
  }

  // Update default for tatiana / moda
  await pool.query(
    "UPDATE omnichannel_ai_settings SET response_delay_seconds = 3, auto_learn_conversations = 1 WHERE response_delay_seconds IS NULL OR response_delay_seconds = 0"
  );

  console.log('Migration completed successfully!');
  process.exit(0);
}

migrate().catch(console.error);
