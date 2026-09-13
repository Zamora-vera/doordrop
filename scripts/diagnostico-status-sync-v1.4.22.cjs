const fs = require('fs');
const path = require('path');
require('dotenv').config({ override: true });
const mysql = require('mysql2/promise');

function esc(v){ return String(v ?? '').replace(/[|]/g, '/'); }

(async()=>{
  const root = process.cwd();
  const outDir = path.join(root, 'diagnostico');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(outDir, `STATUS_SYNC_V1_4_22_${stamp}.md`);
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    user: process.env.MYSQL_USER || process.env.DB_USER || process.env.DB_USERNAME,
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.DB_DATABASE || process.env.DB_NAME
  });

  const [providerRows] = await db.query(`
    SELECT provider_code, COUNT(*) total,
      SUM(CASE WHEN status IN ('entregado','delivered') THEN 1 ELSE 0 END) entregados,
      SUM(CASE WHEN status IN ('en_transito','in_transit') THEN 1 ELSE 0 END) transito,
      SUM(CASE WHEN status IN ('en_reparto','out_for_delivery') THEN 1 ELSE 0 END) reparto,
      SUM(CASE WHEN status IN ('incidencia','exception') THEN 1 ELSE 0 END) incidencias,
      SUM(CASE WHEN status NOT IN ('entregado','delivered','cancelado','cancelled','draft') THEN 1 ELSE 0 END) activos
    FROM shipments
    WHERE provider_code IN ('genei','parcelabc','paccofacile','spedirepro','spediamopro','easypost')
    GROUP BY provider_code
    ORDER BY provider_code
  `).catch(()=>[[]]);

  const [recentEvents] = await db.query(`
    SELECT e.event_time, e.tracking_code, e.status_label, s.provider_code
    FROM tracking_events e
    LEFT JOIN shipments s ON s.id=e.shipment_id
    ORDER BY e.event_time DESC, e.created_at DESC
    LIMIT 20
  `).catch(()=>[[]]);

  const cronKey = process.env.CRON_SECRET || process.env.CRON_KEY || process.env.SHIP24GO_CRON_KEY || '(revisar .env)';
  const appUrl = process.env.APP_URL || process.env.PUBLIC_APP_URL || 'https://ship24go.com';

  let md = `# Ship24Go — Diagnóstico sincronización de estados V1.4.22\n\n`;
  md += `Fecha: ${new Date().toISOString()}\n\n`;
  md += `## Cron recomendado\n\n`;
  md += '```bash\n';
  md += `curl -fsS "${appUrl.replace(/\/$/,'')}/api/cron/shipments/status?key=${cronKey}" >/dev/null 2>&1\n`;
  md += '```\n\n';
  md += `## Resumen por proveedor\n\n`;
  md += `| Proveedor | Total | Activos | En tránsito | En reparto | Entregados | Incidencias |\n`;
  md += `|---|---:|---:|---:|---:|---:|---:|\n`;
  for (const r of providerRows) {
    md += `| ${esc(r.provider_code)} | ${Number(r.total||0)} | ${Number(r.activos||0)} | ${Number(r.transito||0)} | ${Number(r.reparto||0)} | ${Number(r.entregados||0)} | ${Number(r.incidencias||0)} |\n`;
  }
  if (!providerRows.length) md += `| No hay registros todavía | 0 | 0 | 0 | 0 | 0 | 0 |\n`;
  md += `\n## Últimos eventos\n\n`;
  md += `| Fecha | Proveedor | Tracking | Estado |\n`;
  md += `|---|---|---|---|\n`;
  for (const r of recentEvents) {
    md += `| ${esc(r.event_time)} | ${esc(r.provider_code)} | ${esc(r.tracking_code)} | ${esc(r.status_label)} |\n`;
  }
  if (!recentEvents.length) md += `| No hay registros todavía | - | - | - |\n`;

  fs.writeFileSync(file, md);
  await db.end();
  console.log(file);
})().catch((e)=>{
  console.error('No se pudo completar el diagnóstico:', e.message);
  process.exit(0);
});
