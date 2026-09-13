/**
 * Matterhorn B2B Wholesale Cron Worker for DoorDrop Marketplace
 * Integrates directly with Matterhorn API (Key: 8c6d9d74ee)
 *
 * Rules:
 * - Margin: Exactly +30% over wholesale price
 * - Shipping: Direct supplier delivery via Matterhorn API (/DICTIONARIES/DELIVERY/IT)
 * - Frequency: 10 products per hour (cron)
 */

const https = require('https');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const fs = require('fs');

const CONFIG = {
  apiKey: '8c6d9d74ee',
  baseUrl: 'https://matterhorn-wholesale.com/B2BAPI',
  storeEmail: 'moda@doordrop.lat',
  storeName: 'Zubay IT',
  defaultCountry: 'IT',
  defaultCity: 'Roma',
  defaultZip: '00072',
  stateFile: '/app/matterhorn_sync_state.json'
};

function log(msg) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Matterhorn-Cron] ${msg}`);
}

function fetchMatterhorn(endpoint) {
  return new Promise((resolve, reject) => {
    const url = `${CONFIG.baseUrl}${endpoint}`;
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'Authorization': CONFIG.apiKey,
        'Accept': 'application/json'
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch(e) {
            reject(new Error(`JSON Parse error: ${e.message}`));
          }
        } else {
          reject(new Error(`Matterhorn error ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout: ${url}`));
    });
    req.end();
  });
}

function buildSlug(title, city = 'roma') {
  const base = `${title} ${city}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
}

function loadState() {
  try {
    if (fs.existsSync(CONFIG.stateFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf-8'));
    }
  } catch(e) {}
  return { lastPage: 1, totalSynced: 0, lastRun: null };
}

function saveState(state) {
  try {
    fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2), 'utf-8');
  } catch(e) {}
}

async function runCronSync(batchSize = 10) {
  const state = loadState();
  const page = state.lastPage || 1;
  log(`Iniciando lote de sincronización (Página ${page}, ${batchSize} artículos con margen +30%)...`);

  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'doordrop_ship24go',
    password: 'e176335ba43abfece77d994f368ebc7c88e705ce0f3d002a4c37c60e902c82bc',
    database: 'doordrop_ship24go'
  });

  try {
    // 1. Fetch live delivery from Matterhorn API
    let deliveryPriceMinor = 790;
    let shippingCarrier = 'GLOBAL';
    let deliveryDays = '3-4';
    try {
      const itDeliveries = await fetchMatterhorn('/DICTIONARIES/DELIVERY/IT');
      if (Array.isArray(itDeliveries) && itDeliveries.length > 0) {
        deliveryPriceMinor = Math.round((itDeliveries[0].price || 7.9) * 100);
        shippingCarrier = itDeliveries[0].shipping_method || 'GLOBAL';
        deliveryDays = itDeliveries[0].delivery_time_days || '3-4';
      }
    } catch(e) {
      log(`Nota sobre delivery API: ${e.message}`);
    }

    const [users] = await conn.query('SELECT id FROM users WHERE email = ?', [CONFIG.storeEmail]);
    if (users.length === 0) throw new Error(`Vendedor ${CONFIG.storeEmail} no encontrado.`);
    const sellerId = users[0].id;
    const categoryId = 2; // Moda e Abbigliamento

    const products = await fetchMatterhorn(`/ITEMS/?limit=${batchSize}&page=${page}`);
    if (!Array.isArray(products) || products.length === 0) {
      log('No hay más productos en la página actual. Reiniciando a página 1.');
      state.lastPage = 1;
      saveState(state);
      await conn.end();
      return;
    }

    let created = 0;
    let updated = 0;

    for (const item of products) {
      if (!item.id || !item.name) continue;

      const rawTitle = (item.name_without_number || item.name || '').trim();
      const productTitle = rawTitle;

      // REGLA: PRECIO +30% EXACTO
      const wholesaleEur = (item.prices && typeof item.prices.EUR === 'number') ? item.prices.EUR : 20.00;
      const retailPriceEur = wholesaleEur * 1.30;
      const retailPriceMinor = Math.round(retailPriceEur * 100);
      const weightGrams = item.weight ? Math.round(Number(item.weight) * 1000) : 350;

      const description = `${(item.description || rawTitle).trim()}

---
• Dettagli Prodotto:
  - Marca: ${item.brand || 'Moda Italiana & Europea'}
  - Colore: ${item.color || 'Standard'}
  - Codice Articolo: MH-${item.id}
• Spedizione & Consegna Diretta:
  - Metodo di Spedizione: Spedizione Diretta Fornitore (${shippingCarrier})
  - Tempi di Consegna Stimati: ${deliveryDays} giorni lavorativi con tracciamento
  - Tariffe calcolate direttamente via API fornitore (Spedizione internazionale/nazionale diretta)
• Garanzia & Protezione Acquirente Marketplace inclusa.`;

      const [existing] = await conn.query(
        "SELECT id FROM marketplace_listings WHERE seller_id = ? AND description LIKE ?",
        [sellerId, `%MH-${item.id}%`]
      );

      let listingId;
      if (existing.length > 0) {
        listingId = existing[0].id;
        await conn.query(
          `UPDATE marketplace_listings SET
            title = ?,
            description = ?,
            price_minor = ?,
            shipping_from_minor = ?,
            weight_grams = ?,
            status = 'active',
            updated_at = NOW()
          WHERE id = ?`,
          [productTitle, description, retailPriceMinor, deliveryPriceMinor, weightGrams, listingId]
        );
        updated++;
      } else {
        listingId = crypto.randomUUID();
        const slug = buildSlug(rawTitle, 'roma');

        await conn.query(
          `INSERT INTO marketplace_listings (
            id, seller_id, category_id, title, slug, description,
            \`condition\`, price_minor, currency, city, region,
            country_code, postal_code, original_language, weight_grams,
            length_cm, width_cm, height_cm, quantity, negotiable,
            shipping_available, pickup_available, shipping_from_minor,
            status, risk_score, view_count, favorite_count,
            created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            'new', ?, 'EUR', ?, 'Lazio',
            'IT', ?, 'it', ?,
            25, 20, 5, 25, 0,
            1, 0, ?,
            'active', 0, 0, 0,
            NOW(), NOW()
          )`,
          [
            listingId, sellerId, categoryId, productTitle, slug, description,
            retailPriceMinor, CONFIG.defaultCity, CONFIG.defaultZip,
            weightGrams, deliveryPriceMinor
          ]
        );
        created++;
      }

      if (Array.isArray(item.images) && item.images.length > 0) {
        await conn.query('DELETE FROM marketplace_listing_images WHERE listing_id = ?', [listingId]);
        for (let i = 0; i < Math.min(item.images.length, 6); i++) {
          const imgUrl = item.images[i];
          const imgId = crypto.randomUUID();
          await conn.query(
            `INSERT INTO marketplace_listing_images (
              id, listing_id, file_key, url, sort_order, is_cover, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [imgId, listingId, `mh_img_${item.id}_${i}`, imgUrl, i, i === 0 ? 1 : 0]
          );
        }
      }
    }

    log(`Ciclo completato: ${created} nuovi, ${updated} aggiornati a +30%.`);
    state.lastPage = page + 1;
    state.totalSynced = (state.totalSynced || 0) + created;
    state.lastRun = new Date().toISOString();
    saveState(state);

    const [totalRows] = await conn.query('SELECT count(*) as total FROM marketplace_listings WHERE seller_id = ?', [sellerId]);
    log(`Total productos en tienda Zubay IT: ${totalRows[0].total}`);

  } catch (err) {
    log(`Error en cron: ${err.message}`);
  } finally {
    await conn.end();
  }
}

const args = process.argv.slice(2);
let batch = 10;
args.forEach(a => {
  if (a.startsWith('--batch=')) batch = parseInt(a.split('=')[1], 10) || 10;
  if (a.startsWith('--limit=')) batch = parseInt(a.split('=')[1], 10) || 10;
});

runCronSync(batch)
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
