const fs = require('fs');
const mysql = require('mysql2/promise');

function envValue(key) {
  const text = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
  const line = text.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.split('=').slice(1).join('=').replace(/^"|"$/g, '').trim() : '';
}

function cents(value) {
  const n = Number(value || 0);
  return Math.max(0, Math.round(n * 100));
}

function mask(value) {
  return String(value || '').replace(/([A-Za-z0-9_-]{8})[A-Za-z0-9_-]{12,}/g, '$1********');
}

async function main() {
  const outPath = process.env.POLAR_SYNC_RAW;
  const token = process.env.POLAR_TOKEN || envValue('POLAR_ACCESS_TOKEN') || envValue('POLAR_API_TOKEN');
  const env = (process.env.POLAR_ENV || envValue('POLAR_ENV') || 'sandbox').toLowerCase();
  const base = env === 'production' || env === 'prod' ? 'https://api.polar.sh/v1' : 'https://sandbox-api.polar.sh/v1';

  const db = await mysql.createPool({
    host: envValue('DB_HOST') || envValue('MYSQL_HOST') || '127.0.0.1',
    port: Number(envValue('DB_PORT') || envValue('MYSQL_PORT') || 3306),
    database: envValue('DB_NAME') || envValue('MYSQL_DATABASE'),
    user: envValue('DB_USER') || envValue('MYSQL_USER'),
    password: envValue('DB_PASSWORD') || envValue('MYSQL_PASSWORD') || '',
    waitForConnections: true,
    connectionLimit: 3,
  });

  const result = {
    env,
    base,
    tokenPresent: Boolean(token),
    listProducts: null,
    wallet: null,
    plans: [],
    errors: [],
  };

  async function polar(method, path, body) {
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'follow',
    });

    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    return { ok: response.ok, status: response.status, data };
  }

  async function query(sql, params = []) {
    const [rows] = await db.query(sql, params);
    return rows;
  }

  async function exec(sql, params = []) {
    await db.query(sql, params);
  }

  async function ensureSetting(key, value, group = 'payments', secret = 0) {
    const [rows] = await db.query('SELECT id FROM admin_settings WHERE setting_key = ? LIMIT 1', [key]);
    if (rows.length) {
      await db.query(
        'UPDATE admin_settings SET setting_value = ?, setting_group = ?, is_secret = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
        [value, group, secret, key]
      );
      return;
    }

    const [[maxRow]] = await db.query('SELECT COALESCE(MAX(id),0) + 1 AS next_id FROM admin_settings');
    await db.query(
      'INSERT INTO admin_settings (id, setting_key, setting_value, setting_group, is_secret) VALUES (?, ?, ?, ?, ?)',
      [maxRow.next_id, key, value, group, secret]
    );
  }

  async function ensureColumns() {
    const add = async (table, column, definition) => {
      const rows = await query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [table, column]
      );
      if (!rows.length) {
        await exec(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      }
    };

    await add('plans', 'polar_product_id', 'VARCHAR(190) NULL').catch(() => null);
    await add('plans', 'polar_price_id', 'VARCHAR(190) NULL').catch(() => null);
    await add('plans', 'polar_sync_status', 'VARCHAR(40) NULL DEFAULT "pending"').catch(() => null);
    await add('plans', 'polar_enabled', 'TINYINT(1) NOT NULL DEFAULT 1').catch(() => null);
  }

  if (!token) {
    result.errors.push('missing_token');
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    process.exit(2);
  }

  await ensureColumns();

  await ensureSetting('payments.polar.enabled', 'true', 'payments', 0);
  await ensureSetting('payments.polar.access_token', token, 'payments', 1);
  await ensureSetting('payments.polar.environment', env, 'payments', 0);
  await ensureSetting('payments.polar.webhook_url', 'https://ship24go.com/api/webhooks/polar', 'payments', 0);
  await ensureSetting('polar.access_token', token, 'payments', 1);
  await ensureSetting('polar.environment', env, 'payments', 0);
  await ensureSetting('POLAR_ACCESS_TOKEN', token, 'payments', 1);
  await ensureSetting('POLAR_ENV', env, 'payments', 0);

  result.listProducts = await polar('GET', '/products/?limit=5');

  async function createProduct(payload) {
    return polar('POST', '/products/', payload);
  }

  const walletPayload = {
    name: 'Ship24Go Wallet Recharge',
    description: 'Wallet recharge for Ship24Go customers.',
    recurring_interval: null,
    visibility: 'private',
    metadata: {
      source: 'ship24go',
      type: 'wallet_recharge',
    },
    prices: [
      {
        amount_type: 'custom',
        price_currency: 'eur',
      },
    ],
  };

  result.wallet = await createProduct(walletPayload);

  if (result.wallet.ok) {
    const productId = result.wallet.data.id || result.wallet.data.product?.id || '';
    const priceId = result.wallet.data.prices?.[0]?.id || result.wallet.data.product?.prices?.[0]?.id || '';
    await ensureSetting('payments.polar.wallet_product_id', productId, 'payments', 0);
    await ensureSetting('payments.polar.wallet_price_id', priceId, 'payments', 0);
    await ensureSetting('polar.wallet_product_id', productId, 'payments', 0);
    await ensureSetting('polar.wallet_price_id', priceId, 'payments', 0);
  }

  const plans = await query(`
    SELECT id, name, price, currency, COALESCE(polar_enabled, 1) AS polar_enabled
    FROM plans
    ORDER BY price ASC
  `);

  for (const plan of plans) {
    if (Number(plan.polar_enabled) !== 1) {
      result.plans.push({ id: plan.id, skipped: true, reason: 'polar_disabled' });
      continue;
    }

    const amount = cents(plan.price);
    const currency = String(plan.currency || 'EUR').toLowerCase();

    let price;
    if (amount > 0) {
      price = {
        amount_type: 'fixed',
        price_currency: currency,
        price_amount: amount,
      };
    } else {
      price = {
        amount_type: 'free',
      };
    }

    const payload = {
      name: String(plan.name || plan.id).slice(0, 64),
      description: `${plan.name || plan.id} - Ship24Go subscription plan`,
      recurring_interval: 'month',
      recurring_interval_count: 1,
      visibility: 'public',
      metadata: {
        source: 'ship24go',
        local_plan_id: String(plan.id),
      },
      prices: [price],
    };

    const created = await createProduct(payload);
    const productId = created.data?.id || created.data?.product?.id || '';
    const priceId = created.data?.prices?.[0]?.id || created.data?.product?.prices?.[0]?.id || '';

    if (created.ok && productId) {
      await exec(
        `UPDATE plans
         SET polar_product_id = ?, polar_price_id = ?, polar_sync_status = 'synced'
         WHERE id = ?`,
        [productId, priceId, plan.id]
      );
    } else {
      await exec(
        `UPDATE plans SET polar_sync_status = 'failed' WHERE id = ?`,
        [plan.id]
      ).catch(() => null);
    }

    result.plans.push({
      id: plan.id,
      name: plan.name,
      amount,
      currency,
      http: created.status,
      ok: created.ok,
      productId,
      priceId,
      response: created.data,
    });
  }

  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  const failed = result.plans.filter((p) => !p.skipped && !p.ok);
  if (!result.listProducts?.ok || !result.wallet?.ok || failed.length) {
    console.error(JSON.stringify({
      listProducts: result.listProducts?.status,
      wallet: result.wallet?.status,
      failedPlans: failed.map((p) => ({ id: p.id, http: p.http })),
    }, null, 2));
    process.exit(1);
  }

  console.log('Polar sync OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
