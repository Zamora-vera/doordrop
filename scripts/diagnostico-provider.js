const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'diagnostico');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(outDir, `SHIP24GO_PROVIDER_RECEIVE_${stamp}.md`);

const env = process.env;
const config = {
  host: env.MYSQL_HOST || env.DB_HOST || '127.0.0.1',
  port: Number(env.MYSQL_PORT || env.DB_PORT || 3306),
  user: env.MYSQL_USER || env.DB_USER || env.DB_USERNAME,
  password: env.MYSQL_PASSWORD || env.DB_PASSWORD || '',
  database: env.MYSQL_DATABASE || env.DB_DATABASE || env.DB_NAME,
};

function mask(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return String(text || '')
    .replace(/("authToken"\s*:\s*")([^"]+)(")/gi, '$1********$3')
    .replace(/("token"\s*:\s*")([^"]+)(")/gi, '$1********$3')
    .replace(/("password"\s*:\s*")([^"]+)(")/gi, '$1********$3')
    .replace(/("api_key"\s*:\s*")([^"]+)(")/gi, '$1********$3')
    .replace(/(\"key\"\s*:\s*\")([^\"]{12,})(\")/gi, '$1********$3')
    .replace(/(GENEI_V1_USER=).+/g, '$1********')
    .replace(/(GENEI_V1_PASSWORD=).+/g, '$1********');
}

async function exists(db, table) {
  const [rows] = await db.query('SHOW TABLES LIKE ?', [table]);
  return rows.length > 0;
}

async function columns(db, table) {
  const [rows] = await db.query(`SHOW COLUMNS FROM \`${table}\``);
  return rows.map((r) => r.Field);
}

async function section(db, title, table, wanted, where = '', params = [], order = '', limit = 10) {
  const lines = [`\n## ${title}\n`];
  try {
    if (!(await exists(db, table))) return `${lines.join('')}No hay datos para mostrar.\n`;
    const available = await columns(db, table);
    const selected = wanted.filter((c) => available.includes(c));
    if (!selected.length) return `${lines.join('')}No hay datos para mostrar.\n`;
    const sql = `SELECT ${selected.map((c) => `\`${c}\``).join(', ')} FROM \`${table}\` ${where} ${order} LIMIT ${Number(limit)}`;
    const [rows] = await db.query(sql, params);
    return `${lines.join('')}\n\`\`\`json\n${mask(rows)}\n\`\`\`\n`;
  } catch (e) {
    return `${lines.join('')}No se pudo leer esta sección: ${e.message}\n`;
  }
}

(async () => {
  const db = await mysql.createConnection(config);
  let report = `# Diagnóstico Ship24Go - Proveedor y etiquetas\n\nFecha: ${new Date().toISOString()}\n\n`;

  report += await section(db, 'Últimos envíos', 'shipments', [
    'id','user_id','quote_id','provider_code','provider_shipment_code','provider_tracking_code','tracking_code','order_number','status','status_label','label_status','label_error','provider_attempts','last_provider_attempt_at','label_url','track_url','created_at','updated_at'
  ], '', [], 'ORDER BY created_at DESC', 12);

  report += await section(db, 'Direcciones recientes', 'shipment_addresses', [
    'shipment_id','type','full_name','company','country','city','zip_code','address','civic_number','formatted_address','phone','email','created_at'
  ], '', [], 'ORDER BY created_at DESC', 20);

  report += await section(db, 'Trabajos automáticos', 'shipment_processing_jobs', [
    'id','shipment_id','job_type','status','attempts','last_message','next_run_at','last_run_at','created_at','updated_at'
  ], '', [], 'ORDER BY updated_at DESC', 20);

  report += await section(db, 'Genei recibido/respondido', 'provider_logs', [
    'id','provider_code','action_type','request_payload','response_payload','http_status','created_at'
  ], "WHERE provider_code = 'genei'", [], 'ORDER BY created_at DESC', 25);

  report += await section(db, 'ParcelABC recibido/respondido', 'provider_logs', [
    'id','provider_code','action_type','request_payload','response_payload','http_status','created_at'
  ], "WHERE provider_code = 'parcelabc'", [], 'ORDER BY created_at DESC', 12);

  await db.end();
  fs.writeFileSync(out, report);
  console.log(out);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
