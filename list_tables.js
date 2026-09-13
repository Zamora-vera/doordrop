import { pool } from './server/db/connection.js';

async function listTables() {
  const [rows] = await pool.query('SHOW TABLES');
  const tableNames = rows.map(r => Object.values(r)[0]);
  console.log('All tables:', tableNames.filter(n => 
    n.includes('market') || n.includes('prod') || n.includes('order') || n.includes('item') || n.includes('ship') || n.includes('catalog')
  ));
  process.exit(0);
}

listTables().catch(console.error);
