const mysql = require("mysql2/promise");

async function run() {
  const conn = await mysql.createConnection({
    host: "127.0.0.1",
    user: "doordrop_ship24go",
    password: "e176335ba43abfece77d994f368ebc7c88e705ce0f3d002a4c37c60e902c82bc",
    database: "doordrop_ship24go"
  });

  const columnsToAdd = [
    { name: 'can_send_photos', query: "ALTER TABLE omnichannel_ai_settings ADD COLUMN can_send_photos TINYINT(1) NOT NULL DEFAULT 1" },
    { name: 'can_create_orders', query: "ALTER TABLE omnichannel_ai_settings ADD COLUMN can_create_orders TINYINT(1) NOT NULL DEFAULT 1" },
    { name: 'can_generate_tracking', query: "ALTER TABLE omnichannel_ai_settings ADD COLUMN can_generate_tracking TINYINT(1) NOT NULL DEFAULT 1" },
    { name: 'min_order_amount', query: "ALTER TABLE omnichannel_ai_settings ADD COLUMN min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00" },
    { name: 'free_shipping_threshold', query: "ALTER TABLE omnichannel_ai_settings ADD COLUMN free_shipping_threshold DECIMAL(10,2) NOT NULL DEFAULT 0.00" },
    { name: 'sales_contract_text', query: "ALTER TABLE omnichannel_ai_settings ADD COLUMN sales_contract_text LONGTEXT NULL" }
  ];

  for (const col of columnsToAdd) {
    try {
      await conn.query(col.query);
      console.log(`Added column ${col.name}`);
    } catch (e) {
      console.log(`Column ${col.name} already exists or error:`, e.message);
    }
  }

  // Update default settings for user moda@doordrop.lat
  const userId = 'usr_cd9c5499356269546b7c9aa27e0adebe';
  await conn.query(`
    INSERT INTO omnichannel_ai_settings 
      (user_id, agent_name, tone, language, system_prompt, business_info, faqs_json, can_lookup_orders, can_lookup_tracking, can_quote_shipping, can_search_products, can_handoff_human, can_send_photos, can_create_orders, can_generate_tracking, min_order_amount, free_shipping_threshold, sales_contract_text)
    VALUES 
      (?, 'DoorDrop Sales Assistant', 'friendly_professional', 'it', 
       'Sei l\\'assistente vendite autonomo ufficiale di questo negozio. Rispondi in modo cordiale, guida il cliente all\\'acquisto, invia foto, calcola spedizioni e crea gli ordini direttamente.', 
       'Negozio specializzato in moda con spedizioni espresse tracciate DoorDrop.',
       '[]', 1, 1, 1, 1, 1, 1, 1, 1, 0.00, 50.00,
       'Spedizioni gratuite in tutta Italia per ordini superiori a 50 EUR. Resi garantiti entro 14 giorni.')
    ON DUPLICATE KEY UPDATE 
      can_send_photos = 1,
      can_create_orders = 1,
      can_generate_tracking = 1,
      min_order_amount = 0.00,
      free_shipping_threshold = 50.00,
      sales_contract_text = VALUES(sales_contract_text),
      updated_at = CURRENT_TIMESTAMP
  `, [userId]);

  console.log("Updated omnichannel_ai_settings with autonomous sales permissions!");
  await conn.end();
}

run().catch(console.error);
