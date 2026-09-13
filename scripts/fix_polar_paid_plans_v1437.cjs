const fs = require('fs');
const mysql = require('mysql2/promise');

function envValue(key) {
  const text = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
  const line = text.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.split('=').slice(1).join('=').replace(/^"|"$/g, '').trim() : '';
}

async function main() {
  const rawPath = process.env.RAW_PATH;
  const db = await mysql.createPool({
    host: envValue('DB_HOST') || envValue('MYSQL_HOST') || '127.0.0.1',
    port: Number(envValue('DB_PORT') || envValue('MYSQL_PORT') || 3306),
    database: envValue('DB_NAME') || envValue('MYSQL_DATABASE'),
    user: envValue('DB_USER') || envValue('MYSQL_USER'),
    password: envValue('DB_PASSWORD') || envValue('MYSQL_PASSWORD') || '',
  });

  const [settings] = await db.query(`
    SELECT setting_key, setting_value
    FROM admin_settings
    WHERE setting_key IN (
      'payments.polar.access_token',
      'polar.access_token',
      'POLAR_ACCESS_TOKEN',
      'payments.polar.environment',
      'polar.environment',
      'POLAR_ENV'
    )
  `);

  const map = Object.fromEntries(settings.map((s) => [s.setting_key, s.setting_value]));
  const token =
    map['payments.polar.access_token'] ||
    map['polar.access_token'] ||
    map['POLAR_ACCESS_TOKEN'] ||
    envValue('POLAR_ACCESS_TOKEN') ||
    envValue('POLAR_API_TOKEN');

  const polarEnv = (
    map['payments.polar.environment'] ||
    map['polar.environment'] ||
    map['POLAR_ENV'] ||
    envValue('POLAR_ENV') ||
    'sandbox'
  ).toLowerCase();

  const base = polarEnv === 'production' || polarEnv === 'prod'
    ? 'https://api.polar.sh/v1'
    : 'https://sandbox-api.polar.sh/v1';

  const result = {
    base,
    tokenPresent: Boolean(token),
    plans: [],
  };

  if (!token) {
    result.error = 'missing_token';
    fs.writeFileSync(rawPath, JSON.stringify(result, null, 2));
    process.exit(1);
  }

  async function polarCreate(payload) {
    const r = await fetch(`${base}/products/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    return { ok: r.ok, status: r.status, data };
  }

  const [plans] = await db.query(`
    SELECT id, name, price, currency, polar_product_id, polar_price_id
    FROM plans
    WHERE COALESCE(price,0) > 0
      AND (polar_product_id IS NULL OR polar_product_id = '' OR polar_price_id IS NULL OR polar_price_id = '')
    ORDER BY price ASC
  `);

  for (const plan of plans) {
    const priceAmount = Math.round(Number(plan.price || 0) * 100);
    const currency = String(plan.currency || 'EUR').toLowerCase();

    const payload = {
      name: String(plan.name || plan.id),
      description: `${plan.name || plan.id} - Ship24Go subscription`,
      recurring_interval: 'month',
      recurring_interval_count: 1,
      visibility: 'public',
      metadata: {
        source: 'ship24go',
        local_plan_id: String(plan.id),
      },
      prices: [
        {
          amount_type: 'fixed',
          price_amount: priceAmount,
          price_currency: currency,
        },
      ],
    };

    const created = await polarCreate(payload);

    const productId = created.data?.id || created.data?.product?.id || '';
    const priceId =
      created.data?.prices?.[0]?.id ||
      created.data?.product?.prices?.[0]?.id ||
      '';

    if (created.ok && productId) {
      await db.query(
        `UPDATE plans
         SET polar_product_id = ?, polar_price_id = ?, polar_sync_status = 'synced'
         WHERE id = ?`,
        [productId, priceId, plan.id]
      );
    } else {
      await db.query(
        `UPDATE plans SET polar_sync_status = 'failed' WHERE id = ?`,
        [plan.id]
      ).catch(() => {});
    }

    result.plans.push({
      id: plan.id,
      name: plan.name,
      price: plan.price,
      currency,
      priceAmount,
      http: created.status,
      ok: created.ok,
      productId,
      priceId,
      response: created.data,
    });
  }

  const [after] = await db.query(`
    SELECT id, name, price, currency, polar_product_id, polar_price_id, polar_sync_status
    FROM plans
    ORDER BY price ASC
  `);

  result.after = after;

  fs.writeFileSync(rawPath, JSON.stringify(result, null, 2));

  const failed = result.plans.filter((p) => !p.ok);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  fs.writeFileSync(process.env.RAW_PATH, JSON.stringify({ error: err.message }, null, 2));
  process.exit(1);
});
