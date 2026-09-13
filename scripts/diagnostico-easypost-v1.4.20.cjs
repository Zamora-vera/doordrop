const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

function mask(value) {
  const text = String(value || '').trim();
  if (!text) return 'pendiente';
  return text.length <= 8 ? '***' : `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function safeJson(value, fallback = {}) {
  try {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

async function main() {
  const root = process.cwd();
  const outDir = path.join(root, 'diagnostico');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(outDir, `EASYPOST_V1_4_20_${stamp}.md`);

  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    user: process.env.MYSQL_USER || process.env.DB_USER || process.env.DB_USERNAME,
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.DB_DATABASE || process.env.DB_NAME
  });

  const [providers] = await db.query(`
    SELECT code, name, is_active, is_connected, last_connection_status, last_connection_message, last_tested_at, config_json
    FROM providers
    WHERE code = 'easypost'
    LIMIT 1
  `).catch(() => [[]]);

  const [shipments] = await db.query(`
    SELECT tracking_code, provider_code, provider_shipment_code, provider_tracking_code,
           status, status_label, label_status, LEFT(label_error, 180) AS label_error,
           LENGTH(label_base64) AS label_len, label_url, provider_attempts, created_at, updated_at
    FROM shipments
    WHERE provider_code = 'easypost'
    ORDER BY created_at DESC
    LIMIT 30
  `).catch(() => [[]]);

  const [logs] = await db.query(`
    SELECT action_type, http_status, created_at,
           LEFT(request_payload, 600) AS request_payload,
           LEFT(response_payload, 900) AS response_payload
    FROM provider_logs
    WHERE provider_code = 'easypost'
    ORDER BY created_at DESC
    LIMIT 40
  `).catch(() => [[]]);

  const [webhooks] = await db.query(`
    SELECT external_id, event_type, processed_at, created_at, LEFT(payload_json, 900) AS payload_json
    FROM webhook_events
    WHERE provider_code = 'easypost'
    ORDER BY created_at DESC
    LIMIT 30
  `).catch(() => [[]]);

  const p = providers[0] || null;
  const cfg = safeJson(p?.config_json, {});
  const lines = [];
  lines.push('# Diagnóstico EasyPost V1.4.20');
  lines.push('');
  lines.push(`Fecha: ${new Date().toISOString()}`);
  lines.push(`Proyecto: ${root}`);
  lines.push('');
  lines.push('## Configuración');
  lines.push('');
  lines.push(`- Provider creado: ${p ? 'sí' : 'no'}`);
  lines.push(`- Activo: ${p?.is_active ?? ''}`);
  lines.push(`- Conectado: ${p?.is_connected ?? ''}`);
  lines.push(`- Estado: ${p?.last_connection_status || ''}`);
  lines.push(`- Mensaje: ${p?.last_connection_message || ''}`);
  lines.push(`- Modo: ${process.env.EASYPOST_MODE || cfg.mode || 'test'}`);
  lines.push(`- Base URL: ${process.env.EASYPOST_BASE_URL || cfg.baseUrl || 'https://api.easypost.com/v2'}`);
  lines.push(`- Test key: ${mask(process.env.EASYPOST_TEST_API_KEY || process.env.EASYPOST_API_KEY || cfg.apiKey)}`);
  lines.push(`- Producción key: ${mask(process.env.EASYPOST_PRODUCTION_API_KEY)}`);
  lines.push(`- Compra real: ${process.env.EASYPOST_ALLOW_REAL_BUY || cfg.allowRealBuy || false}`);
  lines.push(`- Webhook URL: ${cfg.webhookUrl || `${process.env.APP_URL || 'https://ship24go.com'}/api/webhooks/easypost`}`);
  lines.push('');
  lines.push('## Flujo esperado');
  lines.push('');
  lines.push('1. /panel/quote crea una cotización EasyPost en modo prueba.');
  lines.push('2. Ship24Go muestra el courier real: UPS, USPS, FedEx, DHL, etc.');
  lines.push('3. El cliente crea el envío y el proveedor queda pendiente hasta activar emisión real.');
  lines.push('4. Al activar emisión real, Ship24Go compra la tarifa seleccionada y guarda etiqueta/tracking.');
  lines.push('5. El webhook actualiza eventos y vuelve a buscar etiqueta si falta.');
  lines.push('');
  lines.push('## Últimos envíos EasyPost');
  lines.push('');
  lines.push('| Tracking | Código proveedor | Tracking proveedor | Estado | Etiqueta | PDF | URL | Actualizado |');
  lines.push('|---|---|---|---|---|---:|---|---|');
  for (const s of shipments) {
    lines.push(`| ${s.tracking_code || ''} | ${s.provider_shipment_code || ''} | ${s.provider_tracking_code || ''} | ${s.status_label || s.status || ''} | ${s.label_status || ''} | ${s.label_len || 0} | ${s.label_url ? 'sí' : 'no'} | ${s.updated_at || ''} |`);
  }
  lines.push('');
  lines.push('## Webhooks recibidos');
  lines.push('');
  lines.push('| Evento | Externo | Procesado | Fecha |');
  lines.push('|---|---|---|---|');
  for (const w of webhooks) lines.push(`| ${w.event_type || ''} | ${w.external_id || ''} | ${w.processed_at || ''} | ${w.created_at || ''} |`);
  lines.push('');
  lines.push('## Logs recientes');
  lines.push('');
  for (const l of logs) {
    lines.push(`### ${l.created_at || ''} - ${l.action_type || ''} (${l.http_status || ''})`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify({ request: safeJson(l.request_payload, l.request_payload), response: safeJson(l.response_payload, l.response_payload) }, null, 2).slice(0, 2500));
    lines.push('```');
    lines.push('');
  }

  fs.writeFileSync(outFile, lines.join('\n'));
  await db.end();
  console.log(outFile);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
