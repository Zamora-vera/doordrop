/**
 * Matterhorn Wholesale B2B Sync Engine for DoorDrop Marketplace
 * Integrates Matterhorn Moda catalog into tienda "Zubay IT" (moda@doordrop.lat)
 * 
 * Rules applied:
 * - Margin: Exactly +30% over wholesale price (EUR price * 1.30)
 * - Shipping: Direct from Matterhorn via API (/DICTIONARIES/DELIVERY/{country_code})
 *   (Not DoorDrop courier, direct carrier from Matterhorn: GLOBAL / DPD)
 * - Brand: Zubay IT / Matterhorn Direct
 * - Cron & manual execution support
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
            reject(new Error(`JSON Parse error from ${url}: ${e.message}`));
          }
        } else {
          reject(new Error(`Matterhorn API error (${res.statusCode}): ${data.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout on ${url}`));
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

async function updateAllProductsWithNewMarginAndShipping(options = {}) {
  const limit = options.limit || 100;
  console.log(`[Matterhorn Sync] Sincronizando productos con margen +30% y envío directo Matterhorn API (Límite: ${limit})...`);

  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'doordrop_ship24go',
    password: 'e176335ba43abfece77d994f368ebc7c88e705ce0f3d002a4c37c60e902c82bc',
    database: 'doordrop_ship24go'
  });

  try {
    // 1. Fetch live delivery tariffs from Matterhorn for IT
    console.log('[Matterhorn Sync] Consultando tarifas de envío directo en Matterhorn API para IT...');
    let itDeliveryOptions = [];
    try {
      itDeliveryOptions = await fetchMatterhorn('/DICTIONARIES/DELIVERY/IT');
      console.log(`[Matterhorn Sync] Opciones de entrega obtenidas: ${itDeliveryOptions.length}`);
    } catch (e) {
      console.warn('[Matterhorn Sync] Error al obtener delivery, usando fallback:', e.message);
    }

    // Lowest delivery price from Matterhorn (typically 7.90 EUR via GLOBAL)
    const cheapestDelivery = itDeliveryOptions.length > 0 ? itDeliveryOptions[0] : { price: 7.9, shipping_method: 'GLOBAL', delivery_time_days: '3-4' };
    const shippingPriceMinor = Math.round((cheapestDelivery.price || 7.9) * 100);
    const shippingCarrier = cheapestDelivery.shipping_method || 'GLOBAL';
    const deliveryDays = cheapestDelivery.delivery_time_days || '3-4';

    console.log(`[Matterhorn Sync] Tarifa de envío directo Matterhorn: ${cheapestDelivery.price} EUR (${shippingCarrier} - ${deliveryDays} días)`);

    // 2. Fetch products from Matterhorn API
    const products = await fetchMatterhorn(`/ITEMS/?limit=${limit}`);
    console.log(`[Matterhorn Sync] Procesando ${products.length} productos de Matterhorn...`);

    const [users] = await conn.query('SELECT id FROM users WHERE email = ?', [CONFIG.storeEmail]);
    if (users.length === 0) throw new Error('Usuario vendedor no encontrado.');
    const sellerId = users[0].id;
    const categoryId = 2; // Moda e Abbigliamento

    let updatedCount = 0;
    let createdCount = 0;

    for (const item of products) {
      if (!item.id || !item.name) continue;

      const rawTitle = (item.name_without_number || item.name || '').trim();
      const productTitle = rawTitle; // Limpio, sin prefijo forzado

      // REGLA CLAVE: +30% EXACTO SOBRE EL PRECIO MAYORISTA
      const wholesaleEur = (item.prices && typeof item.prices.EUR === 'number') ? item.prices.EUR : 20.00;
      const retailPriceEur = wholesaleEur * 1.30;
      const retailPriceMinor = Math.round(retailPriceEur * 100);

      const weightGrams = item.weight ? Math.round(Number(item.weight) * 1000) : 350;

      // Descripción enfocada en envío directo desde almacén central europeo
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

      // Check if product exists
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
          [productTitle, description, retailPriceMinor, shippingPriceMinor, weightGrams, listingId]
        );
        updatedCount++;
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
            weightGrams, shippingPriceMinor
          ]
        );
        createdCount++;
      }

      // Sync Images
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

    console.log(`[Matterhorn Sync] Finalizado: ${updatedCount} actualizados a +30%, ${createdCount} nuevos.`);

  } catch (err) {
    console.error('[Matterhorn Sync] Error:', err);
  } finally {
    await conn.end();
  }
}

const args = process.argv.slice(2);
let limit = 100;
args.forEach(a => {
  if (a.startsWith('--limit=')) limit = parseInt(a.split('=')[1], 10) || 100;
});

updateAllProductsWithNewMarginAndShipping({ limit })
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
