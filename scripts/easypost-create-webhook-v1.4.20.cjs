const mysql = require('mysql2/promise');
require('dotenv').config();

function parseJsonSafe(value) {
  try { return value ? (typeof value === 'object' ? value : JSON.parse(String(value))) : {}; } catch { return {}; }
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    user: process.env.MYSQL_USER || process.env.DB_USER || process.env.DB_USERNAME,
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.DB_DATABASE || process.env.DB_NAME
  });
  const [[provider]] = await db.query("SELECT config_json FROM providers WHERE code='easypost' LIMIT 1").catch(() => [[null]]);
  const cfg = parseJsonSafe(provider?.config_json);
  const mode = String(process.env.EASYPOST_MODE || cfg.mode || 'test').toLowerCase();
  const key = String(mode === 'production' ? (process.env.EASYPOST_PRODUCTION_API_KEY || process.env.EASYPOST_API_KEY || cfg.apiKey || '') : (process.env.EASYPOST_TEST_API_KEY || process.env.EASYPOST_API_KEY || cfg.apiKey || '')).trim();
  if (!key) throw new Error('Credencial EasyPost pendiente.');
  const url = String(process.env.EASYPOST_WEBHOOK_URL || cfg.webhookUrl || `${process.env.APP_URL || 'https://ship24go.com'}/api/webhooks/easypost`);
  const secret = String(process.env.EASYPOST_WEBHOOK_SECRET || cfg.webhookSecret || '').trim();
  const body = { webhook: { url } };
  if (secret) body.webhook.webhook_secret = secret;
  const auth = Buffer.from(`${key}:`).toString('base64');
  const res = await fetch('https://api.easypost.com/v2/webhooks', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  await db.query(`INSERT INTO provider_logs (id, provider_code, action_type, request_payload, response_payload, http_status, created_at) VALUES (?, 'easypost', 'webhook_create_cli', ?, ?, ?, NOW())`, [`log_${Date.now()}`, JSON.stringify(body), JSON.stringify(json), res.status]).catch(() => null);
  await db.end();
  if (!res.ok || json?.error) {
    console.log('No se pudo completar la operación. Revisa la credencial privada.');
    process.exit(1);
  }
  console.log(`Webhook EasyPost listo: ${url}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
