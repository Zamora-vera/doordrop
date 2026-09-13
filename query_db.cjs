
const { pool } = require('./server/db/connection');
(async () => {
  try {
    const [rows] = await pool.query('SELECT code, name, is_active, is_connected, config_json FROM providers WHERE code = "genei"');
    console.log('Genei row:', JSON.stringify(rows, null, 2));
    const [keys] = await pool.query('SELECT id, genei FROM api_keys LIMIT 1');
    console.log('ApiKeys genei:', JSON.stringify(keys, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
})();
