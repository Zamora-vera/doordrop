#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config({ override: true });
const mysql = require('mysql2/promise');

function mask(value) {
  const raw = String(value || '');
  if (!raw) return 'pendiente';
  return raw.length > 10 ? `${raw.slice(0, 5)}••••${raw.slice(-4)}` : 'configurado';
}

(async () => {
  const outDir = path.join(process.cwd(), 'diagnostico');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const file = path.join(outDir, `ECARTAPI_STORES_V1_4_23_${stamp}.md`);
  const lines = [];
  lines.push('# Diagnóstico Ecart API Stores — Ship24Go V1.4.23');
  lines.push('');
  lines.push(`Fecha: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Configuración');
  lines.push(`- Estado: ${String(process.env.ECARTAPI_ENABLED || 'true')}`);
  lines.push(`- App ID: ${mask(process.env.ECARTAPI_APP_ID)}`);
  lines.push(`- Client secret: ${process.env.ECARTAPI_CLIENT_SECRET ? 'configurado' : 'pendiente'}`);
  lines.push(`- Redirect URL: ${process.env.ECARTAPI_REDIRECT_URL || 'https://ship24go.com/api/integrations/ecartapi/callback'}`);
  lines.push(`- Base URL: ${process.env.ECARTAPI_BASE_URL || 'https://api.ecartapi.com'}`);
  lines.push(`- Versión: ${process.env.ECARTAPI_API_VERSION || 'v2'}`);
  lines.push('');

  let db;
  try {
    db = await mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'ship24go',
      multipleStatements: true
    });

    const [[stores]] = await db.query(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='connected' THEN 1 ELSE 0 END) AS connected FROM stores`);
    const [[orders]] = await db.query(`SELECT COUNT(*) AS total, SUM(CASE WHEN address_quality='needs_review' THEN 1 ELSE 0 END) AS alerts, SUM(CASE WHEN shipment_id IS NOT NULL THEN 1 ELSE 0 END) AS shipments FROM store_orders`).catch(() => [[{ total: 0, alerts: 0, shipments: 0 }]]);
    const [lastStores] = await db.query(`SELECT platform, store_name, status, updated_at FROM stores ORDER BY updated_at DESC LIMIT 5`).catch(() => [[]]);
    const [logs] = await db.query(`SELECT action, status, message, created_at FROM store_sync_logs ORDER BY created_at DESC LIMIT 10`).catch(() => [[]]);

    lines.push('## Resumen');
    lines.push(`- Tiendas totales: ${Number(stores.total || 0)}`);
    lines.push(`- Tiendas conectadas: ${Number(stores.connected || 0)}`);
    lines.push(`- Pedidos importados: ${Number(orders.total || 0)}`);
    lines.push(`- Direcciones por revisar: ${Number(orders.alerts || 0)}`);
    lines.push(`- Envíos creados desde tiendas: ${Number(orders.shipments || 0)}`);
    lines.push('');

    lines.push('## Últimas tiendas');
    if (lastStores.length) {
      for (const row of lastStores) lines.push(`- ${row.platform || 'Ecommerce'} — ${row.store_name || 'Sin nombre'} — ${row.status || 'sin estado'} — ${row.updated_at || ''}`);
    } else {
      lines.push('- No hay tiendas conectadas todavía.');
    }
    lines.push('');

    lines.push('## Registros recientes');
    if (logs.length) {
      for (const row of logs) lines.push(`- ${row.created_at || ''} — ${row.action || ''} — ${row.status || ''} — ${row.message || ''}`);
    } else {
      lines.push('- No hay registros todavía.');
    }
    lines.push('');
    await db.end();
  } catch (error) {
    lines.push('## Estado de revisión');
    lines.push('- No fue posible leer el resumen de base de datos.');
    lines.push(`- Detalle interno: ${error.message}`);
    lines.push('');
    if (db) await db.end().catch(() => null);
  }

  lines.push('## Recomendaciones');
  lines.push('- Configurar el Client Id token de Ecart para validar conexiones con HMAC.');
  lines.push('- Mantener el cron de tiendas activo si hay clientes con alto volumen.');
  lines.push('- Revisar direcciones marcadas antes de generar etiquetas.');
  lines.push('');
  fs.writeFileSync(file, lines.join('\n'));
  console.log(file);
})();
