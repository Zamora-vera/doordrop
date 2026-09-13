const fs = require('fs');

const serverPath = 'server.ts';
let s = fs.readFileSync(serverPath, 'utf8');

const marker = 'SHIP24GO_ADMIN_DASHBOARD_REAL_HOTFIX_V1434';

if (!s.includes(marker)) {
  const route = `

// ${marker}
// Resumen real del Super Admin: usa tablas existentes y evita métricas vacías.
app.get('/api/admin/dashboard-real', async (_req, res) => {
  try {
    const q = async (sql) => {
      const [rows] = await pool.query(sql);
      return Array.isArray(rows) ? rows : [];
    };

    const scalar = async (sql, fallback = 0) => {
      try {
        const rows = await q(sql);
        const first = rows?.[0] || {};
        const value = Object.values(first)[0];
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
      } catch {
        return fallback;
      }
    };

    const hasTable = async (table) => {
      try {
        const rows = await q("SELECT COUNT(*) c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = " + pool.escape(table));
        return Number(rows?.[0]?.c || 0) > 0;
      } catch {
        return false;
      }
    };

    const usersCount = await hasTable('users') ? await scalar("SELECT COUNT(*) c FROM users WHERE role <> 'super_admin'") : 0;
    const shipmentsCount = await hasTable('shipments') ? await scalar("SELECT COUNT(*) c FROM shipments") : 0;
    const storesCount = await hasTable('stores') ? await scalar("SELECT COUNT(*) c FROM stores") : 0;
    const paymentsTotal = await hasTable('payments') ? await scalar("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE status IN ('paid','completed','succeeded','success')") : 0;
    const walletTotal = await hasTable('wallet_transactions') ? await scalar("SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END),0) total FROM wallet_transactions") : 0;
    const deliveredCount = await hasTable('shipments') ? await scalar("SELECT COUNT(*) c FROM shipments WHERE LOWER(COALESCE(status,'')) IN ('delivered','entregado','completed','complete') OR LOWER(COALESCE(status_label,'')) LIKE '%entreg%' OR LOWER(COALESCE(status_label,'')) LIKE '%delivered%'") : 0;
    const inTransitCount = await hasTable('shipments') ? await scalar("SELECT COUNT(*) c FROM shipments WHERE LOWER(COALESCE(status,'')) IN ('in_transit','transit','processing') OR LOWER(COALESCE(status_label,'')) LIKE '%trans%'") : 0;
    const pendingCount = await hasTable('shipments') ? await scalar("SELECT COUNT(*) c FROM shipments WHERE LOWER(COALESCE(status,'')) IN ('created','pending','preparing') OR LOWER(COALESCE(status_label,'')) LIKE '%creado%' OR LOWER(COALESCE(status_label,'')) LIKE '%prepar%'") : 0;

    const providers = await hasTable('shipments')
      ? await q("SELECT COALESCE(provider,'Sin proveedor') provider, COUNT(*) total FROM shipments GROUP BY COALESCE(provider,'Sin proveedor') ORDER BY total DESC LIMIT 10")
      : [];

    const countries = await hasTable('shipments')
      ? await q("SELECT COALESCE(destination_country, country_to, destination_country_code, 'No disponible') country, COUNT(*) total FROM shipments GROUP BY country ORDER BY total DESC LIMIT 10")
      : [];

    const recent = await hasTable('shipments')
      ? await q("SELECT DATE(COALESCE(created_at, NOW())) date, COUNT(*) total FROM shipments WHERE COALESCE(created_at, NOW()) >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY DATE(COALESCE(created_at, NOW())) ORDER BY date ASC")
      : [];

    res.json({
      ok: true,
      source: 'database',
      summary: {
        users: usersCount,
        shipments: shipmentsCount,
        stores: storesCount,
        revenue: paymentsTotal,
        wallet: walletTotal,
        delivered: deliveredCount,
        inTransit: inTransitCount,
        pending: pendingCount,
        currency: 'USD'
      },
      providers,
      countries,
      recent
    });
  } catch (error) {
    res.json({
      ok: false,
      summary: {
        users: 0,
        shipments: 0,
        stores: 0,
        revenue: 0,
        wallet: 0,
        delivered: 0,
        inTransit: 0,
        pending: 0,
        currency: 'USD'
      },
      providers: [],
      countries: [],
      recent: []
    });
  }
});
`;

  const insertBefore = [
    "app.use(express.static",
    "app.get('*'",
    "app.get(\"*\"",
  ];

  let inserted = false;
  for (const needle of insertBefore) {
    const idx = s.indexOf(needle);
    if (idx !== -1) {
      s = s.slice(0, idx) + route + "\n" + s.slice(idx);
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    s += route;
  }

  fs.writeFileSync(serverPath, s);
}

const apiPath = 'src/lib/api.ts';
if (fs.existsSync(apiPath)) {
  let api = fs.readFileSync(apiPath, 'utf8');
  if (!api.includes('getAdminDashboardReal')) {
    api += `

export async function getAdminDashboardReal() {
  const response = await fetch('/api/admin/dashboard-real', {
    credentials: 'include',
    headers: { 'Accept': 'application/json' }
  });
  return response.json();
}
`;
    fs.writeFileSync(apiPath, api);
  }
}

// Limpieza urgente de texto corrupto visible.
const files = [
  'src/pages/AdminPanel.tsx',
  'src/lang/moduleTranslations.ts',
  'src/lang/visibleText.ts',
  'src/lang/locales/es.json',
  'src/lang/locales/en.json',
  'src/lang/locales/it.json',
  'src/lang/locales/fr.json',
  'src/lang/locales/de.json',
  'src/lang/locales/zh.json',
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, 'utf8');
  text = text
    .replace(/MODIFICAR+RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRAR/gi, 'Modificar')
    .replace(/MODIFICAR+R+/gi, 'Modificar')
    .replace(/ESTADO\\s*\\(MODIFICAR\\)/gi, 'Estado')
    .replace(/Estado\\s*\\(Modificar\\)/g, 'Estado')
    .replace(/estado\\s*\\(modificar\\)/gi, 'Estado');
  fs.writeFileSync(file, text);
}

console.log('Hotfix dashboard real aplicado.');
