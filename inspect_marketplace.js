import { pool } from './server/db/connection.js';

async function inspectSchema() {
  const [colsListings] = await pool.query('DESCRIBE marketplace_listings');
  console.log('marketplace_listings columns:', colsListings.map(c => `${c.Field} (${c.Type})`).join(', '));

  const [colsImages] = await pool.query('DESCRIBE marketplace_listing_images');
  console.log('marketplace_listing_images columns:', colsImages.map(c => `${c.Field} (${c.Type})`).join(', '));

  const [colsOrders] = await pool.query('DESCRIBE marketplace_orders');
  console.log('marketplace_orders columns:', colsOrders.map(c => `${c.Field} (${c.Type})`).join(', '));

  // Query one listing sample
  const [samples] = await pool.query('SELECT * FROM marketplace_listings LIMIT 1');
  console.log('Sample listing:', samples[0]);

  process.exit(0);
}

inspectSchema().catch(console.error);
