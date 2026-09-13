const mysql = require('mysql2/promise');
const crypto = require('crypto');
require('dotenv').config();

function hashPassword(password) {
  const salt = 'ship24go_salt_98765';
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

function id(prefix) {
  return prefix + crypto.randomBytes(12).toString('hex');
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'ship24go',
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'ship24go',
    multipleStatements: true
  });

  const adminEmail = process.env.SHIP_ADMIN_EMAIL || 'admin@ship24go.com';
  const adminPass = process.env.SHIP_ADMIN_PASSWORD || '';
  const userEmail = process.env.SHIP_USER_EMAIL || 'user@ship24go.com';
  const userPass = process.env.SHIP_USER_PASSWORD || '';

  if (!adminPass || !userPass) {
    throw new Error('Faltan claves para crear los usuarios.');
  }

  await db.execute(`
    INSERT INTO users (id, email, password_hash, name, phone, country, currency, role, business_type, balance, status)
    VALUES (?, ?, ?, 'Super Admin', '', 'ES', 'EUR', 'super_admin', 'Admin', 0.00, 'active')
    ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), role='super_admin', status='active'
  `, [id('usr_'), adminEmail, hashPassword(adminPass)]);

  await db.execute(`
    INSERT INTO users (id, email, password_hash, name, phone, country, currency, role, business_type, balance, status)
    VALUES (?, ?, ?, 'Cliente Ship24Go', '', 'ES', 'EUR', 'customer', 'Tienda online', 0.00, 'active')
    ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), role='customer', status='active'
  `, [id('usr_'), userEmail, hashPassword(userPass)]);

  await db.execute(`
    INSERT INTO api_keys
      (id, googleMaps, genei, parcelAbc, posteItaliane, paccoFacile, paypalClientId, paypalClientSecret,
       polarApiToken, polarProductId, freeCurrencyApiKey, ecartApiClientId, ecartClientSecret,
       ecartAppUrl, ecartRedirectUrl)
    VALUES
      (1, ?, ?, ?, '', '', '', '', '', '', ?, ?, ?, 'https://ship24go.com', 'https://ship24go.com/es/customer/integeration')
    ON DUPLICATE KEY UPDATE
      googleMaps=VALUES(googleMaps),
      genei=VALUES(genei),
      parcelAbc=VALUES(parcelAbc),
      freeCurrencyApiKey=VALUES(freeCurrencyApiKey),
      ecartApiClientId=VALUES(ecartApiClientId),
      ecartClientSecret=VALUES(ecartClientSecret),
      ecartAppUrl=VALUES(ecartAppUrl),
      ecartRedirectUrl=VALUES(ecartRedirectUrl)
  `, [
    process.env.SHIP_GOOGLE_MAPS_KEY || '',
    `${process.env.SHIP_GENEI_USER || ''}:${process.env.SHIP_GENEI_PASS || ''}`,
    process.env.SHIP_PABC_TOKEN || '',
    process.env.SHIP_FREECURRENCY_KEY || '',
    process.env.SHIP_ECART_CLIENT_ID || '',
    process.env.SHIP_ECART_SECRET || ''
  ]);

  await db.execute(`UPDATE providers SET is_active=1, is_connected=1 WHERE code IN ('parcelabc','genei','ecart')`);
  await db.execute(`INSERT IGNORE INTO app_versions (version, name, description) VALUES ('V1.0.0', 'Ship24Go Producción Real', 'Credenciales y usuarios iniciales configurados.')`);

  await db.end();
  console.log('Configuración V1 guardada correctamente.');
}

main().catch(err => {
  console.error('No se pudo completar la configuración:', err.message);
  process.exit(1);
});
