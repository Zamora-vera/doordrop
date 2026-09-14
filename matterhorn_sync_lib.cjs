const https = require('https');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const CONFIG = {
  apiKey: process.env.MATTERHORN_API_KEY || '',
  baseUrl: process.env.MATTERHORN_BASE_URL || 'https://matterhorn-wholesale.com/B2BAPI',
  storeEmail: process.env.MATTERHORN_STORE_EMAIL || 'moda@doordrop.lat',
  defaultCountry: process.env.MATTERHORN_STORE_COUNTRY || 'IT',
  defaultCity: process.env.MATTERHORN_STORE_CITY || 'Roma',
  defaultZip: process.env.MATTERHORN_STORE_ZIP || '00072',
  stateFile: process.env.MATTERHORN_STATE_FILE || path.resolve(process.cwd(), 'matterhorn_sync_state.json'),
};

const CATEGORY_RULES = [
  ['moda-intimo', /\b(lingerie|intim[oa]|reggiseno|bralette|slip|mutand|perizoma|body|babydoll|corsett|calze|collant|pigiama|nightwear)\b/i],
  ['moda-abiti', /\b(abito|abiti|vestito|vestiti|dress|gown|jumpsuit|tuta elegante)\b/i],
  ['moda-top-camicie', /\b(camicia|camicetta|blusa|top|t-shirt|maglia|maglietta|shirt|sweater|pullover|cardigan|felpa)\b/i],
  ['moda-pantaloni', /\b(pantalon|jeans|leggings|shorts|gonna|skirt|trouser)\b/i],
  ['moda-capispalla', /\b(giacca|cappotto|blazer|gilet|parka|trench|jacket|coat|mantella)\b/i],
  ['moda-calzature', /\b(scarp|stival|sandali|sneaker|heels|boots|shoes|ciabatt)\b/i],
  ['moda-accessori', /\b(borsa|borsetta|cintura|sciarpa|cappello|guanti|portafoglio|occhiali|accessori|bag|belt|hat|wallet)\b/i],
];

function log(message) { console.log(`[${new Date().toISOString()}] [Matterhorn-Cron] ${message}`); }

function fetchMatterhorn(endpoint) {
  if (!CONFIG.apiKey) return Promise.reject(new Error('MATTERHORN_API_KEY non configurata'));
  return new Promise((resolve, reject) => {
    const request = https.request(`${CONFIG.baseUrl}${endpoint}`, { method: 'GET', headers: { Authorization: CONFIG.apiKey, Accept: 'application/json' }, timeout: 20000 }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`Matterhorn HTTP ${response.statusCode}`));
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Risposta JSON Matterhorn non valida')); }
      });
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('Timeout Matterhorn')));
    request.end();
  });
}

function databaseConfig() {
  return { host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE };
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8')); }
  catch { return { lastPage: 1, totalSynced: 0, lastRun: null }; }
}
function saveState(state) { fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2), 'utf8'); }

function buildSlug(title, externalId) {
  const base = String(title || 'prodotto').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 150);
  return `${base}-mh-${String(externalId).toLowerCase().replace(/[^a-z0-9]/g, '').slice(-24)}`.slice(0, 200);
}

function classifyProduct(item) {
  const text = [item?.name_without_number, item?.name, item?.description, item?.category, item?.type].filter(Boolean).join(' ');
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(text))?.[0] || 'moda';
}

function selectBalanced(items, limit) {
  const buckets = new Map();
  for (const item of items) {
    if (!item?.id || !(item?.name_without_number || item?.name)) continue;
    const price = Number(item?.prices?.EUR);
    if (!Number.isFinite(price) || price <= 0) continue;
    const category = classifyProduct(item);
    if (!buckets.has(category)) buckets.set(category, []);
    buckets.get(category).push(item);
  }
  const selected = [];
  const seen = new Set();
  while (selected.length < limit && Array.from(buckets.values()).some((bucket) => bucket.length)) {
    for (const bucket of buckets.values()) {
      const item = bucket.shift();
      if (!item || seen.has(String(item.id))) continue;
      seen.add(String(item.id));
      selected.push(item);
      if (selected.length >= limit) break;
    }
  }
  return selected;
}

async function loadCategoryMap(connection) {
  const slugs = ['moda', ...CATEGORY_RULES.map(([slug]) => slug)];
  const [rows] = await connection.query(`SELECT id, slug FROM marketplace_categories WHERE slug IN (${slugs.map(() => '?').join(',')}) AND is_active = 1`, slugs);
  const map = new Map(rows.map((row) => [row.slug, row.id]));
  if (!map.has('moda')) throw new Error('Categoria principale moda non disponibile');
  return map;
}

async function syncImages(connection, listingId, item) {
  if (!Array.isArray(item.images) || !item.images.length) return;
  await connection.query('DELETE FROM marketplace_listing_images WHERE listing_id = ?', [listingId]);
  for (let index = 0; index < Math.min(item.images.length, 6); index++) {
    const url = String(item.images[index] || '').trim();
    if (!/^https:\/\//i.test(url)) continue;
    await connection.query('INSERT INTO marketplace_listing_images (id, listing_id, file_key, url, sort_order, is_cover, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [crypto.randomUUID(), listingId, `mh_${item.id}_${index}`, url, index, index === 0 ? 1 : 0]);
  }
}

async function reclassifyExisting(connection, sellerId, categoryMap) {
  const [rows] = await connection.query("SELECT id, title, description FROM marketplace_listings WHERE seller_id = ? AND description LIKE '%MH-%'", [sellerId]);
  let changed = 0;
  for (const row of rows) {
    const slug = classifyProduct({ name: row.title, description: row.description });
    const categoryId = categoryMap.get(slug) || categoryMap.get('moda');
    const [result] = await connection.query('UPDATE marketplace_listings SET category_id = ? WHERE id = ? AND (category_id IS NULL OR category_id <> ?)', [categoryId, row.id, categoryId]);
    changed += Number(result.affectedRows || 0);
  }
  return changed;
}

async function runMatterhornSync(options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit || 10)));
  const state = loadState();
  const page = Math.max(1, Number(state.lastPage || 1));
  const connection = await mysql.createConnection(databaseConfig());
  try {
    const [users] = await connection.query('SELECT id FROM users WHERE email = ? AND status = ?', [CONFIG.storeEmail, 'active']);
    if (!users.length) throw new Error('Account venditore Matterhorn attivo non trovato');
    const sellerId = users[0].id;
    const categoryMap = await loadCategoryMap(connection);
    const deliveries = await fetchMatterhorn(`/DICTIONARIES/DELIVERY/${CONFIG.defaultCountry}`);
    const realDeliveries = Array.isArray(deliveries) ? deliveries.filter((entry) => Number(entry?.price) > 0).sort((a, b) => Number(a.price) - Number(b.price)) : [];
    if (!realDeliveries.length) throw new Error('Nessuna tariffa reale di consegna disponibile');
    const delivery = realDeliveries[0];
    const shippingPriceMinor = Math.round(Number(delivery.price) * 100);
    const shippingCarrier = String(delivery.shipping_method || 'Corriere').slice(0, 80);
    const deliveryDays = String(delivery.delivery_time_days || 'da confermare').slice(0, 40);

    const pageResults = await Promise.allSettled([0, 7, 19].map((offset) => fetchMatterhorn(`/ITEMS/?limit=${Math.max(limit, 12)}&page=${page + offset}`)));
    const candidates = pageResults.flatMap((result) => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : []);
    const products = selectBalanced(candidates, limit);
    if (!products.length) { state.lastPage = 1; state.lastRun = new Date().toISOString(); saveState(state); throw new Error('Nessun prodotto reale valido; cursore reimpostato'); }

    let created = 0; let updated = 0; const categoryCounts = {};
    for (const item of products) {
      const rawTitle = String(item.name_without_number || item.name).trim().slice(0, 180);
      const wholesaleEur = Number(item.prices.EUR);
      const priceMinor = Math.round(wholesaleEur * 1.30 * 100);
      const weightValue = Number(item.weight);
      const weightGrams = Number.isFinite(weightValue) && weightValue > 0 ? Math.round(weightValue * 1000) : null;
      const stockValue = Number(item.quantity ?? item.stock ?? 1);
      const quantity = Number.isFinite(stockValue) && stockValue > 0 ? Math.max(1, Math.floor(stockValue)) : 1;
      const categorySlug = classifyProduct(item);
      const categoryId = categoryMap.get(categorySlug) || categoryMap.get('moda');
      categoryCounts[categorySlug] = (categoryCounts[categorySlug] || 0) + 1;
      const description = `${String(item.description || rawTitle).trim()}\n\n---\n• Marca: ${String(item.brand || 'Non specificata').trim()}\n• Colore: ${String(item.color || 'Non specificato').trim()}\n• Codice articolo fornitore: MH-${item.id}\n• Spedizione diretta fornitore: ${shippingCarrier}\n• Consegna stimata dal fornitore: ${deliveryDays} giorni lavorativi con tracciamento.`;
      const [existing] = await connection.query("SELECT id FROM marketplace_listings WHERE seller_id = ? AND description LIKE ? LIMIT 1", [sellerId, `%MH-${item.id}%`]);
      if (existing.length) {
        await connection.query(`UPDATE marketplace_listings SET category_id = ?, title = ?, description = ?, price_minor = ?, shipping_from_minor = ?, weight_grams = ?, quantity = ?, status = 'active', updated_at = NOW() WHERE id = ?`, [categoryId, rawTitle, description, priceMinor, shippingPriceMinor, weightGrams, quantity, existing[0].id]);
        await syncImages(connection, existing[0].id, item); updated++;
      } else {
        const listingId = crypto.randomUUID();
        await connection.query(`INSERT INTO marketplace_listings (id, seller_id, category_id, title, slug, description, \`condition\`, price_minor, currency, city, region, country_code, postal_code, original_language, weight_grams, length_cm, width_cm, height_cm, quantity, negotiable, shipping_available, pickup_available, shipping_from_minor, status, risk_score, view_count, favorite_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'new', ?, 'EUR', ?, 'Lazio', 'IT', ?, 'it', ?, NULL, NULL, NULL, ?, 0, 1, 0, ?, 'active', 0, 0, 0, NOW(), NOW())`, [listingId, sellerId, categoryId, rawTitle, buildSlug(rawTitle, item.id), description, priceMinor, CONFIG.defaultCity, CONFIG.defaultZip, weightGrams, quantity, shippingPriceMinor]);
        await syncImages(connection, listingId, item); created++;
      }
    }
    const reclassified = options.reclassifyExisting ? await reclassifyExisting(connection, sellerId, categoryMap) : 0;
    state.lastPage = page + 1; state.totalSynced = Number(state.totalSynced || 0) + created; state.lastRun = new Date().toISOString(); state.lastResult = { created, updated, reclassified, categoryCounts }; saveState(state);
    log(`Completato: ${created} nuovi, ${updated} aggiornati, ${reclassified} riclassificati. Mix: ${JSON.stringify(categoryCounts)}`);
    return state.lastResult;
  } finally { await connection.end(); }
}

module.exports = { runMatterhornSync, classifyProduct };
