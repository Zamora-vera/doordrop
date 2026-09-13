const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

function mask(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length <= 6 ? '***' : `${text.slice(0, 2)}***${text.slice(-4)}`;
}

function safeJson(value, fallback = null) {
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
  const outFile = path.join(outDir, `PROVEEDORES_PRODUCCION_V148_${stamp}.md`);

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
    WHERE code IN ('parcelabc','genei','paccofacile')
    ORDER BY FIELD(code,'parcelabc','genei','paccofacile')
  `);

  const [shipments] = await db.query(`
    SELECT tracking_code, provider_code, provider_shipment_code, provider_tracking_code,
           status, status_label, label_status, LEFT(label_error, 160) AS label_error,
           LENGTH(label_base64) AS label_len, provider_attempts, last_provider_attempt_at, created_at, updated_at
    FROM shipments
    WHERE provider_code IN ('parcelabc','genei','paccofacile')
    ORDER BY created_at DESC
    LIMIT 30
  `);

  const [jobs] = await db.query(`
    SELECT s.tracking_code, s.provider_code, j.job_type, j.status, j.attempts, j.last_message, j.next_run_at, j.updated_at
    FROM shipment_processing_jobs j
    JOIN shipments s ON s.id = j.shipment_id
    WHERE s.provider_code IN ('parcelabc','genei','paccofacile')
    ORDER BY j.updated_at DESC
    LIMIT 30
  `).catch(() => [[]]);

  const [logs] = await db.query(`
    SELECT provider_code, action_type, http_status, created_at,
           LEFT(request_payload, 800) AS request_payload,
           LEFT(response_payload, 1200) AS response_payload
    FROM provider_logs
    WHERE provider_code IN ('parcelabc','genei','paccofacile')
    ORDER BY created_at DESC
    LIMIT 40
  `).catch(() => [[]]);

  const lines = [];
  lines.push(`# Diagnóstico proveedores producción V1.4.8`);
  lines.push(``);
  lines.push(`Fecha: ${new Date().toISOString()}`);
  lines.push(`Proyecto: ${root}`);
  lines.push(``);
  lines.push(`## Variables activas`);
  lines.push(``);
  lines.push(`- APP_URL: ${process.env.APP_URL || ''}`);
  lines.push(`- GENEI_API_MODE: ${process.env.GENEI_API_MODE || ''}`);
  lines.push(`- GENEI_V1_ALLOW_REAL_CREATE: ${process.env.GENEI_V1_ALLOW_REAL_CREATE || ''}`);
  lines.push(`- GENEI_V1_CREATE_FUNCTION: ${process.env.GENEI_V1_CREATE_FUNCTION || ''}`);
  lines.push(`- PACCOFACILE_MODE: ${process.env.PACCOFACILE_MODE || ''}`);
  lines.push(`- PACCOFACILE_ALLOW_REAL_BUY: ${process.env.PACCOFACILE_ALLOW_REAL_BUY || ''}`);
  lines.push(`- PACCOFACILE_TOKEN: ${mask(process.env.PACCOFACILE_TOKEN)}`);
  lines.push(`- PACCOFACILE_API_KEY: ${mask(process.env.PACCOFACILE_API_KEY)}`);
  lines.push(`- PACCOFACILE_ACCOUNT_NUMBER: ${mask(process.env.PACCOFACILE_ACCOUNT_NUMBER)}`);
  lines.push(``);

  lines.push(`## Proveedores`);
  lines.push(``);
  for (const p of providers) {
    const cfg = safeJson(p.config_json, {});
    lines.push(`### ${p.code}`);
    lines.push(`- Nombre: ${p.name}`);
    lines.push(`- Activo: ${p.is_active}`);
    lines.push(`- Conectado: ${p.is_connected}`);
    lines.push(`- Último estado: ${p.last_connection_status || ''}`);
    lines.push(`- Mensaje: ${p.last_connection_message || ''}`);
    lines.push(`- Última prueba: ${p.last_tested_at || ''}`);
    lines.push(`- Nombre público: ${cfg.publicName || cfg.displayName || ''}`);
    lines.push(`- Modo: ${cfg.mode || ''}`);
    lines.push(``);
  }

  lines.push(`## Últimos envíos`);
  lines.push(``);
  lines.push(`| Tracking | Proveedor | Código proveedor | Tracking proveedor | Estado | Etiqueta | PDF | Intentos | Actualizado |`);
  lines.push(`|---|---|---|---|---|---|---:|---:|---|`);
  for (const s of shipments) {
    lines.push(`| ${s.tracking_code || ''} | ${s.provider_code || ''} | ${s.provider_shipment_code || ''} | ${s.provider_tracking_code || ''} | ${s.status_label || s.status || ''} | ${s.label_status || ''} | ${s.label_len || 0} | ${s.provider_attempts || 0} | ${s.updated_at || ''} |`);
  }
  lines.push(``);

  lines.push(`## Trabajos pendientes/recientes`);
  lines.push(``);
  lines.push(`| Tracking | Proveedor | Tipo | Estado | Intentos | Mensaje | Próxima ejecución |`);
  lines.push(`|---|---|---|---|---:|---|---|`);
  for (const j of jobs) {
    lines.push(`| ${j.tracking_code || ''} | ${j.provider_code || ''} | ${j.job_type || ''} | ${j.status || ''} | ${j.attempts || 0} | ${String(j.last_message || '').replace(/\|/g, '/')} | ${j.next_run_at || ''} |`);
  }
  lines.push(``);

  lines.push(`## Últimos logs`);
  lines.push(``);
  for (const l of logs) {
    lines.push(`### ${l.created_at} — ${l.provider_code} / ${l.action_type} / HTTP ${l.http_status || ''}`);
    lines.push(``);
    lines.push(`Solicitud:`);
    lines.push('```json');
    lines.push(l.request_payload || '{}');
    lines.push('```');
    lines.push(`Respuesta:`);
    lines.push('```json');
    lines.push(l.response_payload || '{}');
    lines.push('```');
    lines.push(``);
  }

  fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
  await db.end();
  console.log(outFile);
}

main().catch((err) => {
  console.error('No se pudo generar el diagnóstico:', err.message);
  process.exit(1);
});
