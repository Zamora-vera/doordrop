import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';
import dotenv from 'dotenv';
import {
  validateEvent as validatePolarWebhookEvent,
  WebhookVerificationError as PolarWebhookVerificationError
} from '@polar-sh/sdk/webhooks';
import { pool } from './server/db/connection';

// Asegurar la carga de variables del archivo .env con override prioritario
dotenv.config({ override: true });
if (!process.env.MAIL_FROM_EMAIL || process.env.MAIL_FROM_EMAIL.includes('ship24go')) {
  process.env.MAIL_FROM_EMAIL = 'info@doordrop.lat';
}
if (!process.env.MAIL_FROM_NAME || process.env.MAIL_FROM_NAME.toLowerCase().includes('ship24go')) {
  process.env.MAIL_FROM_NAME = 'DoorDrop';
}
if (!process.env.APP_URL || process.env.APP_URL.includes('ship24go')) {
  process.env.APP_URL = 'https://doordrop.lat';
}
if (!process.env.SMTP_HOST) {
  process.env.SMTP_HOST = 'smtp.truobox.com';
  process.env.SMTP_PORT = '465';
  process.env.SMTP_SECURE = 'true';
}

import {
  initDb,
  UserRepo,
  CompanyRepo,
  StoreRepo,
  ProviderRepo,
  ApiKeysRepo,
  AdminSettingsRepo,
  PlanRepo,
  ShipmentRepo,
  TrackingEventRepo,
  TicketRepo,
  hashPassword,
  verifyPassword,
  generateId
} from './server/db/repos';
import { getDocBundle, docsToMarkdown, docsToPdfBuffer, billingStatementToPdfBuffer, getOpenApiSpec, getOpenAiToolSchemas } from './server/docs/apiDocs';
import { swaggerUiHtml } from './server/docs/swaggerUi';
import { sendPasswordResetEmail, sendTemplatedEmail, sendNotificationEvent, testSmtpConnection, renderTemplateText } from './server/services/emailService';
import {
  WebmailServiceError,
  actOnWebmailMessage,
  downloadWebmailAttachment,
  getWebmailAttachmentLimits,
  getWebmailFolders,
  getWebmailMessage,
  getWebmailStatus,
  listWebmailMessages,
  sanitizeWebmailHtml,
  saveWebmailDraft,
  sendWebmailCompose,
  verifyWebmailConnection
} from './server/services/webmailService';


const app = express();
const APP_VERSION = (() => {
  try {
    return fs.readFileSync(path.resolve(process.cwd(), 'VERSION'), 'utf8').trim() || 'unknown';
  } catch {
    return 'unknown';
  }
})();
app.set('trust proxy', true); // real client IP behind nginx/CF
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  next();
});

// HTML shell: avoid CDN caching so script tags stay as type=module
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const p = String(req.path || '');
  const isAsset = p.startsWith('/assets/') || p.startsWith('/brand/') || /\.(js|css|png|jpg|jpeg|svg|ico|woff2?|map)$/i.test(p);
  if (!isAsset) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
  next();
});
app.use(express.json({
  limit: '8mb',
  verify: (req: any, _res, buf) => {
    if (
      req.originalUrl === '/api/webhooks/zernio' ||
      req.originalUrl === '/api/webhooks/polar' ||
      req.originalUrl === '/api/webhooks/paypal' ||
      req.originalUrl === '/api/webhooks/logihub' ||
      req.originalUrl === '/api/webhooks/logihub-intl' ||
      req.originalUrl === '/api/webhooks/genei' ||
      req.originalUrl === '/api/webhooks/spedirepro' ||
      req.originalUrl === '/api/webhooks/easypost'
    ) {
      req.rawBody = buf;
    }
  }
}));

app.get('/api/version', (_req, res) => {
  res.json({ name: 'DoorDrop', version: APP_VERSION });
});


// SHIP24GO_DROP_OFF_ALIAS — public path without supplier name
app.use((req, _res, next) => {
  if (req.method === 'POST' && (req.path === '/api/drop-off-points' || req.url?.startsWith('/api/drop-off-points'))) {
    req.url = '/api/spedirepro/drop-off-points' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    // @ts-ignore
    if (req.path) { try { Object.defineProperty(req, 'path', { value: '/api/spedirepro/drop-off-points', writable: true, configurable: true }); } catch {} }
  }
  next();
});


// PWA service worker must never be long-cached
app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Service-Worker-Allowed', '/');
  res.type('application/javascript');
  const candidates = [
    path.join(process.cwd(), 'dist', 'sw.js'),
    path.join(process.cwd(), 'public', 'sw.js'),
  ];
  for (const fp of candidates) {
    if (fs.existsSync(fp)) return res.sendFile(fp);
  }
  res.status(404).send('// sw missing');
});

app.get(['/manifest.json', '/manifest.webmanifest'], (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('application/manifest+json');
  const candidates = [
    path.join(process.cwd(), 'dist', 'manifest.json'),
    path.join(process.cwd(), 'public', 'manifest.json'),
  ];
  for (const fp of candidates) {
    if (fs.existsSync(fp)) return res.sendFile(fp);
  }
  res.status(404).json({ error: 'manifest missing' });
});

app.get('/api/public/runtime-config', (_req, res) => {
  res.json({
    googleMapsKey:
      process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_PLATFORM_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      ''
  });
});


app.get('/api/public/locale', async (req, res) => {
  try {
    const headerCountry = String(
      req.headers['cf-ipcountry'] ||
      req.headers['x-vercel-ip-country'] ||
      req.headers['x-country-code'] ||
      req.headers['cloudfront-viewer-country'] ||
      ''
    ).toUpperCase().slice(0, 2);
    let country = headerCountry && headerCountry !== 'XX' && headerCountry !== 'T1' ? headerCountry : '';
    let source = country ? 'edge' : '';
    const ip = clientIpFromRequest(req);

    if (!country) {
      const fromIp = await resolveCountryFromIp(ip);
      if (fromIp) {
        country = fromIp;
        source = 'ip';
      }
    }

    const rows = await loadCountriesLocaleRows();
    const byCode: Record<string, any> = {};
    for (const r of rows) {
      const code = String(r.code || '').toUpperCase();
      if (code) byCode[code] = r;
    }

    const row = country ? byCode[country] : null;
    // language + currency from MySQL when available
    let language = row
      ? mapDbLanguageToApp(row.languageCode, country)
      : detectLanguageFromRequest(req);
    let currency = row?.currency
      ? String(row.currency).toUpperCase()
      : countryToCurrencyCode(country || 'ES');

    // Build maps from DB (no guessing)
    const countryCurrencyMap: Record<string, string> = {};
    const countryLanguageMap: Record<string, string> = {};
    for (const r of rows) {
      const code = String(r.code || '').toUpperCase();
      if (!code) continue;
      if (r.currency) countryCurrencyMap[code] = String(r.currency).toUpperCase();
      countryLanguageMap[code] = mapDbLanguageToApp(r.languageCode, code);
    }

    // Priority currencies for selector (must include DOP, EUR, USD…)
    const priority = ['DOP', 'EUR', 'USD', 'GBP', 'COP', 'MXN', 'ARS', 'CLP', 'BRL', 'PEN', 'CNY', 'HTG', 'CAD', 'AUD', 'CHF'];
    const currencySet = new Set<string>();
    for (const c of priority) currencySet.add(c);
    for (const r of rows) {
      if (r.currency) currencySet.add(String(r.currency).toUpperCase());
    }
    // Keep selector practical: priority first + any from active countries that are common in platform
    const currencies = Array.from(currencySet)
      .filter((c) => priority.includes(c) || ['DOP','EUR','USD','GBP','COP','MXN','ARS','CLP','BRL','PEN','CNY','HTG','CAD','AUD','CHF','JPY','INR'].includes(c))
      .sort((a, b) => {
        const ia = priority.indexOf(a); const ib = priority.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      })
      .map(currencyMeta);

    // Ensure DOP always present
    if (!currencies.find((c) => c.code === 'DOP')) {
      currencies.unshift(currencyMeta('DOP'));
    }

    res.setHeader('Cache-Control', 'private, max-age=120');
    res.json({
      success: true,
      language,
      country: country || null,
      currency,
      countryName: row ? (row.nameEs || row.nameEn || country) : null,
      flag: row?.flag || (country ? `https://flagsapi.com/${country}/flat/64.png` : null),
      ip: isPublicIp(ip) ? ip.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, '$1.$2.x.x') : null,
      source: source || (row ? 'db' : 'accept-language'),
      countryCurrencyMap,
      countryLanguageMap,
      currencies,
    });
  } catch (e: any) {
    console.warn('[locale]', e?.message || e);
    res.json({
      success: true,
      language: detectLanguageFromRequest(req),
      country: null,
      currency: 'EUR',
      source: 'fallback',
      currencies: ['DOP', 'EUR', 'USD', 'GBP', 'COP', 'MXN'].map(currencyMeta),
      countryCurrencyMap: { DO: 'DOP', ES: 'EUR', IT: 'EUR', US: 'USD' },
      countryLanguageMap: { DO: 'es-DO', ES: 'es', IT: 'it', US: 'en' },
    });
  }
});



app.get('/api/public/countries', async (req, res) => {
  try {
    const lang = String(req.query.lang || 'es').toLowerCase() === 'en' ? 'en' : 'es';
    const q = String(req.query.q || '').trim().toLowerCase();
    let rows = (await loadCountriesLocaleRows()).map((row: any) => ({
      ...row,
      language: row.languageCode,
    }));
    if (q) {
      rows = rows.filter((c) => {
        const n = lang === 'en' ? String(c.nameEn || '') : String(c.nameEs || '');
        return (
          n.toLowerCase().includes(q) ||
          String(c.code || '').toLowerCase().includes(q) ||
          String(c.languageName || '').toLowerCase().includes(q)
        );
      });
    }
    const priority = ['ES','IT','DO','CO','MX','US','GB','DE','FR','PT','BR','AR','CL','PE','EC','CA','NL','CN'];
    rows.sort((a, b) => {
      const ai = priority.indexOf(String(a.code || '').toUpperCase());
      const bi = priority.indexOf(String(b.code || '').toUpperCase());
      const ap = ai === -1 ? 999 : ai;
      const bp = bi === -1 ? 999 : bi;
      if (ap !== bp) return ap - bp;
      const an = lang === 'en' ? a.nameEn : a.nameEs;
      const bn = lang === 'en' ? b.nameEn : b.nameEs;
      return String(an || '').localeCompare(String(bn || ''), lang);
    });
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.json({
      ok: true,
      total: rows.length,
      flagApi: 'https://flagsapi.com/:country_code/:style/:size.png',
      countries: rows.map((c: any) => {
        const code = String(c.code || '').toUpperCase();
        return {
          code,
          nameEn: c.nameEn,
          nameEs: c.nameEs,
          name: lang === 'en' ? c.nameEn : c.nameEs,
          language: c.language,
          languageName: c.languageName,
          currency: c.currency,
          flag: c.flag || ('https://flagsapi.com/' + code + '/flat/64.png'),
          flagSm: 'https://flagsapi.com/' + code + '/flat/32.png',
          flagShiny: 'https://flagsapi.com/' + code + '/shiny/64.png',
        };
      }),
    });
  } catch (err: any) {
    console.error('[countries]', err);
    res.status(500).json({ ok: false, error: 'countries_failed' });
  }
});

app.get('/api/public/brand', async (req, res) => {
  try {
    const settings = await AdminSettingsRepo.get();
    const brand = settings.brand || {};
    res.json({
      brand: {
        ...brand,
        logoUrl: resolvePublicAssetUrl(req, brand.logoUrl),
        logoMarkUrl: resolvePublicAssetUrl(req, brand.logoMarkUrl || brand.logoUrl),
        logoWordmarkUrl: resolvePublicAssetUrl(req, brand.logoWordmarkUrl || '/brand/logo-wordmark.png'),
        faviconUrl: resolvePublicAssetUrl(req, brand.faviconUrl || '/brand/favicon-32.png'),
        ogImageUrl: resolvePublicAssetUrl(req, brand.ogImageUrl || brand.logoUrl)
      }
    });
  } catch {
    res.json({
      brand: {
        siteName: 'DoorDrop',
        shortName: 'DoorDrop',
        tagline: 'Plataforma de envíos',
        seoTitle: 'DoorDrop - Plataforma de envíos',
        seoDescription: 'La plataforma inteligente definitiva de envíos ecommerce.',
        seoKeywords: 'envíos ecommerce, logística, tracking, paquetería, cotizador de envíos',
        logoUrl: '/brand/logo.png',
        logoMarkUrl: resolvePublicAssetUrl(req, '/brand/logo-mark.png'),
        logoWordmarkUrl: resolvePublicAssetUrl(req, '/brand/logo-wordmark.png'),
        faviconUrl: resolvePublicAssetUrl(req, '/brand/favicon-32.png'),
        ogImageUrl: '/brand/logo.png',
        themeColor: '#2563eb'
      }
    });
  }
});


app.get('/manifest.json', async (req, res) => {
  try {
    const settings = await AdminSettingsRepo.get();
    const brand = settings.brand || {};
    const icon = resolvePublicAssetUrl(req, brand.faviconUrl || brand.logoUrl || '/brand/favicon-32.png');
    res.json({
      short_name: brand.shortName || brand.siteName || 'DoorDrop',
      name: brand.siteName || 'DoorDrop',
      description: brand.seoDescription || 'La plataforma inteligente definitiva de envíos ecommerce.',
      icons: [
        { src: icon, type: icon.endsWith('.svg') ? 'image/svg+xml' : 'image/png', sizes: 'any', purpose: 'any maskable' },
        { src: icon, type: icon.endsWith('.svg') ? 'image/svg+xml' : 'image/png', sizes: '192x192', purpose: 'any' },
        { src: icon, type: icon.endsWith('.svg') ? 'image/svg+xml' : 'image/png', sizes: '512x512', purpose: 'any' }
      ],
      start_url: '/',
      background_color: '#0d1117',
      theme_color: brand.themeColor || '#2563eb',
      display: 'standalone',
      orientation: 'any'
    });
  } catch {
    res.sendFile(path.join(process.cwd(), 'public', 'manifest.json'));
  }
});

// --- NATIVE JWT SECURITY LAYER ---
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('Configura JWT_SECRET seguro antes de iniciar producción.');
}

const JWT_TTL_SECONDS = 7 * 24 * 60 * 60;
const EMAIL_VERIFICATION_TTL_MS = 4 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_HOURS = 4;
type AuthTokenPayload = {
  userId: string;
  role: string;
  adminUserId?: string;
  impersonated?: boolean;
  authTokenVersion: number;
  iat: number;
  exp: number;
};

function generateToken(payload: { userId: string; role: string; adminUserId?: string; impersonated?: boolean; authTokenVersion?: number }): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    authTokenVersion: Number.isInteger(payload.authTokenVersion) ? Number(payload.authTokenVersion) : 1,
    iat: now,
    exp: now + JWT_TTL_SECONDS
  };
  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64Payload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
  
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${base64Header}.${base64Payload}`)
    .digest('base64url');
    
  return `${base64Header}.${base64Payload}.${signature}`;
}

function verifyToken(token: string): AuthTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    if (header?.alg !== 'HS256' || header?.typ !== 'JWT') return null;
    
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
      
    if (signatureB64 !== expectedSig) return null;
    
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (
      !payload ||
      typeof payload.userId !== 'string' ||
      typeof payload.role !== 'string' ||
      !Number.isFinite(Number(payload.iat)) ||
      !Number.isFinite(Number(payload.exp)) ||
      Number(payload.exp) <= now ||
      Number(payload.exp) > now + JWT_TTL_SECONDS + 300 ||
      !Number.isInteger(Number(payload.authTokenVersion))
    ) return null;
    return payload as AuthTokenPayload;
  } catch {
    return null;
  }
}

// --- REAL-TIME EXCHANGE RATES CACHE & HELPERS ---
let cachedRates: any = null;
let lastCacheTime = 0;
let ratesRefreshPromise: Promise<any> | null = null;

// Keep a slow or unavailable carrier/API from holding the customer request forever.
// AbortSignal.timeout also covers response-body reads, not only connection setup.
const EXTERNAL_API_TIMEOUT_MS = 12_000;
const CURRENCY_API_TIMEOUT_MS = 5_000;
// Quote requests must fail fast enough for the customer UI to stay responsive;
// purchase/label operations keep the longer external timeout above.
const QUOTE_API_TIMEOUT_MS = 9_000;
function fetchWithTimeout(input: any, init: any = {}, timeoutMs = EXTERNAL_API_TIMEOUT_MS) {
  const signal = init?.signal || AbortSignal.timeout(timeoutMs);
  return fetch(input, { ...init, signal });
}


function getPolarApiBase(token: string = '', environment: string = '') {
  return ship24goPolarApiBase(token, environment);
}

function normalizePolarAmount(amount: number) {
  return Math.round(Number(amount || 0) * 100);
}

async function writePolarProviderLog(actionType: string, requestPayload: any, responsePayload: any, httpStatus = 200) {
  try {
    await pool.query(
      `INSERT INTO provider_logs (id, provider_code, action_type, request_payload, response_payload, http_status)
       VALUES (?, 'polar', ?, ?, ?, ?)`,
      [generateId('log_'), actionType, JSON.stringify(requestPayload || {}), JSON.stringify(responsePayload || {}), httpStatus]
    );
  } catch {}
}


function ship24goPolarApiBase(token: string = '', environment: string = '') {
  const env = String(environment || process.env.POLAR_ENV || '').toLowerCase().trim();

  if (env === 'sandbox' || env === 'test' || env === 'testing') {
    return 'https://sandbox-api.polar.sh';
  }

  if (env === 'production' || env === 'prod' || env === 'live') {
    return 'https://api.polar.sh';
  }

  const raw = String(token || '').toLowerCase();

  if (
    raw.includes('sandbox') ||
    raw.includes('test') ||
    raw.startsWith('polar_at_test')
  ) {
    return 'https://sandbox-api.polar.sh';
  }

  return 'https://api.polar.sh';
}

function ship24goPolarWebhookUrl() {
  return `${process.env.APP_URL || 'https://doordrop.lat'}/api/webhooks/polar`;
}

function ship24goAmountFromPolar(_data: any, fallback: number) {
  // Regla global del wallet:
  // La recarga acredita SIEMPRE el monto solicitado/guardado en wallet_topups.
  // Nunca acredita el total cobrado por la pasarela, porque ese total puede incluir
  // impuestos, comisiones, diferencias del producto o ajustes externos.
  const value = Number(fallback || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// SHIP24GO_POLAR_RUNTIME_CONFIG_V1_4_37_COMPLETE
async function ship24goPolarRuntimeConfig(keys: any = {}) {
  let settings: any = {};

  try {
    const [rows]: any = await pool.query(
      `SELECT setting_key, setting_value
       FROM admin_settings
       WHERE setting_key IN (
        'payments.polar.access_token',
        'polar.access_token',
        'POLAR_ACCESS_TOKEN',
        'payments.polar.environment',
        'polar.environment',
        'POLAR_ENV',
        'payments.polar.webhook_secret',
        'polar.webhook_secret'
       )`
    );

    for (const row of rows || []) {
      settings[row.setting_key] = row.setting_value;
    }
  } catch {}

  const token =
    settings['payments.polar.access_token'] ||
    settings['polar.access_token'] ||
    settings['POLAR_ACCESS_TOKEN'] ||
    keys?.polarAccessToken ||
    keys?.polarApiToken ||
    keys?.paymentPolarAccessToken ||
    process.env.POLAR_ACCESS_TOKEN ||
    '';

  // Prefer the persisted DoorDrop configuration so a stale container environment
  // cannot silently route live checkouts to Polar sandbox.
  const rawEnv = String(
    keys?.polarEnvironment ||
    keys?.paymentPolarEnvironment ||
    settings['payments.polar.environment'] ||
    settings['polar.environment'] ||
    settings['POLAR_ENV'] ||
    process.env.PAYMENTS_POLAR_ENVIRONMENT ||
    process.env.POLAR_ENV ||
    'production'
  ).toLowerCase().trim();
  const environment = (rawEnv === 'sandbox' || rawEnv === 'test' || rawEnv === 'development')
    ? 'sandbox'
    : 'production';

  const webhookSecret =
    settings['payments.polar.webhook_secret'] ||
    settings['polar.webhook_secret'] ||
    keys?.polarWebhookSecret ||
    process.env.POLAR_WEBHOOK_SECRET ||
    '';

  return { token, environment, webhookSecret };
}

// SHIP24GO_BILLING_COMPAT_COLUMNS_V1_4_37_COMPLETE
let ship24goBillingColumnsReady = false;
async function ensureShip24GoBillingColumns() {
  if (ship24goBillingColumnsReady) return;
  const statements = [
    `ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(80) NULL`,
    `ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(191) NULL`,
    `ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS external_reference VARCHAR(191) NULL`,
    `ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS method VARCHAR(80) NULL`,
    `ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'completed' AFTER currency`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS purpose VARCHAR(80) NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS plan_id CHAR(36) NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS subscription_id CHAR(36) NULL`
  ];
  for (const statement of statements) {
    try { await pool.query(statement); } catch {}
  }
  ship24goBillingColumnsReady = true;
}

async function ship24goPolarLog(actionType: string, requestPayload: any, responsePayload: any, httpStatus = 200) {
  try {
    await pool.query(
      `INSERT INTO provider_logs (id, provider_code, action_type, request_payload, response_payload, http_status)
       VALUES (?, 'polar', ?, ?, ?, ?)`,
      [generateId('log_'), actionType, JSON.stringify(requestPayload || {}), JSON.stringify(responsePayload || {}), httpStatus]
    );
  } catch {}
}

function normalizePolarProduct(product: any) {
  const price =
    Array.isArray(product.prices) && product.prices.length
      ? product.prices[0]
      : product.price || {};

  const amountCents = Number(price.price_amount || price.amount || product.price_amount || product.amount || 0);
  const interval =
    price.recurring_interval ||
    product.recurring_interval ||
    product.interval ||
    (product.is_recurring ? 'month' : 'one_time');

  const codeBase = String(product.slug || product.name || product.id || 'polar_plan')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70) || String(product.id).slice(0, 30);

  return {
    id: String(product.id || generateId('pln_')).slice(0, 36),
    code: `polar_${codeBase}`.slice(0, 80),
    name: String(product.name || 'Plan Polar'),
    price: amountCents ? amountCents / 100 : 0,
    currency: String(price.price_currency || price.currency || product.price_currency || 'EUR').toUpperCase().slice(0, 3),
    interval: String(interval || 'one_time'),
    isSubscription: String(interval || '').toLowerCase() !== 'one_time',
    raw: product
  };
}


async function getFreshRatesInternal() {
  const now = Date.now();
  if (cachedRates && (now - lastCacheTime < 300000)) { // 5 minutes cache
    return cachedRates;
  }

  if (ratesRefreshPromise) return ratesRefreshPromise;
  ratesRefreshPromise = refreshRatesInternal();
  try {
    return await ratesRefreshPromise;
  } finally {
    ratesRefreshPromise = null;
  }
}

async function refreshRatesInternal() {
  const now = Date.now();

  const fallbackRates = {
    EUR: 1.0,
    USD: 1.09,
    GBP: 0.84,
    MXN: 19.50,
    COP: 4420.00,
    ARS: 990.00,
    CLP: 1010.00,
    BRL: 5.90,
    DOP: 59.30
  };

  const keys = await ApiKeysRepo.get();
  const apiKey = keys?.freeCurrencyApiKey || '';

  if (apiKey) {
    try {
      const url = `https://api.freecurrencyapi.com/v1/latest?apikey=${apiKey}&base_currency=EUR`;
      const response = await fetchWithTimeout(url, {}, CURRENCY_API_TIMEOUT_MS);
      if (response.ok) {
        const json: any = await response.json();
        if (json && json.data) {
          // SHIP24GO_FX_ALL_RATES_V1 — keep full map (not only a hard-coded subset)
          const merged: Record<string, number> = { ...fallbackRates, EUR: 1.0 };
          for (const [code, val] of Object.entries(json.data || {})) {
            const c = String(code || '').toUpperCase();
            const n = Number(val);
            if (/^[A-Z]{3}$/.test(c) && Number.isFinite(n) && n > 0) merged[c] = n;
          }
          cachedRates = merged;
          lastCacheTime = now;
          console.log('[Currencies Cache] Tasas actualizadas desde FreeCurrencyAPI.', Object.keys(merged).length, 'monedas');
          return cachedRates;
        }
      }
    } catch (e: any) {
      console.warn('[Currencies Cache] FreeCurrencyAPI failed, trying open.er-api fallback:', e.message);
    }
  }

  try {
    const response = await fetchWithTimeout('https://open.er-api.com/v6/latest/EUR', {}, CURRENCY_API_TIMEOUT_MS);
    if (response.ok) {
      const json: any = await response.json();
      if (json && json.result === 'success' && json.rates) {
        const merged: Record<string, number> = { ...fallbackRates, EUR: 1.0 };
        for (const [code, val] of Object.entries(json.rates || {})) {
          const c = String(code || '').toUpperCase();
          const n = Number(val);
          if (/^[A-Z]{3}$/.test(c) && Number.isFinite(n) && n > 0) merged[c] = n;
        }
        cachedRates = merged;
        lastCacheTime = now;
        console.log('[Currencies Cache] Tasas actualizadas desde proveedor alterno.', Object.keys(merged).length, 'monedas');
        return cachedRates;
      }
    }
  } catch (e: any) {
    console.warn('[Currencies Cache] All currency APIs failed, using hardcoded rates:', e.message);
  }

  cachedRates = fallbackRates;
  lastCacheTime = now;
  return cachedRates;
}

function normalizeCurrencyCode(code: any, fallback = 'EUR') {
  const value = String(code || fallback).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  return value || fallback;
}


function convertMoneyAmount(amount: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>) {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) return 0;
  if (from === to) return roundMoney(value);
  const fromRate = Number(rates?.[from] || 0);
  const toRate = Number(rates?.[to] || 0);
  if (!fromRate || !toRate) return roundMoney(value);
  return roundMoney((value / fromRate) * toRate);
}

function convertMoneyAmountStrict(amount: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>) {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) throw new Error('El importe no es válido.');
  if (from === to) return roundMoney(value);
  const fromRate = Number(rates?.[from] || 0);
  const toRate = Number(rates?.[to] || 0);
  if (!fromRate || !toRate || !Number.isFinite(fromRate) || !Number.isFinite(toRate)) {
    const error: any = new Error('No hay una tasa de cambio disponible para completar la operación.');
    error.code = 'FX_UNAVAILABLE';
    throw error;
  }
  return roundMoney((value / fromRate) * toRate);
}

let walletCurrencySchemaReady = false;
let walletCurrencySchemaPromise: Promise<void> | null = null;

async function ensureWalletCurrencySchema() {
  if (walletCurrencySchemaReady) return;
  if (walletCurrencySchemaPromise) return walletCurrencySchemaPromise;
  walletCurrencySchemaPromise = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS wallet_currency_conversions (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      from_currency CHAR(3) NOT NULL,
      to_currency CHAR(3) NOT NULL,
      from_balance DECIMAL(12,2) NOT NULL,
      to_balance DECIMAL(12,2) NOT NULL,
      exchange_rate DECIMAL(24,12) NOT NULL,
      rate_source VARCHAR(80) NOT NULL DEFAULT 'fx_provider',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_wallet_currency_conversion_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_wallet_currency_conversion_user_created (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    for (const statement of [
      `ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS source_amount DECIMAL(12,2) NULL`,
      `ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS source_currency CHAR(3) NULL`,
      `ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS fx_rate DECIMAL(24,12) NULL`
    ]) {
      try { await pool.query(statement); } catch {}
    }
    walletCurrencySchemaReady = true;
  })().finally(() => {
    walletCurrencySchemaPromise = null;
  });
  return walletCurrencySchemaPromise;
}

function walletFxRate(fromCurrency: string, toCurrency: string, rates: Record<string, number>) {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  if (from === to) return 1;
  const fromRate = Number(rates?.[from] || 0);
  const toRate = Number(rates?.[to] || 0);
  if (!fromRate || !toRate) return 0;
  return Number((toRate / fromRate).toFixed(12));
}

async function recordWalletCurrencyConversion(conn: any, options: {
  userId: string;
  fromCurrency: string;
  toCurrency: string;
  fromBalance: number;
  toBalance: number;
  rates: Record<string, number>;
}) {
  const fromCurrency = normalizeCurrencyCode(options.fromCurrency);
  const toCurrency = normalizeCurrencyCode(options.toCurrency);
  if (fromCurrency === toCurrency) return;
  await conn.query(
    `INSERT INTO wallet_currency_conversions
      (id, user_id, from_currency, to_currency, from_balance, to_balance, exchange_rate, rate_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'fx_provider')`,
    [
      generateId('wfx_'),
      options.userId,
      fromCurrency,
      toCurrency,
      roundMoney(options.fromBalance),
      roundMoney(options.toBalance),
      walletFxRate(fromCurrency, toCurrency, options.rates)
    ]
  );
}

async function lockedWalletUser(conn: any, userId: string) {
  const [rows]: any = await conn.query(
    `SELECT id, name, email, country, currency, balance, role
     FROM users WHERE id = ? FOR UPDATE`,
    [userId]
  );
  const user = rows?.[0];
  if (!user) throw new Error('No se pudo encontrar la cuenta.');
  user.currency = normalizeCurrencyCode(user.currency || 'EUR');
  user.balance = roundMoney(Number(user.balance || 0));
  return user;
}

async function applyWalletMutation(conn: any, options: {
  userId: string;
  type: 'credit' | 'debit';
  amount: number;
  currency: string;
  description: string;
  referenceType: string;
  referenceId: string;
  transactionId?: string;
  status?: string;
  adminNote?: string | null;
  minimumBalance?: number;
  rates?: Record<string, number>;
}) {
  const user = await lockedWalletUser(conn, options.userId);
  const sourceCurrency = normalizeCurrencyCode(options.currency || user.currency);
  const sourceAmount = roundMoney(Number(options.amount || 0));
  if (!Number.isFinite(sourceAmount) || sourceAmount < 0) throw new Error('El importe no es válido.');
  const rates = options.rates || (sourceCurrency === user.currency ? { EUR: 1 } : await getFreshRatesInternal());
  const walletAmount = convertMoneyAmountStrict(sourceAmount, sourceCurrency, user.currency, rates);
  const nextBalance = options.type === 'debit'
    ? roundMoney(user.balance - walletAmount)
    : roundMoney(user.balance + walletAmount);
  const minimumBalance = Number.isFinite(Number(options.minimumBalance)) ? Number(options.minimumBalance) : 0;
  if (options.type === 'debit' && nextBalance < minimumBalance) {
    const error: any = new Error('Saldo insuficiente para completar la operación.');
    error.code = 'WALLET_INSUFFICIENT';
    error.balance = user.balance;
    error.required = walletAmount;
    throw error;
  }

  const transactionId = options.transactionId || generateId('wtx_');
  await conn.query('UPDATE users SET balance = ? WHERE id = ?', [nextBalance, user.id]);
  await conn.query(
    `INSERT INTO wallet_transactions
      (id, user_id, type, amount, currency, source_amount, source_currency, fx_rate, description, reference_type, reference_id, status, admin_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      transactionId,
      user.id,
      options.type,
      walletAmount,
      user.currency,
      sourceAmount,
      sourceCurrency,
      walletFxRate(sourceCurrency, user.currency, rates),
      options.description,
      options.referenceType,
      options.referenceId,
      options.status || 'completed',
      options.adminNote || null
    ]
  );
  return { user, sourceAmount, sourceCurrency, walletAmount, walletCurrency: user.currency, newBalance: nextBalance, transactionId };
}

async function applyWalletMutationCommitted(options: Parameters<typeof applyWalletMutation>[1]) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await applyWalletMutation(conn, options);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}


// SHIP24GO_FX_UNIFIED_V1 — system-wide currency conversion + multi-provider diversity
const SHIP24GO_QUOTE_PROVIDER_CODES = new Set([
  'parcelabc', 'genei', 'paccofacile', 'spedirepro', 'spediamopro', 'easypost', 'logihub_intl'
]);
// DoorDrop pricing guardrail: 30% provider margin leaves 23% as the safe
// maximum plan discount after rounding (30 / 130 = 23.0769%).
const DOORDROP_PROVIDER_MARGIN_PERCENT = 30;
const DOORDROP_MAX_PLAN_DISCOUNT_PERCENT = 23;
// Read-only quote results are intentionally short-lived: provider prices can
// change quickly and the customer should never see a stale estimate for long.
const READ_ONLY_QUOTE_CACHE_TTL_MS = 10 * 1000;
const READ_ONLY_QUOTE_CACHE_MAX_ENTRIES = 32;
const readOnlyQuoteCache = new Map<string, { expiresAt: number; response: any }>();

function readOnlyQuoteCacheKey(input: any) {
  return JSON.stringify({
    userId: input.userId || 'anonymous',
    originCountry: input.originCountry,
    originZip: input.originZip,
    originCity: input.originCity || '',
    destCountry: input.destCountry,
    destZip: input.destZip,
    destCity: input.destCity || '',
    currency: input.currency,
    packages: input.packages,
    activeProviders: input.activeProviders,
  });
}

function getReadOnlyQuoteCache(key: string) {
  const hit = readOnlyQuoteCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    readOnlyQuoteCache.delete(key);
    return null;
  }
  // Refresh insertion order for a small bounded LRU cache.
  readOnlyQuoteCache.delete(key);
  readOnlyQuoteCache.set(key, hit);
  return hit.response;
}

function setReadOnlyQuoteCache(key: string, response: any) {
  readOnlyQuoteCache.delete(key);
  readOnlyQuoteCache.set(key, { expiresAt: Date.now() + READ_ONLY_QUOTE_CACHE_TTL_MS, response });
  while (readOnlyQuoteCache.size > READ_ONLY_QUOTE_CACHE_MAX_ENTRIES) {
    const oldest = readOnlyQuoteCache.keys().next().value;
    if (!oldest) break;
    readOnlyQuoteCache.delete(oldest);
  }
}

function withQuoteProviderTimeout<T>(work: Promise<T>, providerCode: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn(`[Quote] provider ${providerCode || 'unknown'} exceeded ${QUOTE_API_TIMEOUT_MS}ms; returning partial results.`);
      resolve([] as T);
    }, QUOTE_API_TIMEOUT_MS);
    work.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }).catch((error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function normalizeDoorDropPlanDiscount(value: any) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(DOORDROP_MAX_PLAN_DISCOUNT_PERCENT, Math.max(0, numericValue));
}

function providerNativeCurrency(provider: any, fallback = 'EUR') {
  let cfg: any = {};
  try {
    if (typeof provider?.config_json === 'string' && provider.config_json) cfg = JSON.parse(provider.config_json);
    else if (provider?.config && typeof provider.config === 'object') cfg = provider.config;
  } catch {}
  return normalizeCurrencyCode(provider?.currency || cfg?.currency || fallback);
}

/** Convert money fields of a quote from its currency into target currency (proportional). */
function convertQuoteToCurrency(quote: any, targetCurrency: string, rates: Record<string, number>) {
  const from = normalizeCurrencyCode(quote?.currency || quote?.providerNativeCurrency || 'EUR');
  const to = normalizeCurrencyCode(targetCurrency || 'EUR');
  if (from === to) {
    return { ...quote, currency: to, providerNativeCurrency: quote.providerNativeCurrency || from };
  }
  const c = (v: any) => convertMoneyAmount(Number(v || 0), from, to, rates);
  const next: any = {
    ...quote,
    providerCost: c(quote.providerCost ?? quote.price),
    price: c(quote.price ?? quote.providerCost),
    margin: c(quote.marginAmount ?? quote.margin),
    marginAmount: c(quote.marginAmount ?? quote.margin),
    customerPrice: c(quote.customerPrice ?? quote.total),
    total: c(quote.total ?? quote.customerPrice),
    currency: to,
    providerNativeCurrency: quote.providerNativeCurrency || from,
    fxFrom: from,
    fxTo: to,
  };
  if (quote.originalCustomerPrice != null) next.originalCustomerPrice = c(quote.originalCustomerPrice);
  if (quote.originalTotal != null) next.originalTotal = c(quote.originalTotal);
  if (quote.planDiscountAmount != null) next.planDiscountAmount = c(quote.planDiscountAmount);
  if (quote.taxes != null) next.taxes = c(quote.taxes);
  return next;
}

/**
 * Keep variety across providers: up to maxPerProvider of the cheapest per code,
 * then fill remaining slots with global cheapest. Cap total at maxTotal.
 */
function diversifyQuotesByProvider(quotes: any[], maxTotal = 24, maxPerProvider = 4) {
  const sorted = [...(quotes || [])].sort(
    (a, b) =>
      (Number(a.total || 0) - Number(b.total || 0)) ||
      (Number(a.estimatedDays || 99) - Number(b.estimatedDays || 99)) ||
      (Number(a.priority || 99) - Number(b.priority || 99))
  );
  const selected: any[] = [];
  const perCode = new Map<string, number>();
  const used = new Set<string>();

  for (const q of sorted) {
    const code = String(q.providerCode || q.provider || 'unknown').toLowerCase();
    const n = perCode.get(code) || 0;
    if (n >= maxPerProvider) continue;
    selected.push(q);
    perCode.set(code, n + 1);
    used.add(String(q.id));
    if (selected.length >= maxTotal) break;
  }

  if (selected.length < maxTotal) {
    for (const q of sorted) {
      if (used.has(String(q.id))) continue;
      selected.push(q);
      used.add(String(q.id));
      if (selected.length >= maxTotal) break;
    }
  }

  return selected.sort(
    (a, b) =>
      (Number(a.total || 0) - Number(b.total || 0)) ||
      (Number(a.estimatedDays || 99) - Number(b.estimatedDays || 99)) ||
      (Number(a.priority || 99) - Number(b.priority || 99))
  );
}


function safeJsonParse(value: any, fallback: any = null) {
  try {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

async function writeAdminClientLog(actionType: string, requestPayload: any, responsePayload: any, httpStatus = 200) {
  try {
    await pool.query(
      `INSERT INTO provider_logs (id, provider_code, action_type, request_payload, response_payload, http_status)
       VALUES (?, 'admin_clients', ?, ?, ?, ?)`,
      [generateId('log_'), actionType, JSON.stringify(requestPayload || {}), JSON.stringify(responsePayload || {}), httpStatus]
    );
  } catch {}
}


function appPublicUrl(req: express.Request) {
  const configured = String(process.env.APP_URL || '').replace(/\/$/, '');
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
}

function resolvePublicAssetUrl(req: express.Request, value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `${appPublicUrl(req)}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function saveBrandImageFromDataUrl(dataUrl: string, prefix: 'logo' | 'favicon') {
  const raw = String(dataUrl || '');
  if (!raw.startsWith('data:image/')) return '';
  const match = raw.match(/^data:image\/(png|jpe?g|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return '';

  const subtype = match[1].toLowerCase();
  const ext = subtype.includes('svg') ? 'svg' : subtype.includes('jpeg') || subtype.includes('jpg') ? 'jpg' : subtype.includes('icon') || subtype.includes('x-icon') ? 'ico' : subtype;
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > 3 * 1024 * 1024) return '';

  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'brand');
  fs.mkdirSync(uploadDir, { recursive: true });
  const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, data);
  return `/uploads/brand/${filename}`;
}

async function saveIncomingBrandAssets(req: express.Request, brand: any) {
  const next = { ...(brand || {}) };
  const logoUrl = saveBrandImageFromDataUrl(next.logoDataUrl, 'logo');
  const faviconUrl = saveBrandImageFromDataUrl(next.faviconDataUrl, 'favicon');
  delete next.logoDataUrl;
  delete next.faviconDataUrl;
  if (logoUrl) next.logoUrl = logoUrl;
  if (faviconUrl) next.faviconUrl = faviconUrl;
  if (!next.ogImageUrl && next.logoUrl) next.ogImageUrl = next.logoUrl;
  return next;
}

// Subscription periods are provider-owned, but local access and discounts
// must fail closed when the local period is over or missing. This reconciler
// is deliberately idempotent and never cancels a provider subscription or
// mutates wallet balances.
let subscriptionReconciliationInFlight = false;

async function reconcileExpiredSubscriptions(source = 'runtime'): Promise<void> {
  if (subscriptionReconciliationInFlight) return;
  subscriptionReconciliationInFlight = true;
  try {
    const [generalResult]: any = await pool.query(
      `UPDATE subscriptions
          SET status = 'expired', updated_at = UTC_TIMESTAMP()
        WHERE status IN ('active', 'trialing')
          AND (current_period_end IS NULL OR current_period_end <= UTC_TIMESTAMP())`
    );
    const [omnichannelResult]: any = await pool.query(
      `UPDATE omnichannel_subscriptions
          SET status = 'expired', updated_at = CURRENT_TIMESTAMP
        WHERE provider = 'polar'
          AND status IN ('active', 'trialing')
          AND (COALESCE(current_period_end, renews_at) IS NULL
               OR COALESCE(current_period_end, renews_at) <= UTC_TIMESTAMP())`
    );
    const changed = Number(generalResult?.affectedRows || 0) + Number(omnichannelResult?.affectedRows || 0);
    if (changed > 0) {
      console.log(`[Subscriptions] Reconciliación ${source}: ${changed} período(s) local(es) marcado(s) como expired.`);
    }
  } catch (error: any) {
    // The interval retries on the next cycle; do not interrupt API startup or
    // turn a database maintenance issue into a payment-flow failure.
    console.error('[Subscriptions] Error en reconciliación de períodos:', error?.message || error);
  } finally {
    subscriptionReconciliationInFlight = false;
  }
}

// Inicializar base de datos
initDb().then(() => {
  void reconcileExpiredSubscriptions('startup');
  const subscriptionReconciliationTimer = setInterval(() => {
    void reconcileExpiredSubscriptions('interval');
  }, 15 * 60 * 1000);
  subscriptionReconciliationTimer.unref?.();
}).catch(err => {
  console.error('[MySQL Init] Error crítico:', err);
});

// --- GENEI AUTHENTICATION TOKEN CACHE ---
let geneiToken = '';
let geneiTokenExpiry = 0;

async function getGeneiToken(credentials: string, timeoutMs = EXTERNAL_API_TIMEOUT_MS): Promise<string> {
  if (geneiToken && Date.now() < geneiTokenExpiry) {
    return geneiToken;
  }
  const parts = credentials.split(':');
  if (parts.length < 2) {
    return credentials; // Is already a token or API key
  }
  const [email, password] = parts;
  try {
    const response = await fetchWithTimeout('https://apiv2.genei.es/api/v2/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }, timeoutMs);
    if (response.ok) {
      const data: any = await response.json();
      if (data && data.token) {
        geneiToken = data.token;
        geneiTokenExpiry = Date.now() + 14 * 24 * 60 * 60 * 1000; // 14 days
        return geneiToken;
      }
    }
  } catch (e) {
    console.error('[Genei Auth] Error al autenticar con Genei API:', e);
  }
  return credentials;
}

type GeneiV1Credentials = { user: string; password: string };

function geneiApiMode(provider?: any) {
  const cfg = providerConfig(provider || {});
  return String(process.env.GENEI_API_MODE || cfg.apiMode || cfg.mode || 'v2').trim().toLowerCase();
}

function geneiV1BaseUrl(provider?: any) {
  const cfg = providerConfig(provider || {});
  return String(process.env.GENEI_V1_BASE_URL || cfg.v1BaseUrl || cfg.baseUrlV1 || 'https://v1.genei.es/json_interface').replace(/\/$/, '');
}

function geneiV1PlatformBaseUrl(provider?: any) {
  const cfg = providerConfig(provider || {});
  return String(process.env.GENEI_V1_PLATFORM_URL || cfg.platformUrl || 'https://www.genei.es').replace(/\/$/, '');
}

function geneiV1Credentials(provider: any, keys: any): GeneiV1Credentials | null {
  const cfg = providerConfig(provider || {});
  const envUser = String(process.env.GENEI_V1_USER || '').trim();
  const envPass = String(process.env.GENEI_V1_PASSWORD || '').trim();
  const cfgUser = String(cfg.v1User || cfg.user || '').trim();
  const cfgPass = String(cfg.v1Password || cfg.password || '').trim();
  if (envUser && envPass) return { user: envUser, password: envPass };
  if (cfgUser && cfgPass) return { user: cfgUser, password: cfgPass };
  const credential = String(cfg.credential || keys?.genei || '').trim();
  const [user, ...passwordParts] = credential.split(':');
  const password = passwordParts.join(':');
  if (user && password) return { user, password };
  return null;
}

function geneiV1AllowRealCreate(provider?: any) {
  const cfg = providerConfig(provider || {});
  const raw = String(process.env.GENEI_V1_ALLOW_REAL_CREATE ?? cfg.allowRealCreate ?? 'false').trim().toLowerCase();
  return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(raw);
}

function geneiV1CreateFunction(provider?: any) {
  const cfg = providerConfig(provider || {});
  const wanted = String(process.env.GENEI_V1_CREATE_FUNCTION || cfg.createFunction || '').trim();
  if (geneiV1AllowRealCreate(provider) && wanted === 'crear_envio') return 'crear_envio';
  return 'crear_envio_sandbox';
}

function safeGeneiPhone(value: any) {
  const raw = String(value || '').trim();
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  return `${hasPlus ? '+' : ''}${digits}`.slice(0, 30) || '+34910000000';
}

function nextBusinessDateEs(offsetDays = 2) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  while ([0, 6].includes(date.getDay())) date.setDate(date.getDate() + 1);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function buildGeneiV1Packages(packages: any[], customs?: any[], content?: string, declaredValue?: number) {
  // Genei V1 uses a legacy one-based array_bultos contract: the first entry is
  // intentionally empty and physical parcels start at index 1. Without this
  // sentinel, Genei accepts the request but normalizes the shipment to zero
  // packages and returns an empty agency list.
  const rows: any[] = [];
  const fallbackContent = compactText(content || 'Ropa', 80) || 'Ropa';
  const expanded = expandPackagesByQty(packages);
  expanded.forEach((pkg: any, index: number) => {
    const custom = Array.isArray(customs) ? customs[Math.min(index, customs.length - 1)] || customs[0] : null;
    rows.push({
      peso: String(Number(pkg.weight || pkg.weight_kg || 1) || 1),
      largo: String(Math.round(Number(pkg.length || pkg.length_cm || 10) || 10)),
      ancho: String(Math.round(Number(pkg.width || pkg.width_cm || 10) || 10)),
      alto: String(Math.round(Number(pkg.height || pkg.height_cm || 10) || 10)),
      contenido: compactText(custom?.description || fallbackContent, 80),
      taric: compactText(custom?.hsCode || custom?.itemhscode || '', 14),
      peso_bruto: String(Number(custom?.grossWeight || custom?.peso_bruto || pkg.weight || pkg.weight_kg || 1) || 1),
      peso_neto: String(Number(custom?.netWeight || custom?.peso_neto || pkg.weight || pkg.weight_kg || 1) || 1),
      cantidad: '1',
      valor: String(Number(custom?.value || declaredValue || 15) || 15)
    });
  });
  if (!rows.length) {
    rows.push({ peso: '1', largo: '10', ancho: '10', alto: '10', contenido: fallbackContent, taric: '', peso_bruto: '1', peso_neto: '1', cantidad: '1', valor: String(Number(declaredValue || 15) || 15) });
  }
  return [[], ...rows];
}

function absoluteGeneiV1LabelUrl(rawUrl: any, provider?: any) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${geneiV1PlatformBaseUrl(provider)}${value}`;
  return `${geneiV1PlatformBaseUrl(provider)}/recursos/etiquetas/${value.replace(/^\/+/, '')}`;
}

async function callGeneiV1(provider: any, keys: any, fn: string, payload: any, timeoutMs = EXTERNAL_API_TIMEOUT_MS) {
  const credentials = geneiV1Credentials(provider, keys);
  if (!credentials) {
    return { httpStatus: 0, response: { resultado: '0', resultado_text: 'Proveedor no disponible todavía.' } };
  }
  const body = {
    ...(payload || {}),
    usuario_servicio: credentials.user,
    password_servicio: credentials.password,
    servicio: 'api'
  };
  const response = await fetchWithTimeout(`${geneiV1BaseUrl(provider)}/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, timeoutMs);
  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { httpStatus: response.status, response: data, request: body };
}

function mapGeneiStatus(rawEstado: any, fallbackLabel = 'Actualizado') {
  const code = Number(rawEstado);
  if (code === 7) return { status: 'pendiente_pago', label: 'Pendiente de pago' };
  if (code === 6) return { status: 'pendiente_tramitar', label: 'Pendiente de tramitación' };
  if (code === 1) return { status: 'tramitado', label: 'Tramitado' };
  if (code === 2) return { status: 'pendiente_deposito', label: 'Pendiente de depósito' };
  if (code === 80) return { status: 'en_reparto', label: 'En reparto' };
  if (code === 85) return { status: 'recogida_pendiente', label: 'Disponible en oficina' };
  if (code === 3) return { status: 'entregado', label: 'Entregado' };
  if (code === 5) return { status: 'en_transito', label: 'En tránsito' };
  if ([9, 10, 15, 78].includes(code)) return { status: 'incidencia', label: 'Incidencia' };
  if (code === 14) return { status: 'devuelto', label: 'Devuelto' };
  if ([77, 79].includes(code)) return { status: 'cancelado', label: 'Cancelado' };
  return { status: 'enviado_proveedor', label: fallbackLabel };
}

type PaccofacileCredentials = { token: string; apiKey: string; accountNumber: string };

function paccofacileMode(provider?: any) {
  const cfg = providerConfig(provider || {});
  const raw = String(process.env.PACCOFACILE_MODE || cfg.mode || 'sandbox').trim().toLowerCase();
  return raw === 'live' || raw === 'production' || raw === 'prod' ? 'live' : 'sandbox';
}

function paccofacileBaseUrl(provider?: any) {
  const cfg = providerConfig(provider || {});
  const mode = paccofacileMode(provider);
  const envBase = mode === 'live' ? process.env.PACCOFACILE_LIVE_BASE_URL : process.env.PACCOFACILE_SANDBOX_BASE_URL;
  const fallback = mode === 'live' ? 'https://paccofacile.tecnosogima.cloud/live' : 'https://paccofacile.tecnosogima.cloud/sandbox';
  return String(envBase || cfg.baseUrl || fallback).replace(/\/$/, '');
}

function paccofacileApiVersion(provider?: any) {
  const cfg = providerConfig(provider || {});
  return String(process.env.PACCOFACILE_API_VERSION || cfg.apiVersion || 'v1').replace(/^\/+|\/+$/g, '') || 'v1';
}

function paccofacileCredentials(provider?: any, keys?: any): PaccofacileCredentials | null {
  const cfg = providerConfig(provider || {});
  const token = String(process.env.PACCOFACILE_TOKEN || cfg.token || cfg.authToken || keys?.paccoFacile || '').trim();
  const apiKey = String(process.env.PACCOFACILE_API_KEY || cfg.apiKey || '').trim();
  const accountNumber = String(process.env.PACCOFACILE_ACCOUNT_NUMBER || cfg.accountNumber || cfg.account_number || '').trim();
  if (!token || !apiKey || !accountNumber) return null;
  return { token, apiKey, accountNumber };
}

function paccofacileAllowRealBuy(provider?: any) {
  const cfg = providerConfig(provider || {});
  const raw = String(process.env.PACCOFACILE_ALLOW_REAL_BUY ?? cfg.allowRealBuy ?? 'false').trim().toLowerCase();
  return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(raw);
}

function paccofacileCanBuy(provider?: any) {
  const mode = paccofacileMode(provider);
  // En sandbox se permite completar el flujo comercial sin activar compras reales.
  // En live se exige confirmación explícita para evitar cargos involuntarios.
  return mode === 'sandbox' || paccofacileAllowRealBuy(provider);
}

function paccofacileBuyBlockedMessage(provider?: any) {
  return paccofacileMode(provider) === 'live'
    ? 'La red logística está conectada. Falta activar la compra real para emitir etiquetas.'
    : 'La red logística está conectada. La etiqueta seguirá en preparación.';
}

function paccofacileBuyPayload(providerShipmentId: any) {
  return {
    shipments: [Number(providerShipmentId)],
    billing_type: 2,
    billing_date: 1,
    payment_method: 'CREDIT'
  };
}

function paccofacileExtractTrackingNumber(payload: any): string {
  const data = payload?.data?.shipment || payload?.data || payload || {};
  const trackingValues = [
    data?.tracking_number,
    data?.tracking,
    data?.tracking_code,
    data?.trackingCode,
    data?.ldv,
    data?.waybill
  ];
  const list = Array.isArray(data?.tracking_numbers)
    ? data.tracking_numbers
    : (Array.isArray(data?.trackings) ? data.trackings : (data?.tracking_numbers ? [data.tracking_numbers] : []));
  for (const item of list) {
    trackingValues.push(item?.tracking_number || item?.number || item?.code || item?.tracking || item);
  }
  for (const value of trackingValues) {
    const text = String(value || '').trim();
    if (text && text !== '[object Object]') return text;
  }
  return '';
}

function paccofacileExtractRawStatus(payload: any): string {
  const data = payload?.data?.shipment || payload?.data || payload || {};
  return String(data?.status_name || data?.status_label || data?.status || data?.state || data?.current_status || data?.carrier_status || data?.nome_stato || data?.tracking_status || '').trim();
}

function paccofacileHasCompletedBuy(data: any) {
  if (!paccofacileIsSuccess(data)) return false;
  const order = data?.data?.order || data?.order || data?.data || {};
  const statusText = String(order?.status_name || order?.status || '').toLowerCase();
  const statusId = Number(order?.status_id || order?.statusId || 0);
  return statusId === 5 || statusText.includes('complete') || statusText.includes('completed') || statusText.includes('pagato') || statusText.includes('success') || statusText.includes('paid');
}

function paccofacileEndpoint(provider: any, pathName: string) {
  return `${paccofacileBaseUrl(provider)}/${paccofacileApiVersion(provider)}/${String(pathName || '').replace(/^\/+/, '')}`;
}

async function callPaccofacile(provider: any, keys: any, method: string, pathName: string, body?: any, timeoutMs = EXTERNAL_API_TIMEOUT_MS) {
  const credentials = paccofacileCredentials(provider, keys);
  if (!credentials) {
    return { httpStatus: 0, response: { header: { status: 'FAILED', notification: { messages: 'Proveedor no disponible todavía.' } } }, request: null };
  }
  const headers: any = {
    Authorization: `Bearer ${credentials.token}`,
    'Account-Number': credentials.accountNumber,
    'api-key': credentials.apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  const response = await fetchWithTimeout(paccofacileEndpoint(provider, pathName), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  }, timeoutMs);
  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { httpStatus: response.status, response: data, request: { method, pathName, body } };
}


type SpedireProCredentials = { apiKey: string };

function spedireProBaseUrl(provider?: any) {
  const cfg = providerConfig(provider || {});
  return String(process.env.SPEDIREPRO_BASE_URL || cfg.baseUrl || 'https://www.spedirepro.com/public-api').replace(/\/$/, '');
}

function spedireProCredentials(provider?: any, _keys?: any): SpedireProCredentials | null {
  const cfg = providerConfig(provider || {});
  const apiKey = String(process.env.SPEDIREPRO_API_KEY || cfg.apiKey || cfg.token || cfg.authToken || '').trim();
  if (!apiKey) return null;
  return { apiKey };
}

function spedireProAllowRealBuy(provider?: any) {
  const cfg = providerConfig(provider || {});
  const raw = String(process.env.SPEDIREPRO_ALLOW_REAL_BUY ?? cfg.allowRealBuy ?? 'false').trim().toLowerCase();
  return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(raw);
}

function spedireProEndpoint(provider: any, pathName: string) {
  return `${spedireProBaseUrl(provider)}/${String(pathName || '').replace(/^\/+/, '')}`;
}

async function callSpedirePro(provider: any, keys: any, method: string, pathName: string, body?: any, timeoutMs = EXTERNAL_API_TIMEOUT_MS) {
  const credentials = spedireProCredentials(provider, keys);
  if (!credentials) {
    return { httpStatus: 0, response: { message: 'Proveedor no disponible todavía.' }, request: null };
  }
  const response = await fetchWithTimeout(spedireProEndpoint(provider, pathName), {
    method,
    headers: { 'X-Api-Key': credentials.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined
  }, timeoutMs);
  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { httpStatus: response.status, response: data, request: { method, pathName, body } };
}

function spedireProIsOk(httpStatus: number, data: any) {
  return httpStatus >= 200 && httpStatus < 300 && !data?.error && !data?.errors;
}

function spedireProMessage(data: any, fallback = 'No se pudo completar la operación.') {
  if (!data) return fallback;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.error?.message === 'string') return data.error.message;
  if (data?.errors && typeof data.errors === 'object') {
    const first = Object.values(data.errors).flat().find(Boolean);
    if (first) return String(first);
  }
  return fallback;
}


// SHIP24GO_MULTI_PACKAGE_V1 — expand qty lines into physical parcels + totals
function expandPackagesByQty(packages: any[]): any[] {
  const out: any[] = [];
  for (const pkg of Array.isArray(packages) ? packages : []) {
    const qty = Math.max(1, Math.round(Number(pkg?.qty ?? pkg?.quantity ?? 1) || 1));
    const base = {
      width: Math.max(1, Number(pkg?.width ?? pkg?.width_cm ?? 10) || 10),
      height: Math.max(1, Number(pkg?.height ?? pkg?.height_cm ?? 10) || 10),
      length: Math.max(1, Number(pkg?.length ?? pkg?.depth ?? pkg?.length_cm ?? 10) || 10),
      weight: Math.max(0.1, Number(pkg?.weight ?? pkg?.weight_kg ?? 1) || 1),
      qty: 1,
      quantity: 1,
    };
    for (let i = 0; i < qty; i++) out.push({ ...pkg, ...base });
  }
  return out.length ? out : [{ width: 10, height: 10, length: 10, weight: 1, qty: 1, quantity: 1 }];
}

function totalShipmentWeightKg(packages: any[]): number {
  const total = (Array.isArray(packages) ? packages : []).reduce(
    (sum: number, p: any) => sum + (Number(p?.weight ?? p?.weight_kg ?? 0) * Math.max(1, Number(p?.qty ?? p?.quantity ?? 1) || 1)),
    0
  );
  return Number.isFinite(total) && total > 0 ? total : 1;
}

function totalShipmentPieces(packages: any[]): number {
  const total = (Array.isArray(packages) ? packages : []).reduce(
    (sum: number, p: any) => sum + Math.max(1, Number(p?.qty ?? p?.quantity ?? 1) || 1),
    0
  );
  return Math.max(1, total || 1);
}

/** Which public APIs truly accept multi-piece quotes (after our expansion). */
function multiPackageProviderSupport(): Record<string, { multi: boolean; mode: string; note: string }> {
  return {
    parcelabc: { multi: true, mode: 'packages[]+qty', note: 'Soporta varios bultos y qty. Internacional con aduanas: preferible 1 bulto al crear.' },
    genei: { multi: true, mode: 'array_bultos', note: 'Varios bultos en array_bultos (qty expandido).' },
    paccofacile: { multi: true, mode: 'parcels[]', note: 'Expande qty a parcels individuales.' },
    spedirepro: { multi: true, mode: 'packages[]', note: 'Expande qty a packages individuales.' },
    spediamopro: { multi: true, mode: 'parcels[]', note: 'Expande qty a parcels individuales.' },
    logihub_intl: { multi: true, mode: 'pieces+weight', note: 'Consolida: peso total + pieces (no dimensiones por bulto).' },
    easypost: { multi: true, mode: 'consolidated', note: 'API 1 parcel; consolidamos peso total y caja máxima para cotizar.' },
  };
}

function buildSpedireProPackages(packages: any[]) {
  // Expand qty so 1 line × qty 3 = 3 physical packages
  const rows = expandPackagesByQty(packages).map((pkg: any) => ({
    width: Math.max(1, Math.round(Number(pkg.width || pkg.width_cm || 10) || 10)),
    height: Math.max(1, Math.round(Number(pkg.height || pkg.height_cm || 10) || 10)),
    depth: Math.max(1, Math.round(Number(pkg.length || pkg.depth || pkg.length_cm || 10) || 10)),
    weight: Math.max(0.1, Number(pkg.weight || pkg.weight_kg || 1) || 1)
  }));
  return rows.length ? rows : [{ width: 10, height: 10, depth: 10, weight: 1 }];
}

function normalizeItalianProvince(value: any, country: any, postalCode?: any) {
  const clean = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2);
  if (clean) return clean;
  const iso = String(country || '').toUpperCase();
  if (iso !== 'IT') return iso.slice(0, 2) || 'OT';
  const zip = String(postalCode || '').replace(/\D/g, '').slice(0, 2);
  const map: Record<string, string> = { '00':'RM','01':'VT','02':'RI','03':'FR','04':'LT','05':'TR','06':'PG','10':'TO','12':'CN','13':'VC','14':'AT','15':'AL','16':'GE','17':'SV','18':'IM','19':'SP','20':'MI','21':'VA','22':'CO','23':'SO','24':'BG','25':'BS','26':'CR','27':'PV','28':'NO','29':'PC','30':'VE','31':'TV','32':'BL','33':'UD','34':'TS','35':'PD','36':'VI','37':'VR','38':'TN','39':'BZ','40':'BO','41':'MO','42':'RE','43':'PR','44':'FE','45':'RO','46':'MN','47':'FC','48':'RA','50':'FI','51':'PT','52':'AR','53':'SI','54':'MS','55':'LU','56':'PI','57':'LI','58':'GR','60':'AN','61':'PU','62':'MC','63':'AP','64':'TE','65':'PE','66':'CH','67':'AQ','70':'BA','71':'FG','72':'BR','73':'LE','74':'TA','75':'MT','80':'NA','81':'CE','82':'BN','83':'AV','84':'SA','85':'PZ','86':'CB','87':'CS','88':'CZ','89':'RC','90':'PA','91':'TP','92':'AG','93':'CL','94':'EN','95':'CT','96':'SR','97':'RG','98':'ME' };
  return map[zip] || 'RM';
}

function buildSpedireProStreet(addr: any) {
  const line = compactText(addr?.addressLine1 || addr?.address || addr?.street || '', 70);
  const civic = compactText(addr?.civicNumber || addr?.streetNumber || addr?.numeroCivico || '', 12);
  if (!line) return 'Via Roma, 1';
  if (civic && !line.includes(civic)) return compactText(`${line}, ${civic}`, 80);
  return compactText(line, 80);
}

function buildSpedireProAddress(addr: any, quote: any, fallbackCountry: any, fallbackZip: any, providerEmail: string) {
  const country = compactText(addr?.country || fallbackCountry || 'IT', 2).toUpperCase() || 'IT';
  const postcode = compactText(addr?.zipCode || addr?.post_code || addr?.postcode || fallbackZip || '', 20);
  return {
    name: compactText(safeAddressName(addr, 'DoorDrop Cliente'), 27),
    attention_name: compactText(addr?.attention_name || addr?.company || '', 22),
    country,
    city: compactText(addr?.city || quote?.city || '', 80),
    postcode,
    province: normalizeItalianProvince(addr?.province || addr?.state || addr?.StateOrProvinceCode, country, postcode),
    street: buildSpedireProStreet(addr),
    email: providerEmail,
    phone: safePabcPhone(addr?.phone || '') || '3331234567'
  };
}


function sanitizeSpedireProDropPoint(point: any) {
  if (!point || typeof point !== 'object') return null;
  const required = ['PointID', 'Street', 'Zip', 'City'];
  for (const key of required) {
    if (!String(point?.[key] || '').trim()) return null;
  }
  return point;
}

function normalizeSpedireProDropPoints(data: any) {
  const rows: any[] = [];
  const source = data?.data || data?.points || data;
  if (Array.isArray(source)) return source.filter((point: any) => point && typeof point === 'object');
  if (source && typeof source === 'object') {
    Object.entries(source).forEach(([vendor, list]: any) => {
      if (Array.isArray(list)) list.forEach((point: any) => rows.push(point));
    });
  }
  return rows;
}

function allowedSpedireProVendors(vendors: any) {
  const allowed = new Set(['ups', 'poste', 'inpost', 'inpost_p2a', 'mondial_relay']);
  const rows = Array.isArray(vendors) ? vendors : [];
  return rows.map((vendor: any) => String(vendor || '').toLowerCase().trim()).filter((vendor: string) => allowed.has(vendor));
}



type SpediamoProCredentials = { authCode: string };
let spediamoProToken = '';
let spediamoProTokenExpiry = 0;

function spediamoProMode(provider?: any) {
  const cfg = providerConfig(provider || {});
  return String(process.env.SPEDIAMOPRO_MODE || cfg.mode || 'production').trim().toLowerCase();
}

function spediamoProBaseUrl(provider?: any) {
  const cfg = providerConfig(provider || {});
  const mode = spediamoProMode(provider);
  const envBase = process.env.SPEDIAMOPRO_BASE_URL || (mode === 'staging' ? process.env.SPEDIAMOPRO_STAGING_BASE_URL : process.env.SPEDIAMOPRO_PRODUCTION_BASE_URL);
  const fallback = mode === 'staging' ? 'https://core.spediamopro.it/api/v2' : 'https://core.spediamopro.com/api/v2';
  return String(envBase || cfg.baseUrl || cfg.apiBaseUrl || fallback).replace(/\/$/, '');
}

function spediamoProCredentials(provider?: any, _keys?: any): SpediamoProCredentials | null {
  const cfg = providerConfig(provider || {});
  const authCode = String(process.env.SPEDIAMOPRO_AUTHCODE || cfg.authCode || cfg.auth_code || cfg.apiKey || cfg.token || '').trim();
  if (!authCode) return null;
  return { authCode };
}

function spediamoProAllowRealBuy(provider?: any) {
  const cfg = providerConfig(provider || {});
  const raw = String(process.env.SPEDIAMOPRO_ALLOW_REAL_BUY ?? cfg.allowRealBuy ?? 'false').trim().toLowerCase();
  return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(raw);
}

async function getSpediamoProToken(provider: any, keys: any, timeoutMs = EXTERNAL_API_TIMEOUT_MS) {
  const credentials = spediamoProCredentials(provider, keys);
  if (!credentials) throw new Error('Proveedor no disponible todavía.');
  if (spediamoProToken && Date.now() < spediamoProTokenExpiry) return spediamoProToken;
  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const basic = Buffer.from(`${credentials.authCode}:`).toString('base64');
  const response = await fetchWithTimeout(`${spediamoProBaseUrl(provider)}/auth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body
  }, timeoutMs);
  const data = await response.json().catch(() => ({}));
  await writeProviderLog('spediamopro', 'auth_token', { mode: spediamoProMode(provider) }, { httpStatus: response.status, expiresIn: data?.expires_in || null, hasToken: Boolean(data?.access_token), processId: data?.processId || null }, response.status).catch(() => null);
  if (!response.ok || !data?.access_token) throw new Error('No se pudo validar el proveedor.');
  spediamoProToken = String(data.access_token);
  spediamoProTokenExpiry = Date.now() + Math.max(60, Number(data.expires_in || 3600) - 120) * 1000;
  return spediamoProToken;
}

async function callSpediamoPro(provider: any, keys: any, method: string, pathName: string, body?: any, timeoutMs = EXTERNAL_API_TIMEOUT_MS) {
  const credentials = spediamoProCredentials(provider, keys);
  if (!credentials) return { httpStatus: 0, response: { message: 'Proveedor no disponible todavía.' }, request: null };
  const token = await getSpediamoProToken(provider, keys, timeoutMs);
  const response = await fetchWithTimeout(`${spediamoProBaseUrl(provider)}/${String(pathName || '').replace(/^\/+/, '')}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined
  }, timeoutMs);
  const text = await response.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { httpStatus: response.status, response: data, request: { method, pathName, body } };
}

async function downloadSpediamoProFile(provider: any, keys: any, pathName: string) {
  const token = await getSpediamoProToken(provider, keys);
  const response = await fetch(`${spediamoProBaseUrl(provider)}/${String(pathName || '').replace(/^\/+/, '')}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf,application/zip,application/octet-stream,*/*' }
  });
  const contentType = response.headers.get('content-type') || '';
  const filename = response.headers.get('x-filename') || '';
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { httpStatus: response.status, contentType, filename, base64: '', response: data };
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { httpStatus: response.status, contentType, filename, base64: buffer.toString('base64'), response: { downloaded: true, filename, contentType, bytes: buffer.length } };
}

function spediamoProIsOk(httpStatus: number, data: any) {
  return httpStatus >= 200 && httpStatus < 300 && !data?.error && !data?.errors;
}

function spediamoProMessage(data: any, fallback = 'No se pudo completar la operación.') {
  if (!data) return fallback;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.error?.message === 'string') return data.error.message;
  if (Array.isArray(data?.error?.details) && data.error.details.length) return String(data.error.details[0]?.message || fallback);
  if (Array.isArray(data?.details) && data.details.length) return String(data.details[0]?.message || fallback);
  return fallback;
}

function buildSpediamoProParcels(packages: any[]) {
  const rows = expandPackagesByQty(packages).map((pkg: any) => ({
    type: Number(pkg.type ?? 0),
    weight: Math.max(10, Math.round(Number(pkg.weight || pkg.weight_kg || 1) * 1000)),
    length: Math.max(1, Math.round(Number(pkg.length || pkg.depth || pkg.length_cm || 10) * 10)),
    width: Math.max(1, Math.round(Number(pkg.width || pkg.width_cm || 10) * 10)),
    height: Math.max(1, Math.round(Number(pkg.height || pkg.height_cm || 10) * 10))
  }));
  return rows.length ? rows : [{ type: 0, weight: 1000, length: 100, width: 100, height: 100 }];
}

function buildSpediamoProQuoteContact(country: any, postalCode: any, city: any, province?: any) {
  const cleanCountry = compactText(country || 'IT', 2).toUpperCase() || 'IT';
  const zip = compactText(postalCode || '', 10);
  return {
    country: cleanCountry,
    postalCode: zip,
    city: compactText(city || '', 255),
    province: normalizeItalianProvince(province, cleanCountry, zip)
  };
}

function buildSpediamoProShipmentContact(addr: any, quote: any, fallbackCountry: any, fallbackZip: any, providerEmail: string) {
  const source = buildCustomerAddressPayload(addr || {});
  const country = compactText(source.country || fallbackCountry || 'IT', 2).toUpperCase() || 'IT';
  const postalCode = compactText(source.zipCode || source.post_code || source.postcode || fallbackZip || '', 9);
  const rawStreet = compactText(source.addressLine1 || source.address || source.street || '', 40) || 'Via Roma 1';
  return {
    name: compactText(safeAddressName(source, 'DoorDrop Cliente'), 35),
    at: compactText(source.company || source.at || '', 35) || null,
    address: rawStreet,
    addressLine2: null,
    addressLine3: null,
    postalCode,
    city: compactText(source.city || quote?.city || '', 48),
    country,
    province: normalizeItalianProvince(source.province || source.state || source.StateOrProvinceCode, country, postalCode),
    phone: safePabcPhone(source.phone || '') || '+393331234567',
    email: providerEmail
  };
}

function spediamoProCourierName(courier: any) {
  const code = String(courier || '').toLowerCase();
  if (code === 'brt') return 'BRT';
  if (code === 'inpost') return 'InPost';
  if (code === 'sda') return 'Poste Italiane';
  if (code === 'ups') return 'UPS';
  return compactText(courier || 'DoorDrop', 42);
}

function spediamoProServicePointTypes(offer: any) {
  const serviceCode = String(offer?.serviceCode || offer?.courierService?.code || offer?.code || '').toUpperCase();
  const description = normalizeProviderText(`${offer?.serviceDescription || offer?.description || ''} ${serviceCode}`);
  const requiresDeliveryPudo = ['BRTPUDO', 'INPOSTSTD', 'SDAHTSSTD', 'SDASTS'].includes(serviceCode) || Boolean(offer?.deliveryPudoRequired);
  const departurePoint = serviceCode.includes('STH') || serviceCode.includes('STS') || description.includes('shop to home') || description.includes('shop to shop');
  return { departure: departurePoint ? 'point' : 'home', arrival: requiresDeliveryPudo ? 'point' : 'home', deliveryPudoRequired: requiresDeliveryPudo };
}

function normalizeSpediamoProQuotationForAccept(offer: any) {
  return {
    service: Number(offer?.service || offer?.courierService?.id || 0),
    expectedDeliveryDate: offer?.expectedDeliveryDate || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    firstAvailablePickupDate: offer?.firstAvailablePickupDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    priceBreakdown: offer?.priceBreakdown || { basePrice: Number(offer?.totalPrice || 0), fuelSurcharge: 0, accessoryServicePrice: 0, vatRate: 0, vatAmount: 0 }
  };
}

function normalizeSpediamoProPudoPoints(data: any) {
  const rows = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
  return rows.map((row: any) => {
    const p = row?.pudoPoint || row;
    const distanceMeters = row?.distance ?? p?.distance;
    const courierName = spediamoProCourierName(p?.courier);
    return {
      ...p,
      PointID: String(p?.id || '').trim(),
      PointName: p?.name || 'Punto autorizado',
      Street: p?.address || '',
      Zip: p?.postalCode || '',
      City: p?.city || '',
      State: p?.province || '',
      Country: p?.country || 'IT',
      Latitude: p?.latitude,
      Longitude: p?.longitude,
      CarrierName: courierName,
      TypeOfPoint: Array.isArray(p?.types) && p.types.includes(1) ? 'LOCKER' : 'PUDO',
      DistanceFromOrigin: distanceMeters !== null && distanceMeters !== undefined ? { Value: Number(distanceMeters) / 1000, UnitOfMeasurement: { Code: 'KM' } } : undefined,
      _spediamoPro: { courier: p?.courier, id: p?.id, status: p?.status, url: p?.url, distance: distanceMeters }
    };
  }).filter((p: any) => p.PointID && p.Street && p.City);
}

function mapSpediamoProStatus(status: any, fallbackLabel = 'Actualizado') {
  const code = Number(status);
  const text = String(status || fallbackLabel || '').toLowerCase();
  const map: Record<number, { status: string; label: string }> = {
    0: { status: 'cancelado', label: 'Cancelado' },
    4: { status: 'pending_provider', label: 'Pendiente de procesamiento' },
    5: { status: 'tramitado', label: 'Etiqueta lista' },
    6: { status: 'pending_pickup', label: 'Recogida solicitada' },
    7: { status: 'en_transito', label: 'En tránsito' },
    8: { status: 'en_transito', label: 'En tránsito' },
    9: { status: 'en_reparto', label: 'En reparto' },
    10: { status: 'entregado', label: 'Entregado' },
    11: { status: 'incidencia', label: 'Incidencia' },
    12: { status: 'entregado', label: 'Entregado en punto' },
    13: { status: 'pending_label', label: 'Etiqueta en preparación' }
  };
  if (map[code]) return map[code];
  if (text.includes('delivered') || text.includes('consegn') || text.includes('entreg')) return { status: 'entregado', label: 'Entregado' };
  if (text.includes('delivery') || text.includes('reparto') || text.includes('consegna')) return { status: 'en_reparto', label: 'En reparto' };
  if (text.includes('transit') || text.includes('transito')) return { status: 'en_transito', label: 'En tránsito' };
  if (text.includes('fail') || text.includes('exception') || text.includes('incid')) return { status: 'incidencia', label: 'Incidencia' };
  if (text.includes('return') || text.includes('devuelto')) return { status: 'devuelto', label: 'Devuelto' };
  if (text.includes('cancel')) return { status: 'cancelado', label: 'Cancelado' };
  return { status: 'updated', label: fallbackLabel || 'Actualizado' };
}


type EasyPostCredentials = { apiKey: string };

function easyPostMode(provider?: any) {
  const cfg = providerConfig(provider || {});
  return String(process.env.EASYPOST_MODE || cfg.mode || 'test').trim().toLowerCase();
}

function easyPostBaseUrl(provider?: any) {
  const cfg = providerConfig(provider || {});
  return String(process.env.EASYPOST_BASE_URL || cfg.baseUrl || 'https://api.easypost.com/v2').replace(/\/$/, '');
}

function easyPostCredentials(provider?: any, _keys?: any): EasyPostCredentials | null {
  const cfg = providerConfig(provider || {});
  const mode = easyPostMode(provider);
  const apiKey = String(
    (mode === 'production' ? process.env.EASYPOST_PRODUCTION_API_KEY : process.env.EASYPOST_TEST_API_KEY) ||
    process.env.EASYPOST_API_KEY ||
    cfg.apiKey || cfg.testApiKey || cfg.productionApiKey || cfg.token || ''
  ).trim();
  if (!apiKey) return null;
  return { apiKey };
}

function truthyFlag(value: any, fallback = false) {
  const raw = String(value ?? (fallback ? 'true' : 'false')).trim().toLowerCase();
  return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(raw);
}

function easyPostIsTestMode(provider?: any) {
  const mode = easyPostMode(provider);
  const key = easyPostCredentials(provider, null)?.apiKey || '';
  return mode === 'test' || mode === 'staging' || mode === 'sandbox' || key.startsWith('EZTK');
}

function easyPostAllowRealBuy(provider?: any) {
  const cfg = providerConfig(provider || {});
  return truthyFlag(process.env.EASYPOST_ALLOW_REAL_BUY ?? cfg.allowRealBuy, false);
}

function easyPostAllowTestLabels(provider?: any) {
  const cfg = providerConfig(provider || {});
  return truthyFlag(process.env.EASYPOST_ALLOW_TEST_LABELS ?? cfg.allowTestLabels, true);
}

function easyPostCanGenerateLabel(provider?: any) {
  if (easyPostIsTestMode(provider) && easyPostAllowTestLabels(provider)) return true;
  return easyPostAllowRealBuy(provider);
}

function easyPostAuthHeader(provider: any, keys: any) {
  const credentials = easyPostCredentials(provider, keys);
  if (!credentials) throw new Error('Proveedor no disponible todavía.');
  return `Basic ${Buffer.from(`${credentials.apiKey}:`).toString('base64')}`;
}

async function callEasyPost(provider: any, keys: any, method: string, pathName: string, body?: any, timeoutMs = EXTERNAL_API_TIMEOUT_MS) {
  if (!easyPostCredentials(provider, keys)) return { httpStatus: 0, response: { message: 'Proveedor no disponible todavía.' }, request: null };
  const response = await fetchWithTimeout(`${easyPostBaseUrl(provider)}/${String(pathName || '').replace(/^\/+/, '')}`, {
    method,
    headers: { Authorization: easyPostAuthHeader(provider, keys), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined
  }, timeoutMs);
  const text = await response.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { httpStatus: response.status, response: data, request: { method, pathName, body } };
}

function easyPostIsOk(httpStatus: number, data: any) {
  return httpStatus >= 200 && httpStatus < 300 && !data?.error && !data?.errors;
}

function easyPostMessage(data: any, fallback = 'No se pudo completar la operación.') {
  if (!data) return fallback;
  if (typeof data?.error?.message === 'string') return data.error.message;
  if (typeof data?.message === 'string') return data.message;
  if (Array.isArray(data?.errors) && data.errors.length) return String(data.errors[0]?.message || data.errors[0] || fallback);
  return fallback;
}

function easyPostCurrencyToCustomer(amount: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>) {
  return convertMoneyAmount(Number(amount || 0), normalizeCurrencyCode(fromCurrency || 'USD'), normalizeCurrencyCode(toCurrency || 'EUR'), rates);
}

/** Merge multi packages into one parcel (EasyPost only supports one parcel per shipment). */
function consolidatePackagesForSingleParcel(packages: any[]) {
  const expanded = expandPackagesByQty(packages);
  if (expanded.length <= 1) return expanded[0] || { width: 10, height: 10, length: 10, weight: 1 };
  const weight = expanded.reduce((s: number, p: any) => s + Number(p.weight || 1), 0);
  // Approximate a single outer box: max dims, not perfect volume packing but quotes instead of empty.
  const length = Math.max(...expanded.map((p: any) => Number(p.length || 10)));
  const width = Math.max(...expanded.map((p: any) => Number(p.width || 10)));
  const height = expanded.reduce((s: number, p: any) => s + Number(p.height || 10), 0);
  return { width, height: Math.min(height, 150), length, weight: Math.max(0.1, weight), qty: 1 };
}

function buildEasyPostParcel(pkg: any) {
  return {
    length: String(Math.max(1, Number(pkg?.length || pkg?.depth || pkg?.length_cm || 10))),
    width: String(Math.max(1, Number(pkg?.width || pkg?.width_cm || 10))),
    height: String(Math.max(1, Number(pkg?.height || pkg?.height_cm || 10))),
    weight: String(Math.max(1, Math.round(Number(pkg?.weight || pkg?.weight_kg || 1) * 35.274)))
  };
}

function buildEasyPostAddress(addr: any, fallbackCountry: any, fallbackZip: any, providerEmail: string) {
  const source = buildCustomerAddressPayload(addr || {});
  const country = compactText(source.country || fallbackCountry || 'US', 2).toUpperCase() || 'US';
  const zip = compactText(source.zipCode || source.post_code || source.postcode || fallbackZip || '', 20);
  const street1 = compactText(source.addressLine1 || source.address || source.street || '', 80) || (country === 'US' ? '417 Montgomery St' : 'Via Roma 1');
  const city = compactText(source.city || '', 80) || (country === 'US' ? 'San Francisco' : 'Roma');
  return {
    name: compactText(safeAddressName(source, 'DoorDrop Cliente'), 35),
    company: compactText(source.company || '', 35) || undefined,
    street1,
    street2: compactText(source.addressLine2 || '', 35) || undefined,
    city,
    state: normalizeItalianProvince(source.province || source.state || source.StateOrProvinceCode, country, zip),
    zip,
    country,
    phone: safePabcPhone(source.phone || '') || (country === 'US' ? '4153334445' : '+393331234567'),
    email: providerEmail
  };
}

function easyPostCarrierName(rateOrShipment: any) {
  const code = String(rateOrShipment?.carrier || rateOrShipment?.carrierAccount || rateOrShipment?.selected_rate?.carrier || '').trim();
  const lower = code.toLowerCase();
  if (lower.includes('usps')) return 'USPS';
  if (lower.includes('ups')) return 'UPS';
  if (lower.includes('fedex')) return 'FedEx';
  if (lower.includes('dhl')) return 'DHL';
  if (lower.includes('canadapost')) return 'Canada Post';
  if (lower.includes('royalmail')) return 'Royal Mail';
  if (lower.includes('lasership')) return 'LaserShip';
  if (lower.includes('ontrac')) return 'OnTrac';
  return compactText(code || 'DoorDrop', 42);
}

function easyPostStatusMap(status: any) {
  const s = String(status || '').toLowerCase();
  if (['delivered'].includes(s)) return { status: 'entregado', label: 'Entregado' };
  if (['out_for_delivery'].includes(s)) return { status: 'en_reparto', label: 'En reparto' };
  if (['in_transit'].includes(s)) return { status: 'en_transito', label: 'En tránsito' };
  if (['pre_transit', 'unknown'].includes(s)) return { status: 'tramitado', label: 'Tramitado' };
  if (['failure', 'error'].includes(s)) return { status: 'incidencia', label: 'Incidencia' };
  if (['return_to_sender'].includes(s)) return { status: 'devuelto', label: 'Devuelto' };
  if (s.includes('cancel')) return { status: 'cancelado', label: 'Cancelado' };
  return { status: 'tramitado', label: 'Etiqueta lista' };
}

function normalizeEasyPostWebhookPayload(payload: any) {
  const result = payload?.result || payload?.tracker || payload?.shipment || payload || {};
  const object = String(result?.object || payload?.description || '').toLowerCase();
  return {
    eventId: payload?.id || result?.id || crypto.randomBytes(8).toString('hex'),
    eventType: payload?.description || result?.object || 'easypost.event',
    object,
    shipmentId: result?.shipment_id || result?.shipment?.id || (String(result?.id || '').startsWith('shp_') || String(result?.id || '').startsWith('SHIP-') ? result.id : ''),
    trackerId: result?.id && String(result.id).startsWith('trk_') ? result.id : result?.tracker?.id,
    trackingCode: result?.tracking_code || result?.trackingCode || result?.tracking_details?.[0]?.tracking_code || '',
    status: result?.status || result?.tracking_status?.status || result?.tracker?.status || result?.state || '',
    statusDetail: result?.status_detail || result?.tracking_status?.status_detail || '',
    labelUrl: result?.postage_label?.label_url || result?.label_url || result?.shipment?.postage_label?.label_url || '',
    publicUrl: result?.public_url || result?.tracker?.public_url || '',
    raw: payload
  };
}

function extractGeneiPointTypes(offer: any) {
  const integrationCode = String(offer?.nombre_integracion_cliente || offer?.tipo_servicio || '').trim().toLowerCase();
  if (integrationCode.includes('ofi-ofi') || integrationCode.includes('punto-punto')) {
    return { departure: 'point', arrival: 'point' };
  }
  if (integrationCode.includes('ofi-dom') || integrationCode.includes('punto-dom')) {
    return { departure: 'point', arrival: 'home' };
  }
  if (integrationCode.includes('dom-ofi') || integrationCode.includes('dom-punto')) {
    return { departure: 'home', arrival: 'point' };
  }
  if (integrationCode.includes('dom-dom')) {
    return { departure: 'home', arrival: 'home' };
  }

  const nameText = `${offer?.nombre_completo_agencia || ''} ${offer?.nombre_agencia || ''} ${offer?.service_name || ''} ${offer?.collection_type || ''} ${offer?.collectionTypeName || ''}`.toLowerCase();

  const pickupPoint = (
    Number(offer?.recoger_tienda || 0) === 1 ||
    Number(offer?.servicio_recogida || 1) === 0 ||
    Number(offer?.id_oficina_salida || 0) > 0 ||
    /ofi-ofi|ofi-dom|shop2shop|drop[\s-]?off|inpost|mondial|locker|delegaci[oó]n.*salida/i.test(nameText)
  );

  const deliveryPoint = (
    Number(offer?.servicio_entrega || 1) === 0 ||
    Number(offer?.id_oficina_entrega || 0) > 0 ||
    /ofi-ofi|dom-ofi|shop2shop|to[\s-]?pick[\s-]?up|lockers?|inpost|punto[\s-]?entrega|delegaci[oó]n.*entrega/i.test(nameText)
  );

  return { departure: pickupPoint ? 'point' : 'home', arrival: deliveryPoint ? 'point' : 'home' };
}

function normalizeGeneiDropPoints(data: any) {
  const rows: any[] = [];
  const seen = new Set<string>();
  const push = (raw: any) => {
    if (!raw || typeof raw !== 'object') return;
    const id = String(raw.PointID || raw.id_oficina || raw.id || raw.office_id || raw.codigo || raw.code || raw.id_punto || raw.point_id || '').trim();
    const name = String(raw.PointName || raw.nombre || raw.name || raw.nombre_oficina || raw.office_name || raw.alias || raw.agencia || raw.carrier || 'Punto autorizado').trim();
    const street = String(raw.Street || raw.dir || raw.direccion || raw.address || raw.street || raw.dir_drop || raw.localizacion || '').replace(/<br\s*\/?>/gi, ', ').trim();
    const zip = String(raw.Zip || raw.cp || raw.codigo_postal || raw.postcode || raw.postal_code || raw.cp_drop || '').trim();
    const city = String(raw.City || raw.pob || raw.poblacion || raw.city || raw.localidad || raw.pob_drop || '').trim();
    const country = String(raw.Country || raw.pais || raw.country || raw.iso_pais || raw.pais_drop || 'ES').toUpperCase().slice(0, 2) || 'ES';
    const state = String(raw.State || raw.prov || raw.provincia || raw.state || raw.prov_drop || '').trim();
    const lat = Number(raw.Latitude ?? raw.latitud ?? raw.latitude ?? raw.oficina_latitud_origen ?? raw.oficina_latitud_destino ?? raw.lat);
    const lng = Number(raw.Longitude ?? raw.longitud ?? raw.longitude ?? raw.oficina_longitud_origen ?? raw.oficina_longitud_destino ?? raw.lng ?? raw.lon);
    const key = id || `${name}|${street}|${zip}|${city}`;
    if (!key || seen.has(key)) return;
    if (!street && !zip && !city) return;
    seen.add(key);
    rows.push({
      ...raw,
      PointID: id || key,
      PointName: name,
      Street: street,
      Zip: zip,
      City: city,
      State: state,
      Country: country,
      Latitude: Number.isFinite(lat) ? lat : undefined,
      Longitude: Number.isFinite(lng) ? lng : undefined,
      CarrierName: raw.CarrierName || raw.nombre_agencia || raw.agencia || raw.carrier || raw.transportista || 'Genei',
      TypeOfPoint: raw.TypeOfPoint || raw.tipo || raw.type || 'point',
      raw
    });
  };
  const visit = (value: any) => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value === 'object') {
      if (value.PointID || value.id_oficina || value.office_id || value.nombre_oficina || value.direccion || value.address || value.cp || value.codigo_postal || value.postal_code) push(value);
      Object.entries(value).forEach(([key, val]) => {
        if (['errors', 'error', 'message', 'status'].includes(String(key).toLowerCase())) return;
        if (Array.isArray(val) || (val && typeof val === 'object')) visit(val);
      });
    }
  };
  visit(data?.data || data?.items || data?.offices || data?.points || data?.oficinas || data);
  return rows;
}

async function searchGeneiDropPoints(provider: any, keys: any, params: any) {
  const attempts: any[] = [];
  const country = compactText(params?.country || 'ES', 2).toUpperCase() || 'ES';
  const postcode = compactText(params?.postcode || params?.zipCode || '', 20);
  const city = compactText(params?.city || '', 80);
  const direction = String(params?.direction || 'sender');
  const agencyId = compactText(params?.agencyId || params?.serviceId || '', 30);

  // --- A) Genei API v2 (Bearer) ---
  try {
    const credential = providerSecret('genei', provider, keys);
    if (credential) {
      const token = await getGeneiToken(credential);
      const query = new URLSearchParams();
      query.set('country', country);
      query.set('postal_code', postcode);
      query.set('postcode', postcode);
      query.set('zip', postcode);
      query.set('city', city);
      query.set('direction', direction);
      if (agencyId) {
        query.set('agency_id', agencyId);
        query.set('id_agencia', agencyId);
      }
      const base = 'https://apiv2.genei.es/api/v2';
      const candidates = [
        `${base}/offices?${query.toString()}`,
        `${base}/agencies/offices?${query.toString()}`,
        `${base}/agencies/points?${query.toString()}`,
        `${base}/points?${query.toString()}`,
        `${base}/drop-points?${query.toString()}`,
        `${base}/dropoff-points?${query.toString()}`,
        `${base}/collection-points?${query.toString()}`,
        ...(agencyId ? [
          `${base}/agencies/${encodeURIComponent(agencyId)}/offices?${query.toString()}`,
          `${base}/agencies/${encodeURIComponent(agencyId)}/points?${query.toString()}`,
          `${base}/agencies/${encodeURIComponent(agencyId)}/drop-points?${query.toString()}`
        ] : [])
      ];
      for (const url of candidates) {
        try {
          const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` } });
          const text = await response.text();
          let json: any = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
          const points = normalizeGeneiDropPoints(json);
          attempts.push({ url: url.replace(/([?&](?:token|password|api_key|apikey|key)=)[^&]+/ig, '$1***'), httpStatus: response.status, count: points.length, source: 'v2' });
          if (response.ok && points.length) return { points, attempts };
        } catch (error: any) {
          attempts.push({ url, error: error?.message || 'No disponible', source: 'v2' });
        }
      }
    }
  } catch (e: any) {
    attempts.push({ source: 'v2', error: e?.message || 'v2 failed' });
  }

  // --- B) Genei API v1 (json_interface) — several known/possible office functions ---
  if (geneiApiMode(provider) === 'v1' && geneiV1Credentials(provider, keys)) {
    const v1Fns = [
      'obtener_listado_oficinas',
      'obtener_oficinas',
      'obtener_oficinas_por_cp',
      'obtener_oficinas_codigo_postal',
      'obtener_listado_unidades_correo',
      'obtener_unidades_correo',
      'obtener_puntos_recogida',
      'obtener_puntos_entrega',
      'obtener_oficinas_servicio',
      'obtener_listado_oficinas_cp',
    ];
    const payloads = [
      {
        codigo_postal: postcode,
        cp: postcode,
        cod_postal: postcode,
        codigos: postcode,
        poblacion: city.toUpperCase(),
        pais: country,
        iso_pais: country,
        id_agencia: agencyId || undefined,
        id_agencia_servicio: agencyId || undefined,
        tipo: direction === 'receiver' ? 'entrega' : 'recogida',
        direccion: direction === 'receiver' ? 'destino' : 'origen',
      },
      {
        array_bultos: buildGeneiV1Packages([{ weight: 1, length: 10, width: 10, height: 10, qty: 1 }]),
        codigos_origen: postcode,
        poblacion_salida: city.toUpperCase() || 'MADRID',
        iso_pais_salida: country,
        codigos_destino: postcode,
        poblacion_llegada: city.toUpperCase() || 'MADRID',
        iso_pais_llegada: country,
        id_agencia: agencyId || undefined,
        cod_promo: '',
      },
    ];
    for (const fn of v1Fns) {
      for (const payload of payloads) {
        try {
          const { httpStatus, response } = await callGeneiV1(provider, keys, fn, payload);
          const points = normalizeGeneiDropPoints(response);
          attempts.push({ source: 'v1', fn, httpStatus, count: points.length, keys: response && typeof response === 'object' ? Object.keys(response).slice(0, 12) : [] });
          if (httpStatus >= 200 && httpStatus < 300 && points.length) return { points, attempts };
          // stop trying second payload variants if first clearly says unknown function
          const msg = String(response?.resultado_text || response?.message || response?.raw || '').toLowerCase();
          if (msg.includes('no existe') || msg.includes('not found') || msg.includes('<!doctype')) break;
        } catch (error: any) {
          attempts.push({ source: 'v1', fn, error: error?.message || 'v1 failed' });
        }
      }
    }
  }

  // --- C) Fallback multi-carrier network via ParcelABC / SpedirePro for same country (DoorDrop network) ---
  try {
    const keys = await ApiKeysRepo.get();
    // ParcelABC token
    const pabcProvider = await ProviderRepo.getByCode('parcelabc');
    const pabcToken = pabcProvider ? providerSecret('parcelabc', pabcProvider, keys) : '';
    if (pabcToken) {
      try {
        const response = await fetch(`${providerBaseUrl(pabcProvider, 'https://www.parcelabc.com/api-pabc.php')}/drop-off-points`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authToken: pabcToken, country, city, postcode, zipCode: postcode, direction })
        });
        const text = await response.text();
        let data: any = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
        const points = normalizeSpedireProDropPoints(data?.points || data?.data || data?.offers || data || []);
        attempts.push({ source: 'parcelabc_fallback', httpStatus: response.status, count: points.length });
        if (response.ok && points.length) return { points, attempts };
      } catch (e: any) {
        attempts.push({ source: 'parcelabc_fallback', error: e?.message || 'fail' });
      }
    }
    const spProvider = await ProviderRepo.getByCode('spedirepro');
    if (spProvider && spedireProCredentials(spProvider, keys)) {
      try {
        const drop = await callSpedirePro(spProvider, keys, 'POST', 'v1/drop-off-points', {
          country,
          direction,
          ...(city ? { city } : {}),
          ...(postcode ? { postcode } : {}),
        });
        const points = normalizeSpedireProDropPoints(drop.response);
        attempts.push({ source: 'spedirepro_fallback', httpStatus: drop.httpStatus, count: points.length });
        if (points.length) return { points, attempts };
      } catch (e: any) {
        attempts.push({ source: 'spedirepro_fallback', error: e?.message || 'fail' });
      }
    }
  } catch (e: any) {
    attempts.push({ source: 'fallback', error: e?.message || 'fallback failed' });
  }

  return { points: [], attempts };
}

function geneiDropOfficePayload(point: any) {
  if (!point || typeof point !== 'object') return null;
  const raw = point.raw && typeof point.raw === 'object' ? point.raw : point;
  const officeId = compactText(raw.id_oficina || raw.office_id || raw.id || raw.PointID || raw.id_punto || raw.codigo || raw.code || '', 40);
  return {
    id: officeId,
    id_oficina: officeId,
    nombre: compactText(raw.nombre || raw.PointName || raw.name || raw.nombre_oficina || '', 80),
    direccion: compactText(raw.direccion || raw.Street || raw.address || '', 140),
    cp: compactText(raw.cp || raw.Zip || raw.postal_code || raw.postcode || '', 20),
    poblacion: compactText(raw.poblacion || raw.City || raw.city || '', 80),
    provincia: compactText(raw.provincia || raw.State || raw.state || '', 40),
    pais: compactText(raw.pais || raw.Country || raw.country || 'ES', 2).toUpperCase(),
    telefono: compactText(raw.telefono || raw.phone || '', 30),
    email: compactText(raw.email || '', 100),
    raw
  };
}

function spedireProServiceSupportsAddressFlow(offer: any) {
  const departure = String(offer?.departure_type || '').toLowerCase();
  const arrival = String(offer?.arrival_type || '').toLowerCase();
  return departure !== 'point' && arrival !== 'point';
}

function spedireProExtractReference(data: any): string {
  return String(data?.reference || data?.shipment_reference || data?.order_reference || data?.order || data?.data?.reference || data?.data?.order || '').trim();
}

function spedireProExtractTracking(data: any): string {
  return String(data?.tracking || data?.tracker || data?.tracking_number || data?.data?.tracking || data?.data?.tracker || '').trim();
}

function spedireProExtractLabelUrl(data: any): string {
  const label = data?.label || data?.data?.label || {};
  return String(data?.label_url || data?.url || label?.link || label?.url || data?.data?.url || '').trim();
}

function mapSpedireProStatus(code: any, fallbackLabel = 'Actualizado') {
  const raw = String(code || '').trim().toUpperCase();
  const map: Record<string, any> = {
    N: { status: 'pending_provider', label: 'Validando envío' },
    O: { status: 'pending_label', label: 'Etiqueta en preparación' },
    B: { status: 'tramitado', label: 'Etiqueta lista' },
    G: { status: 'pending_provider', label: 'En preparación' },
    T: { status: 'en_transito', label: 'En tránsito' },
    S: { status: 'en_transito', label: 'En tránsito' },
    Y: { status: 'en_reparto', label: 'En reparto' },
    D: { status: 'entregado', label: 'Entregado' },
    P: { status: 'en_reparto', label: 'Punto de retiro' },
    L: { status: 'incidencia', label: 'Incidencia' },
    X: { status: 'incidencia', label: 'Incidencia' },
    E: { status: 'incidencia', label: 'Verificar dirección' },
    K: { status: 'devuelto', label: 'Devuelto' },
    R: { status: 'cancelado', label: 'Reembolsado' }
  };
  return map[raw] || { status: 'tramitado', label: fallbackLabel || 'Actualizado' };
}

function spedireProWebhookUrl() {
  return `${appBaseUrl()}/api/webhooks/spedirepro`;
}

function spedireProPublicTrackingUrl(code: any, lang = 'it') {
  const finalCode = String(code || '').trim();
  return `${appBaseUrl()}/tracking?code=${encodeURIComponent(finalCode)}&lang=${encodeURIComponent(lang)}`;
}

function normalizeSpedireProWebhookPayload(payload: any) {
  const data = payload?.data || payload?.shipment || payload?.payload || payload || {};
  const reference = String(data.reference || data.shipment_reference || data.merchant_reference || data.order_reference || payload?.reference || payload?.merchant_reference || payload?.order_reference || '').trim();
  const order = String(data.order || data.order_reference || payload?.order || payload?.order_reference || '').trim();
  const tracking = String(data.tracker || data.tracking || data.tracking_number || payload?.tracker || payload?.tracking || payload?.tracking_number || '').trim();
  const rawStatus = String(data.status || data.estado || data.state || payload?.status || payload?.estado || '').trim();
  const eventType = String(payload?.event || payload?.type || payload?.update_type || payload?.message || data?.event || data?.type || (rawStatus ? 'shipment_status' : 'shipment_created')).trim();
  const labelUrl = spedireProExtractLabelUrl(data) || spedireProExtractLabelUrl(payload);
  const labelBase64 = String(data.label_base64 || data.etiqueta || data.label?.content || payload?.label_base64 || payload?.etiqueta || '').trim();
  const trackingUrl = String(data.tracking_url || data.tracker_url || payload?.tracking_url || '').trim();
  const courier = String(data.courier || data.carrier || data.courier_name || payload?.courier || '').trim();
  const description = String(payload?.message || data?.message || data?.description || '').trim();
  const eventTime = String(data.updated_at || data.created_at || payload?.created_at || payload?.date || '').trim();
  const pickupStatus = String(data.pickup_status || payload?.pickup_status || data.pickup?.status || '').trim();
  const pickupNumber = String(data.pickup_number || payload?.pickup_number || data.pickup?.number || '').trim();
  return { data, reference, order, tracking, rawStatus, eventType, labelUrl, labelBase64, trackingUrl, courier, description, eventTime, pickupStatus, pickupNumber };
}

async function findShipmentForSpedireProReference(refs: any[]) {
  const references = Array.from(new Set((refs || []).map((v: any) => String(v || '').trim()).filter(Boolean)));
  if (!references.length) return null;
  const placeholders = references.map(() => '?').join(',');
  const params = [...references, ...references, ...references, ...references, ...references, ...references];
  const [rows]: any = await pool.query(
    `SELECT * FROM shipments
     WHERE id IN (${placeholders})
        OR order_number IN (${placeholders})
        OR tracking_code IN (${placeholders})
        OR provider_tracking_code IN (${placeholders})
        OR provider_shipment_code IN (${placeholders})
        OR reference IN (${placeholders})
     ORDER BY updated_at DESC
     LIMIT 1`,
    params
  );
  return rows?.[0] || null;
}

async function fetchAndStoreSpedireProLabel(shipment: any, references: any[]) {
  const refs = Array.from(new Set((references || []).map((v: any) => String(v || '').trim()).filter(Boolean)));
  if (!refs.length) return { stored: false, labelUrl: '' };
  const keys = await ApiKeysRepo.get();
  const provider = await ProviderRepo.getByCode('spedirepro');
  for (const reference of refs) {
    try {
      const label = await callSpedirePro(provider, keys, 'POST', 'v1/get-label', { reference });
      const labelUrl = spedireProExtractLabelUrl(label.response);
      await writeProviderLog('spedirepro', 'webhook_label_fetch', { shipmentId: shipment.id, reference }, { httpStatus: label.httpStatus, hasUrl: Boolean(labelUrl) }, label.httpStatus);
      if (labelUrl) {
        const stored = await cacheShipmentLabelFromSource({ ...shipment, provider_code: 'spedirepro' }, labelUrl, '');
        await createTrackingEventOnce({ shipment_id: shipment.id, tracking_code: shipment.tracking_code, status: 'label_ready', status_code: 'B', status_label: 'Etiqueta lista', description: 'La etiqueta está disponible para descargar.' });
        return { ...stored, stored: Boolean(stored.stored || stored.labelUrl), labelUrl };
      }
    } catch (e: any) {
      await writeProviderLog('spedirepro', 'webhook_label_fetch_failed', { shipmentId: shipment.id, reference }, { message: e?.message || 'Etiqueta pendiente' }, 0);
    }
  }
  return { stored: false, labelUrl: '' };
}

async function ensureSpedireProProviderSeed() {
  try {
    const current = await ProviderRepo.getByCode('spedirepro');
    if (current) return current;
    await ProviderRepo.updateAll([{ id: 'prv_spedirepro', code: 'spedirepro', name: 'SpedirePro', is_active: true, is_connected: false, margin: DOORDROP_PROVIDER_MARGIN_PERCENT, currency: 'EUR', config: { baseUrl: process.env.SPEDIREPRO_BASE_URL || 'https://www.spedirepro.com/public-api', apiKey: process.env.SPEDIREPRO_API_KEY || '', allowRealBuy: false, publicName: 'DoorDrop', primaryColor: '#7c3aed', secondaryColor: '#a855f7', maxResults: 10, priority: 25 } }]);
    return ProviderRepo.getByCode('spedirepro');
  } catch { return null; }
}


async function ensureSpediamoProProviderSeed() {
  try {
    const current = await ProviderRepo.getByCode('spediamopro');
    if (current) return current;
    await ProviderRepo.updateAll([{ id: 'prv_spediamopro', code: 'spediamopro', name: 'SpediamoPro', is_active: true, is_connected: false, margin: DOORDROP_PROVIDER_MARGIN_PERCENT, currency: 'EUR', config: { mode: process.env.SPEDIAMOPRO_MODE || 'production', baseUrl: process.env.SPEDIAMOPRO_BASE_URL || 'https://core.spediamopro.com/api/v2', stagingBaseUrl: process.env.SPEDIAMOPRO_STAGING_BASE_URL || 'https://core.spediamopro.it/api/v2', authCode: process.env.SPEDIAMOPRO_AUTHCODE || '', allowRealBuy: false, publicName: 'DoorDrop', primaryColor: '#4f46e5', secondaryColor: '#06b6d4', maxResults: 10, priority: 22 } }]);
    return ProviderRepo.getByCode('spediamopro');
  } catch { return null; }
}


async function ensureEasyPostProviderSeed() {
  try {
    const current = await ProviderRepo.getByCode('easypost');
    if (current) return current;
    await ProviderRepo.updateAll([{ id: 'prv_easypost', code: 'easypost', name: 'EasyPost', is_active: true, is_connected: false, margin: DOORDROP_PROVIDER_MARGIN_PERCENT, currency: 'USD', config: { mode: process.env.EASYPOST_MODE || 'test', baseUrl: process.env.EASYPOST_BASE_URL || 'https://api.easypost.com/v2', apiKey: process.env.EASYPOST_TEST_API_KEY || process.env.EASYPOST_API_KEY || '', allowRealBuy: false, allowTestLabels: true, publicName: 'DoorDrop', primaryColor: '#111827', secondaryColor: '#2563eb', maxResults: 10, priority: 21, webhookUrl: `${process.env.APP_URL || 'https://doordrop.lat'}/api/webhooks/easypost` } }]);
    return ProviderRepo.getByCode('easypost');
  } catch { return null; }
}

async function ensureProviderSeeds() {
  await ensurePaccofacileProviderSeed();
  await ensureSpedireProProviderSeed();
  await ensureSpediamoProProviderSeed();
  await ensureEasyPostProviderSeed();
}

async function getProviderBalanceInfo(provider: any, keys: any) {
  const code = String(provider?.code || '').toLowerCase();
  try {
    if (code === 'paccofacile' && paccofacileCredentials(provider, keys)) {
      const credit = await callPaccofacile(provider, keys, 'GET', 'service/customers/credit');
      const data = credit.response?.data || credit.response || {};
      const value = data?.credit?.value ?? data?.credit_value ?? data?.credit ?? data?.value;
      const currency = data?.credit?.currency || data?.currency || provider.currency || 'EUR';
      await writeProviderLog('paccofacile', 'balance_check', {}, { httpStatus: credit.httpStatus, hasBalance: value !== undefined }, credit.httpStatus);
      if (value !== undefined) return { available: Number(value), currency, label: `${Number(value || 0).toFixed(2)} ${currency}` };
    }
    if (code === 'spedirepro' && spedireProCredentials(provider, keys)) {
      const me = await callSpedirePro(provider, keys, 'GET', 'v1/me');
      const value = me.response?.credits_amount;
      await writeProviderLog('spedirepro', 'balance_check', {}, { httpStatus: me.httpStatus, hasBalance: value !== undefined }, me.httpStatus);
      if (value !== undefined) return { available: Number(value), currency: provider.currency || 'EUR', label: `${Number(value || 0).toFixed(2)} ${provider.currency || 'EUR'}` };
    }
    if (code === 'spediamopro' && spediamoProCredentials(provider, keys)) {
      const wallet = await callSpediamoPro(provider, keys, 'GET', 'wallet');
      const cents = wallet.response?.data?.balance ?? wallet.response?.balance;
      await writeProviderLog('spediamopro', 'balance_check', {}, { httpStatus: wallet.httpStatus, hasBalance: cents !== undefined }, wallet.httpStatus);
      if (cents !== undefined) return { available: Number(cents || 0) / 100, currency: provider.currency || 'EUR', label: `${(Number(cents || 0) / 100).toFixed(2)} ${provider.currency || 'EUR'}` };
    }
    if (code === 'easypost' && easyPostCredentials(provider, keys)) {
      const carrierAccounts = await callEasyPost(provider, keys, 'GET', 'carrier_accounts');
      await writeProviderLog('easypost', 'balance_check', {}, { httpStatus: carrierAccounts.httpStatus, connected: easyPostIsOk(carrierAccounts.httpStatus, carrierAccounts.response) }, carrierAccounts.httpStatus);
      if (easyPostIsOk(carrierAccounts.httpStatus, carrierAccounts.response)) return { available: null, currency: provider.currency || 'USD', label: easyPostMode(provider) === 'production' ? 'Conectado en producción' : 'Conectado en prueba' };
    }
    if (code === 'genei' && geneiApiMode(provider) === 'v1' && geneiV1Credentials(provider, keys)) {
      const { httpStatus, response } = await callGeneiV1(provider, keys, 'obtener_saldo', {});
      const value = response?.saldo ?? response?.balance ?? response?.credito;
      await writeProviderLog('genei', 'balance_check_v1', {}, { httpStatus, hasBalance: value !== undefined }, httpStatus);
      if (value !== undefined) return { available: Number(value), currency: provider.currency || 'EUR', label: `${Number(value || 0).toFixed(2)} ${provider.currency || 'EUR'}` };
    }
  } catch (e: any) {
    await writeProviderLog(code || 'provider', 'balance_check_failed', {}, { message: e?.message || 'No disponible' }, 0).catch(() => null);
  }
  return null;
}

async function enrichProvidersWithBalances(providers: any[], keys: any) {
  const enriched: any[] = [];
  for (const provider of providers) {
    const balance = await getProviderBalanceInfo(provider, keys);
    enriched.push({ ...provider, _balanceInfo: balance });
  }
  return enriched;
}


async function ensurePaccofacileProviderSeed() {
  try {
    const current = await ProviderRepo.getByCode('paccofacile');
    if (current) return current;
    const cfg: any = {
      mode: process.env.PACCOFACILE_MODE || 'sandbox',
      baseUrl: process.env.PACCOFACILE_SANDBOX_BASE_URL || 'https://paccofacile.tecnosogima.cloud/sandbox',
      liveBaseUrl: process.env.PACCOFACILE_LIVE_BASE_URL || 'https://paccofacile.tecnosogima.cloud/live',
      apiVersion: process.env.PACCOFACILE_API_VERSION || 'v1',
      token: process.env.PACCOFACILE_TOKEN || '',
      apiKey: process.env.PACCOFACILE_API_KEY || '',
      accountNumber: process.env.PACCOFACILE_ACCOUNT_NUMBER || '',
      allowRealBuy: false,
      publicName: 'DoorDrop',
      primaryColor: '#16a34a',
      secondaryColor: '#22c55e',
      maxResults: 10,
      priority: 30,
      testMode: true
    };
    await ProviderRepo.updateAll([{
      id: 'prv_paccofacile',
      code: 'paccofacile',
      name: 'Paccofacile',
      is_active: true,
      is_connected: false,
      margin: DOORDROP_PROVIDER_MARGIN_PERCENT,
      currency: 'EUR',
      config: cfg
    }]);
    return ProviderRepo.getByCode('paccofacile');
  } catch {
    return null;
  }
}

function paccofacileSandboxTestPayload(serviceId: any, pickupLocality: any, destinationLocality: any) {
  return {
    shipment_service: {
      pickup_date: nextBusinessDateIso(2),
      pickup_range: 'AM',
      service_id: Number(serviceId || 0),
      parcels: [{ shipment_type: 1, weight: 2, dim1: 10, dim2: 11, dim3: 12 }],
      accessories: [],
      package_content_type: 'GOODS'
    },
    pickup: {
      iso_code: 'IT',
      postal_code: '04011',
      city: String(pickupLocality?.locality || 'APRILIA').toUpperCase(),
      StateOrProvinceCode: paccofacileProvince(pickupLocality, 'IT', pickupLocality?.postal_code || pickupLocality?.cap),
      header_name: 'DoorDrop Test',
      address: 'Via Roma',
      building_number: '11',
      phone: '3331234567',
      email: ship24goProviderContactEmail(),
      note: 'Test sandbox DoorDrop'
    },
    destination: {
      iso_code: 'IT',
      postal_code: '00135',
      city: String(destinationLocality?.locality || 'ROMA').toUpperCase(),
      StateOrProvinceCode: paccofacileProvince(destinationLocality, 'IT', destinationLocality?.postal_code || destinationLocality?.cap),
      header_name: 'Cliente Test',
      address: 'Via Milano',
      building_number: '12',
      phone: '3331234567',
      email: ship24goProviderContactEmail(),
      note: 'Test sandbox DoorDrop'
    },
    additional_information: {
      reference: `S24G-PF-SANDBOX-${Date.now()}`,
      note: 'Test sandbox DoorDrop',
      content: 'Merce'
    }
  };
}

async function runPaccofacileSandboxFullTest(provider: any, keys: any) {
  const mode = paccofacileMode(provider);
  const result: any = { mode, safe: true, steps: [] };

  const account = await callPaccofacile(provider, keys, 'GET', 'service/customers/account');
  result.steps.push({ step: 'account', httpStatus: account.httpStatus, ok: paccofacileIsSuccess(account.response) });

  const credit = await callPaccofacile(provider, keys, 'GET', 'service/customers/credit');
  result.steps.push({ step: 'credit', httpStatus: credit.httpStatus, ok: paccofacileIsSuccess(credit.response), credit: credit.response?.data?.credit || null });

  const pickupLocality = await lookupPaccofacileLocality(provider, keys, 'IT', '04011', 'Aprilia');
  const destinationLocality = await lookupPaccofacileLocality(provider, keys, 'IT', '00135', 'Roma');
  result.steps.push({ step: 'locality', ok: Boolean(pickupLocality && destinationLocality), pickup: pickupLocality, destination: destinationLocality });

  if (!pickupLocality || !destinationLocality) {
    result.ok = false;
    result.message = 'Valida las localidades antes de continuar.';
    return result;
  }

  const quotePayload = {
    shipment_service: {
      parcels: [{ shipment_type: 1, dim1: 10, dim2: 11, dim3: 12, weight: 2 }],
      accessories: [],
      package_content_type: 'GOODS'
    },
    pickup: { iso_code: 'IT', postal_code: '04011', city: 'APRILIA', StateOrProvinceCode: paccofacileProvince(pickupLocality, 'IT', pickupLocality?.postal_code || pickupLocality?.cap) },
    destination: { iso_code: 'IT', postal_code: '00135', city: 'ROMA', StateOrProvinceCode: paccofacileProvince(destinationLocality, 'IT', destinationLocality?.postal_code || destinationLocality?.cap) }
  };
  const quote = await callPaccofacile(provider, keys, 'POST', 'service/shipment/quote', quotePayload);
  const services = quote.response?.data?.services_available || [];
  const service = services.find((s: any) => Number(s?.service_id) > 0 && paccofacileServiceSupportsAddressFlow(s)) || services.find((s: any) => Number(s?.service_id) > 0) || services[0];
  result.steps.push({ step: 'quote', httpStatus: quote.httpStatus, ok: paccofacileIsSuccess(quote.response), offers: services.length, selectedService: service ? { service_id: service.service_id, name: service.name, carrier: service.carrier, amount: service.price_total?.amount } : null });

  if (!paccofacileIsSuccess(quote.response) || !service?.service_id) {
    result.ok = false;
    result.message = paccofacileMessage(quote.response, 'No se pudo obtener cotización de prueba.');
    return result;
  }

  if (mode !== 'sandbox') {
    result.ok = true;
    result.message = 'Conexión validada. La prueba completa de compra/etiqueta sólo se ejecuta en sandbox.';
    return result;
  }

  const savePayload = paccofacileSandboxTestPayload(service.service_id, pickupLocality, destinationLocality);
  const save = await callPaccofacile(provider, keys, 'POST', 'service/shipment/save', savePayload);
  const savedPayload = save.response?.data?.shipment || save.response?.data?.data || save.response?.data || save.response || {};
  const providerShipmentId = String(savedPayload?.shipment_id || savedPayload?.id || savedPayload?.shipmentId || savedPayload?.shipment?.shipment_id || '').trim();
  result.steps.push({ step: 'shipment_save', httpStatus: save.httpStatus, ok: paccofacileIsSuccess(save.response), providerShipmentId });

  if (!providerShipmentId) {
    result.ok = false;
    result.message = paccofacileMessage(save.response, 'Paccofacile recibió la prueba, pero no devolvió número de envío.');
    return result;
  }

  const buyPayload = paccofacileBuyPayload(providerShipmentId);
  const buy = await callPaccofacile(provider, keys, 'POST', 'service/shipment/buy', buyPayload);
  result.steps.push({ step: 'shipment_buy_sandbox', httpStatus: buy.httpStatus, ok: paccofacileIsSuccess(buy.response) });

  const detail = await callPaccofacile(provider, keys, 'GET', `service/shipment/${encodeURIComponent(providerShipmentId)}`);
  const detailPayload = detail.response?.data?.shipment || detail.response?.data || detail.response || {};
  const trackingCandidate = Array.isArray(detailPayload?.tracking_numbers) ? detailPayload.tracking_numbers[0] : detailPayload?.tracking_numbers;
  const tracking = String(trackingCandidate?.tracking_number || trackingCandidate?.number || trackingCandidate || detailPayload?.tracking_number || detailPayload?.tracking || providerShipmentId).trim();
  result.steps.push({ step: 'shipment_detail', httpStatus: detail.httpStatus, ok: paccofacileIsSuccess(detail.response), tracking });

  const label = await callPaccofacile(provider, keys, 'GET', `service/shipment/${encodeURIComponent(providerShipmentId)}/label`);
  const hasLabel = Boolean(label.response?.data?.content || label.response?.content || label.response?.data?.label?.content);
  result.steps.push({ step: 'label_fetch', httpStatus: label.httpStatus, ok: paccofacileIsSuccess(label.response), hasLabel, format: label.response?.data?.format || label.response?.format || 'pdf' });

  result.ok = paccofacileIsSuccess(save.response) && paccofacileIsSuccess(buy.response);
  result.message = hasLabel
    ? 'Prueba sandbox completa: envío, compra de prueba, tracking y etiqueta disponibles.'
    : 'Prueba sandbox completa: envío y compra de prueba realizados. La etiqueta puede tardar unos minutos.';
  result.providerShipmentId = providerShipmentId;
  result.tracking = tracking;
  result.hasLabel = hasLabel;
  return result;
}

function paccofacileIsSuccess(data: any) {
  const status = String(data?.header?.status || data?.status || '').toUpperCase();
  return status === 'SUCCESS' || data?.success === true;
}

function paccofacileMessage(data: any, fallback = 'No se pudo completar la operación.') {
  const message = data?.header?.notification?.messages || data?.message || data?.error || data?.errors || data?.data?.errors || data?.data?.message || fallback;
  if (typeof message === 'string') return message;
  try { return JSON.stringify(message); } catch { return fallback; }
}


function paccofacileExtractLabelBase64(data: any): string {
  const candidates = [
    data?.data?.content,
    data?.content,
    data?.data?.label?.content,
    data?.data?.label?.base64,
    data?.data?.label?.file,
    data?.data?.label?.pdf,
    data?.data?.label_pdf,
    data?.data?.pdf,
    data?.data?.base64,
    data?.data?.base64_pdf,
    data?.label?.content,
    data?.label?.base64,
    data?.labelBase64,
    data?.base64,
    data?.pdf
  ];
  for (const value of candidates) {
    if (typeof value === 'string') {
      const clean = value.trim().replace(/^data:application\/pdf;base64,/i, '');
      if (clean.length > 100) return clean;
    }
  }
  const docs = data?.data?.documents || data?.documents || data?.data?.labels || data?.labels || data?.data?.files || data?.files;
  if (Array.isArray(docs)) {
    for (const doc of docs) {
      const value = doc?.content || doc?.base64 || doc?.file || doc?.pdf || doc?.label?.content || doc?.label?.base64;
      if (typeof value === 'string') {
        const clean = value.trim().replace(/^data:application\/pdf;base64,/i, '');
        if (clean.length > 100) return clean;
      }
    }
  }
  return '';
}

function paccofacileExtractLabelFormat(data: any): string {
  return String(data?.data?.format || data?.format || data?.data?.label?.format || 'pdf').toLowerCase() || 'pdf';
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeJsonObjects(base: any, patch: any) {
  const safeBase = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
  const safePatch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  return { ...safeBase, ...safePatch };
}

function paccofacileServiceSupportsAddressFlow(offer: any) {
  const pickupType = Number(offer?.pickup_type || offer?.pickupType || offer?.pickupTypeId || 1);
  const serviceName = String(`${offer?.carrier || ''} ${offer?.name || offer?.service_name || ''}`).toLowerCase();
  if (pickupType === 4 || pickupType === 5 || pickupType === 6) return false;
  if (serviceName.includes('point to point') || serviceName.includes('locker') || serviceName.includes('inpost')) return false;
  return true;
}

function parsePaccofacileLocationInput(postalCode: any, cityHint?: any) {
  const rawPostal = String(postalCode || '').trim();
  const rawCity = String(cityHint || '').trim();
  const postalMatch = rawPostal.match(/\b\d{4,6}\b/);
  const cleanPostal = postalMatch ? postalMatch[0] : rawPostal;
  const labelWithoutPostal = rawPostal.replace(/\b\d{4,6}\b/g, '').replace(/[—\-–,()]+/g, ' ').trim();
  const cleanCity = rawCity || labelWithoutPostal;
  return { postalCode: cleanPostal, city: cleanCity };
}

function buildPaccofacileParcels(packages: any[]) {
  const parcels: any[] = [];
  for (const pkg of expandPackagesByQty(packages)) {
    parcels.push({
      shipment_type: 1,
      weight: Math.max(1, Number(pkg.weight || pkg.weight_kg || 1)),
      dim1: Math.max(2, Math.round(Number(pkg.length || pkg.length_cm || 10))),
      dim2: Math.max(2, Math.round(Number(pkg.height || pkg.height_cm || 10))),
      dim3: Math.max(2, Math.round(Number(pkg.width || pkg.width_cm || 10)))
    });
  }
  return parcels.length ? parcels : [{ shipment_type: 1, weight: 1, dim1: 10, dim2: 10, dim3: 10 }];
}

function normalizePaccofacileText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toUpperCase();
}

function paccofacileLocalityPostal(locality: any) {
  return String(locality?.postal_code || locality?.cap || '').trim();
}

function paccofacileLocalityCity(locality: any) {
  return String(locality?.locality || locality?.city || '').trim();
}

function paccofacileLocalityMatches(locality: any, parsed: { postalCode: string; city: string }, requirePostal = true) {
  if (!locality) return false;
  const expectedPostal = String(parsed.postalCode || '').trim();
  const actualPostal = paccofacileLocalityPostal(locality);
  if (requirePostal && expectedPostal && actualPostal !== expectedPostal) return false;
  const expectedCity = normalizePaccofacileText(parsed.city || '');
  const actualCity = normalizePaccofacileText(paccofacileLocalityCity(locality));
  if (expectedCity && actualCity && actualCity !== expectedCity) {
    if (!actualCity.includes(expectedCity) && !expectedCity.includes(actualCity)) return false;
  }
  return true;
}

async function lookupPaccofacileLocality(provider: any, keys: any, country: string, postalCode: string, cityHint?: string, timeoutMs = EXTERNAL_API_TIMEOUT_MS) {
  const parsed = parsePaccofacileLocationInput(postalCode, cityHint);
  const iso = String(country || 'IT').toUpperCase().slice(0, 2);
  const candidates = [
    { search: parsed.city, postal_code: parsed.postalCode, strictPostal: true, strictCity: true },
    { search: String(cityHint || '').trim(), postal_code: parsed.postalCode, strictPostal: true, strictCity: true },
    { search: '', postal_code: parsed.postalCode, strictPostal: true, strictCity: false },
    { search: parsed.postalCode, postal_code: parsed.postalCode, strictPostal: true, strictCity: false },
    { search: parsed.city || parsed.postalCode, postal_code: '', strictPostal: false, strictCity: true },
  ];

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const payload = {
      iso_code: iso,
      search: String(candidate.search || '').trim(),
      postal_code: String(candidate.postal_code || '').trim()
    };
    const key = `${payload.iso_code}|${payload.search}|${payload.postal_code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!payload.search && !payload.postal_code) continue;

    const { httpStatus, response } = await callPaccofacile(provider, keys, 'POST', 'service/locality/validation', payload, timeoutMs);
    await writeProviderLog('paccofacile', 'locality_validation', payload, response, httpStatus);
    const items = response?.data?.items || response?.items || [];
    if (!Array.isArray(items) || !items.length) continue;

    const exact = items.find((row: any) => paccofacileLocalityMatches(row, parsed, Boolean(candidate.strictPostal)));
    if (exact) return exact;

    const exactPostal = parsed.postalCode
      ? items.find((row: any) => paccofacileLocalityPostal(row) === parsed.postalCode)
      : null;
    if (exactPostal && !candidate.strictCity) return exactPostal;

    // Do not accept the first returned locality when a CAP was supplied and it does not match.
    // Paccofacile may return a locality for the text search even when the CAP belongs to another city.
    if (parsed.postalCode && candidate.strictPostal !== false) continue;

    if (!parsed.postalCode && items[0]) return items[0];
  }

  return null;
}

function inferredItalianProvinceByPostal(postal: any) {
  const cap = String(postal || '').trim();
  if (/^00/.test(cap)) return 'RM';
  if (/^90/.test(cap)) return 'PA';
  return '';
}

function paccofacileProvince(locality: any, country: any, postalCode?: any) {
  const raw = String(locality?.StateOrProvinceCode || locality?.stateOrProvinceCode || '').trim().toUpperCase();
  if (raw) return raw.slice(0, 5);
  const inferred = String(country || '').toUpperCase() === 'IT' ? inferredItalianProvinceByPostal(postalCode) : '';
  return String(inferred || country || 'IT').toUpperCase().slice(0, 5);
}

function nextBusinessDateIso(offsetDays = 2) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  while ([0, 6].includes(date.getDay())) date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function safePaccofacilePhone(value: any) {
  return String(value || '').replace(/\D/g, '').slice(0, 15) || '3331234567';
}

function cleanPaccofacileStreet(addr: any) {
  const raw = compactText(addr?.addressLine1 || addr?.address || '', 80);
  const civic = compactText(addr?.civicNumber || addr?.streetNumber || addr?.numeroCivico || '', 10);
  if (!raw) return 'Indirizzo';
  if (civic) return compactText(raw.replace(civic, '').replace(/[,\s]+$/g, '').trim(), 80) || raw;
  return raw;
}

function buildPaccofacileAddress(addr: any, quote: any, locality: any, kind: 'pickup' | 'destination', providerEmail: string) {
  const country = String(addr?.country || (kind === 'pickup' ? quote.origin_country : quote.dest_country) || locality?.iso_code || 'IT').toUpperCase().slice(0, 2);
  const postal = compactText(locality?.postal_code || locality?.cap || addr?.zipCode || addr?.post_code || (kind === 'pickup' ? quote.origin_zip : quote.dest_zip) || '', 15);
  // The locality validated by Paccofacile is the source of truth for city/province.
  // This prevents combinations like ROMA + province TN when a user typed a mismatched city/CAP.
  const city = compactText(locality?.locality || addr?.city || '', 30).toUpperCase();
  const civic = compactText(addr?.civicNumber || addr?.streetNumber || addr?.numeroCivico || '', 5) || '1';
  return {
    iso_code: country,
    postal_code: postal,
    city,
    StateOrProvinceCode: paccofacileProvince(locality, country, postal),
    header_name: compactText(safeAddressName(addr, kind === 'pickup' ? 'DoorDrop Sender' : 'DoorDrop Client'), 80),
    address: cleanPaccofacileStreet(addr),
    building_number: civic,
    phone: safePaccofacilePhone(addr?.phone),
    email: providerEmail,
    note: compactText(addr?.observations || '', 120)
  };
}

function mapPaccofacileStatus(rawStatus: any, fallbackLabel = 'Actualizado') {
  const text = String(rawStatus || fallbackLabel || '').toLowerCase();
  if (text.includes('consegn') || text.includes('delivered')) return { status: 'entregado', label: 'Entregado' };
  if (text.includes('reparto') || text.includes('delivery')) return { status: 'en_reparto', label: 'En reparto' };
  if (text.includes('transito') || text.includes('transit')) return { status: 'en_transito', label: 'En tránsito' };
  if (text.includes('ritir') || text.includes('tramit') || text.includes('compr') || text.includes('ready')) return { status: 'tramitado', label: 'Tramitado' };
  if (text.includes('incid') || text.includes('failed') || text.includes('fall')) return { status: 'incidencia', label: 'Incidencia' };
  if (text.includes('annull') || text.includes('cancel')) return { status: 'cancelado', label: 'Cancelado' };
  return { status: 'enviado_proveedor', label: fallbackLabel || 'Actualizado' };
}

function mapParcelAbcTrackStatus(statusId: any) {
  const code = Number(statusId);
  const mapping: Record<number, { status: string; label: string }> = {
    1: { status: 'en_transito', label: 'En tránsito' },
    2: { status: 'entregado', label: 'Entregado' },
    3: { status: 'incidencia', label: 'Dirección pendiente de confirmar' },
    4: { status: 'incidencia', label: 'Dirección pendiente de confirmar' },
    6: { status: 'en_reparto', label: 'En reparto' },
    9: { status: 'devuelto', label: 'Devuelto' },
    10: { status: 'pendiente_tramitar', label: 'Pendiente' },
    11: { status: 'incidencia', label: 'Incidencia' },
    12: { status: 'cancelado', label: 'Cancelado' },
    14: { status: 'pendiente_tramitar', label: 'Información recibida' },
    20: { status: 'en_transito', label: 'Recogido' },
    23: { status: 'tramitado', label: 'Transportista notificado' }
  };
  return mapping[code] || { status: 'enviado_proveedor', label: 'Actualizado' };
}


function appBaseUrl() {
  return String(process.env.APP_URL || 'https://doordrop.lat').replace(/\/$/, '');
}


// ---- Geo IP: country → language + currency ----
const GEO_IP_CACHE = new Map<string, { country: string; ts: number }>();
const GEO_IP_TTL_MS = 60 * 60 * 1000;

function clientIpFromRequest(req: any): string {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const xr = String(req.headers['x-real-ip'] || '').trim();
  const raw = xf || xr || req.ip || req.socket?.remoteAddress || '';
  return String(raw).replace(/^::ffff:/, '').trim();
}

function isPublicIp(ip: string): boolean {
  if (!ip || ip === '::1' || ip === '127.0.0.1') return false;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return false;
  return true;
}

function countryToLanguageCode(country: string): string {
  const c = String(country || '').toUpperCase().slice(0, 2);
  if (c === 'IT') return 'it';
  if (c === 'DE' || c === 'AT') return 'de';
  if (c === 'FR' || c === 'MC') return 'fr';
  if (c === 'CN' || c === 'TW' || c === 'HK') return 'zh';
  if (c === 'HT') return 'ht';
  if (c === 'DO') return 'es-DO';
  if (c === 'CO') return 'es-CO';
  if (c === 'EC') return 'es-EC';
  if (c === 'ES') return 'es';
  if (['US', 'GB', 'IE', 'CA', 'AU', 'NZ', 'IN', 'PH', 'SG', 'ZA', 'NG'].includes(c)) return 'en';
  // LatAm Spanish
  if (['MX', 'AR', 'CL', 'PE', 'UY', 'PY', 'BO', 'VE', 'GT', 'HN', 'SV', 'NI', 'CR', 'PA', 'CU', 'PR'].includes(c)) return 'es';
  // Eurozone / Europe default to local when known, else en/es
  if (['PT', 'NL', 'BE', 'LU', 'FI', 'GR', 'PL', 'SE', 'NO', 'DK', 'CZ', 'RO', 'HU'].includes(c)) return 'en';
  if (c === 'CH') return 'de';
  return 'es';
}

function countryToCurrencyCode(country: string): string {
  const c = String(country || '').toUpperCase().slice(0, 2);
  const map: Record<string, string> = {
    DO: 'DOP', US: 'USD', EC: 'USD', PA: 'USD', PR: 'USD', SV: 'USD',
    GB: 'GBP',
    CO: 'COP', MX: 'MXN', AR: 'ARS', CL: 'CLP', BR: 'BRL', PE: 'PEN',
    CN: 'CNY', HT: 'HTG', CA: 'CAD',
    // EUR zone
    ES: 'EUR', IT: 'EUR', FR: 'EUR', DE: 'EUR', PT: 'EUR', NL: 'EUR', BE: 'EUR',
    IE: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR',
    CH: 'EUR', // display EUR on platform (user can change)
  };
  return map[c] || 'EUR';
}


const COUNTRIES_CACHE_TTL_MS = 5 * 60 * 1000;
let countriesLocaleCache: any[] | null = null;
let countriesLocaleCacheAt = 0;
let countriesLocaleRefreshPromise: Promise<any[]> | null = null;

async function loadCountriesLocaleRows(): Promise<any[]> {
  const now = Date.now();
  if (countriesLocaleCache && now - countriesLocaleCacheAt < COUNTRIES_CACHE_TTL_MS) {
    return countriesLocaleCache;
  }
  if (countriesLocaleRefreshPromise) return countriesLocaleRefreshPromise;

  countriesLocaleRefreshPromise = (async () => {
    try {
      const [rows]: any = await pool.query(
        `SELECT iso2 AS code, currency, language_code AS languageCode, language_name AS languageName,
                name_es AS nameEs, name_en AS nameEn, flag_url AS flag, active
         FROM countries WHERE active = 1`
      );
      const result = Array.isArray(rows) ? rows : [];
      if (result.length > 0) {
        countriesLocaleCache = result;
        countriesLocaleCacheAt = Date.now();
      }
      return result;
    } catch (e: any) {
      console.warn('[locale] countries query failed', e?.message || e);
      return [];
    }
  })();

  try {
    return await countriesLocaleRefreshPromise;
  } finally {
    countriesLocaleRefreshPromise = null;
  }
}

function mapDbLanguageToApp(languageCode: string, countryCode: string): string {
  const lang = String(languageCode || '').toLowerCase().slice(0, 2);
  const cc = String(countryCode || '').toUpperCase().slice(0, 2);
  // Spanish regional variants we ship in UI
  if (lang === 'es') {
    if (cc === 'DO') return 'es-DO';
    if (cc === 'CO') return 'es-CO';
    if (cc === 'EC') return 'es-EC';
    if (cc === 'ES') return 'es';
    return 'es';
  }
  if (lang === 'en') return 'en';
  if (lang === 'it') return 'it';
  if (lang === 'fr') return 'fr';
  if (lang === 'de') return 'de';
  if (lang === 'zh') return 'zh';
  if (lang === 'ht') return 'ht';
  if (lang === 'pt') return 'en'; // no PT pack — English fallback for BR/PT UX
  // fallback by country if language pack missing
  return countryToLanguageCode(cc);
}

function currencyMeta(code: string) {
  const c = String(code || 'EUR').toUpperCase();
  const symbols: Record<string, { symbol: string; name: string; decimals: number }> = {
    EUR: { symbol: '€', name: 'Euro', decimals: 2 },
    USD: { symbol: '$', name: 'US Dollar', decimals: 2 },
    DOP: { symbol: 'RD$', name: 'Peso dominicano', decimals: 2 },
    GBP: { symbol: '£', name: 'British Pound', decimals: 2 },
    COP: { symbol: 'COP$', name: 'Peso colombiano', decimals: 0 },
    MXN: { symbol: 'MX$', name: 'Peso mexicano', decimals: 2 },
    ARS: { symbol: 'ARS$', name: 'Peso argentino', decimals: 2 },
    CLP: { symbol: 'CLP$', name: 'Peso chileno', decimals: 0 },
    BRL: { symbol: 'R$', name: 'Real brasileño', decimals: 2 },
    PEN: { symbol: 'S/', name: 'Sol peruano', decimals: 2 },
    CNY: { symbol: '¥', name: 'Yuan chino', decimals: 2 },
    HTG: { symbol: 'G', name: 'Gourde haitiano', decimals: 2 },
    CAD: { symbol: 'CA$', name: 'Canadian Dollar', decimals: 2 },
    AUD: { symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
    CHF: { symbol: 'CHF', name: 'Swiss Franc', decimals: 2 },
    JPY: { symbol: '¥', name: 'Yen', decimals: 0 },
    INR: { symbol: '₹', name: 'Indian Rupee', decimals: 2 },
  };
  const meta = symbols[c] || { symbol: c, name: c, decimals: 2 };
  return { code: c, ...meta };
}

async function resolveCountryFromIp(ip: string): Promise<string | null> {
  if (!isPublicIp(ip)) return null;
  const hit = GEO_IP_CACHE.get(ip);
  if (hit && Date.now() - hit.ts < GEO_IP_TTL_MS) return hit.country || null;

  const tryFetch = async (url: string, pick: (j: any) => string | null) => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      clearTimeout(timer);
      if (!res.ok) return null;
      const j: any = await res.json();
      const cc = pick(j);
      return cc ? String(cc).toUpperCase().slice(0, 2) : null;
    } catch {
      return null;
    }
  };

  let country =
    (await tryFetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, (j) => (j?.error ? null : j?.country_code || j?.country))) ||
    (await tryFetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode`, (j) => (j?.status === 'success' ? j.countryCode : null))) ||
    (await tryFetch(`https://get.geojs.io/v1/ip/country/${encodeURIComponent(ip)}.json`, (j) => j?.country || j?.name));

  if (country && /^[A-Z]{2}$/.test(country) && country !== 'XX') {
    GEO_IP_CACHE.set(ip, { country, ts: Date.now() });
    return country;
  }
  return null;
}

function detectLanguageFromRequest(req: any): string {
  const country = String(req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || req.headers['x-country-code'] || '').toUpperCase().slice(0, 2);
  if (country && country !== 'XX' && country !== 'T1') {
    return countryToLanguageCode(country);
  }
  const header = String(req.headers['accept-language'] || '').toLowerCase();
  if (header.startsWith('it') || header.includes('it-')) return 'it';
  if (header.startsWith('de') || header.includes('de-')) return 'de';
  if (header.startsWith('fr') || header.includes('fr-')) return 'fr';
  if (header.startsWith('zh') || header.includes('zh-')) return 'zh';
  if (header.startsWith('ht') || header.includes('ht-')) return 'ht';
  if (header.startsWith('en') || header.includes('en-')) return 'en';
  if (header.startsWith('es') || header.includes('es-')) {
    if (header.includes('es-do')) return 'es-DO';
    if (header.includes('es-co')) return 'es-CO';
    if (header.includes('es-ec')) return 'es-EC';
    return 'es';
  }
  return 'es';
}



function normalizeMailLanguage(value: any): 'es' | 'en' | 'it' | 'fr' | 'de' | 'zh' {
  const lang = String(value || '').trim().replace('_', '-').slice(0, 2).toLowerCase();
  if (['es', 'en', 'it', 'fr', 'de', 'zh'].includes(lang)) return lang as any;
  const countryLanguage: Record<string, 'es' | 'en' | 'it' | 'fr' | 'de' | 'zh'> = {
    us: 'en', gb: 'en', ca: 'en', au: 'en',
    it: 'it', de: 'de', at: 'de', ch: 'de',
    fr: 'fr', be: 'fr',
    cn: 'zh', hk: 'zh', mo: 'zh', tw: 'zh',
    es: 'es', mx: 'es', do: 'es', co: 'es', ar: 'es', cl: 'es', pe: 'es'
  };
  if (countryLanguage[lang]) return countryLanguage[lang];
  return 'es';
}

const SHIPMENT_STATUS_PUBLIC_TEXT: any = {
  es: {
    shipment_created: 'Hemos recibido tu envío',
    label_ready: 'Tu etiqueta está lista', tramitado: 'Tu envío fue tramitado', pendiente_tramitar: 'Tu envío está en preparación',
    en_transito: 'Tu envío está en tránsito', en_reparto: 'Tu envío está en reparto', entregado: 'Tu envío fue entregado', incidencia: 'Tu envío necesita atención', devuelto: 'Tu envío fue devuelto', cancelado: 'Tu envío fue cancelado', default: 'Tu envío fue actualizado'
  },
  en: {
    shipment_created: 'We received your shipment',
    label_ready: 'Your label is ready', tramitado: 'Your shipment has been processed', pendiente_tramitar: 'Your shipment is being prepared',
    en_transito: 'Your shipment is in transit', en_reparto: 'Your shipment is out for delivery', entregado: 'Your shipment was delivered', incidencia: 'Your shipment needs attention', devuelto: 'Your shipment was returned', cancelado: 'Your shipment was canceled', default: 'Your shipment was updated'
  },
  it: {
    shipment_created: 'Abbiamo ricevuto la tua spedizione',
    label_ready: 'La tua etichetta è pronta', tramitado: 'La tua spedizione è stata elaborata', pendiente_tramitar: 'La tua spedizione è in preparazione',
    en_transito: 'La tua spedizione è in transito', en_reparto: 'La tua spedizione è in consegna', entregado: 'La tua spedizione è stata consegnata', incidencia: 'La tua spedizione richiede attenzione', devuelto: 'La tua spedizione è stata restituita', cancelado: 'La tua spedizione è stata annullata', default: 'La tua spedizione è stata aggiornata'
  },
  fr: {
    shipment_created: 'Nous avons reçu votre envoi',
    label_ready: 'Votre étiquette est prête', tramitado: 'Votre envoi a été traité', pendiente_tramitar: 'Votre envoi est en préparation',
    en_transito: 'Votre envoi est en transit', en_reparto: 'Votre envoi est en livraison', entregado: 'Votre envoi a été livré', incidencia: 'Votre envoi nécessite une attention', devuelto: 'Votre envoi a été retourné', cancelado: 'Votre envoi a été annulé', default: 'Votre envoi a été mis à jour'
  }
};

function publicStatusTitle(status: string, lang: any) {
  const l = normalizeMailLanguage(lang);
  return SHIPMENT_STATUS_PUBLIC_TEXT[l]?.[status] || SHIPMENT_STATUS_PUBLIC_TEXT[l]?.default || SHIPMENT_STATUS_PUBLIC_TEXT.es.default;
}

function emailLogoUrlFromBrand(brand: any) {
  const raw = String(brand?.logoUrl || brand?.ogImageUrl || '').trim();
  if (!raw) return `${appBaseUrl()}/icon.svg`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${appBaseUrl()}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function makeTrackingUrl(code: string, lang = 'es') {
  const locale = normalizeMailLanguage(lang);
  return `${appBaseUrl()}/tracking?code=${encodeURIComponent(code || '')}&lang=${locale}`;
}

async function getShipmentCustomer(shipment: any) {
  try { return shipment?.user_id ? await UserRepo.getById(shipment.user_id) : null; } catch { return null; }
}

function shipmentRecipientEmail(shipment: any, user: any) {
  const recipient = typeof shipment?.recipient_json === 'string' ? parseJsonSafe(shipment.recipient_json) : (shipment?.recipient_json || {});
  return isValidEmailForProvider(recipient?.email) || isValidEmailForProvider(user?.email) || '';
}

function shipmentNotificationPart(shipment: any, key: 'sender_json' | 'recipient_json') {
  const raw = shipment?.[key];
  return typeof raw === 'string' ? parseJsonSafe(raw) : (raw || {});
}

function shipmentNotificationVariables(shipment: any, user: any, language: string, statusCode: string, statusLabel: string, description = '') {
  const sender = shipmentNotificationPart(shipment, 'sender_json');
  const recipient = shipmentNotificationPart(shipment, 'recipient_json');
  const trackingCode = shipment?.tracking_code || shipment?.provider_tracking_code || shipment?.provider_shipment_code || shipment?.id || '';
  const baseUrl = (process.env.APP_URL || 'https://doordrop.lat').replace(/\/+$/, '');
  return {
    customerName: user?.name || user?.email || 'Cliente',
    trackingCode,
    statusTitle: publicStatusTitle(statusCode, language) || statusLabel || 'Actualización de envío',
    statusLabel: statusLabel || statusCode,
    trackingUrl: makeTrackingUrl(trackingCode, language),
    carrierName: shipment?.provider_code || 'DoorDrop',
    originCity: sender?.city || sender?.town || '',
    destinationCity: recipient?.city || recipient?.town || '',
    issueTitle: statusLabel || 'Incidencia de envío',
    issueDescription: description || statusLabel || 'El envío necesita atención.',
    supportUrl: `${baseUrl}/panel/tickets`,
    ticketUrl: `${baseUrl}/panel/tickets`,
    walletUrl: `${baseUrl}/panel/billing`,
    userName: user?.name || user?.email || '',
    userEmail: user?.email || ''
  };
}

async function logEmail(params: any) {
  try {
    const id = params.id || generateId('eml_');
    await pool.query(
      `INSERT INTO email_logs (id, shipment_id, user_id, to_email, subject, language, event_code, status, provider_code, message_id, error_message, payload_json, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), message_id = VALUES(message_id), error_message = VALUES(error_message), payload_json = VALUES(payload_json), sent_at = VALUES(sent_at)`,
      [id, params.shipment_id || null, params.user_id || null, params.to_email, params.subject, params.language || 'es', params.event_code || null, params.status || 'pending', params.provider_code || null, params.message_id || null, params.error_message || null, JSON.stringify(params.payload_json || {}), params.sent_at || null]
    );
    return id;
  } catch (e) {
    return '';
  }
}

function brevoApiKey() {
  return String(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim();
}

async function sendShipmentStatusEmail(shipment: any, statusCode: string, statusLabel: string, description?: string) {
  const templateUser = await getShipmentCustomer(shipment);
  const templateRecipient = shipmentRecipientEmail(shipment, templateUser);
  const templateLanguage = detectCustomerEmailLanguage(templateUser);
  const statusEventMap: Record<string, string> = {
    pending_provider: 'shipment_pending_provider',
    pending_label: 'shipment_pending_label',
    label_ready: 'shipment_label_ready',
    tramitado: 'shipment_tramitado',
    en_transito: 'shipment_en_transito',
    en_reparto: 'shipment_en_reparto',
    entregado: 'shipment_entregado',
    incidencia: 'shipment_incidencia',
    devuelto: 'shipment_devuelto',
    cancelado: 'shipment_cancelado'
  };
  const templatedStatusResult = await sendNotificationEvent({
    eventCode: statusEventMap[statusCode] || 'shipment_status_updated',
    entityType: 'shipment',
    entityId: String(shipment?.id || ''),
    shipmentId: shipment?.id || null,
    userId: shipment?.user_id || null,
    providerCode: shipment?.provider_code || null,
    audience: 'customer',
    toEmail: templateRecipient,
    recipientName: templateUser?.name,
    language: templateLanguage,
    variables: shipmentNotificationVariables(shipment, templateUser, templateLanguage, statusCode, statusLabel, description)
  });
  return { sent: templatedStatusResult.success, messageId: templatedStatusResult.messageId, reason: templatedStatusResult.reason, templateId: templatedStatusResult.templateId };

  const apiKey = brevoApiKey();
  if (!apiKey) return { sent: false, reason: 'email_not_configured' };
  const user = await getShipmentCustomer(shipment);
  const toEmail = shipmentRecipientEmail(shipment, user);
  if (!toEmail) return { sent: false, reason: 'no_recipient' };
  const lang = detectCustomerEmailLanguage(user);
  const eventCode = `shipment_${statusCode}`;
  const [existsRows]: any = await pool.query(`SELECT id FROM email_logs WHERE shipment_id = ? AND event_code = ? AND to_email = ? AND status = 'sent' LIMIT 1`, [shipment.id, eventCode, toEmail]);
  if (existsRows.length) return { sent: false, reason: 'already_sent' };

  const settings = await AdminSettingsRepo.get().catch(() => ({} as any));
  const brand = settings?.brand || {};
  const brandName = brand.siteName || 'DoorDrop';
  const senderName = process.env.MAIL_FROM_NAME || process.env.BREVO_FROM_NAME || 'DoorDrop';
  const senderEmail = process.env.MAIL_FROM_EMAIL || process.env.BREVO_FROM_EMAIL || 'info@doordrop.lat';
  const logoUrl = emailLogoUrlFromBrand(brand);
  const title = publicStatusTitle(statusCode, lang);
  const trackingCode = shipment.tracking_code || shipment.provider_tracking_code || shipment.provider_shipment_code || shipment.id;
  const trackingUrl = makeTrackingUrl(trackingCode, lang);
  const subject = `${title} - ${trackingCode}`;
  const preheader = description || statusLabel || title;
  const htmlContent = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#0f172a"><div style="display:none;opacity:0;max-height:0">${preheader}</div><table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;padding:28px 0"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:white;border-radius:22px;overflow:hidden;border:1px solid #e2e8f0"><tr><td style="padding:28px 30px;border-bottom:1px solid #eef2f7"><img src="${logoUrl}" alt="${brandName}" style="max-height:42px;max-width:180px;vertical-align:middle"><strong style="font-size:20px;margin-left:10px;vertical-align:middle">${brandName}</strong></td></tr><tr><td style="padding:32px 30px"><p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#2563eb;font-weight:800;margin:0 0 12px">${trackingCode}</p><h1 style="font-size:28px;line-height:1.2;margin:0 0 12px;color:#0f172a">${title}</h1><p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 24px">${preheader}</p><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:16px;margin-bottom:24px"><strong>${statusLabel || title}</strong><br><span style="color:#64748b;font-size:14px">${new Date().toLocaleString()}</span></div><a href="${trackingUrl}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:800">${lang === 'it' ? 'Vedi tracking' : lang === 'en' ? 'View tracking' : lang === 'fr' ? 'Voir le suivi' : 'Ver seguimiento'}</a></td></tr><tr><td style="padding:20px 30px;background:#0f172a;color:#cbd5e1;font-size:12px">${brandName} · ${senderEmail}</td></tr></table></td></tr></table></body></html>`;
  const payload = { sender: { name: senderName, email: senderEmail }, to: [{ email: toEmail, name: user?.name || undefined }], subject, htmlContent, tags: ['shipment-status', statusCode] };
  const logId = await logEmail({ shipment_id: shipment.id, user_id: shipment.user_id, to_email: toEmail, subject, language: lang, event_code: eventCode, status: 'pending', provider_code: shipment.provider_code, payload_json: { toEmail, subject, statusCode, trackingCode } });
  try {
    const headers: any = { 'Content-Type': 'application/json', 'api-key': apiKey };
    if (String(process.env.BREVO_SANDBOX_MODE || '').toLowerCase() === 'true') headers['X-Sib-Sandbox'] = 'drop';
    const response = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers, body: JSON.stringify(payload) });
    const data: any = await response.json().catch(async () => ({ raw: await response.text() }));
    const messageId = data?.messageId || data?.message_id || '';
    await logEmail({ id: logId, shipment_id: shipment.id, user_id: shipment.user_id, to_email: toEmail, subject, language: lang, event_code: eventCode, status: response.ok ? 'sent' : 'failed', provider_code: shipment.provider_code, message_id: messageId, error_message: response.ok ? null : (data?.message || data?.error || 'No se pudo enviar la notificación.'), payload_json: { response: data, statusCode, trackingCode }, sent_at: response.ok ? new Date().toISOString().slice(0,19).replace('T',' ') : null });
    return { sent: response.ok, messageId, status: response.status };
  } catch (e: any) {
    await logEmail({ id: logId, shipment_id: shipment.id, user_id: shipment.user_id, to_email: toEmail, subject, language: lang, event_code: eventCode, status: 'failed', provider_code: shipment.provider_code, error_message: e?.message || 'No se pudo enviar la notificación.', payload_json: { statusCode, trackingCode } });
    return { sent: false, reason: e?.message || 'send_failed' };
  }
}


const SHIPMENT_CREATED_EMAIL_COPY: any = {
  es: {
    title: 'Hemos recibido tu envío',
    intro: 'Tu envío fue recibido correctamente y ya está en preparación con nuestra red logística.',
    timing: 'En más del 90% de los casos la etiqueta queda disponible en menos de 5 minutos.',
    note: 'Según la red logística seleccionada, la validación de la dirección, los datos declarados o la disponibilidad operativa, puede tardar un poco más.',
    ticket: 'Si pasan más de 5 minutos y la etiqueta todavía no aparece, abre un ticket y nuestro equipo revisará el caso.',
    viewTracking: 'Ver seguimiento',
    openTicket: 'Abrir ticket',
    subject: 'Hemos recibido tu envío'
  },
  en: {
    title: 'We received your shipment',
    intro: 'Your shipment was received successfully and is now being prepared with our logistics network.',
    timing: 'In more than 90% of cases, the label becomes available in less than 5 minutes.',
    note: 'Depending on the selected logistics network, address validation, declared shipment data, or operational availability, it may take a little longer.',
    ticket: 'If more than 5 minutes pass and the label is still not available, open a ticket and our team will review it.',
    viewTracking: 'View tracking',
    openTicket: 'Open ticket',
    subject: 'We received your shipment'
  },
  it: {
    title: 'Abbiamo ricevuto la tua spedizione',
    intro: 'La tua spedizione è stata ricevuta correttamente ed è ora in preparazione con la nostra rete logistica.',
    timing: 'In oltre il 90% dei casi l’etichetta è disponibile in meno di 5 minuti.',
    note: 'In base alla rete logistica selezionata, alla validazione dell’indirizzo, ai dati dichiarati o alla disponibilità operativa, potrebbe richiedere un po’ più di tempo.',
    ticket: 'Se dopo più di 5 minuti l’etichetta non è ancora disponibile, apri un ticket e il nostro team controllerà il caso.',
    viewTracking: 'Vedi tracking',
    openTicket: 'Apri ticket',
    subject: 'Abbiamo ricevuto la tua spedizione'
  },
  fr: {
    title: 'Nous avons reçu votre envoi',
    intro: 'Votre envoi a bien été reçu et il est en préparation avec notre réseau logistique.',
    timing: 'Dans plus de 90 % des cas, l’étiquette est disponible en moins de 5 minutes.',
    note: 'Selon le réseau logistique sélectionné, la validation de l’adresse, les données déclarées ou la disponibilité opérationnelle, cela peut prendre un peu plus de temps.',
    ticket: 'Si plus de 5 minutes passent et que l’étiquette n’est toujours pas disponible, ouvrez un ticket et notre équipe vérifiera le dossier.',
    viewTracking: 'Voir le suivi',
    openTicket: 'Ouvrir un ticket',
    subject: 'Nous avons reçu votre envoi'
  }
};

function detectCustomerEmailLanguage(user: any) {
  const explicit = user?.language || user?.locale;
  if (explicit) return normalizeMailLanguage(explicit);
  return normalizeMailLanguage(user?.country || 'ES');
}

async function sendShipmentCreatedEmail(shipment: any) {
  const templateUser = await getShipmentCustomer(shipment);
  const templateRecipient = shipmentRecipientEmail(shipment, templateUser);
  const templateLanguage = detectCustomerEmailLanguage(templateUser);
  const hasLabel = Boolean(shipment?.label_url || shipment?.label_base64);
  const templatedCreatedResult = await sendNotificationEvent({
    eventCode: hasLabel ? 'shipment_label_ready' : 'shipment_received',
    entityType: 'shipment',
    entityId: String(shipment?.id || ''),
    shipmentId: shipment?.id || null,
    userId: shipment?.user_id || null,
    providerCode: shipment?.provider_code || null,
    audience: 'customer',
    toEmail: templateRecipient,
    recipientName: templateUser?.name,
    language: templateLanguage,
    variables: shipmentNotificationVariables(shipment, templateUser, templateLanguage, hasLabel ? 'label_ready' : 'shipment_created', hasLabel ? 'Etiqueta lista' : 'Envío recibido')
  });
  return { sent: templatedCreatedResult.success, messageId: templatedCreatedResult.messageId, reason: templatedCreatedResult.reason, templateId: templatedCreatedResult.templateId };

  const apiKey = brevoApiKey();
  if (!apiKey) return { sent: false, reason: 'email_not_configured' };
  const user = await getShipmentCustomer(shipment);
  const toEmail = shipmentRecipientEmail(shipment, user);
  if (!toEmail) return { sent: false, reason: 'no_recipient' };

  const lang = detectCustomerEmailLanguage(user);
  const copy = SHIPMENT_CREATED_EMAIL_COPY[lang] || SHIPMENT_CREATED_EMAIL_COPY.es;
  const eventCode = 'shipment_created';
  const [existsRows]: any = await pool.query(
    `SELECT id FROM email_logs WHERE shipment_id = ? AND event_code = ? AND to_email = ? AND status = 'sent' LIMIT 1`,
    [shipment.id, eventCode, toEmail]
  );
  if (existsRows.length) return { sent: false, reason: 'already_sent' };

  const settings = await AdminSettingsRepo.get().catch(() => ({} as any));
  const brand = settings?.brand || {};
  const brandName = brand.siteName || 'DoorDrop';
  const senderName = process.env.MAIL_FROM_NAME || process.env.BREVO_FROM_NAME || 'DoorDrop';
  const senderEmail = process.env.MAIL_FROM_EMAIL || process.env.BREVO_FROM_EMAIL || 'info@doordrop.lat';
  const logoUrl = emailLogoUrlFromBrand(brand);
  const trackingCode = shipment.tracking_code || shipment.provider_tracking_code || shipment.provider_shipment_code || shipment.id;
  const trackingUrl = makeTrackingUrl(trackingCode, lang);
  const ticketUrl = `${appBaseUrl()}/panel/tickets`;
  const subject = `${copy.subject} - ${trackingCode}`;
  const preheader = `${copy.timing} ${copy.ticket}`;

  const providerFriendly = shipment.provider_code === 'genei' || shipment.provider_code === 'parcelabc'
    ? 'DoorDrop'
    : (brandName || 'DoorDrop');

  const htmlContent = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#0f172a"><div style="display:none;opacity:0;max-height:0">${preheader}</div><table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;padding:28px 0"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:white;border-radius:22px;overflow:hidden;border:1px solid #e2e8f0"><tr><td style="padding:28px 30px;border-bottom:1px solid #eef2f7"><img src="${logoUrl}" alt="${brandName}" style="max-height:42px;max-width:180px;vertical-align:middle"><strong style="font-size:20px;margin-left:10px;vertical-align:middle">${brandName}</strong></td></tr><tr><td style="padding:32px 30px"><p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#2563eb;font-weight:800;margin:0 0 12px">${trackingCode}</p><h1 style="font-size:28px;line-height:1.2;margin:0 0 12px;color:#0f172a">${copy.title}</h1><p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 18px">${copy.intro}</p><div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;padding:18px;margin:0 0 18px"><strong style="color:#1d4ed8">${copy.timing}</strong><p style="margin:8px 0 0;color:#475569;line-height:1.55">${copy.note}</p></div><div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:18px;margin:0 0 24px;color:#9a3412"><strong>${copy.ticket}</strong></div><div style="margin:0 0 24px;color:#64748b;font-size:14px">${providerFriendly}</div><a href="${trackingUrl}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:800;margin-right:10px">${copy.viewTracking}</a><a href="${ticketUrl}" style="display:inline-block;background:#0f172a;color:white;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:800">${copy.openTicket}</a></td></tr><tr><td style="padding:20px 30px;background:#0f172a;color:#cbd5e1;font-size:12px">${brandName} · ${senderEmail}</td></tr></table></td></tr></table></body></html>`;

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: toEmail, name: user?.name || undefined }],
    subject,
    htmlContent,
    tags: ['shipment-created']
  };
  const logId = await logEmail({ shipment_id: shipment.id, user_id: shipment.user_id, to_email: toEmail, subject, language: lang, event_code: eventCode, status: 'pending', provider_code: shipment.provider_code, payload_json: { toEmail, subject, trackingCode, ticketUrl } });
  try {
    const headers: any = { 'Content-Type': 'application/json', 'api-key': apiKey };
    if (String(process.env.BREVO_SANDBOX_MODE || '').toLowerCase() === 'true') headers['X-Sib-Sandbox'] = 'drop';
    const response = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers, body: JSON.stringify(payload) });
    const data: any = await response.json().catch(async () => ({ raw: await response.text() }));
    const messageId = data?.messageId || data?.message_id || '';
    await logEmail({ id: logId, shipment_id: shipment.id, user_id: shipment.user_id, to_email: toEmail, subject, language: lang, event_code: eventCode, status: response.ok ? 'sent' : 'failed', provider_code: shipment.provider_code, message_id: messageId, error_message: response.ok ? null : (data?.message || data?.error || 'No se pudo enviar la notificación.'), payload_json: { response: data, trackingCode, ticketUrl }, sent_at: response.ok ? new Date().toISOString().slice(0,19).replace('T',' ') : null });
    return { sent: response.ok, messageId, status: response.status };
  } catch (e: any) {
    await logEmail({ id: logId, shipment_id: shipment.id, user_id: shipment.user_id, to_email: toEmail, subject, language: lang, event_code: eventCode, status: 'failed', provider_code: shipment.provider_code, error_message: e?.message || 'No se pudo enviar la notificación.', payload_json: { trackingCode, ticketUrl } });
    return { sent: false, reason: e?.message || 'send_failed' };
  }
}


async function getShipmentChargeAmount(shipmentId: string) {
  const [txRows]: any = await pool.query(
    `SELECT amount, currency FROM wallet_transactions
     WHERE reference_type = 'shipment' AND reference_id = ? AND type = 'debit'
     ORDER BY created_at ASC LIMIT 1`,
    [shipmentId]
  );
  if (txRows?.[0]) {
    return { amount: Number(txRows[0].amount || 0), currency: String(txRows[0].currency || 'EUR').toUpperCase() };
  }
  const [quoteRows]: any = await pool.query(
    `SELECT q.total_amount, q.currency FROM shipments s LEFT JOIN quotes q ON q.id = s.quote_id WHERE s.id = ? LIMIT 1`,
    [shipmentId]
  );
  return { amount: Number(quoteRows?.[0]?.total_amount || 0), currency: String(quoteRows?.[0]?.currency || 'EUR').toUpperCase() };
}

function canRequestCancellationForShipment(shipment: any) {
  const status = String(shipment?.status || '').toLowerCase();
  const label = String(shipment?.status_label || '').toLowerCase();
  if (!shipment) return false;
  if (['entregado','cancelado','cancelled','devuelto','reembolso_aprobado','refund_approved'].includes(status)) return false;
  if (label.includes('entreg') || label.includes('cancel') || label.includes('reembolso aprobado')) return false;
  return true;
}

const CANCELLATION_EMAIL_COPY: any = {
  es: {
    request_customer_subject: 'Solicitud de cancelación recibida',
    request_customer_title: 'Solicitud de cancelación recibida',
    request_customer_body: 'Recibimos tu solicitud de cancelación. Nuestro equipo revisará el estado logístico antes de aprobar cualquier reembolso. El dinero no se reembolsa de forma automática.',
    request_internal_subject: 'Nueva solicitud de cancelación',
    request_internal_title: 'Nueva solicitud de cancelación pendiente de revisión',
    request_internal_body: 'Un cliente solicitó cancelar un envío. Revisa el ticket, confirma si procede y aprueba o rechaza la solicitud desde el panel.',
    approved_subject: 'Reembolso aprobado',
    approved_title: 'Tu solicitud fue aprobada',
    approved_body: 'Hemos aprobado la solicitud y acreditamos el importe en tu monedero DoorDrop.',
    rejected_subject: 'Solicitud revisada',
    rejected_title: 'Tu solicitud fue revisada',
    rejected_body: 'Revisamos la solicitud y no fue posible aprobar el reembolso en este momento. Puedes responder al ticket si necesitas más información.',
    viewTicket: 'Ver ticket', viewWallet: 'Ver monedero'
  },
  en: {
    request_customer_subject: 'Cancellation request received',
    request_customer_title: 'Cancellation request received',
    request_customer_body: 'We received your cancellation request. Our team will review the logistics status before approving any refund. The money is not refunded automatically.',
    request_internal_subject: 'New cancellation request',
    request_internal_title: 'New cancellation request pending review',
    request_internal_body: 'A customer requested to cancel a shipment. Review the ticket, confirm if it applies, and approve or reject it from the admin panel.',
    approved_subject: 'Refund approved',
    approved_title: 'Your request was approved',
    approved_body: 'We approved the request and credited the amount to your DoorDrop wallet.',
    rejected_subject: 'Request reviewed',
    rejected_title: 'Your request was reviewed',
    rejected_body: 'We reviewed the request and could not approve the refund at this time. You can reply to the ticket if you need more information.',
    viewTicket: 'View ticket', viewWallet: 'View wallet'
  },
  it: {
    request_customer_subject: 'Richiesta di annullamento ricevuta',
    request_customer_title: 'Richiesta di annullamento ricevuta',
    request_customer_body: 'Abbiamo ricevuto la tua richiesta di annullamento. Il nostro team verificherà lo stato logistico prima di approvare qualsiasi rimborso. Il denaro non viene rimborsato automaticamente.',
    request_internal_subject: 'Nuova richiesta di annullamento',
    request_internal_title: 'Nuova richiesta di annullamento in revisione',
    request_internal_body: 'Un cliente ha richiesto l’annullamento di una spedizione. Controlla il ticket e approva o rifiuta la richiesta dal pannello.',
    approved_subject: 'Rimborso approvato',
    approved_title: 'La tua richiesta è stata approvata',
    approved_body: 'Abbiamo approvato la richiesta e accreditato l’importo sul tuo portafoglio DoorDrop.',
    rejected_subject: 'Richiesta verificata',
    rejected_title: 'La tua richiesta è stata verificata',
    rejected_body: 'Abbiamo verificato la richiesta e al momento non è possibile approvare il rimborso. Puoi rispondere al ticket per maggiori informazioni.',
    viewTicket: 'Vedi ticket', viewWallet: 'Vedi portafoglio'
  },
  fr: {
    request_customer_subject: 'Demande d’annulation reçue',
    request_customer_title: 'Demande d’annulation reçue',
    request_customer_body: 'Nous avons reçu votre demande d’annulation. Notre équipe vérifiera le statut logistique avant d’approuver tout remboursement. L’argent n’est pas remboursé automatiquement.',
    request_internal_subject: 'Nouvelle demande d’annulation',
    request_internal_title: 'Nouvelle demande d’annulation en attente de révision',
    request_internal_body: 'Un client a demandé l’annulation d’un envoi. Consultez le ticket, confirmez si la demande est recevable, puis approuvez ou refusez depuis le panneau.',
    approved_subject: 'Remboursement approuvé',
    approved_title: 'Votre demande a été approuvée',
    approved_body: 'Nous avons approuvé la demande et crédité le montant sur votre portefeuille DoorDrop.',
    rejected_subject: 'Demande examinée',
    rejected_title: 'Votre demande a été examinée',
    rejected_body: 'Nous avons examiné la demande et le remboursement ne peut pas être approuvé pour le moment. Vous pouvez répondre au ticket pour plus d’informations.',
    viewTicket: 'Voir le ticket', viewWallet: 'Voir le portefeuille'
  }
};

async function sendCancellationEmail(shipment: any, cancellation: any, eventCode: string, options: any = {}) {
  const cancellationUser = await getShipmentCustomer(shipment);
  const cancellationLanguage = normalizeMailLanguage(options.lang || detectCustomerEmailLanguage(cancellationUser));
  const isInternalNotification = eventCode === 'cancellation_request_internal';
  const internalRecipient = isInternalNotification
    ? isValidEmailForProvider(process.env.CANCELLATION_REVIEW_EMAIL) || isValidEmailForProvider(process.env.ADMIN_EMAIL) || ''
    : '';
  const cancellationRecipient = isInternalNotification ? internalRecipient : isValidEmailForProvider(cancellationUser?.email);
  const cancellationTracking = shipment?.tracking_code || shipment?.provider_tracking_code || shipment?.provider_shipment_code || shipment?.id || '';
  const baseUrl = (process.env.APP_URL || 'https://doordrop.lat').replace(/\/+$/, '');
  const cancellationTitle = eventCode === 'cancellation_approved_refunded'
    ? 'Reembolso aprobado'
    : eventCode === 'cancellation_rejected'
      ? 'Solicitud revisada'
      : eventCode === 'cancellation_request_internal'
        ? 'Nueva solicitud de cancelación'
        : 'Solicitud de cancelación recibida';
  const templatedCancellationResult = await sendNotificationEvent({
    eventCode,
    entityType: 'shipment_cancellation',
    entityId: String(cancellation?.id || shipment?.id || ''),
    shipmentId: shipment?.id || null,
    userId: cancellation?.user_id || shipment?.user_id || null,
    providerCode: shipment?.provider_code || null,
    audience: isInternalNotification ? 'internal' : 'customer',
    toEmail: cancellationRecipient,
    recipientName: isInternalNotification ? 'Operaciones DoorDrop' : cancellationUser?.name,
    language: cancellationLanguage,
    variables: {
      userName: cancellationUser?.name || cancellationUser?.email || '',
      customerName: cancellationUser?.name || cancellationUser?.email || '',
      customerEmail: cancellationUser?.email || '',
      trackingCode: cancellationTracking,
      statusTitle: cancellationTitle,
      statusLabel: eventCode === 'cancellation_approved_refunded' ? 'Reembolso acreditado' : eventCode === 'cancellation_rejected' ? 'Rechazada' : 'Pendiente de revisión',
      amount: Number(cancellation?.amount || 0).toFixed(2),
      currency: String(cancellation?.currency || 'EUR').toUpperCase(),
      reason: String(cancellation?.reason || options.adminNote || 'Solicitud del cliente').slice(0, 900),
      ticketUrl: `${baseUrl}/panel/tickets`,
      walletUrl: `${baseUrl}/panel/billing`
    }
  });
  return { sent: templatedCancellationResult.success, messageId: templatedCancellationResult.messageId, reason: templatedCancellationResult.reason, templateId: templatedCancellationResult.templateId };

  const apiKey = brevoApiKey();
  if (!apiKey) return { sent: false, reason: 'email_not_configured' };

  const settings = await AdminSettingsRepo.get().catch(() => ({} as any));
  const brand = settings?.brand || {};
  const brandName = brand.siteName || 'DoorDrop';
  const senderName = process.env.MAIL_FROM_NAME || process.env.BREVO_FROM_NAME || 'DoorDrop';
  const senderEmail = process.env.MAIL_FROM_EMAIL || process.env.BREVO_FROM_EMAIL || 'info@doordrop.lat';
  const logoUrl = emailLogoUrlFromBrand(brand);
  const user = await getShipmentCustomer(shipment);
  const lang = normalizeMailLanguage(options.lang || detectCustomerEmailLanguage(user));
  const copy = CANCELLATION_EMAIL_COPY[lang] || CANCELLATION_EMAIL_COPY.es;
  const trackingCode = shipment?.tracking_code || shipment?.provider_shipment_code || shipment?.id || '';
  const ticketUrl = `${appBaseUrl()}/panel/tickets`;
  const walletUrl = `${appBaseUrl()}/panel/billing`;
  const amountText = `${Number(cancellation?.amount || 0).toFixed(2)} ${String(cancellation?.currency || 'EUR').toUpperCase()}`;

  const isInternal = eventCode === 'cancellation_request_internal';
  const toEmail = isInternal
    ? (process.env.CANCELLATION_REVIEW_EMAIL || process.env.ADMIN_EMAIL || senderEmail)
    : shipmentRecipientEmail(shipment, user);
  if (!toEmail) return { sent: false, reason: 'no_recipient' };

  let subject = copy.request_customer_subject;
  let title = copy.request_customer_title;
  let body = copy.request_customer_body;
  let primaryLabel = copy.viewTicket;
  let primaryUrl = ticketUrl;

  if (isInternal) {
    subject = `${copy.request_internal_subject} - ${trackingCode}`;
    title = copy.request_internal_title;
    body = copy.request_internal_body;
  } else if (eventCode === 'cancellation_approved_refunded') {
    subject = `${copy.approved_subject} - ${trackingCode}`;
    title = copy.approved_title;
    body = copy.approved_body;
    primaryLabel = copy.viewWallet;
    primaryUrl = walletUrl;
  } else if (eventCode === 'cancellation_rejected') {
    subject = `${copy.rejected_subject} - ${trackingCode}`;
    title = copy.rejected_title;
    body = copy.rejected_body;
  } else {
    subject = `${copy.request_customer_subject} - ${trackingCode}`;
  }

  const note = options.adminNote ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:16px;margin:0 0 18px;color:#9a3412"><strong>${String(options.adminNote).replace(/</g, '&lt;')}</strong></div>` : '';
  const htmlContent = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#0f172a"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;padding:28px 0"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:white;border-radius:22px;overflow:hidden;border:1px solid #e2e8f0"><tr><td style="padding:28px 30px;border-bottom:1px solid #eef2f7"><img src="${logoUrl}" alt="${brandName}" style="max-height:42px;max-width:180px;vertical-align:middle"><strong style="font-size:20px;margin-left:10px;vertical-align:middle">${brandName}</strong></td></tr><tr><td style="padding:32px 30px"><p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#2563eb;font-weight:800;margin:0 0 12px">${trackingCode}</p><h1 style="font-size:28px;line-height:1.2;margin:0 0 12px;color:#0f172a">${title}</h1><p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 18px">${body}</p><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:18px;margin:0 0 18px"><strong>${amountText}</strong><br><span style="color:#64748b;font-size:14px">${trackingCode}</span></div>${note}<a href="${primaryUrl}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:800">${primaryLabel}</a></td></tr><tr><td style="padding:20px 30px;background:#0f172a;color:#cbd5e1;font-size:12px">${brandName} · ${senderEmail}</td></tr></table></td></tr></table></body></html>`;

  const payload = { sender: { name: senderName, email: senderEmail }, to: [{ email: toEmail, name: isInternal ? 'DoorDrop Operaciones' : (user?.name || undefined) }], subject, htmlContent, tags: ['cancellation', eventCode] };
  const logId = await logEmail({ shipment_id: shipment.id, user_id: shipment.user_id, to_email: toEmail, subject, language: lang, event_code: eventCode, status: 'pending', provider_code: shipment.provider_code, payload_json: { trackingCode, amountText, ticketUrl } });
  try {
    const headers: any = { 'Content-Type': 'application/json', 'api-key': apiKey };
    if (String(process.env.BREVO_SANDBOX_MODE || '').toLowerCase() === 'true') headers['X-Sib-Sandbox'] = 'drop';
    const response = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers, body: JSON.stringify(payload) });
    const data: any = await response.json().catch(async () => ({ raw: await response.text() }));
    const messageId = data?.messageId || data?.message_id || '';
    await logEmail({ id: logId, shipment_id: shipment.id, user_id: shipment.user_id, to_email: toEmail, subject, language: lang, event_code: eventCode, status: response.ok ? 'sent' : 'failed', provider_code: shipment.provider_code, message_id: messageId, error_message: response.ok ? null : (data?.message || data?.error || 'No se pudo enviar la notificación.'), payload_json: { response: data, trackingCode, amountText }, sent_at: response.ok ? new Date().toISOString().slice(0,19).replace('T',' ') : null });
    return { sent: response.ok, messageId, status: response.status };
  } catch (e: any) {
    await logEmail({ id: logId, shipment_id: shipment.id, user_id: shipment.user_id, to_email: toEmail, subject, language: lang, event_code: eventCode, status: 'failed', provider_code: shipment.provider_code, error_message: e?.message || 'No se pudo enviar la notificación.', payload_json: { trackingCode, amountText } });
    return { sent: false, reason: e?.message || 'send_failed' };
  }
}

async function attachCancellationRequestsToTickets(ticketsList: any[]) {
  if (!ticketsList.length) return ticketsList;
  const ids = ticketsList.map((t: any) => t.id);
  const placeholders = ids.map(() => '?').join(',');
  const [rows]: any = await pool.query(`SELECT * FROM cancellation_requests WHERE ticket_id IN (${placeholders})`, ids);
  const byTicket = new Map(rows.map((r: any) => [r.ticket_id, r]));
  return ticketsList.map((ticket: any) => ({ ...ticket, cancellationRequest: byTicket.get(ticket.id) || null }));
}

async function createTrackingEventOnce(event: any) {
  const eventTime = event.event_time || new Date().toISOString().slice(0, 19).replace('T', ' ');
  const description = event.description || event.status_label || event.status || 'Actualizado';
  const [existing]: any = await pool.query(
    `SELECT id FROM tracking_events WHERE shipment_id = ? AND COALESCE(status_code,'') = COALESCE(?, '') AND event_time = ? AND COALESCE(description,'') = COALESCE(?, '') LIMIT 1`,
    [event.shipment_id, event.status_code || event.status || null, eventTime, description]
  );
  if (existing.length) return false;
  await TrackingEventRepo.create({ ...event, description, event_time: eventTime });
  return true;
}

async function updateShipmentOperationalStatus(shipment: any, mapped: any, description?: string, eventTime?: string) {
  const oldStatus = String(shipment.status || '');
  const oldLabel = String(shipment.status_label || '');
  const newStatus = mapped.status || oldStatus || 'enviado_proveedor';
  const label = mapped.label || oldLabel || 'Actualizado';
  const trackingCode = shipment.provider_tracking_code || shipment.tracking_code || shipment.provider_shipment_code || shipment.id;
  const changed = Boolean(newStatus && (newStatus !== oldStatus || label !== oldLabel));

  await pool.query(
    `UPDATE shipments SET status = ?, status_label = ?, last_provider_attempt_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [newStatus, label, shipment.id]
  ).catch(async () => {
    await pool.query(`UPDATE shipments SET status = ?, status_label = ?, updated_at = NOW() WHERE id = ?`, [newStatus, label, shipment.id]);
  });

  await createTrackingEventOnce({
    shipment_id: shipment.id,
    tracking_code: trackingCode,
    status: newStatus,
    status_code: mapped.code || newStatus,
    status_label: label,
    description: description || label,
    event_time: eventTime
  }).catch(() => null);

  if (changed) {
    await sendShipmentStatusEmail({ ...shipment, status: newStatus, status_label: label, tracking_code: trackingCode }, newStatus, label, description || label).catch(() => null);
  }
  return changed;
}

async function markProviderStatusSyncAttempt(shipmentId: string, message = '') {
  await pool.query(`UPDATE shipments SET last_provider_attempt_at = NOW(), label_error = COALESCE(NULLIF(?, ''), label_error), updated_at = NOW() WHERE id = ?`, [message || '', shipmentId]).catch(() => null);
}

function normalizeProviderEventTime(value: any): string | undefined {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 19).replace('T', ' ');
  return raw.replace('T', ' ').slice(0, 19);
}

function parseJsonSafe(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

function maskSecret(value: any): string {
  const text = String(value || '').trim();
  if (!text) return '';
  const suffix = text.slice(-4);
  return `••••••••••${suffix}`;
}

function sanitizeProviderPayload(payload: any): any {
  if (payload === null || payload === undefined) return payload;
  if (Array.isArray(payload)) return payload.map(sanitizeProviderPayload);
  if (typeof payload !== 'object') return payload;

  const result: any = {};
  for (const [key, value] of Object.entries(payload)) {
    const lower = key.toLowerCase();
    if (lower.includes('token') || lower.includes('secret') || lower.includes('password') || lower.includes('credential') || lower.includes('apikey') || lower.includes('key_value')) {
      result[key] = value ? maskSecret(value) : value;
    } else {
      result[key] = sanitizeProviderPayload(value);
    }
  }
  return result;
}

async function writeProviderLog(providerCode: string, actionType: string, requestPayload: any, responsePayload: any, httpStatus?: number) {
  try {
    await pool.query(
      `INSERT INTO provider_logs (id, provider_code, action_type, request_payload, response_payload, http_status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        generateId('log_'),
        providerCode,
        actionType,
        JSON.stringify(sanitizeProviderPayload(requestPayload || {})),
        JSON.stringify(sanitizeProviderPayload(responsePayload || {})),
        httpStatus || null
      ]
    );
  } catch (e) {
    console.error('[Diagnóstico Interno] No se pudo guardar el registro del proveedor.');
  }
}

function safeAddressName(addr: any, fallback: string) {
  const raw = String(addr?.name || addr?.full_name || fallback || '').trim().replace(/\s+/g, ' ');
  if (!raw) return fallback;
  const parts = raw.split(' ').filter(Boolean);
  if (parts.length >= 2) return raw.slice(0, 80);
  return `${raw} ${raw}`.slice(0, 80);
}

function safePabcPhone(value: any) {
  const raw = String(value || '').trim();
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  return `${hasPlus ? '+' : ''}${digits}`.slice(0, 30);
}

function compactText(value: any, max = 40) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isValidEmailForProvider(value: any) {
  const email = compactText(value || '', 120).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function providerFallbackEmail(...values: any[]) {
  for (const value of values) {
    const email = isValidEmailForProvider(value);
    if (email) return email;
  }
  return process.env.SHIP24GO_DEFAULT_CONTACT_EMAIL || process.env.PUBLIC_SUPPORT_EMAIL || 'help@doordrop.lat';
}

function ship24goProviderContactEmail() {
  return isValidEmailForProvider(process.env.SHIP24GO_PROVIDER_CONTACT_EMAIL || process.env.PROVIDER_CONTACT_EMAIL || 'help@doordrop.lat') || 'help@doordrop.lat';
}

function normalizeShipmentPartyEmail(party: any, fallbackEmail: string) {
  return {
    ...(party || {}),
    email: providerFallbackEmail(party?.email, fallbackEmail)
  };
}

function buildAddressLine1(addr: any) {
  const raw = compactText(addr?.addressLine1 || addr?.address || '', 70);
  const civic = compactText(addr?.civicNumber || addr?.streetNumber || addr?.numeroCivico || '', 12);
  if (!raw) return '';
  if (civic && !new RegExp(`(?:^|\\s)${civic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s|,)`).test(raw)) {
    return compactText(`${raw} ${civic}`, 40);
  }
  return compactText(raw, 40);
}

function buildCustomerAddressPayload(addr: any) {
  return {
    ...addr,
    addressLine1: buildAddressLine1(addr),
    addressLine2: compactText(addr?.addressLine2 || '', 30),
    civicNumber: compactText(addr?.civicNumber || addr?.streetNumber || addr?.numeroCivico || '', 12),
    formattedAddress: compactText(addr?.formattedAddress || '', 255),
    googlePlaceId: compactText(addr?.googlePlaceId || '', 191),
    phone: safePabcPhone(addr?.phone || ''),
  };
}

function providerConfig(provider: any): any {
  return parseJsonSafe(provider?.config_json);
}

function providerSecret(providerCode: string, provider: any, keys: any): string {
  const cfg = providerConfig(provider);

  if (providerCode === 'spediamopro') {
    const credentials = spediamoProCredentials(provider, keys);
    return credentials ? credentials.authCode : '';
  }
  if (providerCode === 'parcelabc') {
    return String(cfg.authToken || cfg.token || cfg.apiKey || keys?.parcelAbc || '').trim();
  }
  if (providerCode === 'genei') {
    const envUser = String(process.env.GENEI_V1_USER || '').trim();
    const envPass = String(process.env.GENEI_V1_PASSWORD || '').trim();
    if (geneiApiMode(provider) === 'v1' && envUser && envPass) return `${envUser}:${envPass}`;
    return String(cfg.credential || cfg.token || cfg.apiKey || keys?.genei || '').trim();
  }
  if (providerCode === 'paccofacile') {
    const credentials = paccofacileCredentials(provider, keys);
    return credentials ? credentials.token : '';
  }
  if (providerCode === 'spedirepro') {
    const credentials = spedireProCredentials(provider, keys);
    return credentials ? credentials.apiKey : '';
  }
  if (providerCode === 'easypost') {
    const credentials = easyPostCredentials(provider, keys);
    return credentials ? credentials.apiKey : '';
  }
  return String(cfg.authToken || cfg.token || cfg.apiKey || '').trim();
}

function providerBaseUrl(provider: any, fallback: string): string {
  const cfg = providerConfig(provider);
  const url = String(cfg.baseUrl || '').trim();
  return url || fallback;
}

function providerBrand(provider: any): any {
  const cfg = providerConfig(provider);
  return {
    providerColor: cfg.primaryColor || cfg.color || '#2563eb',
    providerSecondaryColor: cfg.secondaryColor || '#06b6d4',
    providerLogo: cfg.logoUrl || cfg.logo || '',
    maxResults: Math.max(1, Math.min(10, Number(cfg.maxResults || 10))),
    priority: Number(cfg.priority || 100),
    manifestAuto: Boolean(cfg.manifestAuto)
  };
}

function roundMoney(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function calculateProviderPrice(provider: any, providerCost: number) {
  const cfg = providerConfig(provider);
  const marginPercent = Number(provider?.margin_percent ?? cfg.marginPercent ?? DOORDROP_PROVIDER_MARGIN_PERCENT);
  const fixedMargin = Number(cfg.fixedMargin || 0);
  const minimumMargin = Number(cfg.minimumMargin || 0);
  const percentMargin = Number(providerCost || 0) * (marginPercent / 100);
  const marginAmount = Math.max(percentMargin + fixedMargin, minimumMargin);
  return {
    providerCost: roundMoney(providerCost),
    marginAmount: roundMoney(marginAmount),
    customerPrice: roundMoney(Number(providerCost || 0) + marginAmount)
  };
}

function mapAdminProvider(provider: any) {
  const cfg = providerConfig(provider);
  const safeConfig = { ...cfg };
  ['authToken', 'token', 'apiKey', 'authCode', 'credential', 'clientSecret', 'password', 'accessToken'].forEach((field) => {
    if (safeConfig[field]) safeConfig[field] = maskSecret(safeConfig[field]);
  });
  const balanceInfo = (provider as any)._balanceInfo || null;
  return {
    id: provider.id,
    code: provider.code,
    name: provider.name,
    margin: Number(provider.margin_percent),
    margin_percent: Number(provider.margin_percent),
    currency: provider.currency || cfg.currency || 'EUR',
    is_active: Boolean(provider.is_active),
    is_connected: Boolean(provider.is_connected),
    last_connection_status: provider.last_connection_status,
    last_connection_message: provider.last_connection_message,
    last_tested_at: provider.last_tested_at,
    config: safeConfig,
    balance: balanceInfo,
    providerBalance: balanceInfo
  };
}

async function callProviderCreate(args: {
  providerCode: string;
  quote: any;
  shipmentId: string;
  sender: any;
  recipient: any;
  packages: any[];
  customs?: any[];
  content?: string;
  reference?: string;
  declaredValue?: number;
  exportReason?: string;
  termsOfTrade?: string;
  manifest?: number;
  services?: any;
  keys: any;
}) {
  const { providerCode, quote, shipmentId, sender, recipient, packages, customs, content, reference, declaredValue, exportReason, termsOfTrade, manifest, services, keys } = args;
  const result: any = {
    success: false,
    errorMessage: 'Proveedor no disponible todavía.',
    providerShipmentCode: '',
    providerTracking: '',
    trackingCode: `S24G-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
    labelUrl: '',
    paymentUrl: '',
    trackUrl: '',
    status: 'draft',
    statusLabel: 'Borrador',
    providerPackages: packages,
    providerPayload: null
  };

  
  // --- Conector internacional suspendido ---
  if (String(providerCode || '').toLowerCase() === 'logihub_intl') {
    const dbProvider = await ProviderRepo.getByCode('logihub_intl');
    const credentials = logihubIntlCredentials(dbProvider, keys);
    if (!credentials) {
      result.errorMessage = 'Conector internacional no configurado. Revisa la credencial en Proveedores.';
      return result;
    }
    if (!credentials.allowRealBuy) {
      result.errorMessage = 'Conector internacional conectado. Activa la emisión real para emitir etiquetas.';
      result.providerPayload = { apiMode: 'logihub_intl_v2', buyEnabled: false };
      return result;
    }

    const quoteEnvelope = parseJsonSafe(quote.provider_payload_json);
    const raw = quoteEnvelope?.raw || quoteEnvelope || {};
    const serviceLevel = String(
      quoteEnvelope?.service_level ||
      raw?.service?.code ||
      quote.service_id ||
      'international_priority'
    );
    const quoteIdLh = String(quoteEnvelope?.quote_id || raw?.quote_id || '').trim();
    const pkg0 = (packages && packages[0]) || { width: 10, height: 10, length: 10, weight: 1, qty: 1 };
    const totalWeight = (packages || []).reduce((s: number, p: any) => s + Number(p.weight || 0) * Number(p.qty || 1), 0) || Number(pkg0.weight || 1);
    const pieces = (packages || []).reduce((s: number, p: any) => s + Number(p.qty || 1), 0) || 1;

    const destCountry = String(quote.dest_country || recipient?.country || 'US').toUpperCase().slice(0, 2);
    const createBody: any = {
      quote_id: quoteIdLh || undefined,
      dest_country: destCountry,
      dest_state: String(recipient?.province || recipient?.state || recipient?.region || '').slice(0, 80),
      dest_city: String(recipient?.city || '').slice(0, 120),
      dest_zip: String(recipient?.zipCode || recipient?.zip || recipient?.post_code || quote.dest_zip || '').slice(0, 32),
      receiver_name: String(recipient?.name || recipient?.full_name || 'Destinatario').slice(0, 180),
      receiver_phone: String(recipient?.phone || '').slice(0, 40),
      receiver_email: String(recipient?.email || '').slice(0, 180),
      receiver_address: String(recipient?.address || recipient?.addressLine1 || '').slice(0, 250),
      receiver_lat: recipient?.lat ? Number(recipient.lat) : undefined,
      receiver_lng: recipient?.lng ? Number(recipient.lng) : undefined,
      sender_name: String(sender?.name || sender?.full_name || '').slice(0, 180) || undefined,
      sender_phone: String(sender?.phone || '').slice(0, 40) || undefined,
      sender_province: String(sender?.province || sender?.state || '').slice(0, 80) || undefined,
      sender_city: String(sender?.city || '').slice(0, 120) || undefined,
      sender_address: String(sender?.address || sender?.addressLine1 || '').slice(0, 250) || undefined,
      weight_kg: Number(totalWeight) || 1,
      length_cm: Number(pkg0.length || 10),
      width_cm: Number(pkg0.width || 10),
      height_cm: Number(pkg0.height || 10),
      pieces,
      service_level: serviceLevel,
      declared_value: Number(declaredValue || 50),
      notes: String(content || reference || '').slice(0, 250) || undefined,
    };

    if (!createBody.quote_id) {
      const qReq = {
        dest_country: destCountry,
        service_level: serviceLevel,
        weight_kg: createBody.weight_kg,
        length_cm: createBody.length_cm,
        width_cm: createBody.width_cm,
        height_cm: createBody.height_cm,
        pieces,
      };
      const qRes = await callLogihubIntl(dbProvider, keys, 'POST', '/internacional/quote.php', qReq);
      await writeProviderLog('logihub_intl', 're_quote_before_create', qReq, qRes.response, qRes.httpStatus);
      if (qRes.response?.quote_id) createBody.quote_id = qRes.response.quote_id;
    }

    const created = await callLogihubIntl(dbProvider, keys, 'POST', '/internacional/create.php', createBody);
    await writeProviderLog('logihub_intl', 'create', { shipmentId, createBody }, created.response, created.httpStatus);

    if (!created.response?.ok && created.httpStatus >= 400) {
      result.errorMessage = created.response?.message || 'No se pudo crear el envío con el conector internacional. Revisa el saldo y los datos del destinatario.';
      result.providerPayload = { create: created.response, apiMode: 'logihub_intl_v2' };
      return result;
    }

    const tracking = String(
      created.response?.tracking ||
      created.response?.tracking_number ||
      created.response?.data?.tracking ||
      created.response?.shipment?.tracking ||
      ''
    );
    let labelUrl = String(
      created.response?.label_url ||
      created.response?.label_4x6_url ||
      created.response?.data?.label_url ||
      ''
    );

    if (tracking && !labelUrl) {
      const lab = await callLogihubIntl(dbProvider, keys, 'GET', `/internacional/label.php?tracking=${encodeURIComponent(tracking)}`);
      labelUrl = String(lab.response?.label_url || lab.response?.label_4x6_url || lab.response?.data?.label_url || '');
      await writeProviderLog('logihub_intl', 'label_fetch', { shipmentId, tracking }, lab.response, lab.httpStatus);
    }

    const logo = logihubIntlConfig(dbProvider).logoUrl;
    result.success = true;
    result.errorMessage = '';
    result.providerShipmentCode = String(created.response?.shipment_id || created.response?.id || tracking || shipmentId);
    result.providerTracking = tracking;
    result.trackingCode = tracking || result.trackingCode;
    result.labelUrl = labelUrl;
    result.trackUrl = tracking ? `https://my.logihub.tech/tracking/${encodeURIComponent(tracking)}` : '';
    result.status = labelUrl ? 'tramitado' : 'pending_label';
    result.statusLabel = labelUrl ? 'Etiqueta lista' : 'Etiqueta en preparación';
    result.providerPackages = packages.map((pkg: any) => ({ ...pkg, customs: Array.isArray(customs) ? customs : [] }));
    result.providerPayload = {
      create: created.response,
      apiMode: 'logihub_intl_v2',
      service_level: serviceLevel,
      logo_url: logo,
      quote_id: createBody.quote_id,
    };
    return result;
  }


  if (providerCode === 'spedirepro') {
    const dbProvider = await ProviderRepo.getByCode('spedirepro');
    const credentials = spedireProCredentials(dbProvider, keys);
    if (!credentials) {
      result.errorMessage = 'Proveedor no disponible todavía.';
      return result;
    }
    if (!spedireProAllowRealBuy(dbProvider)) {
      result.errorMessage = 'La red logística está conectada. Falta activar la compra real para emitir etiquetas.';
      result.providerPayload = { apiMode: 'spedirepro_v1', buyEnabled: false };
      return result;
    }

    const providerContactEmail = ship24goProviderContactEmail();
    const quoteEnvelope = parseJsonSafe(quote.provider_payload_json);
    const quoteRaw = quoteEnvelope?.raw || quoteEnvelope || {};
    const selectedOffer = quoteRaw?.selectedService || quoteRaw;
    const senderForProvider = buildCustomerAddressPayload(sender || {});
    const recipientForProvider = buildCustomerAddressPayload(recipient || {});
    const requestPayload: any = {
      merchant_reference: compactText(reference || shipmentId, 80),
      include_return_label: false,
      include_price: true,
      book_pickup: false,
      courier_fallback: true,
      courier: String(quote.service_id || selectedOffer?.id || selectedOffer?.courier || '').trim(),
      sender: buildSpedireProAddress(senderForProvider, quote, quote.origin_country || senderForProvider?.country || 'IT', quote.origin_zip || senderForProvider?.zipCode || '', providerContactEmail),
      receiver: buildSpedireProAddress(recipientForProvider, quote, quote.dest_country || recipientForProvider?.country || 'IT', quote.dest_zip || recipientForProvider?.zipCode || '', providerContactEmail),
      packages: buildSpedireProPackages(packages),
      addons: [],
      content: { description: compactText(content || 'Merce', 80), amount: Number(declaredValue || 49.99) }
    };

    const senderDrop = sanitizeSpedireProDropPoint(services?.drops?.sender);
    const receiverDrop = sanitizeSpedireProDropPoint(services?.drops?.receiver);
    const departureType = String(selectedOffer?.departure_type || quoteRaw?.departureType || '').toLowerCase();
    const arrivalType = String(selectedOffer?.arrival_type || quoteRaw?.arrivalType || '').toLowerCase();
    if (departureType === 'point' && !senderDrop) {
      result.errorMessage = 'Selecciona un punto de recogida para continuar.';
      result.providerPayload = { apiMode: 'spedirepro_v1', courier: requestPayload.courier, servicesRequired: { sender: true, receiver: arrivalType === 'point' } };
      return result;
    }
    if (arrivalType === 'point' && !receiverDrop) {
      result.errorMessage = 'Selecciona un punto de entrega para continuar.';
      result.providerPayload = { apiMode: 'spedirepro_v1', courier: requestPayload.courier, servicesRequired: { sender: departureType === 'point', receiver: true } };
      return result;
    }
    if (senderDrop || receiverDrop) {
      requestPayload.services = { drops: { ...(senderDrop ? { sender: senderDrop } : {}), ...(receiverDrop ? { receiver: receiverDrop } : {}) } };
    }

    const created = await callSpedirePro(dbProvider, keys, 'POST', 'v1/create-label', requestPayload);
    const createData = created.response;
    await writeProviderLog('spedirepro', 'create_label', { shipmentId, courier: requestPayload.courier, merchant_reference: requestPayload.merchant_reference }, createData, created.httpStatus);
    if (!spedireProIsOk(created.httpStatus, createData) || !createData?.order) {
      result.errorMessage = spedireProMessage(createData, 'No se pudo preparar el envío con la red logística.');
      result.providerPayload = { create: createData, apiMode: 'spedirepro_v1' };
      return result;
    }

    const detail = await callSpedirePro(dbProvider, keys, 'POST', 'v1/shipment', { reference: shipmentId });
    let detailData = detail.response;
    if (!spedireProIsOk(detail.httpStatus, detailData)) {
      const byOrder = await callSpedirePro(dbProvider, keys, 'POST', 'v1/shipment', { reference: createData.order });
      detailData = byOrder.response;
      await writeProviderLog('spedirepro', 'shipment_detail', { shipmentId, reference: createData.order }, { httpStatus: byOrder.httpStatus, hasTracking: Boolean(spedireProExtractTracking(detailData)) }, byOrder.httpStatus);
    } else {
      await writeProviderLog('spedirepro', 'shipment_detail', { shipmentId, reference: shipmentId }, { httpStatus: detail.httpStatus, hasTracking: Boolean(spedireProExtractTracking(detailData)) }, detail.httpStatus);
    }

    let labelUrl = spedireProExtractLabelUrl(detailData);

    const providerReference = spedireProExtractReference(detailData) || createData.order || shipmentId;
    const labelReferences = Array.from(new Set([providerReference, createData.order, shipmentId].filter(Boolean).map((value: any) => String(value))));
    let labelData: any = null;
    for (const labelReference of labelReferences) {
      const label = await callSpedirePro(dbProvider, keys, 'POST', 'v1/get-label', { reference: labelReference });
      labelData = label.response;
      const currentLabelUrl = spedireProExtractLabelUrl(labelData);
      await writeProviderLog('spedirepro', 'label_fetch', { shipmentId, reference: labelReference }, { httpStatus: label.httpStatus, hasUrl: Boolean(currentLabelUrl) }, label.httpStatus);
      if (currentLabelUrl) {
        labelUrl = currentLabelUrl;
        break;
      }
    }

    const trackingNumber = spedireProExtractTracking(detailData) || providerReference;
    const rawStatus = detailData?.status || (labelUrl ? 'B' : 'O');
    const mapped = mapSpedireProStatus(rawStatus, labelUrl ? 'Etiqueta lista' : 'Etiqueta en preparación');
    result.success = true;
    result.errorMessage = '';
    result.providerShipmentCode = providerReference;
    result.providerTracking = trackingNumber;
    result.trackingCode = trackingNumber || providerReference || result.trackingCode;
    result.labelUrl = labelUrl;
    result.trackUrl = detailData?.tracking_url || (trackingNumber ? `https://www.spedire.com/tracking/${encodeURIComponent(providerReference || trackingNumber)}` : '');
    result.status = labelUrl ? 'tramitado' : mapped.status;
    result.statusLabel = labelUrl ? 'Etiqueta lista' : mapped.label;
    result.providerPackages = packages.map((pkg: any) => ({ ...pkg, customs: Array.isArray(customs) ? customs : [] }));
    result.providerPayload = { create: createData, detail: detailData, label: labelUrl ? { hasUrl: true } : labelData, apiMode: 'spedirepro_v1', courier: requestPayload.courier, services: requestPayload.services || null };
    return result;
  }

  if (providerCode === 'spediamopro') {
    const dbProvider = await ProviderRepo.getByCode('spediamopro');
    const credentials = spediamoProCredentials(dbProvider, keys);
    if (!credentials) {
      result.errorMessage = 'Proveedor no disponible todavía.';
      return result;
    }
    if (!spediamoProAllowRealBuy(dbProvider)) {
      result.errorMessage = 'La red logística está conectada. Falta activar la emisión real para preparar etiquetas.';
      result.providerPayload = { apiMode: 'spediamopro_v2', buyEnabled: false };
      return result;
    }

    const providerContactEmail = ship24goProviderContactEmail();
    const quoteEnvelope = parseJsonSafe(quote.provider_payload_json);
    const quoteRaw = quoteEnvelope?.raw || quoteEnvelope || {};
    const selectedOffer = quoteRaw?.selectedService || quoteRaw;
    const courierCode = String(selectedOffer?.courierService?.courier || selectedOffer?.courier || '').toLowerCase();
    const pointTypes = spediamoProServicePointTypes(selectedOffer);
    const senderDrop = sanitizeSpedireProDropPoint(services?.drops?.sender);
    const receiverDrop = sanitizeSpedireProDropPoint(services?.drops?.receiver);
    if (pointTypes.departure === 'point' && !senderDrop) {
      result.errorMessage = 'Selecciona un punto de recogida para continuar.';
      result.providerPayload = { apiMode: 'spediamopro_v2', servicesRequired: { sender: true, receiver: pointTypes.arrival === 'point' } };
      return result;
    }
    if (pointTypes.arrival === 'point' && !receiverDrop) {
      result.errorMessage = 'Selecciona un punto de entrega para continuar.';
      result.providerPayload = { apiMode: 'spediamopro_v2', servicesRequired: { sender: pointTypes.departure === 'point', receiver: true } };
      return result;
    }

    const senderForProvider = buildCustomerAddressPayload(sender || {});
    const recipientForProvider = buildCustomerAddressPayload(recipient || {});
    const requestPayload: any = {
      parcels: buildSpediamoProParcels(packages),
      sender: buildSpediamoProShipmentContact(senderForProvider, quote, quote.origin_country || senderForProvider?.country || 'IT', quote.origin_zip || senderForProvider?.zipCode || '', providerContactEmail),
      consignee: buildSpediamoProShipmentContact(recipientForProvider, quote, quote.dest_country || recipientForProvider?.country || 'IT', quote.dest_zip || recipientForProvider?.zipCode || '', providerContactEmail),
      quotation: normalizeSpediamoProQuotationForAccept(selectedOffer),
      labelFormat: courierCode === 'ups' ? 1 : 0,
      documents: null,
      consigneeNote: compactText(recipientForProvider?.observations || recipientForProvider?.note || '', 70) || null,
      externalId: compactText(shipmentId, 64),
      externalReference: compactText(reference || shipmentId, 64)
    };
    if (pointTypes.arrival === 'point' && receiverDrop?.PointID) requestPayload.deliveryPudo = compactText(receiverDrop.PointID, 16);

    const accepted = await callSpediamoPro(dbProvider, keys, 'POST', 'quotations/accept', requestPayload);
    const shipmentData = accepted.response?.data || accepted.response || {};
    await writeProviderLog('spediamopro', 'quotation_accept', { shipmentId, service: requestPayload.quotation?.service, courier: courierCode, deliveryPudo: requestPayload.deliveryPudo || null }, { httpStatus: accepted.httpStatus, processId: accepted.response?.processId, shipmentId: shipmentData?.id, code: shipmentData?.code }, accepted.httpStatus);
    if (!spediamoProIsOk(accepted.httpStatus, accepted.response) || !shipmentData?.id) {
      result.errorMessage = spediamoProMessage(accepted.response, 'No se pudo preparar el envío con la red logística.');
      result.providerPayload = { accept: accepted.response, apiMode: 'spediamopro_v2', services: { drops: { ...(senderDrop ? { sender: senderDrop } : {}), ...(receiverDrop ? { receiver: receiverDrop } : {}) } } };
      return result;
    }

    let trackingData: any = null;
    try {
      const tracking = await callSpediamoPro(dbProvider, keys, 'GET', `shipments/${encodeURIComponent(shipmentData.id)}/tracking`);
      trackingData = tracking.response?.data || tracking.response || null;
      await writeProviderLog('spediamopro', 'tracking_fetch', { shipmentId, providerShipmentId: shipmentData.id }, { httpStatus: tracking.httpStatus, status: trackingData?.status, hasTracking: Boolean(trackingData?.trackingCode) }, tracking.httpStatus);
    } catch (e: any) {
      await writeProviderLog('spediamopro', 'tracking_fetch_failed', { shipmentId, providerShipmentId: shipmentData.id }, { message: e?.message || 'Seguimiento pendiente' }, 0);
    }

    const label = await downloadSpediamoProFile(dbProvider, keys, `shipments/${encodeURIComponent(shipmentData.id)}/labels`);
    await writeProviderLog('spediamopro', 'label_download', { shipmentId, providerShipmentId: shipmentData.id }, { httpStatus: label.httpStatus, contentType: label.contentType, hasLabel: Boolean(label.base64), filename: label.filename }, label.httpStatus);

    const trackingNumber = trackingData?.trackingCode || shipmentData?.trackingCode || shipmentData?.secondaryTrackingCode || shipmentData?.code || String(shipmentData.id);
    const mapped = mapSpediamoProStatus(trackingData?.status ?? shipmentData?.status, label.base64 ? 'Etiqueta lista' : 'Etiqueta en preparación');
    result.success = true;
    result.errorMessage = '';
    result.providerShipmentCode = String(shipmentData.id);
    result.providerTracking = trackingNumber;
    result.trackingCode = trackingNumber || shipmentData?.code || result.trackingCode;
    result.labelBase64 = label.base64 || '';
    result.labelUrl = '';
    result.trackUrl = trackingData?.url || shipmentData?.trackingUrl || '';
    result.status = label.base64 ? 'tramitado' : mapped.status;
    result.statusLabel = label.base64 ? 'Etiqueta lista' : mapped.label;
    result.providerPackages = packages.map((pkg: any) => ({ ...pkg, customs: Array.isArray(customs) ? customs : [] }));
    result.providerPayload = { accept: shipmentData, tracking: trackingData, label: { hasBase64: Boolean(label.base64), filename: label.filename, contentType: label.contentType }, apiMode: 'spediamopro_v2', courier: courierCode, services: { drops: { ...(senderDrop ? { sender: senderDrop } : {}), ...(receiverDrop ? { receiver: receiverDrop } : {}) } } };
    return result;
  }

  if (providerCode === 'easypost') {
    const dbProvider = await ProviderRepo.getByCode('easypost');
    const credentials = easyPostCredentials(dbProvider, keys);
    if (!credentials) {
      result.errorMessage = 'Proveedor no disponible todavía.';
      return result;
    }
    if (!easyPostCanGenerateLabel(dbProvider)) {
      result.errorMessage = easyPostIsTestMode(dbProvider)
        ? 'La red logística está conectada. Falta activar la emisión de etiquetas de prueba.'
        : 'La red logística está conectada. Falta activar la emisión en producción.';
      result.providerPayload = { apiMode: 'easypost_v2', buyEnabled: false, testMode: easyPostIsTestMode(dbProvider) };
      result.nonBillable = true;
      return result;
    }
    const providerContactEmail = ship24goProviderContactEmail();
    const quoteEnvelope = parseJsonSafe(quote.provider_payload_json);
    const quoteRaw = quoteEnvelope?.raw || quoteEnvelope || {};
    const selectedRate = quoteRaw?.selectedRate || quoteRaw?.rate || quoteRaw;
    const quoteShipment = quoteRaw?.shipment || quoteRaw?.selectedShipment || null;
    const senderForProvider = buildCustomerAddressPayload(sender || {});
    const recipientForProvider = buildCustomerAddressPayload(recipient || {});
    let shipmentData: any = quoteShipment;
    if (!shipmentData?.id) {
      const shipmentPayload: any = {
        shipment: {
          from_address: buildEasyPostAddress(senderForProvider, quote.origin_country || senderForProvider?.country || 'US', quote.origin_zip || senderForProvider?.zipCode || '', providerContactEmail),
          to_address: buildEasyPostAddress(recipientForProvider, quote.dest_country || recipientForProvider?.country || 'US', quote.dest_zip || recipientForProvider?.zipCode || '', providerContactEmail),
          parcel: buildEasyPostParcel(consolidatePackagesForSingleParcel(packages || [])),
          reference: compactText(reference || shipmentId, 80),
          options: { label_format: 'PDF' }
        }
      };
      const created = await callEasyPost(dbProvider, keys, 'POST', 'shipments', shipmentPayload);
      shipmentData = created.response;
      await writeProviderLog('easypost', 'shipment_create_for_buy', { shipmentId, reference: shipmentPayload.shipment.reference }, { httpStatus: created.httpStatus, shipmentId: shipmentData?.id, rates: shipmentData?.rates?.length || 0 }, created.httpStatus);
      if (!easyPostIsOk(created.httpStatus, created.response) || !shipmentData?.id) {
        result.errorMessage = easyPostMessage(created.response, 'No se pudo preparar el envío con la red logística.');
        result.providerPayload = { create: created.response, apiMode: 'easypost_v2' };
        return result;
      }
    }
    const rateId = selectedRate?.id || selectedRate?.rate?.id || (Array.isArray(shipmentData?.rates) ? shipmentData.rates[0]?.id : '');
    if (!rateId) {
      result.errorMessage = 'No hay una tarifa disponible para completar este envío.';
      result.providerPayload = { shipment: shipmentData, selectedRate, apiMode: 'easypost_v2' };
      return result;
    }
    const buyPayload = { rate: { id: rateId } };
    const bought = await callEasyPost(dbProvider, keys, 'POST', `shipments/${encodeURIComponent(String(shipmentData.id))}/buy`, buyPayload);
    const buyData = bought.response;
    await writeProviderLog('easypost', 'shipment_buy', { shipmentId, providerShipmentId: shipmentData.id, rateId }, { httpStatus: bought.httpStatus, trackingCode: buyData?.tracking_code, label: Boolean(buyData?.postage_label?.label_url) }, bought.httpStatus);
    if (!easyPostIsOk(bought.httpStatus, buyData) || !buyData?.id) {
      result.errorMessage = easyPostMessage(buyData, 'No se pudo preparar el envío con la red logística.');
      result.providerPayload = { buy: buyData, shipment: shipmentData, apiMode: 'easypost_v2' };
      return result;
    }
    const mapped = easyPostStatusMap(buyData?.tracker?.status || buyData?.status);
    result.success = true;
    result.errorMessage = '';
    result.providerShipmentCode = String(buyData.id || shipmentData.id || '');
    result.providerTracking = String(buyData.tracking_code || buyData.tracker?.tracking_code || '');
    result.trackingCode = result.providerTracking || result.providerShipmentCode || result.trackingCode;
    result.trackUrl = buyData.tracker?.public_url || buyData.tracker?.tracking_url || '';
    result.labelUrl = buyData.postage_label?.label_url || buyData.postage_label?.label_pdf_url || '';
    result.status = result.labelUrl ? 'tramitado' : 'pending_label';
    result.statusLabel = result.labelUrl ? 'Tramitado' : 'Etiqueta en preparación';
    result.providerPackages = packages.map((pkg: any) => ({ ...pkg, customs: Array.isArray(customs) ? customs : [] }));
    result.providerPayload = { shipment: buyData, selectedRate, apiMode: 'easypost_v2', carrier: easyPostCarrierName(selectedRate || buyData?.selected_rate), rateId };
    return result;
  }


  if (providerCode === 'parcelabc') {
    const dbProvider = await ProviderRepo.getByCode('parcelabc');
    const authToken = providerSecret('parcelabc', dbProvider, keys);
    if (!authToken) {
      result.errorMessage = 'Proveedor no disponible todavía.';
      return result;
    }

    const pabcManifest = manifest !== undefined ? Number(manifest) : (providerBrand(dbProvider).manifestAuto ? 1 : 0);
    const isInternational = (sender?.country || 'ES') !== (recipient?.country || 'ES');
    // Physical pieces after qty expansion
    const physicalPieces = totalShipmentPieces(packages);
    // ParcelABC international customs historically flaky with many package *lines*; keep lines but never drop silent weight.
    let finalPackages = packages;
    if (isInternational && Array.isArray(packages) && packages.length > 1) {
      // Merge into one line with total weight so customs API accepts (was: silent first package only — lost weight)
      const totalW = totalShipmentWeightKg(packages);
      const first = packages[0] || {};
      finalPackages = [{
        ...first,
        weight: totalW,
        width: Math.max(...packages.map((p: any) => Number(p.width || 10))),
        height: Math.max(...packages.map((p: any) => Number(p.height || 10))),
        length: Math.max(...packages.map((p: any) => Number(p.length || 10))),
        qty: physicalPieces,
      }];
    }
    const pabcPackages = finalPackages.map((pkg: any) => {
      const payload: any = {
        width: Math.round(Number(pkg.width || pkg.width_cm || 10)),
        height: Math.round(Number(pkg.height || pkg.height_cm || 10)),
        length: Math.round(Number(pkg.length || pkg.length_cm || 10)),
        weight: Number(pkg.weight || pkg.weight_kg || 1).toString(),
        qty: Number(pkg.qty || pkg.quantity || 1)
      };
      if (isInternational && Array.isArray(customs) && customs.length > 0) {
        payload.customs = customs.map((item: any) => ({
          description: item.description || 'Goods',
          origin: item.origin || sender?.country || 'ES',
          quantity: Number(item.quantity || 1),
          weight: Number(item.weight || pkg.weight || 1).toString(),
          value: Number(item.value || declaredValue || 10).toString(),
          itemhscode: item.hsCode || item.itemhscode || '',
          itemsku: item.sku || item.itemsku || '',
          export_reason: item.exportReason || exportReason || 'Sale',
          terms_of_trade: item.termsOfTrade || termsOfTrade || 'DAP'
        }));
      }
      return payload;
    });

    const senderForProvider = buildCustomerAddressPayload(sender || {});
    const recipientForProvider = buildCustomerAddressPayload(recipient || {});
    const requestPayload = {
      authToken,
      manifest: pabcManifest,
      orderNumber: shipmentId,
      orderCurrency: quote.currency || 'EUR',
      orderValue: Number(declaredValue || 10),
      reference: reference || '',
      content: compactText(content || 'General goods', 150),
      serviceId: quote.service_id ? Number(quote.service_id) : undefined,
      recipient: {
        countryCode: recipientForProvider?.country || 'ES',
        full_name: safeAddressName(recipientForProvider, 'Recipient Name'),
        company: compactText(recipientForProvider?.company || '', 80),
        email: ship24goProviderContactEmail(),
        addressLine1: recipientForProvider.addressLine1,
        addressLine2: recipientForProvider.addressLine2,
        post_code: compactText(recipientForProvider?.zipCode || recipientForProvider?.post_code || '', 30),
        city: compactText(recipientForProvider?.city || '', 80),
        phone: recipientForProvider.phone,
        observations: compactText(recipientForProvider?.observations || '', 120)
      },
      sender: {
        countryCode: senderForProvider?.country || 'ES',
        full_name: safeAddressName(senderForProvider, 'Sender Name'),
        company: compactText(senderForProvider?.company || '', 80),
        email: ship24goProviderContactEmail(),
        addressLine1: senderForProvider.addressLine1,
        addressLine2: senderForProvider.addressLine2,
        post_code: compactText(senderForProvider?.zipCode || senderForProvider?.post_code || '', 30),
        city: compactText(senderForProvider?.city || '', 80),
        phone: senderForProvider.phone,
        observations: compactText(senderForProvider?.observations || '', 120)
      },
      packages: pabcPackages
    };

    console.log('[Proveedor] Creando orden en ParcelABC...');
    const response = await fetch(`${providerBaseUrl(dbProvider, 'https://www.parcelabc.com/api-pabc.php')}/order/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });
    const data = await response.json().catch(async () => ({ status: false, errorMessage: await response.text() }));
    await writeProviderLog('parcelabc', 'order_create', { orderNumber: shipmentId, serviceId: quote.service_id, manifest: pabcManifest }, data, response.status);

    if (data?.status || data?.parcelCode) {
      const firstPkg = data.packages?.[0] || {};
      const labelUrl = firstPkg.labelUrl || data.labelUrl || '';
      result.success = true;
      result.errorMessage = data?.status ? '' : (data?.errorMessage || 'Etiqueta en preparación.');
      result.providerShipmentCode = data.parcelCode || '';
      result.providerTracking = firstPkg.finalMile || data.parcelCode || '';
      result.trackingCode = data.parcelCode || result.trackingCode;
      result.labelUrl = labelUrl;
      result.trackUrl = data.parcelTrackUrl || (data.parcelCode ? `https://www.parcelabc.com/track/${data.parcelCode}` : '');
      result.status = pabcManifest === 1
        ? (labelUrl ? 'tramitado' : 'pending_label')
        : 'pending_customer_balance';
      result.statusLabel = pabcManifest === 1
        ? (labelUrl ? 'Tramitado' : 'Etiqueta en preparación')
        : 'Pendiente de saldo';
      result.providerPackages = packages.map((pkg, idx) => ({
        ...pkg,
        packageCode: data.packages?.[idx]?.packageCode || '',
        manifestReference: data.packages?.[idx]?.manifestReference || '',
        finalMile: data.packages?.[idx]?.finalMile || '',
        finalMileUrl: data.packages?.[idx]?.finalMileUrl || '',
        labelUrl: data.packages?.[idx]?.labelUrl || '',
        providerPayload: data.packages?.[idx] || null,
        customs: Array.isArray(customs) ? customs : []
      }));
      result.providerPayload = data;
    } else {
      result.errorMessage = data?.errorMessage || 'Etiqueta en preparación.';
      result.providerPayload = data;
    }
    return result;
  }


  if (providerCode === 'paccofacile') {
    const dbProvider = await ProviderRepo.getByCode('paccofacile');
    const credentials = paccofacileCredentials(dbProvider, keys);
    if (!credentials) {
      result.errorMessage = 'Proveedor no disponible todavía.';
      return result;
    }

    const providerContactEmail = ship24goProviderContactEmail();
    const quoteEnvelope = parseJsonSafe(quote.provider_payload_json);
    const quoteRaw = quoteEnvelope?.raw || quoteEnvelope || {};
    const quoteLocalities = quoteRaw?.ship24goLocalities || {};
    const senderForProvider = buildCustomerAddressPayload(sender || {});
    const recipientForProvider = buildCustomerAddressPayload(recipient || {});
    const pickupLocality = await lookupPaccofacileLocality(dbProvider, keys, senderForProvider?.country || quote.origin_country || 'IT', senderForProvider?.zipCode || senderForProvider?.post_code || quote.origin_zip || '', senderForProvider?.city || '') || quoteLocalities.pickup;
    const destinationLocality = await lookupPaccofacileLocality(dbProvider, keys, recipientForProvider?.country || quote.dest_country || 'IT', recipientForProvider?.zipCode || recipientForProvider?.post_code || quote.dest_zip || '', recipientForProvider?.city || '') || quoteLocalities.destination;
    if (!pickupLocality || !destinationLocality) {
      result.errorMessage = 'Verifica la localidad de origen y destino antes de continuar.';
      return result;
    }

    const selectedOffer = quoteRaw?.selectedService || quoteRaw;
    const allowBuy = paccofacileCanBuy(dbProvider);
    const requestPayload: any = {
      shipment_service: {
        pickup_date: selectedOffer?.pickup_date?.first_date || nextBusinessDateIso(2),
        pickup_range: selectedOffer?.pickup_date?.first_date_range || 'AM',
        service_id: Number(quote.service_id || selectedOffer?.service_id || 0),
        parcels: buildPaccofacileParcels(packages),
        accessories: [],
        package_content_type: compactText((content || '').toLowerCase().includes('document') ? 'DOCUMENTS' : 'GOODS', 20)
      },
      pickup: buildPaccofacileAddress(senderForProvider, quote, pickupLocality, 'pickup', providerContactEmail),
      destination: buildPaccofacileAddress(recipientForProvider, quote, destinationLocality, 'destination', providerContactEmail),
      additional_information: {
        reference: compactText(reference || shipmentId, 80),
        note: compactText((recipient as any)?.observations || '', 180),
        content: compactText(content || 'Merce', 180)
      }
    };

    console.log('[Proveedor] Guardando envío en Paccofacile...');
    const saved = await callPaccofacile(dbProvider, keys, 'POST', 'service/shipment/save', requestPayload);
    const saveData = saved.response;
    await writeProviderLog('paccofacile', 'shipment_save', { shipmentId, serviceId: requestPayload.shipment_service.service_id, safeMode: !allowBuy }, saveData, saved.httpStatus);

    if (!paccofacileIsSuccess(saveData)) {
      result.errorMessage = paccofacileMessage(saveData, 'No se pudo preparar el envío con la red logística.');
      result.providerPayload = { save: saveData, apiMode: 'paccofacile_v1', mode: paccofacileMode(dbProvider) };
      return result;
    }

    const savePayload = saveData?.data?.shipment || saveData?.data?.data || saveData?.data || saveData;
    const paccofacileShipmentId = String(savePayload?.shipment_id || savePayload?.id || savePayload?.shipmentId || savePayload?.shipment?.shipment_id || '').trim();
    if (!paccofacileShipmentId) {
      result.errorMessage = 'El envío fue recibido, pero falta confirmación logística.';
      result.providerPayload = { save: saveData, apiMode: 'paccofacile_v1', mode: paccofacileMode(dbProvider) };
      return result;
    }

    let buyData: any = null;
    let labelData: any = null;
    let labelBase64 = '';
    let trackingNumber = '';
    let detailData: any = null;

    // Paccofacile usa el mismo flujo comercial que los demás: primero se guarda el envío,
    // luego Preparar/cron compra, reintenta etiqueta y actualiza tracking.
    // Esto evita botones separados y evita cargos antes de guardar el movimiento interno.
    if (!allowBuy) {
      result.errorMessage = paccofacileBuyBlockedMessage(dbProvider);
    }

    const detail = await callPaccofacile(dbProvider, keys, 'GET', `service/shipment/${encodeURIComponent(paccofacileShipmentId)}`);
    detailData = detail.response;
    await writeProviderLog('paccofacile', 'shipment_detail', { shipmentId, providerShipmentId: paccofacileShipmentId }, { status: detailData?.header?.status }, detail.httpStatus);
    trackingNumber = paccofacileExtractTrackingNumber(detailData);

    result.success = true;
    result.errorMessage = '';
    result.providerShipmentCode = paccofacileShipmentId;
    result.providerTracking = trackingNumber || paccofacileShipmentId;
    result.trackingCode = trackingNumber || `PF-${paccofacileShipmentId}`;
    result.trackUrl = '';
    result.labelBase64 = labelBase64;
    result.labelUrl = '';
    result.status = labelBase64 ? 'tramitado' : 'pending_label';
    result.statusLabel = labelBase64 ? 'Tramitado' : 'Etiqueta en preparación';
    result.providerPackages = packages.map((pkg: any) => ({ ...pkg, customs: Array.isArray(customs) ? customs : [] }));
    result.providerPayload = { save: saveData, buy: buyData, detail: detailData, label: labelData ? { header: labelData.header, hasContent: Boolean(labelBase64), format: labelData?.data?.format || labelData?.format || 'pdf' } : null, apiMode: 'paccofacile_v1', mode: paccofacileMode(dbProvider), buyEnabled: allowBuy };
    result.nonBillable = !allowBuy;
    return result;
  }

  if (providerCode === 'genei') {
    const dbProvider = await ProviderRepo.getByCode('genei');
    if (geneiApiMode(dbProvider) === 'v1') {
      const credentials = geneiV1Credentials(dbProvider, keys);
      if (!credentials) {
        result.errorMessage = 'Proveedor no disponible todavía.';
        return result;
      }

      const createFunction = geneiV1CreateFunction(dbProvider);
      const isSandbox = createFunction !== 'crear_envio';
      const providerContactEmail = ship24goProviderContactEmail();
      const quoteEnvelope = parseJsonSafe(quote.provider_payload_json);
      const quoteRaw = quoteEnvelope?.raw || quoteEnvelope || {};
      const senderForProvider = buildCustomerAddressPayload(sender || {});
      const recipientForProvider = buildCustomerAddressPayload(recipient || {});
      const referenceCode = compactText(reference || shipmentId, 60);
      const senderDrop = geneiDropOfficePayload(services?.drops?.sender);
      const receiverDrop = geneiDropOfficePayload(services?.drops?.receiver);
      const quotePointTypes = { departure: String(quoteRaw?.departureType || quoteRaw?.departure_type || '').toLowerCase(), arrival: String(quoteRaw?.arrivalType || quoteRaw?.arrival_type || '').toLowerCase() };
      if (quotePointTypes.departure === 'point' && !senderDrop) {
        result.errorMessage = 'Selecciona un punto de recogida para continuar.';
        result.providerPayload = { apiMode: 'v1', servicesRequired: { sender: true, receiver: quotePointTypes.arrival === 'point' } };
        return result;
      }
      if (quotePointTypes.arrival === 'point' && !receiverDrop) {
        result.errorMessage = 'Selecciona un punto de entrega para continuar.';
        result.providerPayload = { apiMode: 'v1', servicesRequired: { sender: quotePointTypes.departure === 'point', receiver: true } };
        return result;
      }

      const requestPayload: any = {
        array_bultos: buildGeneiV1Packages(packages, customs, content, declaredValue),
        valor_mercancia: Number(declaredValue || quoteRaw.valor_mercancia || 15),
        contenido_envio: compactText(content || 'Ropa', 80),
        contrareembolso: 0,
        cantidad_reembolso: 0,
        seguro: 0,
        dia_laborable_automatico: 1,
        importe_seguro: 0,
        dropshipping: 0,
        codigos_origen: compactText(senderForProvider?.zipCode || senderForProvider?.post_code || quote.origin_zip || '', 30),
        poblacion_salida: compactText(senderForProvider?.city || quoteRaw?.datos_vista?.poblacion_salida || '', 80).toUpperCase(),
        iso_pais_salida: compactText(senderForProvider?.country || quote.origin_country || 'ES', 2).toUpperCase(),
        direccion_salida: compactText(senderForProvider?.addressLine1 || '', 120),
        email_salida: providerContactEmail,
        nombre_salida: safeAddressName(senderForProvider, 'DoorDrop Operaciones'),
        telefono_salida: safeGeneiPhone(senderForProvider?.phone),
        codigos_destino: compactText(recipientForProvider?.zipCode || recipientForProvider?.post_code || quote.dest_zip || '', 30),
        poblacion_llegada: compactText(recipientForProvider?.city || quoteRaw?.datos_vista?.poblacion_entrega || '', 80).toUpperCase(),
        iso_pais_llegada: compactText(recipientForProvider?.country || quote.dest_country || 'ES', 2).toUpperCase(),
        direccion_llegada: compactText(recipientForProvider?.addressLine1 || '', 120),
        telefono_llegada: safeGeneiPhone(recipientForProvider?.phone),
        email_llegada: providerContactEmail,
        nombre_llegada: safeAddressName(recipientForProvider, 'Cliente DoorDrop'),
        dni_llegada: compactText((recipient as any)?.dni || (recipient as any)?.document || '', 30),
        observaciones_salida: referenceCode,
        contacto_salida: 'DoorDrop',
        observaciones_llegada: referenceCode,
        contacto_llegada: 'Cliente DoorDrop',
        codigo_mercancia: compactText((customs as any)?.[0]?.codigoMercancia || (customs as any)?.[0]?.codigo_mercancia || '183', 20),
        recoger_tienda: senderDrop ? '1' : '0',
        cod_promo: '',
        fecha_recogida: nextBusinessDateEs(2),
        hora_recogida_desde: '10:30',
        hora_recogida_hasta: '18:00',
        unidad_correo: receiverDrop?.id_oficina || senderDrop?.id_oficina || null,
        id_oficina_salida: senderDrop?.id_oficina || null,
        id_oficina_entrega: receiverDrop?.id_oficina || null,
        select_oficinas_destino: receiverDrop?.id_oficina || null,
        nombre_drop: receiverDrop?.nombre || senderDrop?.nombre || null,
        pais_drop: receiverDrop?.pais || senderDrop?.pais || null,
        cp_drop: receiverDrop?.cp || senderDrop?.cp || null,
        prov_drop: receiverDrop?.provincia || senderDrop?.provincia || null,
        pob_drop: receiverDrop?.poblacion || senderDrop?.poblacion || null,
        dir_drop: receiverDrop?.direccion || senderDrop?.direccion || null,
        tel_drop: receiverDrop?.telefono || senderDrop?.telefono || null,
        email_drop: receiverDrop?.email || senderDrop?.email || null,
        codigo_envio_servicio: shipmentId,
        id_agencia: String(quote.service_id || quoteRaw.id_agencia || ''),
        cn: 280,
        ship24go_safe_mode: isSandbox ? 1 : 0
      };

      console.log('[Proveedor] Creando orden en Genei V1...');
      const { httpStatus, response: data } = await callGeneiV1(dbProvider, keys, createFunction, requestPayload);
      await writeProviderLog('genei', createFunction, {
        codigo_envio_servicio: shipmentId,
        id_agencia: requestPayload.id_agencia,
        safeMode: isSandbox
      }, data, httpStatus);

      if (String(data?.resultado) === '1' || data?.codigo_envio) {
        const codigoEnvio = String(data.codigo_envio || data.codigo_envio_plataforma || shipmentId);
        const mapped = mapGeneiStatus(data.estado, isSandbox ? 'Prueba segura' : 'Creado');
        result.success = true;
        result.errorMessage = '';
        result.providerShipmentCode = codigoEnvio;
        result.providerTracking = codigoEnvio;
        result.trackingCode = codigoEnvio === 'FICTICIO' ? result.trackingCode : codigoEnvio;
        result.trackUrl = '';
        result.labelUrl = absoluteGeneiV1LabelUrl(data.url_etiqueta || data.labelUrl || '', dbProvider);
        result.status = isSandbox ? 'pending_label' : mapped.status;
        result.statusLabel = isSandbox ? 'Prueba segura' : mapped.label;
        result.providerPackages = packages.map((pkg: any) => ({ ...pkg, customs: Array.isArray(customs) ? customs : [] }));
        result.providerPayload = { ...data, apiMode: 'v1', safeMode: isSandbox, createFunction, services: { drops: { ...(senderDrop ? { sender: senderDrop } : {}), ...(receiverDrop ? { receiver: receiverDrop } : {}) } } };
        result.nonBillable = isSandbox;
      } else {
        result.errorMessage = data?.resultado_text || data?.message || data?.errorMessage || 'No se pudo completar la operación con el proveedor.';
        result.providerPayload = { ...data, apiMode: 'v1', safeMode: isSandbox, createFunction };
      }
      return result;
    }

    if (!keys?.genei) {
      result.errorMessage = 'Proveedor no disponible todavía.';
      return result;
    }

    const appUrl = (process.env.APP_URL || 'https://doordrop.lat').replace(/\/$/, '');
    const token = await getGeneiToken(keys.genei);
    const senderDrop = geneiDropOfficePayload(services?.drops?.sender);
    const receiverDrop = geneiDropOfficePayload(services?.drops?.receiver);
    const quoteEnvelope = parseJsonSafe(quote.provider_payload_json);
    const quoteRaw = quoteEnvelope?.raw || quoteEnvelope || {};
    const quotePointTypes = { departure: String(quoteRaw?.departureType || quoteRaw?.departure_type || '').toLowerCase(), arrival: String(quoteRaw?.arrivalType || quoteRaw?.arrival_type || '').toLowerCase() };
    if (quotePointTypes.departure === 'point' && !senderDrop) {
      result.errorMessage = 'Selecciona un punto de recogida para continuar.';
      result.providerPayload = { apiMode: 'v2', servicesRequired: { sender: true, receiver: quotePointTypes.arrival === 'point' } };
      return result;
    }
    if (quotePointTypes.arrival === 'point' && !receiverDrop) {
      result.errorMessage = 'Selecciona un punto de entrega para continuar.';
      result.providerPayload = { apiMode: 'v2', servicesRequired: { sender: quotePointTypes.departure === 'point', receiver: true } };
      return result;
    }

    const requestPayload: any = {
      agency_id: Number(quote.service_id),
      notificationUrl: `${appUrl}/api/webhooks/genei`,
      sender: {
        name: safeAddressName(sender, 'Sender Name'),
        email: ship24goProviderContactEmail(),
        phone: sender?.phone || '',
        street: sender?.addressLine1 || sender?.address || '',
        zip: sender?.zipCode || sender?.post_code || '',
        city: sender?.city || '',
        country: sender?.country || 'ES'
      },
      recipient: {
        name: safeAddressName(recipient, 'Recipient Name'),
        email: ship24goProviderContactEmail(),
        phone: recipient?.phone || '',
        street: recipient?.addressLine1 || recipient?.address || '',
        zip: recipient?.zipCode || recipient?.post_code || '',
        city: recipient?.city || '',
        country: recipient?.country || 'ES'
      },
      packagesArray: packages.map((pkg: any) => ({
        weight: Number(pkg.weight || pkg.weight_kg || 1),
        width: Number(pkg.width || pkg.width_cm || 10),
        height: Number(pkg.height || pkg.height_cm || 10),
        length: Number(pkg.length || pkg.length_cm || 10)
      }))
    };
    if (senderDrop || receiverDrop) {
      requestPayload.services = { drops: { ...(senderDrop ? { sender: senderDrop } : {}), ...(receiverDrop ? { receiver: receiverDrop } : {}) } };
      if (senderDrop?.id_oficina) requestPayload.id_oficina_salida = senderDrop.id_oficina;
      if (receiverDrop?.id_oficina) requestPayload.id_oficina_entrega = receiverDrop.id_oficina;
      if (receiverDrop?.id_oficina) requestPayload.select_oficinas_destino = receiverDrop.id_oficina;
    }

    console.log('[Proveedor] Creando orden en Genei...');
    const response = await fetch('https://apiv2.genei.es/api/v2/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(requestPayload)
    });
    const data = await response.json().catch(async () => ({ status: false, message: await response.text() }));
    await writeProviderLog('genei', 'order_create', { serviceId: quote.service_id }, data, response.status);

    if (response.ok && data && (data.status === 1 || data.status === true || data.codigo_envio || data.data?.codigo_envio)) {
      const payload = data.data || data;
      result.success = true;
      result.errorMessage = '';
      result.providerShipmentCode = payload.codigo_envio || payload.shipmentCode || '';
      result.providerTracking = payload.codigo_seguimiento || payload.trackingCode || result.providerShipmentCode;
      result.trackingCode = result.providerTracking || result.providerShipmentCode || result.trackingCode;
      result.paymentUrl = payload.paymentUrl || payload.payment_url || '';
      result.labelUrl = payload.labelUrl || payload.etiqueta || '';
      result.trackUrl = payload.web_seguimiento || '';
      const mapped = mapGeneiStatus(payload.estado, 'Creado');
      result.status = mapped.status;
      result.statusLabel = mapped.label;
      result.providerPackages = packages.map((pkg: any) => ({ ...pkg, customs: Array.isArray(customs) ? customs : [] }));
      result.providerPayload = { ...data, services: requestPayload.services || null };
    } else {
      result.errorMessage = data?.message || data?.errorMessage || 'No se pudo completar la operación con el proveedor.';
      result.providerPayload = data;
    }
    return result;
  }

  return result;
}


function shipmentHasLabel(shipment: any): boolean {
  return Boolean(shipment?.label_base64 || shipment?.label_url);
}

function isShipmentEditableBeforeLabel(shipment: any): boolean {
  const status = String(shipment?.status || '').toLowerCase();
  return !shipmentHasLabel(shipment) && ['draft', 'pending_provider', 'provider_error', 'pending_label', 'pending_customer_balance'].includes(status);
}


function createLabelAccessToken(shipment: any): string {
  const seed = `${shipment?.id || ''}:${shipment?.user_id || ''}:${shipment?.created_at || ''}`;
  return crypto.createHmac('sha256', JWT_SECRET).update(seed).digest('hex').slice(0, 48);
}

function labelFileUrlForShipment(shipment: any): string {
  const token = createLabelAccessToken(shipment);
  return `/api/shipments/${shipment.id}/label/file?lt=${token}`;
}

function isValidLabelAccessToken(shipment: any, token: any): boolean {
  const provided = String(token || '').trim();
  if (!provided) return false;
  const expected = createLabelAccessToken(shipment);
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

function cronKeyFromSettings(settings: any): string {
  const cron = settings?.cron || {};
  const savedKey = String(cron.labelCronKey || cron.secret || '').trim();
  if (savedKey) return savedKey;
  return crypto.createHash('sha256').update(String(process.env.CRON_SECRET || JWT_SECRET || 'ship24go')).digest('hex').slice(0, 40);
}

async function getCronKey(): Promise<string> {
  const settings = await AdminSettingsRepo.get().catch(() => ({}));
  return cronKeyFromSettings(settings);
}

async function ensureShipmentJob(shipmentId: string, userId: string, jobType = 'provider_create', status = 'pending', message = '') {
  try {
    const [existing]: any = await pool.query(
      `SELECT id FROM shipment_processing_jobs WHERE shipment_id = ? AND job_type = ? AND status IN ('pending','running') LIMIT 1`,
      [shipmentId, jobType]
    );
    if (existing.length > 0) return existing[0].id;
    const id = generateId('job_');
    await pool.query(
      `INSERT INTO shipment_processing_jobs (id, shipment_id, user_id, job_type, status, last_message, next_run_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [id, shipmentId, userId, jobType, status, message || 'Pendiente de preparación']
    );
    return id;
  } catch (e) {
    await writeProviderLog('ship24go', 'job_create_failed', { shipmentId, jobType }, { message: 'No se pudo registrar la preparación automática.' }, 0);
    return null;
  }
}

async function markShipmentJob(shipmentId: string, jobType: string, status: string, message = '') {
  try {
    await pool.query(
      `UPDATE shipment_processing_jobs
       SET status = ?, attempts = attempts + IF(? = 'running', 1, 0), last_message = ?, updated_at = NOW(), locked_until = NULL,
           next_run_at = CASE WHEN ? IN ('pending','running') THEN DATE_ADD(NOW(), INTERVAL 5 MINUTE) ELSE next_run_at END
       WHERE shipment_id = ? AND job_type = ? AND status IN ('pending','running')`,
      [status, status, message || null, status, shipmentId, jobType]
    );
  } catch {}
}

async function cacheShipmentLabelFromSource(shipment: any, labelUrl?: string, labelBase64?: string) {
  let finalBase64 = labelBase64 || shipment?.label_base64 || '';
  let finalUrl = labelUrl || shipment?.label_url || '';
  let format = 'pdf';

  if (!finalBase64 && finalUrl && /^https?:\/\//i.test(finalUrl)) {
    try {
      const response = await fetch(finalUrl, { headers: { 'User-Agent': 'Ship24goLabelCache/1.0' } });
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length <= 10 * 1024 * 1024) {
          finalBase64 = buffer.toString('base64');
          if (contentType.includes('png')) format = 'png';
          else if (contentType.includes('jpeg') || contentType.includes('jpg')) format = 'jpg';
          else format = 'pdf';
        }
      }
    } catch (e: any) {
      await writeProviderLog(String(shipment?.provider_code || 'ship24go'), 'label_cache_pending', { shipmentId: shipment?.id }, { message: e?.message || 'Etiqueta pendiente' }, 0);
    }
  }

  if (finalBase64 || finalUrl) {
    await pool.query(
      `UPDATE shipments SET label_url = COALESCE(?, label_url), label_base64 = COALESCE(?, label_base64), label_status = ?, updated_at = NOW() WHERE id = ?`,
      [finalUrl || null, finalBase64 || null, finalBase64 ? 'stored' : 'available', shipment.id]
    );
    await pool.query(
      `INSERT INTO shipment_labels (id, shipment_id, format, label_url, label_base64)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label_url = VALUES(label_url), label_base64 = COALESCE(VALUES(label_base64), label_base64)`,
      [generateId('lbl_'), shipment.id, format, finalUrl || null, finalBase64 || null]
    ).catch(async () => {
      await pool.query(
        `INSERT INTO shipment_labels (id, shipment_id, format, label_url, label_base64)
         VALUES (?, ?, ?, ?, ?)`,
        [generateId('lbl_'), shipment.id, format, finalUrl || null, finalBase64 || null]
      ).catch(() => {});
    });
  }

  return { labelUrl: finalUrl, labelBase64: finalBase64, stored: Boolean(finalBase64) };
}

async function fetchProviderLabelForShipment(shipment: any) {
  if (shipment.label_base64) return { labelBase64: shipment.label_base64, labelUrl: shipment.label_url || '', stored: true };
  const keys = await ApiKeysRepo.get();
  let labelUrl = shipment.label_url || '';
  let labelBase64 = '';

  if (!labelUrl) {
    const [pkgRows]: any = await pool.query('SELECT label_url FROM shipment_packages WHERE shipment_id = ? AND label_url IS NOT NULL AND label_url <> "" LIMIT 1', [shipment.id]);
    labelUrl = pkgRows?.[0]?.label_url || '';
  }

  if (shipment.provider_code === 'genei' && shipment.provider_shipment_code) {
    try {
      const dbProvider = await ProviderRepo.getByCode('genei');
      if (geneiApiMode(dbProvider) === 'v1') {
        const { httpStatus, response: data } = await callGeneiV1(dbProvider, keys, 'obtener_codigo_envio', {
          codigo_envio_plataforma: shipment.provider_shipment_code
        });
        labelUrl = absoluteGeneiV1LabelUrl(data?.url_etiqueta || data?.etiqueta || data?.labelUrl || '', dbProvider) || labelUrl;
        labelBase64 = data?.base64_etiqueta || data?.labelBase64 || data?.base64 || '';
        const mapped = mapGeneiStatus(data?.estado, data?.nombre_estado || 'Actualizado');
        if (data?.codigo_envio || data?.estado) {
          await pool.query(
            `UPDATE shipments SET provider_tracking_code = COALESCE(?, provider_tracking_code), track_url = COALESCE(?, track_url), status = IF(status IN ('pending_label','pending_provider','pendiente_tramitar','tramitado'), ?, status), status_label = IF(status_label IN ('Etiqueta en preparación','Preparando etiqueta','Pendiente de tramitación','Tramitado'), ?, status_label), provider_payload_json = COALESCE(?, provider_payload_json), updated_at = NOW() WHERE id = ?`,
            [data?.seguimiento || data?.codigo_seguimiento || null, data?.web_seguimiento || null, mapped.status, mapped.label, JSON.stringify(data || {}), shipment.id]
          ).catch(() => {});
        }
        await writeProviderLog('genei', 'label_fetch_v1', { shipmentId: shipment.id }, { status: data?.estado, hasLabel: Boolean(labelUrl || labelBase64) }, httpStatus);
      } else if (keys?.genei) {
        const token = await getGeneiToken(keys.genei);
        const response = await fetch(`https://apiv2.genei.es/api/v2/shipments/${encodeURIComponent(shipment.provider_shipment_code)}/label`, {
          method: 'GET', headers: { 'Authorization': `Bearer ${token}` }
        });
        const contentType = response.headers.get('content-type') || '';
        if (response.ok && contentType.includes('application/json')) {
          const data = await response.json();
          labelUrl = data.labelUrl || data.url || data.etiqueta || labelUrl;
          labelBase64 = data.labelBase64 || data.base64 || '';
        } else if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          labelBase64 = buffer.toString('base64');
        }
        await writeProviderLog('genei', 'label_fetch', { shipmentId: shipment.id }, { success: response.ok, contentType }, response.status);
      }
    } catch (e: any) {
      await writeProviderLog('genei', 'label_fetch_failed', { shipmentId: shipment.id }, { message: e?.message || 'Etiqueta pendiente' }, 0);
    }
  }


  if (shipment.provider_code === 'paccofacile' && shipment.provider_shipment_code) {
    try {
      const dbProvider = await ProviderRepo.getByCode('paccofacile');
      const detail = await callPaccofacile(dbProvider, keys, 'GET', `service/shipment/${encodeURIComponent(shipment.provider_shipment_code)}`);
      const detailData = detail.response;
      const trackingNumber = paccofacileExtractTrackingNumber(detailData);
      const rawStatus = paccofacileExtractRawStatus(detailData);
      if (trackingNumber || rawStatus) {
        const mapped = mapPaccofacileStatus(rawStatus, rawStatus || 'Actualizado');
        await pool.query(
          `UPDATE shipments SET provider_tracking_code = COALESCE(?, provider_tracking_code), status = IF(status IN ('pending_label','pending_provider','tramitado'), ?, status), status_label = IF(status_label IN ('Etiqueta en preparación','Preparando etiqueta','Tramitado'), ?, status_label), updated_at = NOW() WHERE id = ?`,
          [trackingNumber || null, mapped.status, mapped.label, shipment.id]
        ).catch(() => {});
      }
      await writeProviderLog('paccofacile', 'shipment_detail', { shipmentId: shipment.id, providerShipmentId: shipment.provider_shipment_code }, { status: detailData?.header?.status, trackingNumber, rawStatus }, detail.httpStatus);

      const label = await callPaccofacile(dbProvider, keys, 'GET', `service/shipment/${encodeURIComponent(shipment.provider_shipment_code)}/label`);
      const data = label.response;
      labelBase64 = paccofacileExtractLabelBase64(data) || labelBase64;
      await writeProviderLog('paccofacile', 'label_fetch', { shipmentId: shipment.id, providerShipmentId: shipment.provider_shipment_code }, { status: data?.header?.status, hasLabel: Boolean(labelBase64), format: paccofacileExtractLabelFormat(data) }, label.httpStatus);
    } catch (e: any) {
      await writeProviderLog('paccofacile', 'label_fetch_failed', { shipmentId: shipment.id }, { message: e?.message || 'Etiqueta pendiente' }, 0);
    }
  }


  if (shipment.provider_code === 'spedirepro' && (shipment.provider_shipment_code || shipment.order_number || shipment.tracking_code)) {
    const reference = shipment.provider_shipment_code || shipment.order_number || shipment.tracking_code || shipment.id;
    try {
      const dbProvider = await ProviderRepo.getByCode('spedirepro');
      const detail = await callSpedirePro(dbProvider, keys, 'POST', 'v1/shipment', { reference });
      const detailData = detail.response;
      const trackingNumber = spedireProExtractTracking(detailData);
      const providerReference = spedireProExtractReference(detailData);
      const rawStatus = detailData?.status;
      if (trackingNumber || providerReference || rawStatus) {
        const mapped = mapSpedireProStatus(rawStatus, rawStatus || 'Actualizado');
        await pool.query(
          `UPDATE shipments SET provider_shipment_code = COALESCE(?, provider_shipment_code), provider_tracking_code = COALESCE(?, provider_tracking_code), status = IF(status IN ('pending_label','pending_provider','tramitado'), ?, status), status_label = IF(status_label IN ('Etiqueta en preparación','Preparando etiqueta','Tramitado'), ?, status_label), updated_at = NOW() WHERE id = ?`,
          [providerReference || null, trackingNumber || null, mapped.status, mapped.label, shipment.id]
        ).catch(() => {});
      }
      labelUrl = spedireProExtractLabelUrl(detailData) || labelUrl;
      await writeProviderLog('spedirepro', 'shipment_detail', { shipmentId: shipment.id, reference }, { status: detailData?.status, trackingNumber, providerReference, hasLabel: Boolean(labelUrl) }, detail.httpStatus);
      const labelReferences = Array.from(new Set([providerReference, reference, shipment.order_number, shipment.tracking_code].filter(Boolean).map((value: any) => String(value))));
      for (const labelReference of labelReferences) {
        const label = await callSpedirePro(dbProvider, keys, 'POST', 'v1/get-label', { reference: labelReference });
        const currentLabelUrl = spedireProExtractLabelUrl(label.response);
        labelUrl = currentLabelUrl || labelUrl;
        await writeProviderLog('spedirepro', 'label_fetch', { shipmentId: shipment.id, reference: labelReference }, { httpStatus: label.httpStatus, hasUrl: Boolean(currentLabelUrl) }, label.httpStatus);
        if (currentLabelUrl) break;
      }
    } catch (e: any) {
      await writeProviderLog('spedirepro', 'label_fetch_failed', { shipmentId: shipment.id, reference }, { message: e?.message || 'Etiqueta pendiente' }, 0);
    }
  }



  if (shipment.provider_code === 'spediamopro' && (shipment.provider_shipment_code || shipment.tracking_code)) {
    const providerShipmentId = shipment.provider_shipment_code || shipment.tracking_code;
    try {
      const dbProvider = await ProviderRepo.getByCode('spediamopro');
      const detail = await callSpediamoPro(dbProvider, keys, 'GET', `shipments/${encodeURIComponent(providerShipmentId)}`);
      const detailData = detail.response?.data || detail.response || {};
      const tracking = await callSpediamoPro(dbProvider, keys, 'GET', `shipments/${encodeURIComponent(providerShipmentId)}/tracking`);
      const trackingData = tracking.response?.data || tracking.response || {};
      const mapped = mapSpediamoProStatus(trackingData?.status ?? detailData?.status, 'Actualizado');
      if (trackingData?.trackingCode || detailData?.trackingCode || trackingData?.status || detailData?.status) {
        await pool.query(
          `UPDATE shipments SET provider_tracking_code = COALESCE(?, provider_tracking_code), track_url = COALESCE(?, track_url), status = IF(status IN ('pending_label','pending_provider','tramitado'), ?, status), status_label = IF(status_label IN ('Etiqueta en preparación','Preparando etiqueta','Tramitado'), ?, status_label), provider_payload_json = COALESCE(?, provider_payload_json), updated_at = NOW() WHERE id = ?`,
          [trackingData?.trackingCode || detailData?.trackingCode || null, trackingData?.url || detailData?.trackingUrl || null, mapped.status, mapped.label, JSON.stringify({ detail: detailData, tracking: trackingData, apiMode: 'spediamopro_v2' }), shipment.id]
        ).catch(() => {});
      }
      await writeProviderLog('spediamopro', 'shipment_detail', { shipmentId: shipment.id, providerShipmentId }, { httpStatus: detail.httpStatus, trackingStatus: trackingData?.status, hasTracking: Boolean(trackingData?.trackingCode) }, detail.httpStatus);
      const label = await downloadSpediamoProFile(dbProvider, keys, `shipments/${encodeURIComponent(providerShipmentId)}/labels`);
      if (label.base64) labelBase64 = label.base64;
      await writeProviderLog('spediamopro', 'label_fetch', { shipmentId: shipment.id, providerShipmentId }, { httpStatus: label.httpStatus, contentType: label.contentType, hasLabel: Boolean(label.base64), filename: label.filename }, label.httpStatus);
    } catch (e: any) {
      await writeProviderLog('spediamopro', 'label_fetch_failed', { shipmentId: shipment.id, providerShipmentId }, { message: e?.message || 'Etiqueta pendiente' }, 0);
    }
  }


  if (shipment.provider_code === 'easypost' && (shipment.provider_shipment_code || shipment.provider_tracking_code || shipment.tracking_code)) {
    try {
      const dbProvider = await ProviderRepo.getByCode('easypost');
      const providerShipmentId = String(shipment.provider_shipment_code || '').trim();
      if (providerShipmentId) {
        const detail = await callEasyPost(dbProvider, keys, 'GET', `shipments/${encodeURIComponent(providerShipmentId)}`);
        const detailData = detail.response || {};
        const mapped = easyPostStatusMap(detailData?.tracker?.status || detailData?.status);
        labelUrl = detailData?.postage_label?.label_url || detailData?.postage_label?.label_pdf_url || labelUrl;
        await pool.query(
          `UPDATE shipments SET provider_tracking_code = COALESCE(?, provider_tracking_code), tracking_code = COALESCE(?, tracking_code), track_url = COALESCE(?, track_url), status = IF(status IN ('pending_label','pending_provider','tramitado'), ?, status), status_label = IF(status_label IN ('Etiqueta en preparación','Preparando etiqueta','Tramitado'), ?, status_label), provider_payload_json = COALESCE(?, provider_payload_json), updated_at = NOW() WHERE id = ?`,
          [detailData?.tracking_code || null, detailData?.tracking_code || null, detailData?.tracker?.public_url || detailData?.tracker?.tracking_url || null, mapped.status, mapped.label, JSON.stringify({ detail: detailData, apiMode: 'easypost_v2' }), shipment.id]
        ).catch(() => {});
        await writeProviderLog('easypost', 'shipment_detail', { shipmentId: shipment.id, providerShipmentId }, { httpStatus: detail.httpStatus, trackingCode: detailData?.tracking_code, hasLabel: Boolean(labelUrl) }, detail.httpStatus);
      }
    } catch (e: any) {
      await writeProviderLog('easypost', 'label_fetch_failed', { shipmentId: shipment.id }, { message: e?.message || 'Etiqueta pendiente' }, 0);
    }
  }

  return cacheShipmentLabelFromSource(shipment, labelUrl, labelBase64);
}

async function loadShipmentForProcessing(shipmentId: string) {
  const [rows]: any = await pool.query(
    `SELECT s.*, q.service_id, q.service_name, q.total_amount, q.currency, q.provider_payload_json AS quote_payload_json,
            q.provider_code AS quote_provider_code, p.id AS db_provider_id, p.code AS db_provider_code, u.email AS user_email
     FROM shipments s
     LEFT JOIN quotes q ON q.id = s.quote_id
     LEFT JOIN providers p ON p.id = q.provider_id
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.id = ? LIMIT 1`,
    [shipmentId]
  );
  return rows[0] || null;
}

async function debitShipmentWalletIfPossible(shipment: any) {
  const amount = roundMoney(Number(shipment.total_amount || 0));
  if (!Number.isFinite(amount) || amount <= 0) return { charged: true, amount: 0 };
  await ensureWalletCurrencySchema();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [already]: any = await conn.query(
      `SELECT id FROM wallet_transactions WHERE user_id = ? AND reference_type = 'shipment' AND reference_id = ? AND type = 'debit' LIMIT 1`,
      [shipment.user_id, shipment.id]
    );
    if (already.length > 0) {
      await conn.commit();
      return { charged: true, amount: 0 };
    }
    const rates = await getFreshRatesInternal();
    let result: any;
    try {
      result = await applyWalletMutation(conn, {
        userId: shipment.user_id,
        type: 'debit',
        amount,
        currency: shipment.currency || 'EUR',
        description: `Cargo por envío ${shipment.tracking_code}`,
        referenceType: 'shipment',
        referenceId: shipment.id,
        rates
      });
    } catch (error: any) {
      if (error?.code === 'WALLET_INSUFFICIENT') {
        await conn.rollback();
        return { charged: false, amount: error.required || amount, balance: error.balance || 0 };
      }
      throw error;
    }
    if (!result) {
      await conn.rollback();
      return { charged: false, amount, balance: 0 };
    }
    await conn.commit();
    return { charged: true, amount: result.walletAmount, currency: result.walletCurrency };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}


async function runPaccofacileBuyAndLabelForShipment(shipmentId: string, actorId?: string) {
  const shipment = await loadShipmentForProcessing(shipmentId);
  if (!shipment) return { success: false, message: 'No hay registros para procesar.' };
  if (String(shipment.provider_code || '').toLowerCase() !== 'paccofacile') {
    return { success: false, message: 'Este envío no pertenece a Paccofacile.' };
  }

  const provider = await ProviderRepo.getByCode('paccofacile');
  const mode = paccofacileMode(provider);
  const buyEnabled = paccofacileCanBuy(provider);
  if (!buyEnabled) {
    await pool.query(
      `UPDATE shipments SET status = 'pending_label', status_label = 'Etiqueta en preparación', label_status = 'pending', label_error = ?, updated_at = NOW() WHERE id = ?`,
      [paccofacileBuyBlockedMessage(provider), shipment.id]
    ).catch(() => {});
    await ensureShipmentJob(shipment.id, shipment.user_id, 'label_fetch', 'pending', 'Etiqueta en preparación.');
    return { success: false, message: paccofacileBuyBlockedMessage(provider), providerShipmentId: String(shipment.provider_shipment_code || '').trim(), labelReady: false };
  }

  const providerShipmentId = String(shipment.provider_shipment_code || '').trim();
  if (!providerShipmentId) {
    return { success: false, message: 'El envío aún no tiene código de prueba de Paccofacile.' };
  }

  const keys = await ApiKeysRepo.get();
  const credentials = paccofacileCredentials(provider, keys);
  if (!credentials) return { success: false, message: 'Credencial privada pendiente.' };

  const amount = Number(shipment.total_amount || 0);
  if (Number.isFinite(amount) && amount > 0) {
    const [alreadyDebit]: any = await pool.query(
      `SELECT id FROM wallet_transactions WHERE user_id = ? AND reference_type = 'shipment' AND reference_id = ? AND type = 'debit' LIMIT 1`,
      [shipment.user_id, shipment.id]
    );
    if (!alreadyDebit.length) {
      const [walletRows]: any = await pool.query('SELECT balance FROM users WHERE id = ? LIMIT 1', [shipment.user_id]);
      const balance = Number(walletRows?.[0]?.balance || 0);
      if (balance < amount) {
        await pool.query(
          `UPDATE shipments SET status = 'pending_customer_balance', status_label = 'Pendiente de saldo', label_status = 'pending', label_error = 'Pendiente de saldo', updated_at = NOW() WHERE id = ?`,
          [shipment.id]
        ).catch(() => {});
        return { success: false, message: 'El cliente no tiene saldo suficiente para completar la prueba.', balance, amount };
      }
    }
  }

  const previousPayload = parseJsonSafe(shipment.provider_payload_json) || {};
  let buyData: any = previousPayload?.buy || null;
  let buyOk = buyData ? paccofacileIsSuccess(buyData) : false;

  if (!buyOk) {
    const buyPayload = paccofacileBuyPayload(providerShipmentId);
    const bought = await callPaccofacile(provider, keys, 'POST', 'service/shipment/buy', buyPayload);
    buyData = bought.response;
    buyOk = paccofacileIsSuccess(buyData);
    await writeProviderLog('paccofacile', mode === 'sandbox' ? 'sandbox_shipment_buy' : 'shipment_buy', { shipmentId: shipment.id, providerShipmentId, actorId, buyPayload }, buyData, bought.httpStatus);

    if (!buyOk) {
      const nextPayload = mergeJsonObjects(previousPayload, { buy: buyData, buyAttempted: true, buyAt: new Date().toISOString() });
      await pool.query(
        `UPDATE shipments SET provider_payload_json = ?, label_status = 'pending', label_error = ?, updated_at = NOW() WHERE id = ?`,
        [JSON.stringify(nextPayload), paccofacileMessage(buyData, 'La etiqueta sigue pendiente de compra.'), shipment.id]
      ).catch(() => {});
      return { success: false, message: paccofacileMessage(buyData, 'La red logística todavía no confirmó la compra.'), providerShipmentId };
    }
  }

  const debit = await debitShipmentWalletIfPossible(shipment);
  if (!debit.charged) {
    return { success: false, message: 'No se pudo descontar el saldo interno del cliente.', amount: debit.amount, balance: debit.balance };
  }

  let detailData: any = null;
  let trackingNumber = '';
  try {
    const detail = await callPaccofacile(provider, keys, 'GET', `service/shipment/${encodeURIComponent(providerShipmentId)}`);
    detailData = detail.response;
    await writeProviderLog('paccofacile', 'shipment_detail', { shipmentId: shipment.id, providerShipmentId }, { status: detailData?.header?.status }, detail.httpStatus);
    trackingNumber = paccofacileExtractTrackingNumber(detailData);
  } catch (e: any) {
    await writeProviderLog('paccofacile', 'shipment_detail_failed', { shipmentId: shipment.id, providerShipmentId }, { message: e?.message || 'Detalle no disponible' }, 0);
  }

  let labelData: any = null;
  let labelBase64 = '';
  let labelFormat = 'pdf';
  const labelAttempts: any[] = [];
  for (let attempt = 1; attempt <= 4; attempt++) {
    const label = await callPaccofacile(provider, keys, 'GET', `service/shipment/${encodeURIComponent(providerShipmentId)}/label`);
    labelData = label.response;
    labelBase64 = paccofacileExtractLabelBase64(labelData);
    labelFormat = paccofacileExtractLabelFormat(labelData);
    labelAttempts.push({ attempt, httpStatus: label.httpStatus, status: labelData?.header?.status, hasLabel: Boolean(labelBase64), message: paccofacileMessage(labelData, '') });
    await writeProviderLog('paccofacile', 'label_fetch', { shipmentId: shipment.id, providerShipmentId, attempt }, { status: labelData?.header?.status, hasLabel: Boolean(labelBase64), format: labelFormat }, label.httpStatus);
    if (labelBase64) break;
    if (attempt < 4) await delay(2500);
  }

  const stored = await cacheShipmentLabelFromSource(shipment, '', labelBase64);
  const nextPayload = mergeJsonObjects(previousPayload, {
    buy: buyData,
    detail: detailData,
    label: labelData ? { header: labelData.header, hasContent: Boolean(labelBase64), format: labelFormat, attempts: labelAttempts } : null,
    buyCompleted: true,
    buyAt: new Date().toISOString(),
    apiMode: 'paccofacile_v1',
    mode,
    buyEnabled
  });

  const finalTracking = trackingNumber || shipment.provider_tracking_code || providerShipmentId;
  await pool.query(
    `UPDATE shipments
     SET provider_tracking_code = COALESCE(?, provider_tracking_code),
         tracking_code = COALESCE(?, tracking_code),
         status = ?,
         status_label = ?,
         label_status = ?,
         label_error = ?,
         provider_payload_json = ?,
         provider_attempts = COALESCE(provider_attempts, 0) + 1,
         last_provider_attempt_at = NOW(),
         updated_at = NOW()
     WHERE id = ?`,
    [
      finalTracking || null,
      finalTracking ? `PF-${providerShipmentId}` : null,
      stored.stored ? 'tramitado' : 'pending_label',
      stored.stored ? 'Tramitado' : 'Compra aceptada, etiqueta en preparación',
      stored.stored ? 'stored' : 'pending',
      stored.stored ? null : 'Etiqueta pendiente de emisión por el operador',
      JSON.stringify(nextPayload),
      shipment.id
    ]
  );

  await TrackingEventRepo.create({
    shipment_id: shipment.id,
    tracking_code: finalTracking ? `PF-${providerShipmentId}` : shipment.tracking_code,
    status: stored.stored ? 'tramitado' : 'pending_label',
    status_label: stored.stored ? 'Tramitado' : 'Compra aceptada, etiqueta en preparación',
    description: stored.stored ? 'Etiqueta generada correctamente.' : 'La compra fue aprobada. La etiqueta puede tardar unos minutos.'
  }).catch(() => null);

  if (stored.stored) {
    await markShipmentJob(shipment.id, 'label_fetch', 'completed', 'Etiqueta disponible.');
    await markShipmentJob(shipment.id, 'provider_create', 'completed', 'Etiqueta disponible.');
  } else {
    await ensureShipmentJob(shipment.id, shipment.user_id, 'label_fetch', 'pending', 'Etiqueta en preparación.');
  }

  return {
    success: true,
    message: stored.stored ? 'Etiqueta generada correctamente.' : 'Compra completada. La etiqueta seguirá en preparación unos minutos.',
    providerShipmentId,
    trackingCode: `PF-${providerShipmentId}`,
    providerTracking: finalTracking,
    debited: debit.amount || amount || 0,
    labelReady: stored.stored,
    attempts: labelAttempts
  };
}

async function processShipmentPreparation(shipmentId: string) {
  const shipment = await loadShipmentForProcessing(shipmentId);
  if (!shipment) return { success: false, message: 'No hay registros para procesar.' };

  if (shipment.label_base64) {
    await markShipmentJob(shipment.id, 'provider_create', 'completed', 'Etiqueta disponible.');
    await markShipmentJob(shipment.id, 'label_fetch', 'completed', 'Etiqueta disponible.');
    return { success: true, status: 'completed', message: 'Etiqueta disponible.' };
  }

  if (String(shipment.status || '').toLowerCase() === 'pending_customer_balance') {
    const debit = await debitShipmentWalletIfPossible(shipment);
    if (!debit.charged) {
      await ensureShipmentJob(shipment.id, shipment.user_id, 'payment_manifest', 'pending', 'Pendiente de saldo.');
      await markShipmentJob(shipment.id, 'payment_manifest', 'pending', 'Pendiente de saldo.');
      await pool.query(`UPDATE shipments SET status_label = 'Pendiente de saldo', label_status = 'pending', updated_at = NOW() WHERE id = ?`, [shipment.id]);
      return { success: false, status: 'pending_customer_balance', message: 'Pendiente de saldo.' };
    }
    await pool.query(`UPDATE shipments SET status = 'pending_provider', status_label = 'Preparando etiqueta', updated_at = NOW() WHERE id = ?`, [shipment.id]);
    await markShipmentJob(shipment.id, 'payment_manifest', 'completed', 'Saldo aplicado.');
    shipment.status = 'pending_provider';
    shipment.provider_shipment_code = null;
    shipment.provider_tracking_code = null;
  }

  if (shipment.provider_shipment_code) {
    if (String(shipment.provider_code || '').toLowerCase() === 'paccofacile') {
      await markShipmentJob(shipment.id, 'label_fetch', 'running', 'Preparando etiqueta.');
      const pfResult = await runPaccofacileBuyAndLabelForShipment(shipment.id, 'auto-flow');
      return {
        success: Boolean(pfResult.success),
        status: pfResult.labelReady ? 'label_ready' : 'pending_label',
        message: pfResult.message || 'Etiqueta en preparación.',
        result: pfResult
      };
    }

    await markShipmentJob(shipment.id, 'label_fetch', 'running', 'Preparando etiqueta.');
    const cached = await fetchProviderLabelForShipment(shipment);
    if (cached.stored || cached.labelUrl) {
      await pool.query(`UPDATE shipments SET label_status = ?, status = IF(status IN ('pending_label','pending_provider'), 'label_ready', status), status_label = IF(status_label IN ('Preparando etiqueta','Etiqueta en preparación'), 'Etiqueta disponible', status_label), updated_at = NOW() WHERE id = ?`, [cached.stored ? 'stored' : 'available', shipment.id]);
      await markShipmentJob(shipment.id, 'label_fetch', 'completed', 'Etiqueta disponible.');
      await TrackingEventRepo.create({ shipment_id: shipment.id, tracking_code: shipment.tracking_code, status: 'label_ready', status_label: 'Etiqueta disponible', description: 'La etiqueta está disponible para descargar.' });
      return { success: true, status: 'label_ready', message: 'Etiqueta disponible.' };
    }
    await ensureShipmentJob(shipment.id, shipment.user_id, 'label_fetch', 'pending', 'Etiqueta en preparación.');
    await markShipmentJob(shipment.id, 'label_fetch', 'pending', 'Etiqueta en preparación.');
    await pool.query(`UPDATE shipments SET label_status = 'pending', label_error = ?, last_provider_attempt_at = NOW(), updated_at = NOW() WHERE id = ?`, ['Etiqueta en preparación', shipment.id]);
    return { success: false, status: 'pending_label', message: 'Etiqueta en preparación.' };
  }

  const rawSender = typeof shipment.sender_json === 'string' ? JSON.parse(shipment.sender_json) : shipment.sender_json;
  const rawRecipient = typeof shipment.recipient_json === 'string' ? JSON.parse(shipment.recipient_json) : shipment.recipient_json;
  const shipmentFallbackEmail = providerFallbackEmail(rawRecipient?.email, rawSender?.email, shipment.user_email);
  const sender = normalizeShipmentPartyEmail(rawSender, shipmentFallbackEmail);
  const recipient = normalizeShipmentPartyEmail(rawRecipient, shipmentFallbackEmail);
  if (sender?.email !== rawSender?.email || recipient?.email !== rawRecipient?.email) {
    await pool.query(`UPDATE shipments SET sender_json = ?, recipient_json = ?, updated_at = NOW() WHERE id = ?`, [JSON.stringify(sender || {}), JSON.stringify(recipient || {}), shipment.id]);
    await pool.query(`UPDATE shipment_addresses SET email = ? WHERE shipment_id = ? AND type = 'sender' AND (email IS NULL OR email = '')`, [sender.email || shipmentFallbackEmail, shipment.id]);
    await pool.query(`UPDATE shipment_addresses SET email = ? WHERE shipment_id = ? AND type = 'recipient' AND (email IS NULL OR email = '')`, [recipient.email || shipmentFallbackEmail, shipment.id]);
  }
  const [pkgRows]: any = await pool.query('SELECT * FROM shipment_packages WHERE shipment_id = ?', [shipment.id]);
  const normalizedPackages = pkgRows.map((pkg: any) => ({
    width: Number(pkg.width_cm), height: Number(pkg.height_cm), length: Number(pkg.length_cm), weight: Number(pkg.weight_kg), qty: Number(pkg.quantity)
  }));
  const providerCode = String(shipment.quote_provider_code || shipment.db_provider_code || shipment.provider_code || '').toLowerCase();
  const keys = await ApiKeysRepo.get();
  const retryProviderPayload = parseJsonSafe(shipment.provider_payload_json);

  await markShipmentJob(shipment.id, 'provider_create', 'running', 'Preparando etiqueta.');
  const providerResult = await callProviderCreate({
    providerCode,
    quote: shipment,
    shipmentId: shipment.id,
    sender,
    recipient,
    packages: normalizedPackages.length ? normalizedPackages : [{ width: 10, height: 10, length: 10, weight: 1, qty: 1 }],
    customs: [],
    manifest: 1,
    services: retryProviderPayload?.services || retryProviderPayload?.requestPayload?.services || null,
    keys
  });

  if (!providerResult.success) {
    await pool.query(
      `UPDATE shipments SET status = 'pending_provider', status_label = 'Preparando etiqueta', label_status = 'pending', label_error = ?, provider_attempts = COALESCE(provider_attempts, 0) + 1, last_provider_attempt_at = NOW(), provider_payload_json = ?, updated_at = NOW() WHERE id = ?`,
      [providerResult.errorMessage || 'Etiqueta en preparación', JSON.stringify(providerResult.providerPayload || {}), shipment.id]
    );
    await ensureShipmentJob(shipment.id, shipment.user_id, 'provider_create', 'pending', 'Preparando etiqueta.');
    await markShipmentJob(shipment.id, 'provider_create', 'pending', 'Preparando etiqueta.');
    return { success: false, status: 'pending_provider', message: 'Etiqueta en preparación.' };
  }

  await pool.query(
    `UPDATE shipments SET provider_shipment_code = ?, provider_tracking_code = ?, tracking_code = ?, status = ?, status_label = ?, label_url = ?, track_url = ?, payment_url = ?, provider_payload_json = ?, label_status = ?, label_error = NULL, provider_attempts = COALESCE(provider_attempts, 0) + 1, last_provider_attempt_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [
      providerResult.providerShipmentCode || null,
      providerResult.providerTracking || null,
      providerResult.trackingCode || shipment.tracking_code,
      (providerResult.labelUrl || providerResult.labelBase64) ? providerResult.status : 'pending_label',
      (providerResult.labelUrl || providerResult.labelBase64) ? providerResult.statusLabel : 'Etiqueta en preparación',
      providerResult.labelUrl || null,
      providerResult.trackUrl || null,
      providerResult.paymentUrl || null,
      JSON.stringify(providerResult.providerPayload || {}),
      (providerResult.labelUrl || providerResult.labelBase64) ? 'available' : 'pending',
      shipment.id
    ]
  );

  await TrackingEventRepo.create({ shipment_id: shipment.id, tracking_code: providerResult.trackingCode || shipment.tracking_code, status: providerResult.status || 'pending_label', status_label: (providerResult.labelUrl || providerResult.labelBase64) ? providerResult.statusLabel : 'Etiqueta en preparación', description: 'El envío fue recibido y la etiqueta está en preparación.' });

  const updatedShipment = await ShipmentRepo.getById(shipment.id);
  const cached = await cacheShipmentLabelFromSource(updatedShipment, providerResult.labelUrl || '', providerResult.labelBase64 || '');
  if (cached.stored || cached.labelUrl) {
    await markShipmentJob(shipment.id, 'provider_create', 'completed', 'Etiqueta disponible.');
    await markShipmentJob(shipment.id, 'label_fetch', 'completed', 'Etiqueta disponible.');
  } else {
    await markShipmentJob(shipment.id, 'provider_create', 'completed', 'Envío recibido por la red logística.');
    await ensureShipmentJob(shipment.id, shipment.user_id, 'label_fetch', 'pending', 'Etiqueta en preparación.');
  }

  return { success: true, status: cached.stored || cached.labelUrl ? 'label_ready' : 'pending_label', message: cached.stored || cached.labelUrl ? 'Etiqueta disponible.' : 'Etiqueta en preparación.' };
}

async function processPendingShipments(limit = 10) {
  const [rows]: any = await pool.query(
    `SELECT DISTINCT s.id
     FROM shipments s
     LEFT JOIN shipment_processing_jobs j ON j.shipment_id = s.id
     WHERE (
         s.status IN ('pending_provider','pending_label','pending_customer_balance')
         OR (s.label_status = 'pending' AND (s.label_base64 IS NULL OR s.label_base64 = ''))
         OR (s.label_status IN ('available','stored') AND (s.label_base64 IS NULL OR s.label_base64 = '') AND s.label_url IS NOT NULL AND s.label_url <> '')
         OR (j.status = 'pending' AND j.next_run_at <= NOW())
       )
       AND (s.label_base64 IS NULL OR s.label_base64 = '')
     ORDER BY COALESCE(j.next_run_at, s.updated_at, s.created_at) ASC
     LIMIT ?`,
    [Math.max(1, Math.min(50, Number(limit || 10)))]
  );

  const results: any[] = [];
  for (const row of rows) {
    try {
      const result = await processShipmentPreparation(row.id);
      results.push({ id: row.id, ...result });
    } catch (e: any) {
      results.push({ id: row.id, success: false, message: 'No se pudo completar la preparación.' });
    }
  }
  return results;
}


async function syncGeneiShipmentStatus(shipment: any) {
  const provider = await ProviderRepo.getByCode('genei');
  const keys = await ApiKeysRepo.get();
  if (geneiApiMode(provider) === 'v1') {
    const serviceCode = shipment.order_number || shipment.id;
    const platformCode = shipment.provider_shipment_code || shipment.tracking_code;
    let data: any = null;
    let httpStatus = 0;
    const first = await callGeneiV1(provider, keys, 'obtener_codigo_envio', { codigo_envio_servicio: serviceCode });
    data = first.response;
    httpStatus = first.httpStatus;
    if ((!data || !data.codigo_envio || data.codigo_envio === 0) && platformCode) {
      const second = await callGeneiV1(provider, keys, 'obtener_codigo_envio', { codigo_envio_plataforma: platformCode });
      data = second.response;
      httpStatus = second.httpStatus;
    }
    await writeProviderLog('genei', 'tracking_status_v1', { shipmentId: shipment.id }, { estado: data?.estado, codigo_envio: data?.codigo_envio, seguimiento: data?.seguimiento, nombre_estado: data?.nombre_estado, hasLabel: Boolean(data?.url_etiqueta || data?.base64_etiqueta) }, httpStatus);
    if (!data || data.error) return { success: false, message: data?.error || 'No hay datos de seguimiento todavía.' };

    if (data.codigo_envio || data.seguimiento || data.web_seguimiento) {
      await pool.query(
        `UPDATE shipments SET provider_shipment_code = COALESCE(?, provider_shipment_code), provider_tracking_code = COALESCE(?, provider_tracking_code), tracking_code = COALESCE(?, tracking_code), track_url = COALESCE(?, track_url), updated_at = NOW() WHERE id = ?`,
        [data.codigo_envio || null, data.seguimiento || null, data.codigo_envio || shipment.tracking_code, data.web_seguimiento || null, shipment.id]
      );
    }

    const hist = Array.isArray(data.historico) ? data.historico : [];
    for (const ev of hist) {
      const mapped = mapGeneiStatus(ev.estado || ev.id_estado, ev.nombre_estado || data.nombre_estado || 'Actualizado');
      await createTrackingEventOnce({
        shipment_id: shipment.id,
        tracking_code: data.codigo_envio || shipment.tracking_code,
        status: mapped.status,
        status_code: String(ev.estado || ev.id_estado || mapped.status),
        status_label: mapped.label,
        description: ev.nombre_estado || ev.descripcion || mapped.label,
        event_time: String(ev.fecha || ev.fecha_hora || '').replace('T', ' ').slice(0, 19) || undefined
      });
    }

    if (data.url_etiqueta || data.base64_etiqueta) {
      await cacheShipmentLabelFromSource(shipment, absoluteGeneiV1LabelUrl(data.url_etiqueta, provider), data.base64_etiqueta || '');
    }

    const mapped = mapGeneiStatus(data.estado, data.nombre_estado || 'Actualizado');
    const changed = await updateShipmentOperationalStatus(shipment, { ...mapped, code: String(data.estado || '') }, data.nombre_estado || mapped.label, data.fecha_hora_creacion ? String(data.fecha_hora_creacion).replace('T', ' ').slice(0, 19) : undefined);
    return { success: true, changed, status: mapped.status, label: mapped.label };
  }

  const credential = providerSecret('genei', provider, keys);
  if (!credential) return { success: false, message: 'Proveedor no disponible todavía.' };
  const token = await getGeneiToken(credential);
  const shipmentCode = shipment.provider_shipment_code || shipment.tracking_code;
  if (!shipmentCode) return { success: false, message: 'No hay seguimiento disponible.' };
  const response = await fetch(`https://apiv2.genei.es/api/v2/shipments/${encodeURIComponent(shipmentCode)}`, { headers: { Authorization: `Bearer ${token}` } });
  const data: any = await response.json().catch(async () => ({ raw: await response.text() }));
  await writeProviderLog('genei', 'tracking_status_v2', { shipmentId: shipment.id, shipmentCode }, { estado: data?.estado || data?.status, nombre_estado: data?.nombre_estado || data?.statusName }, response.status);
  const rawEstado = data?.estado || data?.status;
  const mapped = mapGeneiStatus(rawEstado, data?.nombre_estado || data?.statusName || 'Actualizado');
  const changed = await updateShipmentOperationalStatus(shipment, { ...mapped, code: String(rawEstado || '') }, data?.nombre_estado || data?.statusName || mapped.label);
  return { success: response.ok, changed, status: mapped.status, label: mapped.label };
}

async function syncParcelAbcShipmentStatus(shipment: any) {
  const keys = await ApiKeysRepo.get();
  const provider = await ProviderRepo.getByCode('parcelabc');
  const authToken = providerSecret('parcelabc', provider, keys);
  if (!authToken) return { success: false, message: 'Proveedor no disponible todavía.' };
  const parcelCode = shipment.provider_shipment_code || shipment.tracking_code || shipment.order_number;
  if (!parcelCode) return { success: false, message: 'No hay seguimiento disponible.' };
  const response = await fetch(`${providerBaseUrl(provider, 'https://www.parcelabc.com/api-pabc.php')}/tracking`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authToken, parcelCode })
  });
  const data: any = await response.json().catch(async () => ({ status: false, errorMessage: await response.text() }));
  await writeProviderLog('parcelabc', 'tracking_status', { shipmentId: shipment.id, parcelCode }, { status: data?.status, errorMessage: data?.errorMessage }, response.status);
  const record = data?.trackingList?.[parcelCode] || Object.values(data?.trackingList || {})[0] as any;
  if (!record?.packages) return { success: false, message: data?.errorMessage || 'No hay datos de seguimiento todavía.' };
  let latest: any = null;
  for (const pkg of record.packages || []) {
    for (const ev of pkg.tracking || []) {
      const mapped = mapParcelAbcTrackStatus(ev.statusId);
      await createTrackingEventOnce({ shipment_id: shipment.id, tracking_code: parcelCode, status: mapped.status, status_code: String(ev.statusId || ''), status_label: mapped.label, description: ev.comments || mapped.label, event_time: ev.time ? String(ev.time).replace('T', ' ').slice(0, 19) : undefined });
      if (!latest || String(ev.time || '') > String(latest.time || '')) latest = ev;
    }
  }
  if (!latest) return { success: true, changed: false, message: 'Sin cambios recientes.' };
  const mapped = mapParcelAbcTrackStatus(latest.statusId);
  const changed = await updateShipmentOperationalStatus(shipment, { ...mapped, code: String(latest.statusId || '') }, latest.comments || mapped.label, latest.time ? String(latest.time).replace('T', ' ').slice(0, 19) : undefined);
  return { success: true, changed, status: mapped.status, label: mapped.label };
}


async function syncPaccofacileShipmentStatus(shipment: any) {
  const provider = await ProviderRepo.getByCode('paccofacile');
  const keys = await ApiKeysRepo.get();
  const providerShipmentId = shipment.provider_shipment_code || shipment.tracking_code;
  if (!providerShipmentId) return { success: false, message: 'No hay seguimiento disponible.' };
  const detail = await callPaccofacile(provider, keys, 'GET', `service/shipment/${encodeURIComponent(providerShipmentId)}`);
  const data: any = detail.response;
  await writeProviderLog('paccofacile', 'tracking_status', { shipmentId: shipment.id, providerShipmentId }, { status: data?.header?.status }, detail.httpStatus);
  if (!paccofacileIsSuccess(data)) return { success: false, message: paccofacileMessage(data, 'No hay datos de seguimiento todavía.') };

  const payload = data?.data?.shipment || data?.data || data || {};
  const trackingCandidate = Array.isArray(payload?.tracking_numbers) ? payload.tracking_numbers[0] : payload?.tracking_numbers;
  const trackingNumber = String(trackingCandidate?.tracking_number || trackingCandidate?.number || trackingCandidate || payload?.tracking_number || payload?.tracking || '').trim();
  const rawStatus = payload?.status || payload?.status_label || payload?.state || payload?.current_status || payload?.carrier_status || payload?.nome_stato || payload?.tracking_status || 'Actualizado';
  const mapped = mapPaccofacileStatus(rawStatus, String(rawStatus || 'Actualizado'));

  if (trackingNumber) {
    await pool.query(
      `UPDATE shipments SET provider_tracking_code = COALESCE(?, provider_tracking_code), updated_at = NOW() WHERE id = ?`,
      [trackingNumber, shipment.id]
    ).catch(() => {});
  }

  const events = Array.isArray(payload?.tracking_events) ? payload.tracking_events : (Array.isArray(payload?.history) ? payload.history : (Array.isArray(payload?.events) ? payload.events : []));
  if (events.length) {
    for (const ev of events) {
      const label = ev.description || ev.status || ev.status_label || mapped.label;
      const evMapped = mapPaccofacileStatus(label, label);
      await createTrackingEventOnce({
        shipment_id: shipment.id,
        tracking_code: trackingNumber || shipment.tracking_code,
        status: evMapped.status,
        status_code: String(ev.code || ev.status_code || ev.id || evMapped.status),
        status_label: evMapped.label,
        description: label,
        location: ev.location || ev.place || '',
        event_time: ev.date || ev.datetime || ev.time || undefined,
        raw_payload: ev
      });
    }
  } else {
    await createTrackingEventOnce({ shipment_id: shipment.id, tracking_code: trackingNumber || shipment.tracking_code, status: mapped.status, status_code: mapped.status, status_label: mapped.label, description: mapped.label });
  }

  const changed = await updateShipmentOperationalStatus(shipment, { ...mapped, code: String(rawStatus || '') }, mapped.label);
  return { success: true, changed, status: mapped.status, label: mapped.label };
}


async function syncSpedireProShipmentStatus(shipment: any) {
  const provider = await ProviderRepo.getByCode('spedirepro');
  const keys = await ApiKeysRepo.get();
  const reference = shipment.provider_shipment_code || shipment.order_number || shipment.tracking_code;
  if (!reference) return { success: false, message: 'No hay seguimiento disponible.' };
  const detail = await callSpedirePro(provider, keys, 'POST', 'v1/shipment', { reference });
  const data: any = detail.response;
  await writeProviderLog('spedirepro', 'tracking_status', { shipmentId: shipment.id, reference }, { httpStatus: detail.httpStatus, status: data?.status, tracker: data?.tracker || data?.tracking }, detail.httpStatus);
  if (!spedireProIsOk(detail.httpStatus, data)) return { success: false, message: spedireProMessage(data, 'No hay datos de seguimiento todavía.') };
  const providerReference = spedireProExtractReference(data) || reference;
  const trackingNumber = spedireProExtractTracking(data) || shipment.provider_tracking_code || shipment.tracking_code;
  if (providerReference || trackingNumber) {
    await pool.query(
      `UPDATE shipments SET provider_shipment_code = COALESCE(?, provider_shipment_code), provider_tracking_code = COALESCE(?, provider_tracking_code), tracking_code = COALESCE(?, tracking_code), track_url = COALESCE(?, track_url), updated_at = NOW() WHERE id = ?`,
      [providerReference || null, trackingNumber || null, trackingNumber || providerReference || null, data?.tracking_url || null, shipment.id]
    ).catch(() => {});
  }
  const labelUrl = spedireProExtractLabelUrl(data);
  if (labelUrl) await cacheShipmentLabelFromSource(shipment, labelUrl, '');
  const mapped = mapSpedireProStatus(data?.status, data?.status || 'Actualizado');
  const changed = await updateShipmentOperationalStatus(shipment, { ...mapped, code: String(data?.status || '') }, mapped.label);
  return { success: true, changed, status: mapped.status, label: mapped.label };
}


async function syncSpediamoProShipmentStatus(shipment: any) {
  const provider = await ProviderRepo.getByCode('spediamopro');
  const keys = await ApiKeysRepo.get();
  const providerShipmentId = String(shipment.provider_shipment_code || shipment.tracking_code || '').trim();
  if (!providerShipmentId) return { success: false, message: 'No hay seguimiento disponible.' };

  const detail = await callSpediamoPro(provider, keys, 'GET', `shipments/${encodeURIComponent(providerShipmentId)}`);
  const detailData: any = detail.response?.data || detail.response || {};
  const tracking = await callSpediamoPro(provider, keys, 'GET', `shipments/${encodeURIComponent(providerShipmentId)}/tracking`);
  const trackingData: any = tracking.response?.data || tracking.response || {};
  await writeProviderLog('spediamopro', 'tracking_status', { shipmentId: shipment.id, providerShipmentId }, { detailStatus: detailData?.status, trackingStatus: trackingData?.status, httpStatus: tracking.httpStatus, hasTracking: Boolean(trackingData?.trackingCode || detailData?.trackingCode) }, tracking.httpStatus);

  const trackingCode = trackingData?.trackingCode || detailData?.trackingCode || detailData?.secondaryTrackingCode || shipment.provider_tracking_code || shipment.tracking_code;
  const trackUrl = trackingData?.url || detailData?.trackingUrl || shipment.track_url || '';
  await pool.query(
    `UPDATE shipments SET provider_tracking_code = COALESCE(?, provider_tracking_code), tracking_code = COALESCE(?, tracking_code), track_url = COALESCE(?, track_url), provider_payload_json = JSON_MERGE_PATCH(COALESCE(provider_payload_json, JSON_OBJECT()), CAST(? AS JSON)), updated_at = NOW() WHERE id = ?`,
    [trackingCode || null, trackingCode || null, trackUrl || null, JSON.stringify({ spediamoproStatusSync: { detail: detailData, tracking: trackingData } }), shipment.id]
  ).catch(async () => {
    await pool.query(`UPDATE shipments SET provider_tracking_code = COALESCE(?, provider_tracking_code), tracking_code = COALESCE(?, tracking_code), track_url = COALESCE(?, track_url), updated_at = NOW() WHERE id = ?`, [trackingCode || null, trackingCode || null, trackUrl || null, shipment.id]);
  });

  const events = Array.isArray(trackingData?.events) ? trackingData.events
    : (Array.isArray(trackingData?.trackingDetails) ? trackingData.trackingDetails
      : (Array.isArray(trackingData?.history) ? trackingData.history
        : (Array.isArray(detailData?.trackingEvents) ? detailData.trackingEvents : [])));
  for (const ev of events) {
    const rawStatus = ev.status ?? ev.statusCode ?? ev.code ?? ev.state ?? trackingData?.status ?? detailData?.status;
    const evMapped = mapSpediamoProStatus(rawStatus, ev.message || ev.description || ev.statusLabel || 'Actualizado');
    await createTrackingEventOnce({
      shipment_id: shipment.id,
      tracking_code: trackingCode || shipment.tracking_code,
      status: evMapped.status,
      status_code: String(rawStatus || evMapped.status),
      status_label: evMapped.label,
      description: ev.message || ev.description || ev.statusLabel || evMapped.label,
      event_time: normalizeProviderEventTime(ev.datetime || ev.date || ev.time || ev.createdAt)
    }).catch(() => null);
  }

  const rawStatus = trackingData?.status ?? detailData?.status;
  const mapped = mapSpediamoProStatus(rawStatus, trackingData?.statusDescription || detailData?.statusDescription || 'Actualizado');
  const changed = await updateShipmentOperationalStatus({ ...shipment, provider_tracking_code: trackingCode, tracking_code: trackingCode || shipment.tracking_code, track_url: trackUrl }, { ...mapped, code: String(rawStatus || mapped.status) }, mapped.label);

  if (!shipment.label_base64 && providerShipmentId) {
    await fetchProviderLabelForShipment({ ...shipment, provider_code: 'spediamopro', provider_shipment_code: providerShipmentId }).catch(() => null);
  }
  return { success: true, changed, status: mapped.status, label: mapped.label, trackingCode };
}

async function syncEasyPostShipmentStatus(shipment: any) {
  const provider = await ProviderRepo.getByCode('easypost');
  const keys = await ApiKeysRepo.get();
  const providerShipmentId = String(shipment.provider_shipment_code || '').trim();
  const trackerId = String((parseJsonSafe(shipment.provider_payload_json)?.buy?.tracker?.id) || (parseJsonSafe(shipment.provider_payload_json)?.detail?.tracker?.id) || '').trim();
  if (!providerShipmentId && !trackerId && !shipment.provider_tracking_code) return { success: false, message: 'No hay seguimiento disponible.' };

  let detailData: any = null;
  let trackerData: any = null;
  let httpStatus = 0;

  if (providerShipmentId) {
    const detail = await callEasyPost(provider, keys, 'GET', `shipments/${encodeURIComponent(providerShipmentId)}`);
    detailData = detail.response || {};
    httpStatus = detail.httpStatus;
  }
  const resolvedTrackerId = trackerId || detailData?.tracker?.id || '';
  if (resolvedTrackerId) {
    const tracker = await callEasyPost(provider, keys, 'GET', `trackers/${encodeURIComponent(resolvedTrackerId)}`);
    trackerData = tracker.response || {};
    httpStatus = tracker.httpStatus || httpStatus;
  } else if (detailData?.tracker) {
    trackerData = detailData.tracker;
  }

  const source = trackerData || detailData?.tracker || detailData || {};
  const trackingCode = source?.tracking_code || detailData?.tracking_code || shipment.provider_tracking_code || shipment.tracking_code;
  const publicUrl = source?.public_url || source?.tracking_url || detailData?.tracker?.public_url || shipment.track_url || '';
  const labelUrl = detailData?.postage_label?.label_url || detailData?.postage_label?.label_pdf_url || shipment.label_url || '';
  await writeProviderLog('easypost', 'tracking_status', { shipmentId: shipment.id, providerShipmentId, trackerId: resolvedTrackerId }, { httpStatus, status: source?.status, trackingCode, hasLabel: Boolean(labelUrl) }, httpStatus);

  await pool.query(
    `UPDATE shipments SET provider_tracking_code = COALESCE(?, provider_tracking_code), tracking_code = COALESCE(?, tracking_code), track_url = COALESCE(?, track_url), label_url = COALESCE(?, label_url), provider_payload_json = JSON_MERGE_PATCH(COALESCE(provider_payload_json, JSON_OBJECT()), CAST(? AS JSON)), updated_at = NOW() WHERE id = ?`,
    [trackingCode || null, trackingCode || null, publicUrl || null, labelUrl || null, JSON.stringify({ easypostStatusSync: { shipment: detailData, tracker: trackerData } }), shipment.id]
  ).catch(async () => {
    await pool.query(`UPDATE shipments SET provider_tracking_code = COALESCE(?, provider_tracking_code), tracking_code = COALESCE(?, tracking_code), track_url = COALESCE(?, track_url), label_url = COALESCE(?, label_url), updated_at = NOW() WHERE id = ?`, [trackingCode || null, trackingCode || null, publicUrl || null, labelUrl || null, shipment.id]);
  });

  const details = Array.isArray(source?.tracking_details) ? source.tracking_details : [];
  for (const ev of details) {
    const evMapped = easyPostStatusMap(ev.status || source?.status);
    await createTrackingEventOnce({
      shipment_id: shipment.id,
      tracking_code: trackingCode || shipment.tracking_code,
      status: evMapped.status,
      status_code: String(ev.status || source?.status || evMapped.status),
      status_label: evMapped.label,
      description: ev.message || ev.status_detail || evMapped.label,
      event_time: normalizeProviderEventTime(ev.datetime)
    }).catch(() => null);
  }

  const mapped = easyPostStatusMap(source?.status || detailData?.status);
  const changed = await updateShipmentOperationalStatus({ ...shipment, provider_tracking_code: trackingCode, tracking_code: trackingCode || shipment.tracking_code, track_url: publicUrl }, { ...mapped, code: String(source?.status || mapped.status) }, source?.status_detail || mapped.label);

  if (labelUrl && !shipment.label_base64) {
    await cacheShipmentLabelFromSource(shipment, labelUrl, '').catch(() => null);
  } else if (!shipment.label_base64 && providerShipmentId) {
    await fetchProviderLabelForShipment({ ...shipment, provider_code: 'easypost', provider_shipment_code: providerShipmentId }).catch(() => null);
  }

  return { success: true, changed, status: mapped.status, label: mapped.label, trackingCode };
}

async function syncShipmentStatusFromProvider(shipmentId: string) {
  const shipment = await ShipmentRepo.getById(shipmentId);
  if (!shipment) return { success: false, message: 'No hay registros para mostrar.' };
  const providerCode = String(shipment.provider_code || '').toLowerCase();
  if (providerCode === 'genei') return syncGeneiShipmentStatus(shipment);
  if (providerCode === 'parcelabc') return syncParcelAbcShipmentStatus(shipment);
  if (providerCode === 'paccofacile') return syncPaccofacileShipmentStatus(shipment);
  if (providerCode === 'spedirepro') return syncSpedireProShipmentStatus(shipment);
  if (providerCode === 'spediamopro') return syncSpediamoProShipmentStatus(shipment);
  if (providerCode === 'easypost') return syncEasyPostShipmentStatus(shipment);
  if (providerCode === 'logihub_intl') return syncLogihubIntlShipmentStatus(shipment);
  return { success: false, message: 'Proveedor no disponible todavía.' };
}

async function processShipmentStatusUpdates(limit = 25) {
  const [rows]: any = await pool.query(
    `SELECT id FROM shipments
     WHERE provider_code IN ('genei','parcelabc','paccofacile','spedirepro','spediamopro','easypost','logihub_intl')
       AND status NOT IN ('entregado','delivered','cancelado','cancelled','draft')
       AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
     ORDER BY COALESCE(last_provider_attempt_at, updated_at, created_at) ASC
     LIMIT ?`,
    [Math.max(1, Math.min(100, Number(limit || 25)))]
  );
  const results: any[] = [];
  for (const row of rows) {
    try {
      const result = await syncShipmentStatusFromProvider(row.id);
      await markProviderStatusSyncAttempt(row.id).catch(() => null);
      results.push({ id: row.id, ...result });
    } catch (e: any) {
      await markProviderStatusSyncAttempt(row.id, 'Seguimiento pendiente.').catch(() => null);
      results.push({ id: row.id, success: false, message: 'No se pudo actualizar el estado.' });
    }
  }
  return results;
}

// --- MIDDLEWARES DE SEGURIDAD ---

function safeEstimatedDays(value: any, fallback = 3): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.ceil(value));
  }

  const text = String(value ?? '').trim();
  const nums = (text.match(/\d+/g) || [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (nums.length > 0) {
    return Math.max(1, Math.max(...nums));
  }

  return fallback;
}


function normalizeProviderText(value: any): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function inferCarrierName(value: any): string {
  const text = normalizeProviderText(value);
  if (!text) return 'Red logística';
  if (text.includes('poste italiane') || text.includes('posteit') || text.includes('poste delivery') || text.includes('post delivery')) return 'Poste Italiane';
  if (text.includes('poste') && text.includes('ital')) return 'Poste Italiane';
  if (text.includes('sda')) return 'SDA';
  if (text.includes('brt') || text.includes('bartolini')) return 'BRT';
  if (text.includes('inpost') || text.includes('in post')) return 'InPost';
  if (text.includes('seur')) return 'SEUR';
  if (text.includes('dhl')) return 'DHL';
  if (text.includes('gls')) return 'GLS';
  if (text.includes('nacex')) return 'NACEX';
  if (text.includes('fedex') || text.includes('federal express')) return 'FedEx';
  if (text.includes('ups')) return 'UPS';
  if (text.includes('correos express')) return 'Correos Express';
  if (text.includes('correos')) return 'Correos';
  if (text.includes('tnt')) return 'TNT';
  if (text.includes('dpd')) return 'DPD';
  if (text.includes('mrw')) return 'MRW';
  if (text.includes('mondial relay')) return 'Mondial Relay';
  if (text.includes('hermes') || text.includes('evri')) return text.includes('evri') ? 'Evri' : 'Hermes';
  if (text.includes('chronopost')) return 'Chronopost';
  if (text.includes('colissimo')) return 'Colissimo';
  if (text.includes('poste')) return 'Poste';
  if (text.includes('parcel abc') || text.includes('parcelabc') || text.includes('paccofacile') || text.includes('genei') || text.includes('spedirepro') || text.includes('spedire pro') || text.includes('spediamopro') || text.includes('spediamo pro') || text.includes('easypost') || text.includes('easy post') || text.includes('ship24go') || text.includes('logihub') || text.includes('red logistica')) return 'DoorDrop';
  return compactText(String(value || 'Red logística'), 40);
}


function customerServiceName(value: any, fallback = 'Servicio estándar'): string {
  const raw = compactText(value, 80);
  const text = normalizeProviderText(raw);
  if (!raw) return fallback;
  if (text.includes('parcel abc') || text.includes('parcelabc') || text.includes('paccofacile') || text.includes('genei') || text.includes('spedirepro') || text.includes('spedire pro') || text.includes('spediamopro') || text.includes('spediamo pro') || text.includes('easypost') || text.includes('easy post') || text.includes('ship24go') || text.includes('logihub') || text.includes('red logistica')) return fallback;
  return raw;
}

function extractCarrierName(offer: any, fallback?: any): string {
  const sources = [
    offer?.carrier_name, offer?.carrierName, offer?.carrier,
    offer?.courier_name, offer?.courierName, offer?.courier,
    offer?.vendor_name, offer?.vendorName, offer?.vendor,
    offer?.agency_name, offer?.agencyName, offer?.agency,
    offer?.nombre_agencia, offer?.nombre_completo_agencia, offer?.nombre_integracion_cliente,
    offer?.nome_corriere, offer?.nome_vettore, offer?.serviceName, offer?.service_name, offer?.name,
    fallback
  ];
  for (const source of sources) {
    const raw = compactText(source, 80);
    if (!raw) continue;
    const inferred = inferCarrierName(raw);
    if (inferred && normalizeProviderText(inferred) !== 'red logistica') return inferred;
  }
  return 'Red logística';
}

function extractCarrierLogo(offer: any, fallback = ''): string {
  const sources = [
    offer?.carrier_logo, offer?.carrierLogo, offer?.courier_logo, offer?.courierLogo,
    offer?.logo_url, offer?.logoUrl, offer?.logo, offer?.image_url, offer?.imageUrl, offer?.image,
    offer?.icon_url, offer?.iconUrl, offer?.icon, offer?.agency_logo, offer?.agencyLogo, offer?.imagen_agencia,
    fallback
  ];
  for (const source of sources) {
    const url = String(source || '').trim();
    if (!url) continue;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/') || url.startsWith('data:image/')) return url;
  }
  return '';
}

function inferServiceProfile(offer: any, minDays: number, maxDays: number) {
  const text = normalizeProviderText(`${offer?.serviceName || offer?.service_name || offer?.name || ''} ${offer?.collectionTypeName || offer?.collection_type || ''} ${offer?.deliveryTimeText || offer?.delivery_time || ''}`);
  const fast = (maxDays > 0 && maxDays <= 2) || text.includes('express') || text.includes('urgent') || text.includes('rapido') || text.includes('24h') || text.includes('48h');
  const dropoff = text.includes('drop-off') || text.includes('dropoff') || text.includes('drop off') || text.includes('point') || text.includes('hub') || text.includes('oficina');
  const door = text.includes('door') || text.includes('home') || text.includes('domicilio') || text.includes('pickup') || text.includes('pick-up');
  const economy = text.includes('economy') || text.includes('economico') || text.includes('standard') || text.includes('3+') || (!fast && maxDays >= 3);

  if (fast) return { serviceType: 'fast', serviceTypeLabel: 'Rápido' };
  if (economy) return { serviceType: 'economy', serviceTypeLabel: 'Económico' };
  if (dropoff) return { serviceType: 'dropoff', serviceTypeLabel: 'Oficina / punto' };
  if (door) return { serviceType: 'door', serviceTypeLabel: 'A domicilio' };
  return { serviceType: 'standard', serviceTypeLabel: 'Estándar' };
}


// ========== CONECTOR INTERNACIONAL (DO → mundo) V1 ==========
// Endpoint técnico conservado para históricos; el conector permanece suspendido.
const LOGIHUB_INTL_LOGO = 'https://logihub.tech/docs/v2/images/logo.png';
const LOGIHUB_INTL_BASE = 'https://my.logihub.tech/api/v2';

function logihubIntlConfig(provider: any = null) {
  const cfg = provider ? providerConfig(provider) : {};
  return {
    apiKey: String(
      process.env.LOGIHUB_API_KEY ||
      process.env.LOGIHUB_INTL_API_KEY ||
      cfg.apiKey ||
      cfg.token ||
      cfg.authToken ||
      ''
    ).trim(),
    baseUrl: String(cfg.baseUrl || process.env.LOGIHUB_BASE_URL || LOGIHUB_INTL_BASE).replace(/\/$/, ''),
    webhookSecret: String(
      process.env.LOGIHUB_WEBHOOK_SECRET ||
      process.env.LOGIHUB_INTL_WEBHOOK_SECRET ||
      cfg.webhookSecret ||
      ''
    ).trim(),
    allowRealBuy: Boolean(
      cfg.allowRealBuy === true ||
      String(process.env.LOGIHUB_ALLOW_REAL_BUY || '').toLowerCase() === 'true'
    ),
    publicName: String(cfg.publicName || 'DoorDrop'),
    logoUrl: String(cfg.logoUrl || cfg.logo || LOGIHUB_INTL_LOGO),
    priority: Number(cfg.priority || 15),
    maxResults: Math.max(1, Math.min(10, Number(cfg.maxResults || 4))),
  };
}

function logihubIntlCredentials(provider: any, keys: any = {}) {
  const cfg = logihubIntlConfig(provider);
  // also try api_keys / keys bag
  const fromKeys = String(keys?.logihubApiKey || keys?.logihub_intl_api_key || keys?.LOGIHUB_API_KEY || '').trim();
  const apiKey = cfg.apiKey || fromKeys;
  if (!apiKey) return null;
  return { ...cfg, apiKey };
}

async function callLogihubIntl(provider: any, keys: any, method: string, path: string, body?: any) {
  const credentials = logihubIntlCredentials(provider, keys);
  if (!credentials) return { httpStatus: 0, response: { ok: false, error: 'missing_api_key' } };
  const url = `${credentials.baseUrl}${path}`;
  try {
    const response = await fetchWithTimeout(url, {
      method,
      headers: {
        Accept: 'application/json',
        'X-API-Key': credentials.apiKey,
        'User-Agent': 'DoorDrop-International/1.0',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { ok: false, error: 'invalid_json', message: text.slice(0, 500) }; }
    if (typeof data !== 'object' || data === null) data = { ok: false, message: String(data) };
    return { httpStatus: response.status, response: data };
  } catch (e: any) {
    return { httpStatus: 0, response: { ok: false, error: 'network_error', message: e?.message || 'network' } };
  }
}

function logihubIntlMapStatus(status: string, label?: string) {
  const s = String(status || '').toLowerCase();
  const map: Record<string, { status: string; label: string }> = {
    confirmed: { status: 'tramitado', label: label || 'Confirmado' },
    label_created: { status: 'tramitado', label: label || 'Etiqueta creada' },
    picked: { status: 'en_transito', label: label || 'Recolectado' },
    received: { status: 'en_transito', label: label || 'Recibido en hub' },
    in_transit: { status: 'en_transito', label: label || 'En tránsito' },
    customs_hold: { status: 'incidencia', label: label || 'Retenido en aduana' },
    out_for_delivery: { status: 'en_reparto', label: label || 'En ruta de entrega' },
    delivered: { status: 'entregado', label: label || 'Entregado' },
    returned: { status: 'incidencia', label: label || 'Devuelto' },
    cancelled: { status: 'cancelado', label: label || 'Cancelado' },
  };
  return map[s] || { status: s || 'en_transito', label: label || status || 'Actualizado' };
}

function logihubIntlServiceMeta(serviceLevel: string) {
  const code = String(serviceLevel || 'international_priority');
  if (code === 'international_economy') {
    return {
      code,
      name: 'Envío internacional estándar',
      serviceType: 'economy',
      serviceTypeLabel: 'Estándar',
      markup: 30,
    };
  }
  return {
    code: 'international_priority',
    name: 'Envío internacional express',
    serviceType: 'express',
    serviceTypeLabel: 'Express',
    markup: 60,
  };
}

async function convertDopToCurrency(amountDop: number, targetCurrency: string, rates?: Record<string, number>) {
  const to = normalizeCurrencyCode(targetCurrency || 'EUR');
  const amount = Number(amountDop || 0);
  if (!Number.isFinite(amount)) return 0;
  if (to === 'DOP') return roundMoney(amount);
  let rateMap = rates;
  if (!rateMap || !rateMap.DOP) {
    try {
      rateMap = await getFreshRatesInternal();
    } catch {
      rateMap = { EUR: 1, USD: 1.09, DOP: 59.3, GBP: 0.84, MXN: 19.5 };
    }
  }
  return convertMoneyAmount(amount, 'DOP', to, rateMap as Record<string, number>);
}

async function syncLogihubIntlShipmentStatus(shipment: any) {
  const provider = await ProviderRepo.getByCode('logihub_intl');
  const keys = await ApiKeysRepo.get();
  const tracking = shipment.provider_tracking_code || shipment.tracking_code || shipment.provider_shipment_code;
  if (!tracking) return { success: false, message: 'Sin tracking todavía.' };
  const { httpStatus, response } = await callLogihubIntl(provider, keys, 'GET', `/internacional/tracking.php?tracking=${encodeURIComponent(tracking)}`);
  await writeProviderLog('logihub_intl', 'tracking_status', { shipmentId: shipment.id, tracking }, response, httpStatus);
  if (!response?.ok && httpStatus >= 400) return { success: false, message: response?.message || 'Sin datos de tracking.' };

  const statusRaw = response?.status || response?.data?.status || response?.tracking?.status || '';
  const statusLabel = response?.status_label || response?.data?.status_label || statusRaw;
  const mapped = logihubIntlMapStatus(statusRaw, statusLabel);
  const trackUrl = response?.track_url || response?.data?.track_url || null;
  const labelUrl = response?.label_url || response?.data?.label_url || null;

  await pool.query(
    `UPDATE shipments SET status = ?, status_label = ?, track_url = COALESCE(?, track_url), label_url = COALESCE(?, label_url), last_provider_sync_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [mapped.status, mapped.label, trackUrl, labelUrl, shipment.id]
  );
  await TrackingEventRepo.create({
    shipment_id: shipment.id,
    tracking_code: tracking,
    status: mapped.status,
    status_label: mapped.label,
    description: mapped.label,
  }).catch(() => null);

  // try label if missing
  if (!shipment.label_url && !labelUrl) {
    const lab = await callLogihubIntl(provider, keys, 'GET', `/internacional/label.php?tracking=${encodeURIComponent(tracking)}`);
    const url = lab.response?.label_url || lab.response?.label_4x6_url || lab.response?.data?.label_url;
    if (url) {
      await cacheShipmentLabelFromSource(shipment, url, '');
    }
  }
  return { success: true, status: mapped.status, label: mapped.label };
}
// ========== END LOGIHUB INTERNACIONAL ==========

function publicProviderName(provider: any): string {
  const cfg = providerConfig(provider);
  return String(cfg.publicName || cfg.displayName || 'DoorDrop');
}

const authMiddleware = async (req: any, res: any, next: any) => {
  try {
    const token = req.headers['authorization'];
    if (!token) {
      return res.status(401).json({ error: 'No se pudo completar la operación. Por favor, inicia sesión.' });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'No se pudo completar la operación. Sesión inválida.' });
    }
    const user = await UserRepo.getById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'No se pudo completar la operación. Usuario no encontrado.' });
    }
    if (Number(user.auth_token_version || 1) !== Number(decoded.authTokenVersion)) {
      return res.status(401).json({ error: 'No se pudo completar la operación. Sesión expirada.' });
    }
    
    const isImpersonation = Boolean(decoded.impersonated && decoded.adminUserId);
    if (user.role !== 'super_admin' && user.status && user.status !== 'active' && !isImpersonation) {
      return res.status(403).json({ error: 'Cuenta no disponible temporalmente.' });
    }

    // Normalizar estructura de campos booleanos y JSON para que coincidan con el código frontend
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      country: user.country,
      currency: normalizeCurrencyCode(user.currency || 'EUR'),
      role: user.role,
      businessType: user.business_type,
      balance: Number(user.balance),
      status: user.status || 'active',
      cardConnected: Boolean(user.card_connected),
      paypalConnected: Boolean(user.paypal_connected),
      cardDetails: safeJsonParse(user.card_details_json, null),
      paypalEmail: user.paypal_email,
      preferredPaymentMethod: user.preferred_payment_method || 'wallet',
      adminImpersonation: isImpersonation,
      adminUserId: decoded.adminUserId || null,
      isSeller: Boolean(user.is_seller),
      sellerProfileId: user.seller_profile_id || null,
      createdAt: user.created_at
    };
    next();
  } catch (error) {
    console.error('[Diagnóstico Interno] Error en authMiddleware:', error);
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
};

const requireSuperAdmin = (req: any, res: any, next: any) => {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de Administrador.' });
  }
  next();
};

const STAFF_PERMISSION_KEYS = [
  'clients.read',
  'shipments.read',
  'shipments.manage',
  'tickets.read',
  'tickets.manage',
  'webmail.read',
  'webmail.send',
  'reports.read'
] as const;

const DEFAULT_STAFF_PERMISSIONS = ['clients.read', 'shipments.read', 'tickets.read', 'tickets.manage', 'webmail.read'];

function normalizeStaffPermissions(value: any, fallback = DEFAULT_STAFF_PERMISSIONS): string[] {
  const source = Array.isArray(value) ? value : fallback;
  return Array.from(new Set(source.map((item: any) => String(item || '').trim()).filter((item: string) => (STAFF_PERMISSION_KEYS as readonly string[]).includes(item))));
}

function normalizeStaffEmail(value: any): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidStaffEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function publicStaffRow(row: any): any {
  return {
    id: row.staff_id || row.id,
    userId: row.user_id,
    name: String(row.name || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    title: String(row.title || 'Soporte DoorDrop'),
    role: 'support',
    status: String(row.status || 'active'),
    permissions: normalizeStaffPermissions(safeJsonParse(row.permissions_json, DEFAULT_STAFF_PERMISSIONS)),
    lastLoginAt: row.last_login_at || null,
    createdAt: row.staff_created_at || row.created_at || null,
    updatedAt: row.staff_updated_at || row.updated_at || null
  };
}

async function getAdminStaffById(staffId: string, conn: any = pool): Promise<any | null> {
  const [rows]: any = await conn.query(
    `SELECT s.id AS staff_id, s.user_id, s.title, s.permissions_json, s.last_login_at,
            s.created_at AS staff_created_at, s.updated_at AS staff_updated_at,
            u.name, u.email, u.phone, u.role, u.status, u.created_at, u.updated_at
       FROM admin_staff s
       INNER JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND u.role = 'support'
      LIMIT 1`,
    [staffId]
  );
  return rows[0] || null;
}

async function writeAdminStaffLog(actionType: string, requestPayload: any, responsePayload: any, httpStatus = 200) {
  try {
    await pool.query(
      `INSERT INTO provider_logs (id, provider_code, action_type, request_payload, response_payload, http_status)
       VALUES (?, 'admin_staff', ?, ?, ?, ?)`,
      [generateId('log_'), actionType, JSON.stringify(requestPayload || {}), JSON.stringify(responsePayload || {}), httpStatus]
    );
  } catch {}
}

// --- RUTAS DE API ---

// 1. Registro de usuarios


// ========== SWAGGER UI (AllSender-style interactive docs) ==========
app.get(['/docs', '/docs/', '/api/docs', '/api/docs/'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const embed = String(req.query.embed || '') === '1';
  res.type('html').send(swaggerUiHtml({ openapiUrl: '/openapi.json', title: 'DoorDrop API — Docs', embed }));
});

app.get(['/openapi.json', '/api/openapi.json'], (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json(getOpenApiSpec());
});

app.get('/docs/oauth2-redirect', (_req, res) => {
  // Swagger OAuth redirect stub (JWT authorize uses header, not OAuth)
  res.type('html').send('<!doctype html><title>oauth2-redirect</title><body>OK</body>');
});

// ========== CUSTOMER API DOCS (EN primary) ==========
app.get('/api/docs/openapi.json', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(getOpenApiSpec());
});

app.get('/api/docs/openai-tools.json', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(getOpenAiToolSchemas());
});

app.get('/api/docs/content', (req, res) => {
  const lang = String(req.query.lang || req.query.language || 'en');
  const format = String(req.query.format || 'json').toLowerCase();
  const doc = getDocBundle(lang);
  if (format === 'md' || format === 'markdown') {
    res.type('text/markdown; charset=utf-8').send(docsToMarkdown(doc));
    return;
  }
  res.json({ success: true, doc });
});

app.get('/api/docs/pdf', (req, res) => {
  try {
    const lang = String(req.query.lang || req.query.language || 'en');
    const doc = getDocBundle(lang);
    const pdf = docsToPdfBuffer(doc);
    const filename = `DoorDrop-API-Docs-${doc.lang.toUpperCase()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.send(pdf);
  } catch (e: any) {
    console.error('[docs/pdf]', e?.message || e);
    res.status(500).json({ error: 'Could not generate PDF documentation.' });
  }
});

async function issueEmailVerification(user: any, requestIp: string) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const tokenId = generateId('evt_');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
      [user.id]
    );
    await conn.query(
      `INSERT INTO email_verification_tokens
        (id, user_id, token_hash, expires_at, created_at, request_ip)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 4 HOUR), NOW(), ?)`,
      [tokenId, user.id, tokenHash, requestIp || null]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }

  const verificationUrl = `${appBaseUrl()}/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
  const mail = await sendNotificationEvent({
    eventCode: 'email_verification',
    entityType: 'email_verification',
    entityId: tokenId,
    userId: String(user.id),
    audience: 'customer',
    toEmail: user.email,
    recipientName: user.name,
    language: user.language || user.country || 'ES',
    variables: {
      userName: user.name,
      userEmail: user.email,
      verificationUrl,
      expirationHours: EMAIL_VERIFICATION_TTL_HOURS,
      expirationMinutes: EMAIL_VERIFICATION_TTL_HOURS * 60
    }
  });

  return { tokenId, sent: Boolean(mail.success), messageId: mail.messageId };
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, phone, country, currency, language, businessType, storeType, pickupAddress } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    
    if (!normalizedEmail || typeof password !== 'string' || password.length < 8 || !normalizedName) {
      return res.status(400).json({ error: 'El correo, el nombre y una contraseña de al menos 8 caracteres son obligatorios.' });
    }

    const clientIp = String(req.socket.remoteAddress || req.ip || '').slice(0, 45);
    if (!checkForgotPasswordRateLimit(`register_ip_${clientIp}`, 10, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Demasiados registros desde esta conexión. Intenta nuevamente más tarde.' });
    }

    const existingUser = await UserRepo.getByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(400).json({ error: 'El correo ya está registrado. Intenta iniciar sesión.' });
    }

    const userId = generateId('usr_');
    const passwordHash = hashPassword(password);
    
    const registrationLanguage = normalizeMailLanguage(language || country || 'ES');
    const newUser = {
      id: userId,
      email: normalizedEmail,
      password_hash: passwordHash,
      name: normalizedName,
      phone: phone || '',
      country: country || 'ES',
      currency: currency || 'EUR',
      language: registrationLanguage,
      role: 'customer', // Siempre registrado como customer
      business_type: businessType || 'Solo quiero enviar paquetes',
      balance: 0.00,
      email_verified_at: null,
      email_verification_required: true,
      status: 'active'
    };

    await UserRepo.create(newUser);

    let verification = { sent: false, messageId: undefined as string | undefined };
    try {
      const issued = await issueEmailVerification(newUser, clientIp);
      verification = { sent: issued.sent, messageId: issued.messageId };
    } catch (mailError: any) {
      console.error('[auth/register] La cuenta se creó, pero no se pudo preparar la verificación:', mailError?.message || 'error de verificación');
    }
    await sendNotificationEvent({
      eventCode: 'user_registered',
      entityType: 'user',
      entityId: userId,
      userId,
      audience: 'customer',
      toEmail: newUser.email,
      recipientName: newUser.name,
      language: registrationLanguage,
      variables: {
        userName: newUser.name,
        userEmail: newUser.email
      }
    }).catch((mailError: any) => {
      console.warn('[auth/register] La cuenta se creó, pero el correo de bienvenida no se pudo enviar:', mailError?.message || 'error de correo');
    });

    if (storeType && storeType !== 'none' && storeType !== 'skip') {
      await StoreRepo.create({
        id: generateId('store_'),
        user_id: userId,
        platform: storeType,
        status: 'connected'
      });
    }

    if (pickupAddress && pickupAddress.address) {
      await CompanyRepo.create({
        id: generateId('comp_'),
        user_id: userId,
        company_name: pickupAddress.companyName || normalizedName,
        address: pickupAddress.address,
        city: pickupAddress.city || 'Madrid',
        zip_code: pickupAddress.zip || '',
        country: pickupAddress.country || 'ES',
        phone: pickupAddress.phone || phone || '',
        email: normalizedEmail
      });
    }

    res.status(201).json({
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        currency: newUser.currency,
        language: newUser.language,
        emailVerified: false,
        status: newUser.status,
        balance: newUser.balance,
        businessType: newUser.business_type
      },
      email: newUser.email,
      requiresEmailVerification: true,
      emailVerificationSent: verification.sent,
      message: verification.sent
        ? 'Revisa tu correo y confirma tu cuenta. El enlace es válido durante 4 horas.'
        : 'La cuenta fue creada. Solicita un nuevo enlace de verificación cuando el correo esté disponible.'
    });
  } catch (error) {
    console.error('[Diagnóstico Interno] Error en registro:', error);
    res.status(500).json({ error: 'No se pudo completar la operación. Intenta nuevamente más tarde.' });
  }
});

// 2. Inicio de sesión (Login)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalizedEmail || typeof password !== 'string') {
      return res.status(401).json({ error: 'Credenciales incorrectas. Intenta nuevamente.' });
    }
    const clientIp = String(req.socket.remoteAddress || req.ip || '').slice(0, 45);
    const ipAllowed = checkForgotPasswordRateLimit(`login_ip_${clientIp}`, 20, 15 * 60 * 1000);
    const emailAllowed = checkForgotPasswordRateLimit(`login_email_${normalizedEmail}`, 10, 15 * 60 * 1000);
    if (!ipAllowed || !emailAllowed) {
      return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos antes de intentar nuevamente.' });
    }

    const user = await UserRepo.getByEmail(normalizedEmail);
    const passwordCheck = user ? verifyPassword(password, user.password_hash) : { valid: false, needsRehash: false };
    
    if (!user || !passwordCheck.valid) {
      return res.status(401).json({ error: 'Credenciales incorrectas. Intenta nuevamente.' });
    }

    if (passwordCheck.needsRehash) {
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), user.id]).catch(() => null);
    }

    if (user.role !== 'super_admin' && user.status && user.status !== 'active') {
      return res.status(403).json({ error: 'Cuenta no disponible temporalmente.' });
    }

    if (user.role === 'customer' && Number(user.email_verification_required || 0) === 1 && !user.email_verified_at) {
      return res.status(403).json({
        error: 'Debes verificar tu correo electrónico antes de iniciar sesión.',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
        requiresEmailVerification: true
      });
    }

    if (user.role === 'support') {
      await pool.query('UPDATE admin_staff SET last_login_at = NOW() WHERE user_id = ?', [user.id]).catch(() => null);
    }

    const token = generateToken({ userId: user.id, role: user.role, authTokenVersion: Number(user.auth_token_version || 1) });
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        currency: normalizeCurrencyCode(user.currency || 'EUR'),
        language: user.language || 'es',
        emailVerified: Boolean(user.email_verified_at) || Number(user.email_verification_required || 0) !== 1,
        status: user.status || 'active',
        balance: Number(user.balance),
        businessType: user.business_type,
        cardConnected: Boolean(user.card_connected),
        paypalConnected: Boolean(user.paypal_connected),
        cardDetails: user.card_details_json ? JSON.parse(user.card_details_json) : null,
        paypalEmail: user.paypal_email,
        preferredPaymentMethod: user.preferred_payment_method || 'wallet'
      },
      token
    });
  } catch (error) {
    console.error('[Diagnóstico Interno] Error en login:', error);
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

const EMAIL_VERIFICATION_GENERIC_MESSAGE = 'Si el correo corresponde a una cuenta pendiente, recibirás un enlace de verificación válido durante 4 horas.';

app.post('/api/auth/verify-email/resend', async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Por favor, ingresa un correo electrónico válido.' });
    }

    const clientIp = clientIpFromRequest(req).slice(0, 45);
    const ipAllowed = checkForgotPasswordRateLimit(`verify_email_ip_${clientIp}`, 5, 15 * 60 * 1000);
    const emailAllowed = checkForgotPasswordRateLimit(`verify_email_${email}`, 3, 15 * 60 * 1000);
    if (!ipAllowed || !emailAllowed) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Espera 15 minutos antes de intentarlo nuevamente.' });
    }

    const user = await UserRepo.getByEmail(email);
    if (!user || user.role !== 'customer' || !Number(user.email_verification_required || 0) || user.email_verified_at) {
      return res.status(202).json({ ok: true, message: EMAIL_VERIFICATION_GENERIC_MESSAGE });
    }

    try {
      await issueEmailVerification(user, clientIp);
    } catch (mailError: any) {
      console.error('[auth/verify-email/resend] No se pudo preparar el correo:', mailError?.message || 'error interno');
    }
    return res.status(202).json({ ok: true, message: EMAIL_VERIFICATION_GENERIC_MESSAGE });
  } catch (error: any) {
    console.error('[auth/verify-email/resend] Error interno:', error?.message || 'error interno');
    return res.status(500).json({ error: 'No se pudo procesar la solicitud en este momento.' });
  }
});

app.post('/api/auth/verify-email/complete', async (req, res) => {
  const invalidMessage = 'El enlace de verificación es inválido, ya fue utilizado o ha expirado. Solicita uno nuevo.';
  const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!/^[a-f0-9]{64}$/i.test(rawToken)) {
    return res.status(400).json({ error: invalidMessage });
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows]: any = await conn.query(
      `SELECT id, user_id
         FROM email_verification_tokens
        WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
        LIMIT 1 FOR UPDATE`,
      [tokenHash]
    );
    if (!rows?.length) {
      await conn.rollback();
      return res.status(400).json({ error: invalidMessage });
    }

    const verification = rows[0];
    await conn.query('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = ?', [verification.id]);
    await conn.query(
      `UPDATE email_verification_tokens
          SET used_at = NOW()
        WHERE user_id = ? AND used_at IS NULL`,
      [verification.user_id]
    );
    await conn.query(
      `UPDATE users
          SET email_verified_at = NOW(), email_verification_required = 0
        WHERE id = ?`,
      [verification.user_id]
    );
    const [userRows]: any = await conn.query(
      'SELECT id, email, name, language, email_verified_at FROM users WHERE id = ? LIMIT 1',
      [verification.user_id]
    );
    await conn.commit();
    const user = userRows?.[0] || null;
    return res.json({
      ok: true,
      message: 'Correo verificado correctamente. Ya puedes iniciar sesión.',
      user: user ? { id: user.id, email: user.email, name: user.name, language: user.language || 'es', emailVerified: true } : undefined
    });
  } catch (error: any) {
    await conn.rollback().catch(() => {});
    console.error('[auth/verify-email/complete] Error interno:', error?.message || 'error interno');
    return res.status(500).json({ error: 'No se pudo completar la verificación. Intenta nuevamente.' });
  } finally {
    conn.release();
  }
});

function publicPaypalAuthUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    currency: normalizeCurrencyCode(user.currency || 'EUR'),
    language: user.language || 'es',
    emailVerified: Boolean(user.email_verified_at) || Number(user.email_verification_required || 0) !== 1,
    status: user.status || 'active',
    balance: Number(user.balance || 0),
    businessType: user.business_type,
    cardConnected: Boolean(user.card_connected),
    paypalConnected: Boolean(user.paypal_connected),
    paypalEmail: user.paypal_email || null,
    preferredPaymentMethod: user.preferred_payment_method || 'wallet'
  };
}

// PayPal Login / Register (OAuth 2.0 + OpenID Connect). This flow is separate
// from PayPal Checkout: it authenticates the user and never creates a charge.
app.get('/api/auth/paypal/config', async (_req, res) => {
  try {
    const keys = await ApiKeysRepo.get();
    const config = paypalLoginConfig(keys);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ enabled: config.enabled, environment: config.environment, scopes: config.scopes });
  } catch {
    res.status(503).json({ enabled: false, error: 'PayPal no está disponible.' });
  }
});

app.get('/api/auth/paypal/start', async (req, res) => {
  try {
    const mode = String(req.query.mode || 'login').trim().toLowerCase();
    if (!['login', 'register'].includes(mode)) return res.status(400).json({ error: 'Flujo de autenticación no válido.' });
    const clientIp = clientIpFromRequest(req).slice(0, 45);
    if (!checkForgotPasswordRateLimit(`paypal_auth_ip_${clientIp}`, 20, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos antes de intentar nuevamente.' });
    }
    const result = await createPaypalAuthState(mode as 'login' | 'register', null, res);
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (error: any) {
    if (error?.code === 'PAYPAL_AUTH_UNAVAILABLE') return res.status(503).json({ error: 'PayPal no está disponible.' });
    console.error('[auth/paypal/start] No se pudo iniciar el flujo.');
    res.status(500).json({ error: 'No se pudo iniciar el acceso con PayPal.' });
  }
});

app.get('/api/auth/paypal/callback', async (req, res) => {
  const redirect = (status: string) => `${appBaseUrl()}/auth/paypal/callback?status=${encodeURIComponent(status)}`;
  res.setHeader('Cache-Control', 'no-store');
  const state = String(req.query.state || '').trim();
  const stateCookie = getCookieValue(req, PAYPAL_AUTH_STATE_COOKIE);
  const providerError = String(req.query.error || '').trim().toLowerCase();
  if (providerError) {
    clearPaypalAuthCookie(res, PAYPAL_AUTH_STATE_COOKIE);
    return res.redirect(redirect(providerError === 'access_denied' ? 'cancelled' : 'failed'));
  }
  if (!state || !stateCookie || !constantTimeStringEqual(state, stateCookie)) {
    clearPaypalAuthCookie(res, PAYPAL_AUTH_STATE_COOKIE);
    return res.redirect(redirect('invalid_state'));
  }

  try {
    const claimedState = await claimPaypalAuthState(state);
    if (!claimedState) {
      clearPaypalAuthCookie(res, PAYPAL_AUTH_STATE_COOKIE);
      return res.redirect(redirect('expired'));
    }
    const code = String(req.query.code || '').trim();
    if (!code || code.length > 4096) throw new Error('Código de autenticación inválido.');
    const keys = await ApiKeysRepo.get();
    const accessToken = await exchangePaypalLoginCode(code, keys);
    const identity = await fetchPaypalLoginIdentity(accessToken, keys);
    const user = await resolvePaypalUser(claimedState, identity);
    const handoff = await createPaypalAuthHandoff(String(user.id));
    clearPaypalAuthCookie(res, PAYPAL_AUTH_STATE_COOKIE);
    setPaypalAuthCookie(res, PAYPAL_AUTH_HANDOFF_COOKIE, handoff, PAYPAL_AUTH_HANDOFF_TTL_MS);
    return res.redirect(redirect('success'));
  } catch (error: any) {
    clearPaypalAuthCookie(res, PAYPAL_AUTH_STATE_COOKIE);
    const safeCode = String(error?.message || '').includes('correo electrónico verificado') ? 'email_unverified' : 'failed';
    console.error(`[auth/paypal/callback] Flujo rechazado: ${safeCode}`);
    return res.redirect(redirect(safeCode));
  }
});

app.post('/api/auth/paypal/complete', async (req, res) => {
  try {
    const handoff = getCookieValue(req, PAYPAL_AUTH_HANDOFF_COOKIE);
    if (!handoff || handoff.length > 256) {
      return res.status(401).json({ error: 'El acceso con PayPal expiró. Inténtalo nuevamente.' });
    }
    const user = await consumePaypalAuthHandoff(handoff);
    clearPaypalAuthCookie(res, PAYPAL_AUTH_HANDOFF_COOKIE);
    if (!user || user.role !== 'customer' || (user.status && user.status !== 'active')) {
      return res.status(401).json({ error: 'La cuenta no está disponible.' });
    }
    const token = generateToken({ userId: user.id, role: user.role, authTokenVersion: Number(user.auth_token_version || 1) });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ user: publicPaypalAuthUser(user), token });
  } catch {
    clearPaypalAuthCookie(res, PAYPAL_AUTH_HANDOFF_COOKIE);
    res.status(500).json({ error: 'No se pudo completar el acceso con PayPal.' });
  }
});

// 3. Perfil de Usuario

// =============================================================================
// RECUPEARACIÓN DE CONTRASEÑA (PASSWORD RESET) VIA SMTP TRUOBOX
// =============================================================================

// Rate limiter en memoria para /api/auth/forgot-password (IP y Email)
const forgotPasswordRateLimits = new Map<string, { count: number; resetAt: number }>();
function checkForgotPasswordRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = forgotPasswordRateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    forgotPasswordRateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count++;
  return true;
}

// Limpieza periódica de rate limits cada 30 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of forgotPasswordRateLimits.entries()) {
    if (now > val.resetAt) {
      forgotPasswordRateLimits.delete(key);
    }
  }
}, 30 * 60 * 1000);

// Solicitar recuperación de contraseña (público, no-enumeración)
app.post('/api/auth/forgot-password', async (req, res) => {
  const publicSuccessMessage = 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.';
  try {
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!rawEmail || !emailRegex.test(rawEmail)) {
      return res.status(400).json({ error: 'Por favor, ingresa un correo electrónico válido.' });
    }

    const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

    // Rate limits: max 5 por IP cada 15 min, max 3 por email cada 15 min
    const ipAllowed = checkForgotPasswordRateLimit(`ip_${clientIp}`, 5, 15 * 60 * 1000);
    const emailAllowed = checkForgotPasswordRateLimit(`email_${rawEmail}`, 3, 15 * 60 * 1000);

    if (!ipAllowed || !emailAllowed) {
      return res.status(429).json({
        error: 'Demasiadas solicitudes de recuperación. Por favor, espera 15 minutos antes de intentar de nuevo.'
      });
    }

    // Buscar usuario sin revelar existencia (evita enumeración)
    const user = await UserRepo.getByEmail(rawEmail);
    if (!user) {
      return res.status(202).json({
        ok: true,
        message: publicSuccessMessage
      });
    }

    // Invalidar tokens activos previos del mismo usuario
    await pool.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
      [user.id]
    );

    // Generar token criptográficamente seguro
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenId = generateId('prt_');

    // Almacenar con expiración de 30 minutos
    await pool.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at, request_ip)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE), NOW(), ?)`,
      [tokenId, user.id, tokenHash, clientIp]
    );

    // Enviar correo por SMTP Truobox (sin registrar token en logs)
    try {
      await sendPasswordResetEmail({
        toEmail: user.email,
        recipientName: user.name || '',
        resetToken: rawToken,
        expirationMinutes: 30
      });
    } catch (mailError: any) {
      console.error('[auth/forgot-password] Error en el servicio de correo SMTP:', mailError?.message || 'Error desconocido');
    }

    return res.status(202).json({
      ok: true,
      message: publicSuccessMessage
    });
  } catch (err: any) {
    console.error('[auth/forgot-password] Error interno procesando solicitud:', err?.message || err);
    return res.status(500).json({ error: 'No se pudo procesar la solicitud en este momento.' });
  }
});

// Restablecer contraseña mediante token (público, atómico)
app.post('/api/auth/reset-password', async (req, res) => {
  const genericError = 'El enlace de restablecimiento es inválido o ha expirado. Solicita uno nuevo.';
  try {
    const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!rawToken) {
      return res.status(400).json({ error: genericError });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Consumo atómico con transacción SQL
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Buscar token activo no usado y no expirado con bloqueo de fila
      const [rows]: any = await conn.query(
        `SELECT id, user_id, expires_at, used_at
         FROM password_reset_tokens
         WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
         FOR UPDATE`,
        [tokenHash]
      );

      if (!rows || rows.length === 0) {
        await conn.rollback();
        return res.status(400).json({ error: genericError });
      }

      const resetRecord = rows[0];
      const userId = resetRecord.user_id;

      // 1. Marcar el token como consumido
      await conn.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?',
        [resetRecord.id]
      );

      // 2. Invalidar cualquier otro token activo del mismo usuario
      await conn.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
        [userId]
      );

      // 3. Actualizar contraseña usando el hash pbkdf2 histórico
      const newPasswordHash = hashPassword(newPassword);
      await conn.query(
        'UPDATE users SET password_hash = ?, auth_token_version = COALESCE(auth_token_version, 1) + 1 WHERE id = ?',
        [newPasswordHash, userId]
      );

      await conn.commit();

      return res.json({
        ok: true,
        message: 'Contraseña restablecida exitosamente. Ya puedes iniciar sesión con tu nueva contraseña.'
      });
    } catch (txErr: any) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }
  } catch (err: any) {
    console.error('[auth/reset-password] Error procesando cambio de contraseña:', err?.message || err);
    return res.status(500).json({ error: 'No se pudo restablecer la contraseña. Intenta nuevamente.' });
  }
});


// =============================================================================
// ADMIN: CONFIGURACIÓN SMTP & GESTOR DE PLANTILLAS MULTILINGÜES
// =============================================================================

// requireSuperAdmin ya declarado arriba

// 1. Obtener configuración SMTP actual (sin exponer contraseñas)
app.get('/api/admin/smtp/config', authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const host = process.env.SMTP_HOST || 'smtp.truobox.com';
    const port = Number(process.env.SMTP_PORT) || 465;
    const isSecure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    const fromName = process.env.MAIL_FROM_NAME || 'DoorDrop';
    const fromEmail = 'info@doordrop.lat';

    res.json({
      success: true,
      config: {
        host,
        port,
        secure: isSecure,
        userMasked: user ? `${user.substring(0, 4)}...${user.slice(-3)}` : '',
        hasPassword: Boolean(pass),
        fromName,
        fromEmail
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al obtener configuración SMTP.' });
  }
});

// 2. Probar conexión SMTP y opcionalmente enviar correo de prueba
app.post('/api/admin/smtp/test', authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const { toEmail, host, port, secure, user, pass, senderName } = req.body;
    const targetEmail = toEmail ? String(toEmail).trim() : '';

    const testResult = await testSmtpConnection({
      host,
      port,
      secure,
      user,
      pass,
      toEmail: targetEmail,
      senderName,
    });

    if (!testResult.success) {
      return res.status(400).json({
        success: false,
        message: testResult.message,
        details: testResult.details
      });
    }

    res.json({
      success: true,
      message: testResult.message,
      details: testResult.details
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error durante la prueba de conexión SMTP.' });
  }
});

// 3. Listar todas las plantillas y sus idiomas disponibles
app.get('/api/admin/smtp/templates', authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const [templates]: any = await pool.query(
      'SELECT id, category, name, description, variables_json, created_at, updated_at FROM email_templates ORDER BY category, name'
    );

    const [translations]: any = await pool.query(
      'SELECT template_id, language, subject, is_active, updated_at FROM email_template_translations'
    );

    const transMap: Record<string, string[]> = {};
    for (const tr of translations) {
      if (!transMap[tr.template_id]) transMap[tr.template_id] = [];
      transMap[tr.template_id].push(tr.language);
    }

    const result = templates.map((t: any) => ({
      ...t,
      variables: typeof t.variables_json === 'string' ? JSON.parse(t.variables_json) : t.variables_json,
      languages: transMap[t.id] || []
    }));

    res.json({ success: true, templates: result });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al listar plantillas de correo.' });
  }
});

// 3.1. Catálogo de eventos reales y decisiones de entrega (solo super_admin)
app.get('/api/admin/smtp/events', authMiddleware, requireSuperAdmin, async (_req: any, res: any) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT
         e.event_code AS eventCode,
         e.template_id AS templateId,
         e.category,
         e.label,
         e.description,
         e.audience,
         e.is_enabled AS isEnabled,
         t.name AS templateName,
         COALESCE(SUM(CASE WHEN l.status = 'sent' THEN 1 ELSE 0 END), 0) AS sentCount,
         COALESCE(SUM(CASE WHEN l.status = 'failed' THEN 1 ELSE 0 END), 0) AS failedCount
       FROM email_notification_events e
       INNER JOIN email_templates t ON t.id = e.template_id
       LEFT JOIN email_logs l ON l.event_code = e.event_code
       GROUP BY e.event_code, e.template_id, e.category, e.label, e.description, e.audience, e.is_enabled, t.name
       ORDER BY e.category, e.label`
    );
    res.json({ success: true, events: rows.map((row: any) => ({
      ...row,
      isEnabled: Boolean(row.isEnabled),
      sentCount: Number(row.sentCount || 0),
      failedCount: Number(row.failedCount || 0)
    })) });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al listar las automatizaciones de correo.' });
  }
});

app.put('/api/admin/smtp/events/:eventCode', authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const eventCode = String(req.params.eventCode || '').trim();
    const templateId = String(req.body?.templateId || '').trim();
    const hasEnabled = Object.prototype.hasOwnProperty.call(req.body || {}, 'isEnabled');
    if (!eventCode || !templateId || (hasEnabled && typeof req.body.isEnabled !== 'boolean')) {
      return res.status(400).json({ error: 'Evento, plantilla y estado válido son obligatorios.' });
    }

    const [templateRows]: any = await pool.query('SELECT id FROM email_templates WHERE id = ?', [templateId]);
    if (!templateRows.length) return res.status(404).json({ error: 'La plantilla seleccionada no existe.' });

    const [eventRows]: any = await pool.query('SELECT event_code FROM email_notification_events WHERE event_code = ?', [eventCode]);
    if (!eventRows.length) return res.status(404).json({ error: 'El evento no existe.' });

    if (hasEnabled) {
      await pool.query('UPDATE email_notification_events SET template_id = ?, is_enabled = ?, updated_at = NOW() WHERE event_code = ?', [templateId, req.body.isEnabled ? 1 : 0, eventCode]);
    } else {
      await pool.query('UPDATE email_notification_events SET template_id = ?, updated_at = NOW() WHERE event_code = ?', [templateId, eventCode]);
    }
    const [updated]: any = await pool.query('SELECT event_code AS eventCode, template_id AS templateId, is_enabled AS isEnabled FROM email_notification_events WHERE event_code = ?', [eventCode]);
    res.json({ success: true, event: { ...updated[0], isEnabled: Boolean(updated[0]?.isEnabled) } });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al guardar la automatización de correo.' });
  }
});

// =============================================================================
// ADMIN: WEBMAIL CORPORATIVO (IMAP real + SMTP corporativo)
// =============================================================================

function webmailPublicError(error: any): { status: number; message: string } {
  const code = error instanceof WebmailServiceError ? error.code : String(error?.code || 'WEBMAIL_UNAVAILABLE');
  if (code === 'MAILBOX_NOT_CONFIGURED') return { status: 503, message: 'El buzón corporativo aún no está configurado.' };
  if (code === 'FOLDER_NOT_FOUND') return { status: 404, message: 'La carpeta solicitada no está disponible.' };
  if (code === 'MESSAGE_NOT_FOUND' || code === 'ATTACHMENT_NOT_FOUND') return { status: 404, message: 'El contenido solicitado no está disponible.' };
  if (code === 'ACTION_NOT_ALLOWED') return { status: 400, message: 'La acción solicitada no está disponible.' };
  if (code === 'ATTACHMENT_TOO_LARGE' || code === 'MESSAGE_TOO_LARGE') return { status: 413, message: 'El archivo o mensaje supera el tamaño permitido.' };
  if (code === 'INVALID_INPUT') return { status: 400, message: 'Revisa los datos del correo e inténtalo nuevamente.' };
  return { status: 503, message: 'El servicio de correo está temporalmente no disponible.' };
}

function logWebmailFailure(operation: string, error: any) {
  const code = error instanceof WebmailServiceError ? error.code : String(error?.code || 'WEBMAIL_UNAVAILABLE');
  console.error(`[admin/webmail] ${operation} failed`, code.slice(0, 80));
}

function parseWebmailAttachments(value: any): any[] {
  const { maxAttachmentBytes, maxAttachments } = getWebmailAttachmentLimits();
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxAttachments) throw new WebmailServiceError('INVALID_INPUT', 'El número de archivos adjuntos no es válido.');
  let totalBytes = 0;
  return value.map((item: any) => {
    const filename = String(item?.filename || '').replace(/[\\/\r\n]+/g, '_').trim().slice(0, 180);
    const contentBase64 = String(item?.contentBase64 || '');
    if (!filename || !contentBase64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64)) throw new WebmailServiceError('INVALID_INPUT', 'El archivo adjunto no es válido.');
    const content = Buffer.from(contentBase64, 'base64');
    if (!content.length || content.length > maxAttachmentBytes) throw new WebmailServiceError('ATTACHMENT_TOO_LARGE', 'El archivo adjunto supera el tamaño permitido.');
    totalBytes += content.length;
    if (totalBytes > 7 * 1024 * 1024) throw new WebmailServiceError('ATTACHMENT_TOO_LARGE', 'Los archivos adjuntos superan el tamaño permitido.');
    return { filename, content, contentType: String(item?.contentType || 'application/octet-stream').slice(0, 120) };
  });
}

function parseWebmailComposePayload(body: any): any {
  const to = typeof body?.to === 'string' || Array.isArray(body?.to) ? body.to : '';
  const cc = typeof body?.cc === 'string' || Array.isArray(body?.cc) ? body.cc : undefined;
  const bcc = typeof body?.bcc === 'string' || Array.isArray(body?.bcc) ? body.bcc : undefined;
  const subject = String(body?.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 255);
  const html = sanitizeWebmailHtml(String(body?.html || '').slice(0, 4_000_000));
  const text = String(body?.text || '').slice(0, 2_000_000);
  if (!subject || (!html && !text)) throw new WebmailServiceError('INVALID_INPUT', 'El asunto y el mensaje son obligatorios.');
  return {
    to,
    cc,
    bcc,
    subject,
    html,
    text,
    attachments: parseWebmailAttachments(body?.attachments),
    inReplyTo: typeof body?.inReplyTo === 'string' ? body.inReplyTo : undefined,
    references: Array.isArray(body?.references) ? body.references : (typeof body?.references === 'string' ? body.references : undefined)
  };
}

app.get('/api/admin/webmail/status', authMiddleware, requireSuperAdmin, async (_req: any, res: any) => {
  try {
    res.json(await getWebmailStatus({ verify: true }));
  } catch (error: any) {
    logWebmailFailure('status', error);
    const failure = webmailPublicError(error);
    res.status(failure.status).json({ success: false, message: failure.message });
  }
});

app.post('/api/admin/webmail/verify', authMiddleware, requireSuperAdmin, async (_req: any, res: any) => {
  try {
    res.json(await verifyWebmailConnection());
  } catch (error: any) {
    logWebmailFailure('verify', error);
    const failure = webmailPublicError(error);
    res.status(failure.status).json({ success: false, message: failure.message });
  }
});

app.get('/api/admin/webmail/folders', authMiddleware, requireSuperAdmin, async (_req: any, res: any) => {
  try {
    res.json({ success: true, folders: await getWebmailFolders() });
  } catch (error: any) {
    logWebmailFailure('folders', error);
    const failure = webmailPublicError(error);
    res.status(failure.status).json({ success: false, message: failure.message });
  }
});

app.get('/api/admin/webmail/messages', authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const folder = String(req.query?.folder || 'inbox') as any;
    const allowedFolders = new Set(['inbox', 'unread', 'starred', 'sent', 'drafts', 'spam', 'trash', 'archive']);
    if (!allowedFolders.has(folder)) throw new WebmailServiceError('INVALID_INPUT', 'La carpeta solicitada no es válida.');
    const page = Math.max(1, Math.min(1000, Number(req.query?.page) || 1));
    const pageSize = Math.max(10, Math.min(50, Number(req.query?.pageSize) || 25));
    res.json({ success: true, ...(await listWebmailMessages({ folder, page, pageSize, search: String(req.query?.search || '') })) });
  } catch (error: any) {
    logWebmailFailure('list', error);
    const failure = webmailPublicError(error);
    res.status(failure.status).json({ success: false, message: failure.message });
  }
});

app.get('/api/admin/webmail/messages/:uid', authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const mailbox = String(req.query?.mailbox || '').trim();
    const uid = Number(req.params.uid);
    if (!mailbox || !Number.isSafeInteger(uid)) throw new WebmailServiceError('INVALID_INPUT', 'El mensaje solicitado no es válido.');
    res.json({ success: true, message: await getWebmailMessage(mailbox, uid) });
  } catch (error: any) {
    logWebmailFailure('read', error);
    const failure = webmailPublicError(error);
    res.status(failure.status).json({ success: false, message: failure.message });
  }
});

app.get('/api/admin/webmail/messages/:uid/attachments/:index', authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const mailbox = String(req.query?.mailbox || '').trim();
    const uid = Number(req.params.uid);
    const index = Number(req.params.index);
    if (!mailbox || !Number.isSafeInteger(uid) || !Number.isSafeInteger(index)) throw new WebmailServiceError('INVALID_INPUT', 'El archivo solicitado no es válido.');
    const attachment = await downloadWebmailAttachment(mailbox, uid, index);
    res.setHeader('Content-Type', attachment.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename.replace(/"/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(attachment.content);
  } catch (error: any) {
    logWebmailFailure('attachment', error);
    const failure = webmailPublicError(error);
    res.status(failure.status).json({ success: false, message: failure.message });
  }
});

app.post('/api/admin/webmail/messages/:uid/action', authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const mailbox = String(req.body?.mailbox || '').trim();
    const uid = Number(req.params.uid);
    const action = String(req.body?.action || '').trim();
    const targetMailbox = req.body?.targetMailbox ? String(req.body.targetMailbox).trim() : undefined;
    if (!mailbox || !Number.isSafeInteger(uid)) throw new WebmailServiceError('INVALID_INPUT', 'El mensaje solicitado no es válido.');
    await actOnWebmailMessage({ mailbox, uid, action, targetMailbox });
    res.json({ success: true });
  } catch (error: any) {
    logWebmailFailure('action', error);
    const failure = webmailPublicError(error);
    res.status(failure.status).json({ success: false, message: failure.message });
  }
});

app.post('/api/admin/webmail/send', authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const result = await sendWebmailCompose(parseWebmailComposePayload(req.body || {}));
    res.json({ success: true, message: 'Correo enviado correctamente.', messageId: result.messageId });
  } catch (error: any) {
    logWebmailFailure('send', error);
    const failure = webmailPublicError(error);
    res.status(failure.status).json({ success: false, message: failure.status === 400 ? (error?.message || failure.message) : failure.message });
  }
});

app.post('/api/admin/webmail/drafts', authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  try {
    await saveWebmailDraft(parseWebmailComposePayload(req.body || {}));
    res.json({ success: true, message: 'Borrador guardado correctamente.' });
  } catch (error: any) {
    logWebmailFailure('draft', error);
    const failure = webmailPublicError(error);
    res.status(failure.status).json({ success: false, message: failure.status === 400 ? (error?.message || failure.message) : failure.message });
  }
});

// 4. Obtener detalle de una plantilla con sus traducciones
app.get('/api/admin/smtp/templates/:id', authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const [templateRows]: any = await pool.query('SELECT * FROM email_templates WHERE id = ?', [id]);
    if (!templateRows || templateRows.length === 0) {
      return res.status(404).json({ error: 'Plantilla no encontrada.' });
    }

    const [transRows]: any = await pool.query(
      'SELECT * FROM email_template_translations WHERE template_id = ? ORDER BY language',
      [id]
    );

    const template = templateRows[0];
    template.variables = typeof template.variables_json === 'string' ? JSON.parse(template.variables_json) : template.variables_json;

    res.json({
      success: true,
      template,
      translations: transRows
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al obtener detalle de plantilla.' });
  }
});

// 5. Guardar o actualizar traducción de plantilla
app.put('/api/admin/smtp/templates/:id', authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { language, subject, preheader, body_html, body_text, is_active } = req.body;

    if (!language || !subject || !body_html) {
      return res.status(400).json({ error: 'Idioma, asunto y cuerpo HTML son obligatorios.' });
    }

    const [exists]: any = await pool.query(
      'SELECT id FROM email_template_translations WHERE template_id = ? AND language = ?',
      [id, language]
    );

    if (exists.length > 0) {
      await pool.query(
        `UPDATE email_template_translations 
         SET subject = ?, preheader = ?, body_html = ?, body_text = ?, is_active = ?, updated_at = NOW()
         WHERE template_id = ? AND language = ?`,
        [subject, preheader || '', body_html, body_text || '', is_active !== undefined ? (is_active ? 1 : 0) : 1, id, language]
      );
    } else {
      const transId = generateId('trans_');
      await pool.query(
        `INSERT INTO email_template_translations 
         (id, template_id, language, subject, preheader, body_html, body_text, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [transId, id, language, subject, preheader || '', body_html, body_text || '', is_active !== undefined ? (is_active ? 1 : 0) : 1]
      );
    }

    res.json({ success: true, message: 'Traducción de plantilla guardada con éxito.' });
  } catch (err: any) {
    console.error('[admin/smtp/templates PUT]', err);
    res.status(500).json({ error: 'Error al actualizar plantilla.' });
  }
});

// 6. Enviar prueba real de una plantilla a un destinatario
app.post('/api/admin/smtp/templates/:id/send-test', authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { language, toEmail, sampleVariables } = req.body;
    const recipient = toEmail ? String(toEmail).trim() : '';
    const lang = language || 'es';
    if (!recipient) {
      return res.status(400).json({ error: 'Indica un destinatario para la prueba.' });
    }

    const templateVariables = sampleVariables && typeof sampleVariables === 'object' && !Array.isArray(sampleVariables)
      ? sampleVariables
      : {};

    const sendRes = await sendTemplatedEmail({
      templateId: id,
      language: lang,
      toEmail: recipient,
      variables: templateVariables
    });

    res.json({
      success: true,
      message: `Correo de prueba de la plantilla '${id}' enviado exitosamente a ${recipient} en idioma '${lang.toUpperCase()}'.`,
      messageId: sendRes.messageId
    });
  } catch (err: any) {
    console.error('[admin/smtp/templates send-test]', err);
    res.status(500).json({ error: err.message || 'Error al enviar correo de prueba.' });
  }
});

app.get('/api/user/profile', authMiddleware, async (req: any, res) => {
  try {
    const company = await CompanyRepo.getByUserId(req.user.id);
    const stores = await StoreRepo.getByUserId(req.user.id);

    // SHIP24GO_PROFILE_DEFAULT_BASIC_PLAN_V1_4_37
    const [subscriptionRows]: any = await pool.query(
      `SELECT
          sub.id AS id,
          sub.plan_id AS planId,
          COALESCE(pl.name, 'DoorDrop Básico') AS planName,
          sub.provider AS provider,
          sub.status AS status,
          sub.current_period_end AS currentPeriodEnd
        FROM subscriptions sub
        LEFT JOIN plans pl ON pl.id = sub.plan_id
        WHERE sub.user_id = ?
          AND sub.status IN ('active','trialing')
          AND sub.current_period_end > UTC_TIMESTAMP()
        ORDER BY sub.created_at DESC
        LIMIT 1`,
      [req.user.id]
    );

    const activeSubscription = subscriptionRows?.[0] || {
      id: '',
      planId: 'plan_basic',
      planName: 'DoorDrop Básico',
      provider: 'included',
      status: 'active',
      currentPeriodEnd: null
    };

    res.json({
      user: {
        ...req.user,
        subscription: activeSubscription,
        currentPlanId: activeSubscription.planId,
        currentPlanName: activeSubscription.planName
      },
      company: company ? {
        id: company.id,
        companyName: company.company_name,
        address: company.address,
        city: company.city,
        zipCode: company.zip_code,
        phone: company.phone,
        email: company.email
      } : null,
      stores: stores.map(s => ({
        id: s.id,
        platform: s.platform,
        status: s.status,
        createdAt: s.created_at
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo cargar el perfil.' });
  }
});


app.post('/api/user/settings', authMiddleware, async (req: any, res) => {
  try {
    await ensureWalletCurrencySchema();
    const allowedPaymentMethods = ['wallet', 'card', 'paypal'];
    const billing = req.body?.billing || {};
    const hasBillingPayload = Object.prototype.hasOwnProperty.call(req.body || {}, 'billing');
    const requestedPaymentMethod = String(req.body?.preferredPaymentMethod || '').toLowerCase();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [userRows]: any = await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
      const currentUser = userRows?.[0];
      if (!currentUser) throw new Error('No se pudo encontrar la cuenta.');
      const currentCurrency = normalizeCurrencyCode(currentUser.currency || 'EUR');
      const requestedCurrency = normalizeCurrencyCode(req.body?.currency || currentUser.currency || 'EUR');
      const preferredPaymentMethod = allowedPaymentMethods.includes(requestedPaymentMethod)
        ? requestedPaymentMethod
        : String(currentUser.preferred_payment_method || 'wallet').toLowerCase();
      const requestedLanguage = normalizeMailLanguage(req.body?.language || currentUser.language || currentUser.country || 'ES');
      const country = String(req.body?.country || currentUser.country || 'ES').toUpperCase().slice(0, 2);
      const nextName = String(req.body?.name || currentUser.name || '').trim().slice(0, 191) || currentUser.name;
      const nextPhone = String(req.body?.phone ?? currentUser.phone ?? '').trim().slice(0, 50);
      const nextBusinessType = String(req.body?.businessType ?? currentUser.business_type ?? '').trim().slice(0, 100);
      let nextBalance = roundMoney(Number(currentUser.balance || 0));
      let rates: Record<string, number> = { EUR: 1 };
      if (currentCurrency !== requestedCurrency) {
        rates = await getFreshRatesInternal();
        nextBalance = convertMoneyAmountStrict(nextBalance, currentCurrency, requestedCurrency, rates);
        await recordWalletCurrencyConversion(conn, {
          userId: currentUser.id,
          fromCurrency: currentCurrency,
          toCurrency: requestedCurrency,
          fromBalance: Number(currentUser.balance || 0),
          toBalance: nextBalance,
          rates
        });
      }
      await conn.query(
        `UPDATE users
         SET name = ?, phone = ?, country = ?, currency = ?, balance = ?, business_type = ?, preferred_payment_method = ?, language = ?
         WHERE id = ?`,
        [nextName, nextPhone, country, requestedCurrency, nextBalance, nextBusinessType, preferredPaymentMethod, requestedLanguage, currentUser.id]
      );
      await conn.commit();
    } catch (error) {
      try { await conn.rollback(); } catch {}
      throw error;
    } finally {
      conn.release();
    }

    const existingCompany = await CompanyRepo.getByUserId(req.user.id);
    const updatedBaseUser = await UserRepo.getById(req.user.id);
    let updatedCompany = existingCompany;
    if (hasBillingPayload) {
      const country = String(updatedBaseUser?.country || req.user.country || 'ES').toUpperCase().slice(0, 2);
      const companyPayload = {
        company_name: String(billing.companyName || req.body?.name || updatedBaseUser?.name || req.user.name || '').trim().slice(0, 191),
        email: String(billing.email || updatedBaseUser?.email || req.user.email || '').trim().slice(0, 191),
        phone: String(billing.phone || req.body?.phone || updatedBaseUser?.phone || '').trim().slice(0, 50),
        address: String(billing.address || '').trim().slice(0, 255),
        city: String(billing.city || '').trim().slice(0, 120),
        zip_code: String(billing.zipCode || '').trim().slice(0, 30),
        country: String(billing.country || country).toUpperCase().slice(0, 2)
      };

      if (existingCompany) {
        await pool.query(
          `UPDATE companies SET company_name = ?, email = ?, phone = ?, address = ?, city = ?, zip_code = ?, country = ? WHERE id = ? AND user_id = ?`,
          [companyPayload.company_name, companyPayload.email, companyPayload.phone, companyPayload.address, companyPayload.city, companyPayload.zip_code, companyPayload.country, existingCompany.id, req.user.id]
        );
      } else {
        updatedCompany = await CompanyRepo.create({
          id: generateId('comp_'),
          user_id: req.user.id,
          company_name: companyPayload.company_name,
          email: companyPayload.email,
          phone: companyPayload.phone,
          address: companyPayload.address,
          city: companyPayload.city,
          zip_code: companyPayload.zip_code,
          country: companyPayload.country
        });
      }
    }

    const updatedUser = await UserRepo.getById(req.user.id);
    updatedCompany = updatedCompany || await CompanyRepo.getByUserId(req.user.id);
    res.json({
      success: true,
      message: 'Configuración guardada correctamente.',
      user: {
        ...req.user,
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        phone: updatedUser.phone,
        country: updatedUser.country,
        language: normalizeMailLanguage(updatedUser.language || updatedUser.country || 'ES'),
        currency: normalizeCurrencyCode(updatedUser.currency || 'EUR'),
        businessType: updatedUser.business_type,
        balance: Number(updatedUser.balance || 0),
      preferredPaymentMethod: updatedUser.preferred_payment_method || 'wallet'
      },
      company: updatedCompany ? {
        id: updatedCompany.id,
        companyName: updatedCompany.company_name,
        address: updatedCompany.address,
        city: updatedCompany.city,
        zipCode: updatedCompany.zip_code,
        phone: updatedCompany.phone,
        email: updatedCompany.email,
        country: updatedCompany.country
      } : null
    });
  } catch (error: any) {
    if (error?.code === 'FX_UNAVAILABLE') {
      return res.status(503).json({ error: 'No se pudo obtener la tasa de cambio. Tu saldo no fue modificado; inténtalo de nuevo.' });
    }
    console.error('[user/settings] error:', error?.message || error);
    res.status(500).json({ error: 'No se pudo guardar la configuración.' });
  }
});


// Cliente: estado de cuenta y movimientos reales.
// No existe una tabla fiscal de facturas en DoorDrop; este módulo expone
// únicamente registros contables persistidos para el usuario autenticado.
type DoorDropBillingLanguage = 'es' | 'en' | 'it' | 'fr';

function normalizeBillingLanguage(value: any): DoorDropBillingLanguage {
  const code = String(value || 'es').toLowerCase().slice(0, 2);
  return code === 'en' || code === 'it' || code === 'fr' ? code : 'es';
}

const billingServerCopy: Record<DoorDropBillingLanguage, Record<string, string>> = {
  es: {
    title: 'Estado de cuenta DoorDrop',
    subtitle: 'Movimientos reales de tu saldo, recargas, pagos y suscripciones.',
    publicNote: 'Documento informativo de DoorDrop — estado de cuenta de la cuenta autenticada.',
    walletCredit: 'Abono en monedero',
    walletDebit: 'Cargo de envío',
    walletRefund: 'Reembolso',
    walletHold: 'Retención temporal',
    walletRelease: 'Liberación de saldo',
    topup: 'Recarga de saldo',
    payment: 'Pago',
    subscription: 'Suscripción',
    unknown: 'Movimiento de cuenta',
    incoming: 'Entrada',
    outgoing: 'Salida',
    pending: 'Pendiente',
    completed: 'Completado',
    paid: 'Pagado',
    failed: 'Fallido',
    refunded: 'Reembolsado',
    cancelled: 'Cancelado',
    active: 'Activo',
    canceled: 'Cancelado',
    statementTitle: 'Estado de cuenta', issued: 'Emisión', period: 'Periodo', allPeriod: 'Todos los movimientos', preparedFor: 'Preparado para', account: 'Cuenta', currency: 'Moneda', version: 'Versión', summary: 'Resumen del periodo', availableBalance: 'Saldo disponible', movements: 'Movimientos', topups: 'Recargas completadas', payments: 'Pagos completados', activity: 'Detalle de movimientos', date: 'Fecha', concept: 'Concepto', status: 'Estado', direction: 'Sentido', amount: 'Importe', reference: 'Referencia', referenceShort: 'Ref.', subscriptions: 'Suscripciones', noActivity: 'No hay movimientos registrados.', noSubscriptions: 'No hay suscripciones registradas.', renews: 'Renueva', note: 'Documento informativo basado en los registros reales de DoorDrop.', footerNote: 'Estado de cuenta informativo', page: 'Página', continuation: 'Estado de cuenta', notConfigured: 'Perfil no configurado'
  },
  en: {
    title: 'DoorDrop account statement',
    subtitle: 'Real activity from your balance, top-ups, payments and subscriptions.',
    publicNote: 'DoorDrop informational document — statement for the authenticated account.',
    walletCredit: 'Wallet credit',
    walletDebit: 'Shipment charge',
    walletRefund: 'Refund',
    walletHold: 'Temporary hold',
    walletRelease: 'Balance release',
    topup: 'Balance top-up',
    payment: 'Payment',
    subscription: 'Subscription',
    unknown: 'Account activity',
    incoming: 'Incoming',
    outgoing: 'Outgoing',
    pending: 'Pending',
    completed: 'Completed',
    paid: 'Paid',
    failed: 'Failed',
    refunded: 'Refunded',
    cancelled: 'Cancelled',
    active: 'Active',
    canceled: 'Canceled',
    statementTitle: 'Account statement', issued: 'Issued', period: 'Period', allPeriod: 'All movements', preparedFor: 'Prepared for', account: 'Account', currency: 'Currency', version: 'Version', summary: 'Period summary', availableBalance: 'Available balance', movements: 'Movements', topups: 'Completed top-ups', payments: 'Completed payments', activity: 'Movement details', date: 'Date', concept: 'Concept', status: 'Status', direction: 'Direction', amount: 'Amount', reference: 'Reference', referenceShort: 'Ref.', subscriptions: 'Subscriptions', noActivity: 'No account activity found.', noSubscriptions: 'No subscriptions recorded.', renews: 'Renews', note: 'Informational document based on real DoorDrop records.', footerNote: 'Informational account statement', page: 'Page', continuation: 'Account statement', notConfigured: 'Profile not configured'
  },
  it: {
    title: 'Estratto conto DoorDrop',
    subtitle: 'Movimenti reali del saldo, ricariche, pagamenti e abbonamenti.',
    publicNote: 'Documento informativo DoorDrop — estratto del conto autenticato.',
    walletCredit: 'Accredito sul wallet',
    walletDebit: 'Addebito spedizione',
    walletRefund: 'Rimborso',
    walletHold: 'Blocco temporaneo',
    walletRelease: 'Sblocco saldo',
    topup: 'Ricarica saldo',
    payment: 'Pagamento',
    subscription: 'Abbonamento',
    unknown: 'Movimento del conto',
    incoming: 'Entrata',
    outgoing: 'Uscita',
    pending: 'In attesa',
    completed: 'Completato',
    paid: 'Pagato',
    failed: 'Fallito',
    refunded: 'Rimborsato',
    cancelled: 'Annullato',
    active: 'Attivo',
    canceled: 'Annullato',
    statementTitle: 'Estratto conto', issued: 'Emissione', period: 'Periodo', allPeriod: 'Tutti i movimenti', preparedFor: 'Preparato per', account: 'Conto', currency: 'Valuta', version: 'Versione', summary: 'Riepilogo del periodo', availableBalance: 'Saldo disponibile', movements: 'Movimenti', topups: 'Ricariche completate', payments: 'Pagamenti completati', activity: 'Dettaglio movimenti', date: 'Data', concept: 'Voce', status: 'Stato', direction: 'Direzione', amount: 'Importo', reference: 'Riferimento', referenceShort: 'Rif.', subscriptions: 'Abbonamenti', noActivity: 'Nessun movimento trovato.', noSubscriptions: 'Nessun abbonamento registrato.', renews: 'Rinnova', note: 'Documento informativo basato sui registri reali di DoorDrop.', footerNote: 'Estratto conto informativo', page: 'Pagina', continuation: 'Estratto conto', notConfigured: 'Profilo non configurato'
  },
  fr: {
    title: 'Relevé de compte DoorDrop',
    subtitle: 'Activité réelle du solde, recharges, paiements et abonnements.',
    publicNote: 'Document informatif DoorDrop — relevé du compte authentifié.',
    walletCredit: 'Crédit du portefeuille',
    walletDebit: 'Débit d’expédition',
    walletRefund: 'Remboursement',
    walletHold: 'Blocage temporaire',
    walletRelease: 'Libération du solde',
    topup: 'Recharge du solde',
    payment: 'Paiement',
    subscription: 'Abonnement',
    unknown: 'Mouvement du compte',
    incoming: 'Entrée',
    outgoing: 'Sortie',
    pending: 'En attente',
    completed: 'Terminé',
    paid: 'Payé',
    failed: 'Échec',
    refunded: 'Remboursé',
    cancelled: 'Annulé',
    active: 'Actif',
    canceled: 'Annulé',
    statementTitle: 'Relevé de compte', issued: 'Émission', period: 'Période', allPeriod: 'Tous les mouvements', preparedFor: 'Préparé pour', account: 'Compte', currency: 'Devise', version: 'Version', summary: 'Résumé de la période', availableBalance: 'Solde disponible', movements: 'Mouvements', topups: 'Recharges terminées', payments: 'Paiements terminés', activity: 'Détail des mouvements', date: 'Date', concept: 'Libellé', status: 'Statut', direction: 'Sens', amount: 'Montant', reference: 'Référence', referenceShort: 'Réf.', subscriptions: 'Abonnements', noActivity: 'Aucun mouvement trouvé.', noSubscriptions: 'Aucun abonnement enregistré.', renews: 'Renouvellement', note: 'Document informatif basé sur les registres réels de DoorDrop.', footerNote: 'Relevé de compte informatif', page: 'Page', continuation: 'Relevé de compte', notConfigured: 'Profil non configuré'
  }
};

function billingDateFilter(query: any) {
  const from = String(query?.from || '').trim();
  const to = String(query?.to || '').trim();
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  const clauses: string[] = [];
  const values: any[] = [];
  if (validDate(from)) {
    clauses.push('created_at >= ?');
    values.push(`${from} 00:00:00`);
  }
  if (validDate(to)) {
    clauses.push('created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    values.push(`${to} 00:00:00`);
  }
  return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', values };
}

function billingEntryStatus(value: any, fallback = 'completed') {
  return String(value || fallback).trim().toLowerCase() || fallback;
}

function billingWalletDescription(type: string, _fallback: string, copy: Record<string, string>) {
  const key = type === 'credit' ? 'walletCredit'
    : type === 'debit' ? 'walletDebit'
      : type === 'refund' ? 'walletRefund'
        : type === 'hold' ? 'walletHold'
          : type === 'release' ? 'walletRelease' : 'unknown';
  // Customer statements use public accounting concepts only. Internal
  // descriptions can contain provider, supplier, or routing details.
  return copy[key];
}

function billingEntryReference(value: any) {
  const reference = String(value || '').trim();
  return reference ? reference.slice(0, 80) : '';
}

function billingEntryDate(value: any) {
  if (value instanceof Date) return value.toISOString();
  return value ? String(value) : null;
}

function billingEntrySortDate(value: any) {
  const stamp = Date.parse(String(value || ''));
  return Number.isFinite(stamp) ? stamp : 0;
}

function billingEntryMatchesQuery(entry: any, query: any = {}) {
  const requestedStatus = String(query?.status || '').trim().toLowerCase();
  const requestedType = String(query?.type || '').trim().toLowerCase();
  const normalizedRequestedStatus = requestedStatus === 'cancelled' ? 'canceled' : requestedStatus;
  if (normalizedRequestedStatus && normalizedRequestedStatus !== 'all' && String(entry.status || '').toLowerCase() !== normalizedRequestedStatus) return false;
  if (!requestedType || requestedType === 'all') return true;
  if (requestedType === 'topup') return entry.source === 'topup';
  if (requestedType === 'subscription') return entry.source === 'payment' && entry.type === 'subscription';
  if (requestedType === 'payment') return entry.source === 'payment' && entry.type !== 'subscription';
  if (requestedType === 'wallet') return entry.source === 'wallet';
  if (requestedType === 'incoming') return entry.direction === 'incoming';
  if (requestedType === 'outgoing') return entry.direction === 'outgoing';
  return true;
}

async function loadUserBillingData(userId: string, query: any = {}, includeAll = false) {
  await ensureShip24GoBillingColumns();
  const [userRows]: any = await pool.query(
    'SELECT id, name, email, currency, balance, language FROM users WHERE id = ? AND role = \'customer\' LIMIT 1',
    [userId]
  );
  const user = userRows?.[0];
  if (!user) {
    const error: any = new Error('Cliente no encontrado.');
    error.code = 'CUSTOMER_NOT_FOUND';
    throw error;
  }

  const [companyRows]: any = await pool.query(
    'SELECT id, company_name, address, city, zip_code, country, phone, email FROM companies WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  const filter = billingDateFilter(query);
  const limit = includeAll ? 1000 : Math.max(1, Math.min(100, Number(query?.pageSize || 25)));
  const page = includeAll ? 1 : Math.max(1, Number(query?.page || 1));

  const [walletRows]: any = await pool.query(
    `SELECT id, type, amount, currency, description, reference_type, reference_id, status, created_at
       FROM wallet_transactions
      WHERE user_id = ?${filter.sql}
      ORDER BY created_at DESC
      LIMIT 1000`,
    [userId, ...filter.values]
  );
  const [topupRows]: any = await pool.query(
    `SELECT id, amount, currency, method, status, external_reference, payment_provider, provider_reference, created_at
       FROM wallet_topups
      WHERE user_id = ?${filter.sql}
      ORDER BY created_at DESC
      LIMIT 1000`,
    [userId, ...filter.values]
  );
  const [paymentRows]: any = await pool.query(
    `SELECT id, shipment_id, provider, external_payment_id, amount, currency, status, purpose, plan_id, subscription_id, created_at
       FROM payments
      WHERE user_id = ?${filter.sql}
      ORDER BY created_at DESC
      LIMIT 1000`,
    [userId, ...filter.values]
  );
  const [subscriptionRows]: any = await pool.query(
    `SELECT sub.id, sub.plan_id, COALESCE(pl.name, sub.plan_id) AS plan_name, sub.provider,
            CASE
              WHEN sub.status IN ('active','trialing')
                AND (sub.current_period_end IS NULL OR sub.current_period_end <= UTC_TIMESTAMP())
              THEN 'expired'
              ELSE sub.status
            END AS status,
            sub.current_period_start, sub.current_period_end, sub.created_at
       FROM subscriptions sub
       LEFT JOIN plans pl ON pl.id = sub.plan_id
      WHERE sub.user_id = ?${filter.sql.replaceAll('created_at', 'sub.created_at')}
      ORDER BY sub.created_at DESC
      LIMIT 100`,
    [userId, ...filter.values]
  );

  const billingLanguage = normalizeBillingLanguage(query?.lang || user.language || 'es');
  const copy = billingServerCopy[billingLanguage];
  const entries: any[] = [];
  for (const row of walletRows || []) {
    const type = String(row.type || '').toLowerCase();
    const incoming = type === 'credit' || type === 'refund' || type === 'release';
    const date = billingEntryDate(row.created_at);
    entries.push({
      id: String(row.id),
      source: 'wallet',
      type: type || 'movement',
      title: billingWalletDescription(type, row.description, copy),
      description: billingWalletDescription(type, row.description, copy),
      direction: incoming ? 'incoming' : 'outgoing',
      amount: roundMoney(Number(row.amount || 0)),
      currency: normalizeCurrencyCode(row.currency || user.currency || 'EUR'),
      status: billingEntryStatus(row.status),
      referenceType: String(row.reference_type || '').trim(),
      reference: billingEntryReference(row.reference_id),
      createdAt: date
    });
  }
  for (const row of topupRows || []) {
    const date = billingEntryDate(row.created_at);
    entries.push({
      id: String(row.id),
      source: 'topup',
      type: 'topup',
      title: copy.topup,
      description: copy.topup,
      direction: 'incoming',
      amount: roundMoney(Number(row.amount || 0)),
      currency: normalizeCurrencyCode(row.currency || user.currency || 'EUR'),
      status: billingEntryStatus(row.status, 'pending'),
      referenceType: 'wallet_topup',
      reference: billingEntryReference(row.provider_reference || row.external_reference || row.id),
      createdAt: date
    });
  }
  for (const row of paymentRows || []) {
    const status = billingEntryStatus(row.status, 'pending');
    const incoming = status === 'refunded';
    const purpose = String(row.purpose || '').toLowerCase();
    const title = purpose === 'subscription' ? copy.subscription : copy.payment;
    const date = billingEntryDate(row.created_at);
    entries.push({
      id: String(row.id),
      source: 'payment',
      type: purpose || 'payment',
      title,
      description: title,
      direction: incoming ? 'incoming' : 'outgoing',
      amount: roundMoney(Number(row.amount || 0)),
      currency: normalizeCurrencyCode(row.currency || user.currency || 'EUR'),
      status,
      referenceType: purpose || 'payment',
      reference: billingEntryReference(row.external_payment_id || row.id),
      shipmentId: row.shipment_id ? String(row.shipment_id) : '',
      planId: row.plan_id ? String(row.plan_id) : '',
      subscriptionId: row.subscription_id ? String(row.subscription_id) : '',
      createdAt: date
    });
  }

  entries.sort((a, b) => billingEntrySortDate(b.createdAt) - billingEntrySortDate(a.createdAt));
  const filteredEntries = entries.filter((entry) => billingEntryMatchesQuery(entry, query));
  const totalEntries = filteredEntries.length;
  const offset = includeAll ? 0 : (page - 1) * limit;
  const visibleEntries = filteredEntries.slice(offset, offset + limit);

  const credits = filteredEntries.reduce((sum: number, entry: any) => {
    return sum + (entry.source === 'wallet' && entry.direction === 'incoming' ? Number(entry.amount || 0) : 0);
  }, 0);
  const debits = filteredEntries.reduce((sum: number, entry: any) => {
    return sum + (entry.source === 'wallet' && entry.direction === 'outgoing' ? Number(entry.amount || 0) : 0);
  }, 0);
  const paidPayments = filteredEntries.filter((entry: any) => entry.source === 'payment' && entry.status === 'paid');
  const completedTopups = filteredEntries.filter((entry: any) => entry.source === 'topup' && entry.status === 'completed');
  const ignoredCostStatuses = new Set(['failed', 'cancelled', 'canceled', 'refunded']);
  const costBuckets = new Map<string, { reason: string; amount: number; currency: string; count: number }>();
  for (const entry of filteredEntries) {
    if (entry.direction !== 'outgoing' || ignoredCostStatuses.has(String(entry.status || '').toLowerCase())) continue;
    const reason = String(entry.title || copy.unknown);
    const currency = normalizeCurrencyCode(entry.currency || user.currency || 'EUR');
    const key = `${currency}:${reason}`;
    const current = costBuckets.get(key) || { reason, amount: 0, currency, count: 0 };
    current.amount = roundMoney(current.amount + Number(entry.amount || 0));
    current.count += 1;
    costBuckets.set(key, current);
  }
  const allCosts = Array.from(costBuckets.values())
    .sort((a, b) => b.amount - a.amount)
    .map((item) => ({ ...item, amount: roundMoney(item.amount) }));
  const accountCurrency = normalizeCurrencyCode(user.currency || 'EUR');
  const totalCosts = roundMoney(allCosts
    .filter((item) => item.currency === accountCurrency)
    .reduce((sum, item) => sum + item.amount, 0));
  const costs = allCosts.slice(0, 8);

  return {
    account: {
      id: String(user.id),
      name: String(user.name || ''),
      email: String(user.email || ''),
      currency: normalizeCurrencyCode(user.currency || 'EUR'),
      balance: roundMoney(Number(user.balance || 0)),
      language: billingLanguage
    },
    billingProfile: companyRows?.[0] ? {
      id: String(companyRows[0].id),
      companyName: String(companyRows[0].company_name || ''),
      address: String(companyRows[0].address || ''),
      city: String(companyRows[0].city || ''),
      zipCode: String(companyRows[0].zip_code || ''),
      country: String(companyRows[0].country || ''),
      phone: String(companyRows[0].phone || ''),
      email: String(companyRows[0].email || '')
    } : null,
    summary: {
      walletCredits: roundMoney(credits),
      walletDebits: roundMoney(debits),
      paidPayments: paidPayments.length,
      completedTopups: completedTopups.length,
      totalEntries
    },
    analytics: {
      totalCosts,
      costs
    },
    entries: visibleEntries,
    subscriptions: (subscriptionRows || []).map((row: any) => ({
      id: String(row.id),
      planId: String(row.plan_id || ''),
      planName: String(row.plan_name || row.plan_id || ''),
      provider: String(row.provider || '').trim(),
      status: billingEntryStatus(row.status, 'active'),
      currentPeriodStart: billingEntryDate(row.current_period_start),
      currentPeriodEnd: billingEntryDate(row.current_period_end),
      createdAt: billingEntryDate(row.created_at)
    })),
    pagination: {
      page,
      pageSize: limit,
      total: totalEntries,
      totalPages: Math.max(1, Math.ceil(totalEntries / limit))
    }
  };
}

function billingCsvCell(value: any) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function formatBillingDateForPdf(value: any, lang: DoorDropBillingLanguage) {
  if (!value) return '';
  const locale = lang === 'en' ? 'en-US' : lang === 'fr' ? 'fr-FR' : lang === 'it' ? 'it-IT' : 'es-ES';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(value));
  } catch {
    return String(value);
  }
}

app.get('/api/user/billing', authMiddleware, async (req: any, res) => {
  try {
    const data = await loadUserBillingData(String(req.user.id), req.query || {});
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(data);
  } catch (error: any) {
    if (error?.code === 'CUSTOMER_NOT_FOUND') return res.status(404).json({ error: 'Cliente no encontrado.' });
    console.error('[user/billing] error:', error?.message || error);
    res.status(500).json({ error: 'No se pudo cargar el estado de cuenta.' });
  }
});

app.get('/api/user/billing/export', authMiddleware, async (req: any, res) => {
  try {
    const format = String(req.query?.format || 'csv').toLowerCase();
    if (format !== 'csv' && format !== 'pdf') return res.status(400).json({ error: 'Formato de exportación no disponible.' });
    const requestedLang = String(req.query?.lang || '').trim();
    const data = await loadUserBillingData(String(req.user.id), { ...(req.query || {}), lang: requestedLang }, true);
    const lang = normalizeBillingLanguage(requestedLang || data.account.language || 'es');
    const copy = billingServerCopy[lang];
    const dateStamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const headers = lang === 'en'
        ? ['Date', 'Concept', 'Direction', 'Status', 'Amount', 'Currency', 'Reference']
        : lang === 'it'
          ? ['Data', 'Voce', 'Direzione', 'Stato', 'Importo', 'Valuta', 'Riferimento']
          : lang === 'fr'
            ? ['Date', 'Libellé', 'Sens', 'Statut', 'Montant', 'Devise', 'Référence']
            : ['Fecha', 'Concepto', 'Sentido', 'Estado', 'Importe', 'Moneda', 'Referencia'];
      const rows = data.entries.map((entry: any) => [
        entry.createdAt || '', entry.title, copy[entry.direction] || entry.direction,
        copy[entry.status] || entry.status, Number(entry.amount || 0).toFixed(2), entry.currency, entry.reference
      ]);
      const csv = [headers, ...rows].map((row) => row.map(billingCsvCell).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="doordrop-estado-cuenta-${dateStamp}.csv"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.send(`\uFEFF${csv}`);
    }

    const from = String(req.query?.from || '').trim();
    const to = String(req.query?.to || '').trim();
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
    const periodLabel = validDate(from) && validDate(to)
      ? `${formatBillingDateForPdf(from, lang)} - ${formatBillingDateForPdf(to, lang)}`
      : validDate(from)
        ? `${formatBillingDateForPdf(from, lang)} - ${formatBillingDateForPdf(dateStamp, lang)}`
        : validDate(to)
          ? `${copy.allPeriod} - ${formatBillingDateForPdf(to, lang)}`
          : copy.allPeriod;
    const pdfEntries = data.entries.map((entry: any) => ({
      ...entry,
      direction: copy[entry.direction] || entry.direction,
      status: copy[entry.status] || entry.status
    }));
    const pdfSubscriptions = data.subscriptions.map((subscription: any) => ({
      planName: subscription.planName,
      status: copy[subscription.status] || subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd
    }));
    const pdf = billingStatementToPdfBuffer({
      lang,
      version: APP_VERSION,
      issueDate: formatBillingDateForPdf(dateStamp, lang),
      periodLabel,
      account: data.account,
      billingProfile: data.billingProfile,
      summary: data.summary,
      entries: pdfEntries,
      subscriptions: pdfSubscriptions,
      labels: copy
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="doordrop-estado-cuenta-${dateStamp}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(pdf);
  } catch (error: any) {
    if (error?.code === 'CUSTOMER_NOT_FOUND') return res.status(404).json({ error: 'Cliente no encontrado.' });
    console.error('[user/billing/export] error:', error?.message || error);
    res.status(500).json({ error: 'No se pudo generar el documento.' });
  }
});


// 3B. Integraciones Ecart API (tiendas ecommerce)
let ecartSchemaReady = false;

function ecartEnabledValue(raw: any) {
  return ['1', 'true', 'yes', 'si', 'sí', 'on', 'enabled', 'active'].includes(String(raw ?? 'true').trim().toLowerCase());
}

function getCookieValue(req: any, name: string) {
  const raw = String(req.headers?.cookie || '');
  const parts = raw.split(';').map((p) => p.trim());
  const item = parts.find((p) => p.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : '';
}

function setEcartStateCookie(res: any, state: string) {
  const secure = String(process.env.APP_URL || '').startsWith('https://') || process.env.NODE_ENV === 'production';
  const flags = [`ship24go_ecart_state=${encodeURIComponent(state)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=1800'];
  if (secure) flags.push('Secure');
  res.setHeader('Set-Cookie', flags.join('; '));
}

function clearEcartStateCookie(res: any) {
  const secure = String(process.env.APP_URL || '').startsWith('https://') || process.env.NODE_ENV === 'production';
  const flags = ['ship24go_ecart_state=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) flags.push('Secure');
  res.setHeader('Set-Cookie', flags.join('; '));
}

function normalizeStorePlatform(value: any) {
  const raw = String(value || 'Ecommerce').trim();
  const text = raw.toLowerCase();
  if (text.includes('shopify')) return 'Shopify';
  if (text.includes('woocommerce') || text.includes('woo')) return 'WooCommerce';
  if (text.includes('prestashop') || text.includes('presta')) return 'PrestaShop';
  if (text.includes('wix')) return 'Wix';
  if (text.includes('mercado')) return 'Mercado Libre';
  if (text.includes('amazon')) return 'Amazon';
  if (text.includes('ebay')) return 'eBay';
  return raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').slice(0, 80) || 'Ecommerce';
}

function ecartDefaultRedirectUrl() {
  return `${String(process.env.APP_URL || 'https://doordrop.lat').replace(/\/$/, '')}/api/integrations/ecartapi/callback`;
}

function ecartOauthUrl(appId: string) {
  return `https://oauth.ecartapi.com/${encodeURIComponent(appId)}?nobar=true`;
}

async function getEcartConfig() {
  const keys = await ApiKeysRepo.get();
  const appId = String(process.env.ECARTAPI_APP_ID || keys?.ecartApiClientId || '').trim();
  const clientSecret = String(process.env.ECARTAPI_CLIENT_SECRET || keys?.ecartClientSecret || '').trim();
  const appUrl = String(process.env.ECARTAPI_APP_URL || keys?.ecartAppUrl || process.env.APP_URL || 'https://doordrop.lat').replace(/\/$/, '');
  const redirectUrl = String(process.env.ECARTAPI_REDIRECT_URL || keys?.ecartRedirectUrl || ecartDefaultRedirectUrl()).trim();
  const baseUrl = String(process.env.ECARTAPI_BASE_URL || 'https://api.ecartapi.com').replace(/\/$/, '');
  const version = String(process.env.ECARTAPI_API_VERSION || 'v2').replace(/^api\//, '').replace(/^\//, '').trim() || 'v2';
  const enabled = ecartEnabledValue(process.env.ECARTAPI_ENABLED ?? 'true');
  return { keys, appId, clientSecret, appUrl, redirectUrl, baseUrl, version, enabled, oauthUrl: appId ? ecartOauthUrl(appId) : '' };
}

function ecartCryptoKey() {
  return crypto.createHash('sha256').update(String(process.env.STORE_TOKEN_SECRET || JWT_SECRET || 'ship24go-store-token')).digest();
}

function encryptStoreToken(value: any) {
  const raw = String(value || '');
  if (!raw) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ecartCryptoKey(), iv);
  const encrypted = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptStoreToken(value: any) {
  const raw = String(value || '');
  if (!raw) return '';
  if (!raw.startsWith('enc:v1:')) return raw;
  try {
    const [, , ivB64, tagB64, dataB64] = raw.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ecartCryptoKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function validateEcartApiKey(appId: string, accessToken: string, clientSecret: string, receivedKey: string) {
  if (!appId || !accessToken || !clientSecret || !receivedKey) return false;
  const expected = crypto.createHmac('sha256', clientSecret).update(`${appId}&${accessToken}`).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(receivedKey));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function ensureEcartSchema() {
  if (ecartSchemaReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS ecart_pending_connections (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    nonce_hash VARCHAR(191) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'pending',
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at DATETIME NULL,
    INDEX idx_ecart_pending_nonce (nonce_hash),
    INDEX idx_ecart_pending_user (user_id, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS store_orders (
    id CHAR(36) PRIMARY KEY,
    store_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    external_order_id VARCHAR(191) NOT NULL,
    order_number VARCHAR(191) NULL,
    ecommerce VARCHAR(80) NULL,
    order_status VARCHAR(80) NULL,
    fulfillment_status VARCHAR(80) NULL,
    customer_name VARCHAR(191) NULL,
    customer_email VARCHAR(191) NULL,
    customer_phone VARCHAR(80) NULL,
    currency CHAR(3) NULL,
    total_amount DECIMAL(12,2) NULL,
    shipping_name VARCHAR(191) NULL,
    shipping_phone VARCHAR(80) NULL,
    shipping_address1 VARCHAR(255) NULL,
    shipping_address2 VARCHAR(255) NULL,
    shipping_city VARCHAR(120) NULL,
    shipping_state VARCHAR(120) NULL,
    shipping_postal_code VARCHAR(50) NULL,
    shipping_country VARCHAR(10) NULL,
    address_quality VARCHAR(40) NOT NULL DEFAULT 'ready',
    address_alerts_json JSON NULL,
    package_json JSON NULL,
    raw_json JSON NULL,
    shipment_id CHAR(36) NULL,
    fulfillment_status_ship24go VARCHAR(40) NOT NULL DEFAULT 'pending',
    fulfillment_pushed_at DATETIME NULL,
    imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_store_order (store_id, external_order_id),
    INDEX idx_store_orders_user (user_id, imported_at),
    INDEX idx_store_orders_store (store_id, imported_at),
    INDEX idx_store_orders_quality (address_quality),
    INDEX idx_store_orders_shipment (shipment_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS store_sync_logs (
    id CHAR(36) PRIMARY KEY,
    store_id CHAR(36) NULL,
    user_id CHAR(36) NULL,
    direction VARCHAR(40) NOT NULL,
    action VARCHAR(80) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'ok',
    message VARCHAR(255) NULL,
    payload_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_store_sync_store (store_id, created_at),
    INDEX idx_store_sync_user (user_id, created_at),
    INDEX idx_store_sync_action (action, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  try { await pool.query(`ALTER TABLE stores MODIFY status ENUM('pending','connected','inactive','error','disconnected') NOT NULL DEFAULT 'pending'`); } catch {}
  ecartSchemaReady = true;
}

async function writeStoreSyncLog(storeId: string | null, userId: string | null, direction: string, action: string, status: string, message: string, payload: any = null) {
  try {
    await ensureEcartSchema();
    await pool.query(
      `INSERT INTO store_sync_logs (id, store_id, user_id, direction, action, status, message, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [generateId('slg_'), storeId, userId, direction, action, status, String(message || '').slice(0, 255), JSON.stringify(payload || {})]
    );
  } catch {}
}

function pickFirst(...values: any[]) {
  for (const v of values) {
    if (v === 0) return '0';
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

function normalizePhone(value: any) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/[^0-9+]/g, '');
  return digits.slice(0, 80);
}

function orderAddressFromRaw(order: any) {
  const shipping = order?.shippingAddress || order?.shipping_address || order?.shipping || order?.deliveryAddress || order?.delivery_address || order?.address || order?.customer?.shippingAddress || {};
  const customer = order?.customer || order?.buyer || order?.client || {};
  const fullName = pickFirst(shipping.name, shipping.fullName, shipping.full_name, shipping.recipient, `${shipping.firstName || shipping.first_name || customer.firstName || customer.first_name || ''} ${shipping.lastName || shipping.last_name || customer.lastName || customer.last_name || ''}`.trim(), customer.name, customer.fullName);
  return {
    name: String(fullName || '').slice(0, 191),
    phone: normalizePhone(pickFirst(shipping.phone, shipping.phoneNumber, shipping.telephone, customer.phone, customer.phoneNumber, order?.phone)),
    email: String(pickFirst(shipping.email, customer.email, order?.email, order?.customer_email)).slice(0, 191),
    address1: String(pickFirst(shipping.address1, shipping.address_1, shipping.address, shipping.street, shipping.line1, shipping.addressLine1)).slice(0, 255),
    address2: String(pickFirst(shipping.address2, shipping.address_2, shipping.line2, shipping.apartment, shipping.neighborhood, shipping.reference)).slice(0, 255),
    city: String(pickFirst(shipping.city, shipping.locality, shipping.municipality, shipping.town)).slice(0, 120),
    state: String(pickFirst(shipping.state, shipping.province, shipping.region, shipping.department)).slice(0, 120),
    postalCode: String(pickFirst(shipping.zip, shipping.zipCode, shipping.postalCode, shipping.postal_code, shipping.postcode)).slice(0, 50),
    country: String(pickFirst(shipping.countryCode, shipping.country_code, shipping.country, shipping.isoCountry, shipping.iso_country)).toUpperCase().slice(0, 10)
  };
}

function addressQualityForOrder(addr: any) {
  const alerts: string[] = [];
  if (!addr.name) alerts.push('Nombre del destinatario pendiente');
  if (!addr.country || addr.country.length < 2) alerts.push('País pendiente');
  if (!addr.city) alerts.push('Ciudad pendiente');
  if (!addr.postalCode) alerts.push('Código postal pendiente');
  if (!addr.address1 || addr.address1.length < 5) alerts.push('Dirección incompleta');
  if (!addr.phone) alerts.push('Teléfono pendiente');
  const quality = alerts.length ? 'needs_review' : 'ready';
  return { quality, alerts };
}

function normalizeEcartOrder(order: any, store: any) {
  const externalId = String(pickFirst(order?.id, order?.orderId, order?.order_id, order?.externalId, order?.external_id, order?.name, order?.number, order?.orderNumber, order?.order_number)).slice(0, 191);
  const orderNumber = String(pickFirst(order?.orderNumber, order?.order_number, order?.number, order?.name, externalId)).slice(0, 191);
  const customer = order?.customer || order?.buyer || order?.client || {};
  const addr = orderAddressFromRaw(order);
  const quality = addressQualityForOrder(addr);
  const items = Array.isArray(order?.items) ? order.items : Array.isArray(order?.lineItems) ? order.lineItems : Array.isArray(order?.line_items) ? order.line_items : Array.isArray(order?.products) ? order.products : [];
  const totalWeight = items.reduce((sum: number, item: any) => sum + (Number(item?.weight || item?.weight_kg || 0) * Number(item?.quantity || item?.qty || 1)), 0);
  const packageJson = {
    items: items.slice(0, 80).map((item: any) => ({
      name: String(item?.name || item?.title || item?.sku || 'Producto').slice(0, 191),
      sku: String(item?.sku || item?.variantSku || '').slice(0, 120),
      quantity: Number(item?.quantity || item?.qty || 1) || 1,
      weight: Number(item?.weight || item?.weight_kg || 0) || null
    })),
    packages: Array.isArray(order?.packages) ? order.packages : [],
    estimatedPackage: { width: 20, height: 10, length: 20, weight: Math.max(0.2, Number(totalWeight || 1) || 1), qty: 1 }
  };
  return {
    externalId: externalId || crypto.createHash('sha1').update(JSON.stringify(order || {})).digest('hex'),
    orderNumber,
    ecommerce: normalizeStorePlatform(store?.platform || order?.ecommerce || order?.platform),
    orderStatus: String(pickFirst(order?.status, order?.orderStatus, order?.financial_status, order?.paymentStatus, 'open')).slice(0, 80),
    fulfillmentStatus: String(pickFirst(order?.fulfillmentStatus, order?.fulfillment_status, order?.shippingStatus, 'pending')).slice(0, 80),
    customerName: String(pickFirst(customer.name, customer.fullName, `${customer.firstName || ''} ${customer.lastName || ''}`.trim(), addr.name)).slice(0, 191),
    customerEmail: String(pickFirst(customer.email, order?.email, addr.email)).slice(0, 191),
    customerPhone: normalizePhone(pickFirst(customer.phone, order?.phone, addr.phone)),
    currency: String(pickFirst(order?.currency, order?.currencyCode, order?.total?.currency, 'EUR')).toUpperCase().slice(0, 3),
    totalAmount: Number(pickFirst(order?.total, order?.totalPrice, order?.total_price, order?.amount, order?.total?.amount, 0)) || 0,
    address: addr,
    quality,
    packageJson,
    raw: order
  };
}

function extractOrderArray(json: any) {
  if (Array.isArray(json)) return json;
  const candidates = [json?.orders, json?.data?.orders, json?.data, json?.results, json?.items, json?.response?.orders, json?.response?.data];
  for (const c of candidates) if (Array.isArray(c)) return c;
  return [];
}

async function fetchEcartOrders(store: any, limit = 100) {
  const cfg = await getEcartConfig();
  const token = decryptStoreToken(store.access_token_enc);
  if (!token) throw new Error('store_token_missing');
  const url = `${cfg.baseUrl}/api/${cfg.version}/orders?limit=${encodeURIComponent(String(Math.min(Math.max(Number(limit || 100), 1), 250)))}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const text = await response.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!response.ok) {
    await writeStoreSyncLog(store.id, store.user_id, 'inbound', 'orders_fetch', 'error', 'No fue posible sincronizar los pedidos.', { status: response.status, body: String(text || '').slice(0, 900) });
    throw new Error('orders_fetch_failed');
  }
  return { orders: extractOrderArray(json), raw: json };
}

async function upsertStoreOrder(store: any, normalized: any) {
  await pool.query(
    `INSERT INTO store_orders (
      id, store_id, user_id, external_order_id, order_number, ecommerce, order_status, fulfillment_status,
      customer_name, customer_email, customer_phone, currency, total_amount,
      shipping_name, shipping_phone, shipping_address1, shipping_address2, shipping_city, shipping_state, shipping_postal_code, shipping_country,
      address_quality, address_alerts_json, package_json, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      order_number = VALUES(order_number), ecommerce = VALUES(ecommerce), order_status = VALUES(order_status), fulfillment_status = VALUES(fulfillment_status),
      customer_name = VALUES(customer_name), customer_email = VALUES(customer_email), customer_phone = VALUES(customer_phone), currency = VALUES(currency), total_amount = VALUES(total_amount),
      shipping_name = VALUES(shipping_name), shipping_phone = VALUES(shipping_phone), shipping_address1 = VALUES(shipping_address1), shipping_address2 = VALUES(shipping_address2),
      shipping_city = VALUES(shipping_city), shipping_state = VALUES(shipping_state), shipping_postal_code = VALUES(shipping_postal_code), shipping_country = VALUES(shipping_country),
      address_quality = VALUES(address_quality), address_alerts_json = VALUES(address_alerts_json), package_json = VALUES(package_json), raw_json = VALUES(raw_json), updated_at = NOW()`,
    [
      generateId('ord_'), store.id, store.user_id, normalized.externalId, normalized.orderNumber, normalized.ecommerce,
      normalized.orderStatus, normalized.fulfillmentStatus, normalized.customerName, normalized.customerEmail, normalized.customerPhone,
      normalized.currency, normalized.totalAmount, normalized.address.name, normalized.address.phone, normalized.address.address1, normalized.address.address2,
      normalized.address.city, normalized.address.state, normalized.address.postalCode, normalized.address.country,
      normalized.quality.quality, JSON.stringify(normalized.quality.alerts), JSON.stringify(normalized.packageJson), JSON.stringify(normalized.raw)
    ]
  );
}

async function syncEcartStoreOrders(storeId: string, userId: string, limit = 100) {
  await ensureEcartSchema();
  const [rows]: any = await pool.query('SELECT * FROM stores WHERE id = ? AND user_id = ? LIMIT 1', [storeId, userId]);
  const store = rows[0];
  if (!store) throw new Error('store_not_found');
  if (String(store.status) !== 'connected') throw new Error('store_not_connected');
  const result = await fetchEcartOrders(store, limit);
  let imported = 0;
  let needsReview = 0;
  for (const order of result.orders) {
    const normalized = normalizeEcartOrder(order, store);
    if (!normalized.externalId) continue;
    await upsertStoreOrder(store, normalized);
    imported += 1;
    if (normalized.quality.quality === 'needs_review') needsReview += 1;
  }
  await pool.query('UPDATE stores SET updated_at = NOW(), status = ? WHERE id = ?', ['connected', store.id]);
  await writeStoreSyncLog(store.id, userId, 'inbound', 'orders_sync', 'ok', `${imported} pedidos sincronizados.`, { imported, needsReview });
  return { imported, needsReview };
}

function orderToClient(row: any) {
  const alerts = safeJsonParse(row.address_alerts_json, []);
  const packageJson = safeJsonParse(row.package_json, {});
  return {
    id: row.id,
    storeId: row.store_id,
    orderNumber: row.order_number,
    externalOrderId: row.external_order_id,
    ecommerce: row.ecommerce,
    status: row.order_status,
    fulfillmentStatus: row.fulfillment_status,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    currency: row.currency,
    totalAmount: Number(row.total_amount || 0),
    shipping: {
      name: row.shipping_name,
      phone: row.shipping_phone,
      address1: row.shipping_address1,
      address2: row.shipping_address2,
      city: row.shipping_city,
      state: row.shipping_state,
      postalCode: row.shipping_postal_code,
      country: row.shipping_country
    },
    addressQuality: row.address_quality,
    addressAlerts: Array.isArray(alerts) ? alerts : [],
    packageJson,
    shipmentId: row.shipment_id,
    fulfillmentShip24Go: row.fulfillment_status_ship24go,
    importedAt: row.imported_at,
    updatedAt: row.updated_at
  };
}

function orderPrefill(row: any, user: any) {
  const packageJson = safeJsonParse(row.package_json, {});
  const estimatedPackage = packageJson?.estimatedPackage || { width: 20, height: 10, length: 20, weight: 1, qty: 1 };
  return {
    storeOrder: { id: row.id, orderNumber: row.order_number, storeId: row.store_id },
    originCountry: String(user?.country || 'ES').toUpperCase().slice(0, 2),
    originZip: '',
    originCity: '',
    destCountry: String(row.shipping_country || user?.country || 'ES').toUpperCase().slice(0, 2),
    destZip: row.shipping_postal_code || '',
    destCity: row.shipping_city || '',
    packages: [estimatedPackage],
    recipient: {
      name: row.shipping_name || row.customer_name || '',
      company: '',
      email: row.customer_email || '',
      phone: row.shipping_phone || row.customer_phone || '',
      addressLine1: row.shipping_address1 || '',
      addressLine2: row.shipping_address2 || '',
      city: row.shipping_city || '',
      province: row.shipping_state || '',
      country: String(row.shipping_country || user?.country || 'ES').toUpperCase().slice(0, 2),
      zipCode: row.shipping_postal_code || ''
    },
    extra: {
      reference: row.order_number || row.external_order_id || '',
      content: 'Productos ecommerce',
      declaredValue: Number(row.total_amount || 15) || 15
    }
  };
}

async function pushEcartFulfillmentForOrder(orderId: string, userId: string) {
  await ensureEcartSchema();
  const [rows]: any = await pool.query(
    `SELECT o.*, s.access_token_enc, s.platform, s.store_name, sh.tracking_code, sh.provider_tracking_code, sh.track_url, sh.provider_code, sh.status
     FROM store_orders o
     JOIN stores s ON s.id = o.store_id
     LEFT JOIN shipments sh ON sh.id = o.shipment_id
     WHERE o.id = ? AND o.user_id = ? LIMIT 1`,
    [orderId, userId]
  );
  const row = rows[0];
  if (!row || !row.shipment_id) return { pushed: false, message: 'No hay envío vinculado.' };
  const token = decryptStoreToken(row.access_token_enc);
  if (!token) return { pushed: false, message: 'La tienda no tiene conexión activa.' };
  const raw = safeJsonParse(row.raw_json, {});
  const fulfillmentOrderId = pickFirst(raw?.fulfillmentOrderId, raw?.fulfillment_order_id, raw?.packages?.[0]?.fulfillmentOrderId, raw?.packages?.[0]?.fulfillment_order_id, raw?.fulfillment_orders?.[0]?.id);
  if (!fulfillmentOrderId) {
    await pool.query(`UPDATE store_orders SET fulfillment_status_ship24go = 'pending', updated_at = NOW() WHERE id = ?`, [orderId]);
    return { pushed: false, message: 'El pedido queda listo para actualizar tracking cuando la tienda entregue el identificador de fulfillment.' };
  }
  const cfg = await getEcartConfig();
  const trackingCode = row.provider_tracking_code || row.tracking_code;
  const trackingUrl = row.track_url || `${String(process.env.APP_URL || 'https://doordrop.lat').replace(/\/$/, '')}/tracking?code=${encodeURIComponent(trackingCode || '')}`;
  const body = {
    fulfillment: {
      fulfillmentOrderId,
      tracking: { number: trackingCode, company: inferCarrierName(row.provider_code || 'DoorDrop'), url: trackingUrl },
      notifyCustomer: true
    }
  };
  const response = await fetch(`${cfg.baseUrl}/api/${cfg.version}/orders/${encodeURIComponent(row.external_order_id)}/fulfillments`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const text = await response.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!response.ok) {
    await writeStoreSyncLog(row.store_id, userId, 'outbound', 'fulfillment_push', 'error', 'No fue posible actualizar el tracking en la tienda.', { status: response.status, body: String(text || '').slice(0, 900) });
    await pool.query(`UPDATE store_orders SET fulfillment_status_ship24go = 'pending', updated_at = NOW() WHERE id = ?`, [orderId]);
    return { pushed: false, message: 'El tracking quedó pendiente de actualización en la tienda.' };
  }
  await pool.query(`UPDATE store_orders SET fulfillment_status_ship24go = 'pushed', fulfillment_pushed_at = NOW(), updated_at = NOW() WHERE id = ?`, [orderId]);
  await writeStoreSyncLog(row.store_id, userId, 'outbound', 'fulfillment_push', 'ok', 'Tracking actualizado en la tienda.', { response: json });
  return { pushed: true, message: 'Tracking actualizado en la tienda.' };
}

app.get('/api/stores', authMiddleware, async (req: any, res) => {
  try {
    await ensureEcartSchema();
    const [stores]: any = await pool.query(
      `SELECT s.*,
        COUNT(o.id) AS orders_count,
        SUM(CASE WHEN o.address_quality = 'needs_review' THEN 1 ELSE 0 END) AS address_alerts,
        SUM(CASE WHEN o.shipment_id IS NOT NULL THEN 1 ELSE 0 END) AS shipments_count,
        MAX(o.updated_at) AS last_sync_at
       FROM stores s
       LEFT JOIN store_orders o ON o.store_id = s.id
       WHERE s.user_id = ?
       GROUP BY s.id
       ORDER BY s.updated_at DESC`,
      [req.user.id]
    );
    res.json({ stores: stores.map((s: any) => ({
      id: s.id,
      platform: normalizeStorePlatform(s.platform),
      storeName: s.store_name,
      storeUrl: safeJsonParse(s.metadata_json, {})?.url || '',
      externalStoreId: s.external_store_id,
      status: s.status,
      ordersCount: Number(s.orders_count || 0),
      addressAlerts: Number(s.address_alerts || 0),
      shipmentsCount: Number(s.shipments_count || 0),
      lastSyncAt: s.last_sync_at || s.updated_at,
      createdAt: s.created_at,
      updatedAt: s.updated_at
    })) });
  } catch {
    res.status(500).json({ error: 'No se pudo cargar tus tiendas conectadas.' });
  }
});

app.get('/api/integrations/ecart/connect-url', authMiddleware, async (req: any, res) => {
  try {
    await ensureEcartSchema();
    const cfg = await getEcartConfig();
    if (!cfg.enabled) return res.status(400).json({ error: 'La conexión de tiendas está pausada temporalmente.' });
    if (!cfg.appId) return res.status(400).json({ error: 'No se pudo preparar la conexión de tienda.' });
    const state = generateId('ecs_');
    const nonceHash = crypto.createHash('sha256').update(state).digest('hex');
    await pool.query(`INSERT INTO ecart_pending_connections (id, user_id, nonce_hash, status, expires_at) VALUES (?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 30 MINUTE))`, [generateId('epc_'), req.user.id, nonceHash]);
    setEcartStateCookie(res, state);
    res.json({ url: cfg.oauthUrl, redirectUrl: cfg.redirectUrl });
  } catch (error: any) {
    await writeStoreSyncLog(null, req.user?.id || null, 'outbound', 'connect_url', 'error', 'No se pudo preparar la conexión de tienda.', { message: error?.message || '' });
    res.status(500).json({ error: 'No se pudo preparar la conexión de tienda.' });
  }
});

app.get('/api/integrations/ecartapi/connect', authMiddleware, async (req: any, res) => {
  const cfg = await getEcartConfig();
  if (!cfg.enabled || !cfg.appId) return res.redirect('/panel/stores?status=retry');
  await ensureEcartSchema();
  const state = generateId('ecs_');
  const nonceHash = crypto.createHash('sha256').update(state).digest('hex');
  await pool.query(`INSERT INTO ecart_pending_connections (id, user_id, nonce_hash, status, expires_at) VALUES (?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 30 MINUTE))`, [generateId('epc_'), req.user.id, nonceHash]);
  setEcartStateCookie(res, state);
  res.redirect(cfg.oauthUrl);
});

async function saveEcartStoreForUser(userId: string, payload: any, source: string) {
  await ensureEcartSchema();
  const cfg = await getEcartConfig();
  const accessToken = String(payload.access_token || payload.accessToken || '').trim();
  const rawPlatform = payload.ecommerce || payload.platform || payload.cart || 'Ecommerce';
  if (!accessToken) throw new Error('access_token_missing');
  if (cfg.clientSecret) {
    const valid = validateEcartApiKey(cfg.appId, accessToken, cfg.clientSecret, String(payload.ecartapi_key || payload.ecartApiKey || ''));
    if (!valid) throw new Error('ecartapi_key_invalid');
  }
  const platform = normalizeStorePlatform(rawPlatform);
  const storeUrl = String(payload.url || payload.store_url || payload.domain || '').slice(0, 255);
  const storeName = String(payload.name || payload.store_name || storeUrl || platform).slice(0, 191);
  const externalStoreId = String(payload.userId || payload.user_id || payload.store_id || payload.id || storeUrl || '').slice(0, 191) || null;
  const [existing]: any = await pool.query('SELECT id FROM stores WHERE user_id = ? AND platform = ? AND (external_store_id = ? OR store_name = ?) LIMIT 1', [userId, platform, externalStoreId, storeName]);
  const storeId = existing?.[0]?.id || generateId('sto_');
  const metadata = { provider: 'ecartapi', url: storeUrl, ecommerce: rawPlatform, source, connectedAt: new Date().toISOString(), userId: payload.userId || null };
  if (existing?.[0]?.id) {
    await pool.query(
      `UPDATE stores SET platform = ?, external_store_id = ?, store_name = ?, status = 'connected', access_token_enc = ?, refresh_token_enc = ?, metadata_json = ?, updated_at = NOW() WHERE id = ? AND user_id = ?`,
      [platform, externalStoreId, storeName, encryptStoreToken(accessToken), encryptStoreToken(payload.refreshToken || payload.refresh_token || ''), JSON.stringify(metadata), storeId, userId]
    );
  } else {
    await StoreRepo.create({ id: storeId, user_id: userId, platform, external_store_id: externalStoreId, store_name: storeName, status: 'connected', access_token_enc: encryptStoreToken(accessToken), refresh_token_enc: encryptStoreToken(payload.refreshToken || payload.refresh_token || '') });
    await pool.query(`UPDATE stores SET metadata_json = ? WHERE id = ?`, [JSON.stringify(metadata), storeId]);
  }
  await writeStoreSyncLog(storeId, userId, 'inbound', 'store_connected', 'ok', 'Tienda conectada correctamente.', { platform, storeName, storeUrl, tokenHash: crypto.createHash('sha256').update(accessToken).digest('hex') });
  return { storeId, platform, storeName };
}

app.get('/api/integrations/ecartapi/callback', async (req: any, res) => {
  let redirectTo = '/panel/stores?connected=1';
  try {
    const state = getCookieValue(req, 'ship24go_ecart_state');
    const nonceHash = crypto.createHash('sha256').update(state).digest('hex');
    await ensureEcartSchema();
    const [pendingRows]: any = await pool.query(`SELECT * FROM ecart_pending_connections WHERE nonce_hash = ? AND status = 'pending' AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`, [nonceHash]);
    const pending = pendingRows[0];
    if (!pending) throw new Error('pending_connection_not_found');
    const result = await saveEcartStoreForUser(pending.user_id, req.query || {}, 'backend_callback');
    await pool.query(`UPDATE ecart_pending_connections SET status = 'used', used_at = NOW() WHERE id = ?`, [pending.id]);
    clearEcartStateCookie(res);
    redirectTo = `/panel/stores?connected=1&store=${encodeURIComponent(result.storeId)}`;
  } catch (error: any) {
    await writeStoreSyncLog(null, null, 'inbound', 'store_callback', 'error', 'No fue posible conectar la tienda.', { message: error?.message || '', query: req.query || {} });
    clearEcartStateCookie(res);
    redirectTo = '/panel/stores?status=retry';
  }
  res.redirect(redirectTo);
});

app.post('/api/integrations/ecart/callback', authMiddleware, async (req: any, res) => {
  try {
    const result = await saveEcartStoreForUser(req.user.id, req.body || {}, 'frontend_callback');
    res.json({ success: true, message: 'Tienda conectada correctamente.', store: result });
  } catch (error: any) {
    await writeStoreSyncLog(null, req.user?.id || null, 'inbound', 'store_callback', 'error', 'No fue posible conectar la tienda.', { message: error?.message || '' });
    res.status(500).json({ error: 'No se pudo completar la conexión de la tienda.' });
  }
});

app.post('/api/stores/:id/sync', authMiddleware, async (req: any, res) => {
  try {
    const result = await syncEcartStoreOrders(req.params.id, req.user.id, Number(req.body?.limit || 100));
    res.json({ success: true, message: 'Pedidos sincronizados correctamente.', ...result });
  } catch (error: any) {
    await writeStoreSyncLog(req.params.id, req.user?.id || null, 'inbound', 'orders_sync', 'error', 'No fue posible sincronizar los pedidos.', { message: error?.message || '' });
    res.status(500).json({ error: 'No fue posible sincronizar los pedidos. Intenta nuevamente.' });
  }
});

app.get('/api/stores/:id/orders', authMiddleware, async (req: any, res) => {
  try {
    await ensureEcartSchema();
    const status = String(req.query?.status || '').trim();
    const params: any[] = [req.params.id, req.user.id];
    let where = 'WHERE store_id = ? AND user_id = ?';
    if (status === 'needs_review') where += ` AND address_quality = 'needs_review'`;
    if (status === 'ready') where += ` AND address_quality = 'ready'`;
    const [rows]: any = await pool.query(`SELECT * FROM store_orders ${where} ORDER BY imported_at DESC, updated_at DESC LIMIT 250`, params);
    res.json({ orders: rows.map(orderToClient) });
  } catch {
    res.status(500).json({ error: 'No se pudieron cargar los pedidos.' });
  }
});

app.post('/api/store-orders/:id/address', authMiddleware, async (req: any, res) => {
  try {
    await ensureEcartSchema();
    const body = req.body || {};
    const addr = {
      name: String(body.name || '').slice(0, 191), phone: normalizePhone(body.phone), email: String(body.email || '').slice(0, 191),
      address1: String(body.address1 || '').slice(0, 255), address2: String(body.address2 || '').slice(0, 255), city: String(body.city || '').slice(0, 120),
      state: String(body.state || '').slice(0, 120), postalCode: String(body.postalCode || '').slice(0, 50), country: String(body.country || '').toUpperCase().slice(0, 10)
    };
    const quality = addressQualityForOrder(addr);
    await pool.query(
      `UPDATE store_orders SET shipping_name=?, shipping_phone=?, customer_email=COALESCE(NULLIF(?, ''), customer_email), shipping_address1=?, shipping_address2=?, shipping_city=?, shipping_state=?, shipping_postal_code=?, shipping_country=?, address_quality=?, address_alerts_json=?, updated_at=NOW() WHERE id=? AND user_id=?`,
      [addr.name, addr.phone, addr.email, addr.address1, addr.address2, addr.city, addr.state, addr.postalCode, addr.country, quality.quality, JSON.stringify(quality.alerts), req.params.id, req.user.id]
    );
    res.json({ success: true, message: quality.alerts.length ? 'Dirección actualizada. Revisa los campos pendientes.' : 'Dirección lista para crear envío.', addressQuality: quality.quality, addressAlerts: quality.alerts });
  } catch {
    res.status(500).json({ error: 'No se pudo guardar la dirección.' });
  }
});

app.get('/api/store-orders/:id/prefill', authMiddleware, async (req: any, res) => {
  try {
    await ensureEcartSchema();
    const [rows]: any = await pool.query('SELECT * FROM store_orders WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'No hay datos para mostrar.' });
    res.json({ prefill: orderPrefill(rows[0], req.user) });
  } catch {
    res.status(500).json({ error: 'No se pudo preparar el envío.' });
  }
});

app.post('/api/store-orders/:id/link-shipment', authMiddleware, async (req: any, res) => {
  try {
    await ensureEcartSchema();
    const shipmentId = String(req.body?.shipmentId || '');
    if (!shipmentId) return res.status(400).json({ error: 'No se pudo completar la operación.' });
    const [shipmentRows]: any = await pool.query('SELECT id FROM shipments WHERE id = ? AND user_id = ? LIMIT 1', [shipmentId, req.user.id]);
    if (!shipmentRows[0]) return res.status(404).json({ error: 'No hay datos para mostrar.' });
    await pool.query(`UPDATE store_orders SET shipment_id = ?, fulfillment_status_ship24go = 'linked', updated_at = NOW() WHERE id = ? AND user_id = ?`, [shipmentId, req.params.id, req.user.id]);
    const fulfillment = await pushEcartFulfillmentForOrder(req.params.id, req.user.id).catch(() => ({ pushed: false, message: 'El tracking quedó pendiente de actualización en la tienda.' }));
    res.json({ success: true, message: 'Pedido vinculado al envío.', fulfillment });
  } catch {
    res.status(500).json({ error: 'No se pudo vincular el pedido.' });
  }
});

app.post('/api/store-orders/:id/push-fulfillment', authMiddleware, async (req: any, res) => {
  try {
    const result = await pushEcartFulfillmentForOrder(req.params.id, req.user.id);
    res.json({ success: true, ...result });
  } catch {
    res.status(500).json({ error: 'No fue posible actualizar el tracking en la tienda.' });
  }
});

app.post('/api/stores/:id/disconnect', authMiddleware, async (req: any, res) => {
  try {
    await ensureEcartSchema();
    await pool.query(`UPDATE stores SET status = 'inactive', access_token_enc = NULL, refresh_token_enc = NULL, updated_at = NOW() WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
    await writeStoreSyncLog(req.params.id, req.user.id, 'local', 'store_disconnect', 'ok', 'Tienda desconectada.', {});
    res.json({ success: true, message: 'Tienda desconectada correctamente.' });
  } catch {
    res.status(500).json({ error: 'No se pudo desconectar la tienda.' });
  }
});


// SHIP24GO_BANK_TRANSFER_WALLET_V1435
async function ensureBankTransferWalletTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bank_accounts (
    id VARCHAR(80) PRIMARY KEY,
    code VARCHAR(80) NOT NULL,
    currency CHAR(3) NOT NULL,
    country_code VARCHAR(10) NULL,
    account_holder VARCHAR(191) NOT NULL,
    bank_name VARCHAR(191) NOT NULL,
    bank_address VARCHAR(255) NULL,
    details_json JSON NULL,
    instructions_json JSON NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_bank_accounts_currency_active (currency, is_active),
    INDEX idx_bank_accounts_sort (sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_receipts (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    bank_account_id VARCHAR(80) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency CHAR(3) NOT NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    reference_number VARCHAR(191) NULL,
    payer_name VARCHAR(191) NULL,
    note TEXT NULL,
    receipt_file_url VARCHAR(600) NULL,
    admin_note TEXT NULL,
    reviewed_by CHAR(36) NULL,
    reviewed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_payment_receipts_user (user_id, status),
    INDEX idx_payment_receipts_status (status, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  for (const stmt of [
    `ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS receipt_id CHAR(36) NULL`,
    `ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS proof_url VARCHAR(600) NULL`,
    `ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(80) NULL`,
    `ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(191) NULL`,
    `ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'completed' AFTER currency`,
    `ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS admin_note TEXT NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS purpose VARCHAR(80) NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS plan_id CHAR(36) NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS subscription_id CHAR(36) NULL`
  ]) { try { await pool.query(stmt); } catch {} }

  const defaults = [
    {
      id: 'bank_wise_eur_tatiana', code: 'wise_eur_tatiana', currency: 'EUR', countryCode: 'EU', holder: 'Tatiana Monserrate Zamora Vera', bank: 'Wise', address: 'Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium', sort: 10,
      details: { IBAN: 'BE57 9672 5288 5935', 'Swift/BIC': 'TRWIBEB1XXX' },
      instructions: { es: 'Para transferencias SEPA usa el IBAN. Para transferencias desde fuera del área SEPA usa Swift/BIC.', en: 'Use the IBAN for SEPA transfers. For transfers from outside the SEPA area, use Swift/BIC.', it: 'Per bonifici SEPA usa l’IBAN. Per trasferimenti da fuori area SEPA usa Swift/BIC.', fr: 'Utilisez l’IBAN pour les virements SEPA. Pour les virements hors zone SEPA, utilisez Swift/BIC.', de: 'Für SEPA-Überweisungen nutzen Sie die IBAN. Für Überweisungen außerhalb des SEPA-Raums nutzen Sie Swift/BIC.', zh: 'SEPA 转账请使用 IBAN。SEPA 区域外转账请使用 Swift/BIC。' }
    },
    {
      id: 'bank_wise_gbp_tatiana', code: 'wise_gbp_tatiana', currency: 'GBP', countryCode: 'GB', holder: 'Tatiana Monserrate Zamora Vera', bank: 'Wise Payments Limited', address: 'Wise Payments Limited, 1st Floor, Worship Square, 65 Clifton Street, London, EC2A 4JE, United Kingdom', sort: 20,
      details: { 'Account number': '94944449', 'Sort code': '23-14-70', IBAN: 'GB61 TRWI 2314 7094 9444 49', 'Swift/BIC': 'TRWIGB2LXXX' },
      instructions: { es: 'Para transferencias desde Reino Unido usa account number y sort code. Para transferencias internacionales usa IBAN o Swift/BIC.', en: 'For UK domestic transfers use account number and sort code. For international transfers use IBAN or Swift/BIC.', it: 'Per bonifici dal Regno Unito usa account number e sort code. Per trasferimenti internazionali usa IBAN o Swift/BIC.', fr: 'Pour les virements au Royaume-Uni, utilisez account number et sort code. Pour les virements internationaux, utilisez IBAN ou Swift/BIC.', de: 'Für Inlandsüberweisungen im Vereinigten Königreich nutzen Sie Account Number und Sort Code. Für internationale Überweisungen nutzen Sie IBAN oder Swift/BIC.', zh: '英国本地转账请使用账号和 Sort Code。国际转账请使用 IBAN 或 Swift/BIC。' }
    },
    {
      id: 'bank_wise_usd_tatiana', code: 'wise_usd_tatiana', currency: 'USD', countryCode: 'US', holder: 'Tatiana Monserrate Zamora Vera', bank: 'Community Federal Savings Bank', address: 'Community Federal Savings Bank, 89-16 Jamaica Ave, Woodhaven, NY, 11421, United States', sort: 30,
      details: { 'Account type': 'Checking', 'Routing number (wire and ACH)': '026073150', 'Account number': '8311393981', 'Swift/BIC': 'CMFGUS33' },
      instructions: { es: 'Para transferencias desde Estados Unidos usa routing number y número de cuenta. Para transferencias internacionales usa Swift/BIC.', en: 'For US domestic transfers use routing number and account number. For international transfers use Swift/BIC.', it: 'Per bonifici dagli Stati Uniti usa routing number e account number. Per trasferimenti internazionali usa Swift/BIC.', fr: 'Pour les virements depuis les États-Unis, utilisez routing number et account number. Pour les virements internationaux, utilisez Swift/BIC.', de: 'Für Inlandsüberweisungen in den USA nutzen Sie Routing Number und Account Number. Für internationale Überweisungen nutzen Sie Swift/BIC.', zh: '美国本地转账请使用 routing number 和账号。国际转账请使用 Swift/BIC。' }
    },
    {
      id: 'bank_bhd_dop_tatiana', code: 'bhd_dop_tatiana', currency: 'DOP', countryCode: 'DO', holder: 'TATIANA ZAMORA', bank: 'Banco BHD', address: 'LEONARDO DA VINCI #87, Los Cacicazgos, Santo Domingo de Guzmán', sort: 40,
      details: { 'Documento de identidad': 'A3981914', 'Correo electrónico': 'tatyvera938@gmail.com', 'Cuenta de ahorros RD$': '33960360019', Swift: 'BCBHDOSDXXX', 'Cuenta estándar': 'DO02BCBH00000000033960360019' },
      instructions: { es: 'Cuenta local para República Dominicana en pesos dominicanos. Sube el comprobante después de realizar la transferencia.', en: 'Local Dominican Republic account in Dominican pesos. Upload the receipt after completing the transfer.', it: 'Conto locale per Repubblica Dominicana in pesos dominicani. Carica la ricevuta dopo aver effettuato il trasferimento.', fr: 'Compte local pour la République dominicaine en pesos dominicains. Téléversez le reçu après le virement.', de: 'Lokales Konto für die Dominikanische Republik in dominikanischen Pesos. Laden Sie den Zahlungsbeleg nach der Überweisung hoch.', zh: '多米尼加共和国本地多米尼加比索账户。转账完成后请上传付款凭证。' }
    }
  ];
  for (const a of defaults) {
    await pool.query(`INSERT INTO bank_accounts (id, code, currency, country_code, account_holder, bank_name, bank_address, details_json, instructions_json, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON DUPLICATE KEY UPDATE code=VALUES(code), currency=VALUES(currency), country_code=VALUES(country_code), account_holder=VALUES(account_holder), bank_name=VALUES(bank_name), bank_address=VALUES(bank_address), details_json=VALUES(details_json), instructions_json=VALUES(instructions_json), is_active=VALUES(is_active), sort_order=VALUES(sort_order), updated_at=NOW()`,
      [a.id, a.code, a.currency, a.countryCode, a.holder, a.bank, a.address, JSON.stringify(a.details), JSON.stringify(a.instructions), a.sort]);
  }
}

function normalizeReceiptFile(input: any) {
  const raw = String(input || '');
  if (!raw) return { buffer: null as any, ext: '', mime: '' };
  const m = raw.match(/^data:([^;]+);base64,(.+)$/);
  const mime = m ? m[1] : '';
  const base64 = m ? m[2] : raw;
  let ext = 'bin';
  if (mime.includes('pdf')) ext = 'pdf';
  else if (mime.includes('png')) ext = 'png';
  else if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
  else if (mime.includes('webp')) ext = 'webp';
  const buffer = Buffer.from(base64, 'base64');
  return { buffer, ext, mime };
}

function publicBankAccount(row: any, lang = 'es') {
  const details = typeof row.details_json === 'object' ? row.details_json : (() => { try { return JSON.parse(row.details_json || '{}'); } catch { return {}; } })();
  const instructions = typeof row.instructions_json === 'object' ? row.instructions_json : (() => { try { return JSON.parse(row.instructions_json || '{}'); } catch { return {}; } })();
  return {
    id: row.id,
    code: row.code,
    currency: row.currency,
    countryCode: row.country_code,
    accountHolder: row.account_holder,
    bankName: row.bank_name,
    bankAddress: row.bank_address,
    details,
    instructions,
    instruction: instructions?.[lang] || instructions?.[String(lang).slice(0,2)] || instructions?.es || instructions?.en || '',
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order || 0)
  };
}

app.get('/api/admin/integrations/ecartapi/status', authMiddleware, requireSuperAdmin, async (_req: any, res) => {
  try {
    await ensureEcartSchema();
    const cfg = await getEcartConfig();
    const [storeRows]: any = await pool.query(`SELECT COUNT(*) AS stores, SUM(CASE WHEN status='connected' THEN 1 ELSE 0 END) AS connected FROM stores`);
    const [orderRows]: any = await pool.query(`SELECT COUNT(*) AS orders, SUM(CASE WHEN address_quality='needs_review' THEN 1 ELSE 0 END) AS addressAlerts, SUM(CASE WHEN shipment_id IS NOT NULL THEN 1 ELSE 0 END) AS shipments FROM store_orders`);
    const [logs]: any = await pool.query(`SELECT * FROM store_sync_logs ORDER BY created_at DESC LIMIT 25`);
    res.json({
      enabled: cfg.enabled,
      appIdMasked: maskSecret(cfg.appId),
      hasAppId: Boolean(cfg.appId),
      hasClientSecret: Boolean(cfg.clientSecret),
      appUrl: cfg.appUrl,
      redirectUrl: cfg.redirectUrl,
      oauthUrl: cfg.oauthUrl,
      apiVersion: cfg.version,
      baseUrl: cfg.baseUrl,
      stores: Number(storeRows?.[0]?.stores || 0),
      connectedStores: Number(storeRows?.[0]?.connected || 0),
      orders: Number(orderRows?.[0]?.orders || 0),
      addressAlerts: Number(orderRows?.[0]?.addressAlerts || 0),
      shipments: Number(orderRows?.[0]?.shipments || 0),
      logs: logs.map((l: any) => ({ id: l.id, action: l.action, status: l.status, message: l.message, createdAt: l.created_at }))
    });
  } catch {
    res.status(500).json({ error: 'No se pudo cargar la integración.' });
  }
});

app.post('/api/admin/integrations/ecartapi/test', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const cfg = await getEcartConfig();
    if (!cfg.appId) return res.status(400).json({ error: 'No se pudo validar la integración.' });
    await writeStoreSyncLog(null, req.user.id, 'local', 'admin_test', 'ok', 'Integración revisada correctamente.', { appId: maskSecret(cfg.appId), redirectUrl: cfg.redirectUrl, hasSecret: Boolean(cfg.clientSecret) });
    res.json({ success: true, message: 'Integración revisada correctamente.', oauthUrl: cfg.oauthUrl, redirectUrl: cfg.redirectUrl });
  } catch {
    res.status(500).json({ error: 'No se pudo validar la integración.' });
  }
});

app.get('/api/cron/stores/sync', async (req: any, res) => {
  try {
    const key = String(req.query?.key || '');
    const expected = String(process.env.STORES_SYNC_CRON_KEY || process.env.CRON_SECRET || '');
    if (expected && key !== expected) return res.status(403).json({ error: 'Acceso no disponible.' });
    await ensureEcartSchema();
    const limitStores = Math.min(Math.max(Number(req.query?.stores || 10), 1), 50);
    const limitOrders = Math.min(Math.max(Number(req.query?.orders || 100), 1), 250);
    const [stores]: any = await pool.query(`SELECT * FROM stores WHERE status = 'connected' AND access_token_enc IS NOT NULL ORDER BY updated_at ASC LIMIT ?`, [limitStores]);
    let imported = 0;
    let needsReview = 0;
    const results: any[] = [];
    for (const store of stores) {
      try {
        const r = await syncEcartStoreOrders(store.id, store.user_id, limitOrders);
        imported += r.imported;
        needsReview += r.needsReview;
        results.push({ storeId: store.id, imported: r.imported, needsReview: r.needsReview });
      } catch (e: any) {
        await writeStoreSyncLog(store.id, store.user_id, 'inbound', 'cron_orders_sync', 'error', 'No fue posible sincronizar esta tienda.', { message: e?.message || '' });
        results.push({ storeId: store.id, error: true });
      }
    }
    res.json({ success: true, stores: stores.length, imported, needsReview, results });
  } catch {
    res.status(500).json({ error: 'No fue posible completar la sincronización.' });
  }
});



// 4. Conectar Tarjeta
app.post('/api/user/connect-card', authMiddleware, async (req: any, res) => {
  try {
    const { cardNumber, expiryDate, cvv, cardholderName } = req.body;
    if (!cardNumber || !expiryDate || !cvv || !cardholderName) {
      return res.status(400).json({ error: 'Todos los datos de la tarjeta son obligatorios.' });
    }
    
    const cleanNumber = cardNumber.replace(/\s+/g, '');
    const maskedNumber = `•••• •••• •••• ${cleanNumber.slice(-4)}`;
    
    await UserRepo.update(req.user.id, {
      card_connected: 1,
      card_details_json: JSON.stringify({
        cardNumber: maskedNumber,
        expiryDate,
        cardholderName
      })
    });

    const updatedUser = await UserRepo.getById(req.user.id);
    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        balance: Number(updatedUser.balance),
        cardConnected: true,
        cardDetails: { cardNumber: maskedNumber, expiryDate, cardholderName }
      }
    });
  } catch (error) {
    console.error('[Error] connect-card:', error);
    res.status(500).json({ error: 'Error al conectar la tarjeta de seguridad.' });
  }
});

// 5. Vincular PayPal mediante OAuth. El antiguo endpoint que aceptaba un
// correo escrito manualmente queda cerrado para evitar estados falsos.
app.get('/api/user/paypal/connect', authMiddleware, async (req: any, res) => {
  try {
    if (req.user.role !== 'customer') return res.status(403).json({ error: 'Solo las cuentas de cliente pueden vincular PayPal.' });
    const result = await createPaypalAuthState('link', String(req.user.id), res);
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (error: any) {
    if (error?.code === 'PAYPAL_AUTH_UNAVAILABLE') return res.status(503).json({ error: 'PayPal no está disponible.' });
    console.error('[user/paypal/connect] No se pudo iniciar la vinculación.');
    res.status(500).json({ error: 'No se pudo iniciar la vinculación con PayPal.' });
  }
});

app.post('/api/user/connect-paypal', authMiddleware, async (_req: any, res) => {
  res.status(410).json({ error: 'La vinculación manual fue retirada. Usa la autorización segura de PayPal.' });
});






// SHIP24GO_POLAR_WEB_CHECKOUT_FIX_V1_4_37
// Checkout Polar actualizado para cliente: wallet, plan directo y botón de suscripción.
// No muestra detalles técnicos al usuario; detalles quedan en provider_logs y diagnóstico.
function ship24goCheckoutCustomerIp(req: any) {
  return String(
    req.headers['cf-connecting-ip'] ||
    req.headers['true-client-ip'] ||
    req.headers['x-forwarded-for'] ||
    ''
  ).split(',')[0].trim();
}

function ship24goCheckoutUrlFromPolar(data: any) {
  return data?.url || data?.checkout_url || data?.checkoutUrl || '';
}

function ship24goPolarCurrencyPrices(productId: string, amountCents: number, requestedCurrency: string) {
  const requested = String(requestedCurrency || 'EUR').toLowerCase().slice(0, 3);
  const entries: any[] = [];

  entries.push({
    amount_type: 'fixed',
    price_amount: amountCents,
    price_currency: 'usd'
  });

  if (requested && requested !== 'usd') {
    entries.push({
      amount_type: 'fixed',
      price_amount: amountCents,
      price_currency: requested
    });
  }

  return { [productId]: entries };
}

async function ship24goEnsurePolarWalletProduct(keys: any, polarToken: string, environment: string) {
  const existing = keys?.polarWalletProductId || keys?.polarProductId || '';
  if (existing) return existing;

  const apiBase = ship24goPolarApiBase(polarToken, environment);
  const payload = {
    name: 'DoorDrop Wallet Recarga',
    description: 'Recarga segura de saldo DoorDrop.',
    visibility: 'public',
    recurring_interval: null,
    recurring_interval_count: null,
    prices: [
      {
        amount_type: 'fixed',
        price_amount: 100,
        price_currency: 'usd'
      },
      {
        amount_type: 'fixed',
        price_amount: 100,
        price_currency: 'eur'
      }
    ],
    metadata: {
      source: 'ship24go',
      purpose: 'wallet_topup'
    }
  };

  const response = await fetch(`${apiBase}/v1/products/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${polarToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data: any = await response.json().catch(() => ({}));
  await writePolarProviderLog('wallet_product_auto_create', payload, data, response.status);

  const productId = data?.id || data?.product?.id || '';
  if (response.ok && productId) {
    try {
      await pool.query(
        `UPDATE api_keys
         SET polarWalletProductId = ?
         WHERE id = 1`,
        [productId]
      );
    } catch {}
    return productId;
  }

  return '';
}

async function ship24goCreatePolarCheckoutSession(params: {
  polarToken: string;
  environment: string;
  productId: string;
  productIds?: string[];
  priceId?: string;
  currency?: string;
  customerEmail?: string;
  customerName?: string;
  externalCustomerId?: string;
  customerIp?: string;
  metadata?: any;
  successUrl: string;
  returnUrl: string;
  prices?: any;
}) {
  const apiBase = ship24goPolarApiBase(params.polarToken, params.environment);

  // Polar only accepts scalar metadata values. Keep structured application
  // metadata readable by serializing arrays/objects before sending them.
  const polarMetadata = Object.entries(
    params.metadata && typeof params.metadata === 'object' ? params.metadata : {}
  ).reduce<Record<string, string | number | boolean>>((result, [key, value]) => {
    if (value === null || value === undefined) return result;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
      return result;
    }
    try {
      const serialized = JSON.stringify(value);
      if (serialized) result[key] = serialized;
    } catch {
      // Ignore a non-serializable optional metadata field.
    }
    return result;
  }, {});

  const payload: any = {
    products: params.productIds?.length ? params.productIds : [params.productId],
    success_url: params.successUrl,
    return_url: params.returnUrl,
    customer_email: params.customerEmail || undefined,
    customer_name: params.customerName || undefined,
    external_customer_id: params.externalCustomerId || undefined,
    metadata: polarMetadata
  };

  if (params.currency) payload.currency = String(params.currency).toLowerCase().slice(0, 3);
  if (params.customerIp) payload.customer_ip_address = params.customerIp;
  if (params.prices) payload.prices = params.prices;

  const response = await fetch(`${apiBase}/v1/checkouts/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.polarToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data: any = await response.json().catch(() => ({}));
  return { response, data, payload };
}

app.post('/api/user/recharge', authMiddleware, async (req: any, res) => {
  try {
    await ensureShip24GoBillingColumns();
    const amount = roundMoney(Number(req.body?.amount || 0));

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'No se pudo crear la solicitud de recarga.' });
    }

    const keys = await ApiKeysRepo.get();

    const requestedProvider = String(req.body?.paymentProvider || req.body?.provider || 'polar').toLowerCase().trim();
    if (requestedProvider === 'paypal') {
      if (!ship24goPayPalIntegrationEnabled(keys)) {
        return res.status(400).json({ error: ship24goPayPalUnavailableMessage(keys) });
      }

      const user = await UserRepo.getById(req.user.id);
      if (!user) return res.status(404).json({ error: 'No se pudo encontrar la cuenta.' });

      const topupId = generateId('top_');
      const walletCurrency = normalizeCurrencyCode(user.currency || 'EUR');
      const rates = await getFreshRatesInternal();
      const chargeAmount = convertMoneyAmountStrict(amount, walletCurrency, 'EUR', rates);
      if (!chargeAmount || chargeAmount <= 0) {
        return res.status(400).json({ error: 'No se pudo calcular el importe del pago.' });
      }

      await pool.query(
        `INSERT INTO wallet_topups
          (id, user_id, amount, currency, status, payment_provider, provider_reference)
         VALUES (?, ?, ?, ?, 'pending', 'paypal', ?)` ,
        [topupId, req.user.id, amount, walletCurrency, `pending_${topupId}`]
      );

      try {
        const token = await ship24goGetPayPalAccessToken(keys);
        const base = ship24goPayPalApiBase(keys?.paypalEnvironment);
        const appUrl = appBaseUrl();
        const customId = `doordrop:wallet:${topupId}`;
        const orderResponse = await fetch(`${base}/v2/checkout/orders`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': topupId
          },
          body: JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [{
              custom_id: customId,
              description: `Recarga de wallet DoorDrop (${walletCurrency})`,
              amount: { currency_code: 'EUR', value: chargeAmount.toFixed(2) }
            }],
            application_context: {
              brand_name: 'DoorDrop',
              user_action: 'PAY_NOW',
              return_url: `${appUrl}/panel/settings?paypal_payment=success&topup_id=${encodeURIComponent(topupId)}`,
              cancel_url: `${appUrl}/panel/settings?paypal_payment=cancel&topup_id=${encodeURIComponent(topupId)}`
            }
          })
        });
        const order = await orderResponse.json().catch(() => ({}));
        await writeProviderLog('paypal', 'wallet_checkout_create', { topupId, amount, walletCurrency, chargeAmount, chargeCurrency: 'EUR' }, { httpStatus: orderResponse.status, id: order?.id, hasApprovalUrl: Boolean((order?.links || []).find((link: any) => link.rel === 'approve')) }, orderResponse.status);
        const checkoutUrl = (order.links || []).find((link: any) => link.rel === 'approve')?.href || '';
        if (!orderResponse.ok || !order.id || !checkoutUrl) {
          await pool.query(`UPDATE wallet_topups SET status = 'failed', provider_reference = ? WHERE id = ?`, [order?.id || `failed_${topupId}`, topupId]);
          return res.status(400).json({ error: 'No se pudo abrir el pago seguro con PayPal.' });
        }
        await pool.query(`UPDATE wallet_topups SET provider_reference = ? WHERE id = ?`, [order.id, topupId]);
        return res.status(201).json({ success: true, pending: true, topupId, orderId: order.id, checkoutUrl, chargeAmount, chargeCurrency: 'EUR', message: 'Pago seguro de PayPal creado correctamente.' });
      } catch (error: any) {
        await pool.query(`UPDATE wallet_topups SET status = 'failed' WHERE id = ?`, [topupId]).catch(() => null);
        throw error;
      }
    }

    if (requestedProvider !== 'polar') {
      return res.status(400).json({ error: 'Proveedor de pago no válido.' });
    }
    const polarConfig = await ship24goPolarRuntimeConfig(keys);
    const polarToken = polarConfig.token;

    if (!polarToken) {
      return res.status(400).json({ error: 'El pago seguro todavía no está disponible.' });
    }

    const user = await UserRepo.getById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'No se pudo encontrar la cuenta.' });
    }

    const productId = await ship24goEnsurePolarWalletProduct(keys, polarToken, polarConfig.environment || 'sandbox');

    if (!productId) {
      return res.status(400).json({ error: 'No se pudo abrir el pago seguro.' });
    }

    const topupId = generateId('top_');
    const currency = String(user.currency || 'EUR').toUpperCase();
    const amountCents = Math.round(amount * 100);
    const appUrl = process.env.APP_URL || appBaseUrl() || 'https://doordrop.lat';

    await pool.query(
      `INSERT INTO wallet_topups
        (id, user_id, amount, currency, status, payment_provider, provider_reference)
       VALUES (?, ?, ?, ?, 'pending', 'polar', ?)`,
      [topupId, req.user.id, amount, currency, `pending_${topupId}`]
    );

    const result = await ship24goCreatePolarCheckoutSession({
      polarToken,
      environment: polarConfig.environment || 'sandbox',
      productId,
      currency,
      customerEmail: user.email,
      customerName: user.name || user.email,
      externalCustomerId: req.user.id,
      customerIp: ship24goCheckoutCustomerIp(req),
      successUrl: `${appUrl}/panel/settings?polar_payment=success&topup_id=${topupId}&checkout_id={CHECKOUT_ID}`,
      returnUrl: `${appUrl}/panel/settings`,
      prices: ship24goPolarCurrencyPrices(productId, amountCents, currency),
      metadata: {
        purpose: 'wallet_topup',
        topup_id: topupId,
        user_id: req.user.id,
        requested_amount: String(amount),
        credited_amount: String(amount),
        currency
      }
    });

    await writePolarProviderLog(
      'wallet_checkout_create_web_fix',
      { topupId, productId, amount, currency, payload: result.payload },
      result.data,
      result.response.status
    );

    const checkoutUrl = ship24goCheckoutUrlFromPolar(result.data);

    if (!result.response.ok || !checkoutUrl) {
      await pool.query(
        `UPDATE wallet_topups SET status = 'failed', provider_reference = ? WHERE id = ?`,
        [result.data?.id || `failed_${topupId}`, topupId]
      );
      return res.status(400).json({ error: 'No se pudo abrir el pago seguro.' });
    }

    await pool.query(
      `UPDATE wallet_topups SET provider_reference = ? WHERE id = ?`,
      [result.data.id, topupId]
    );

    res.status(201).json({
      success: true,
      pending: true,
      topupId,
      checkoutId: result.data.id,
      checkoutUrl,
      message: 'Pago seguro creado correctamente.'
    });
  } catch (error: any) {
    console.error('[Polar] wallet checkout web fix error:', error?.message || error);
    res.status(500).json({ error: 'No se pudo abrir el pago seguro.' });
  }
});

app.post('/api/subscriptions/polar/plan-checkout', authMiddleware, async (req: any, res) => {
  try {
    const planId = String(req.body?.planId || '').trim();

    const keys = await ApiKeysRepo.get();
    if (keys?.paymentPolarEnabled === 0) {
      return res.status(400).json({ error: 'Este método de pago no está disponible.' });
    }

    const polarConfig = await ship24goPolarRuntimeConfig(keys);
    const polarToken = polarConfig.token;

    if (!polarToken) {
      return res.status(400).json({ error: 'Polar pendiente de configuración.' });
    }

    // DoorDrop Omnicanal uses its own catalog. It must never be activated by
    // the shipping-plan checkout or by a client-side placeholder id.
    const [omnichannelRows]: any = await pool.query(
      `SELECT *
         FROM omnichannel_plan_catalog
        WHERE is_active = 1 AND (id = ? OR code = ?)
        LIMIT 1`,
      [planId, planId]
    );
    const omnichannelPlan = omnichannelRows?.[0];
    if (omnichannelPlan) {
      if (!omnichannelPlan.polar_enabled || !omnichannelPlan.polar_product_id) {
        return res.status(400).json({
          error: 'Este plan Omnicanal todavía no está configurado en Polar.',
          code: 'OMNICHANNEL_POLAR_PRODUCT_REQUIRED'
        });
      }

      const requestedAddOns = Array.isArray(req.body?.addOns)
        ? req.body.addOns
        : (Array.isArray(req.body?.add_ons) ? req.body.add_ons : []);
      const addOnCodes = [...new Set(requestedAddOns.map((value: any) => String(value || '').trim()).filter(Boolean))];
      const addOnProducts: any[] = [];
      let addOnTotal = 0;
      for (const addOnCode of addOnCodes) {
        const [addOnRows]: any = await pool.query(
          `SELECT code, price, currency, polar_product_id, polar_enabled
             FROM omnichannel_addon_catalog
            WHERE code = ? AND is_active = 1
            LIMIT 1`,
          [addOnCode]
        );
        const addOn = addOnRows?.[0];
        if (!addOn || !addOn.polar_enabled || !addOn.polar_product_id) {
          return res.status(400).json({
            error: `El complemento ${addOnCode} todavía no está configurado en Polar.`,
            code: 'OMNICHANNEL_POLAR_ADDON_REQUIRED'
          });
        }
        addOnProducts.push(addOn.polar_product_id);
        addOnTotal += Number(addOn.price || 0);
      }

      const appUrl = process.env.APP_URL || appBaseUrl() || 'https://doordrop.lat';
      const user = await UserRepo.getById(req.user.id);
      const currency = String(omnichannelPlan.currency || user?.currency || 'USD').toUpperCase();
      const paymentId = generateId('spay_');
      const metadata = {
        purpose: 'omnichannel_subscription',
        module: 'omnichannel',
        user_id: req.user.id,
        omnichannel_plan_id: omnichannelPlan.id,
        omnichannel_plan_code: omnichannelPlan.code,
        add_ons: addOnCodes
      };

      await pool.query(
        `INSERT INTO subscription_payments
          (id, user_id, plan_id, provider, amount, currency, status, metadata_json)
         VALUES (?, ?, ?, 'polar', ?, ?, 'pending', ?)`,
        [paymentId, req.user.id, omnichannelPlan.id, Number(omnichannelPlan.price || 0) + addOnTotal, currency, JSON.stringify(metadata)]
      );

      const result = await ship24goCreatePolarCheckoutSession({
        polarToken,
        environment: polarConfig.environment || 'sandbox',
        productId: omnichannelPlan.polar_product_id,
        productIds: [omnichannelPlan.polar_product_id, ...addOnProducts],
        priceId: omnichannelPlan.polar_price_id || '',
        currency,
        customerEmail: user?.email || req.user.email,
        customerName: user?.name || user?.email || req.user.email,
        externalCustomerId: req.user.id,
        customerIp: ship24goCheckoutCustomerIp(req),
        successUrl: `${appUrl}/panel/omnichannel?tab=plans&subscription=polar_success&plan_id=${encodeURIComponent(omnichannelPlan.id)}&checkout_id={CHECKOUT_ID}`,
        returnUrl: `${appUrl}/panel/omnichannel?tab=plans`,
        metadata
      });

      const checkoutUrl = ship24goCheckoutUrlFromPolar(result.data);
      await pool.query(
        `UPDATE subscription_payments
            SET status = ?, provider_payment_id = ?, checkout_url = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [result.response.ok && checkoutUrl ? 'pending' : 'failed', result.data?.id || null, checkoutUrl || null, paymentId]
      );
      await writePolarProviderLog(
        'omnichannel_subscription_checkout_create',
        { paymentId, planId: omnichannelPlan.id, planCode: omnichannelPlan.code, productCount: 1 + addOnProducts.length, currency },
        result.data,
        result.response.status
      );

      if (!result.response.ok || !checkoutUrl) {
        return res.status(400).json({ error: 'No se pudo crear el checkout de Polar.' });
      }

      return res.json({
        success: true,
        pending: true,
        url: checkoutUrl,
        checkoutId: result.data.id,
        paymentId,
        planId: omnichannelPlan.id
      });
    }

    const [rows]: any = await pool.query(
      `SELECT *
       FROM plans
       WHERE id = ?
         AND is_active = 1
       LIMIT 1`,
      [planId]
    );

    const plan = rows?.[0];

    if (!plan || plan.polar_enabled === 0) {
      return res.status(400).json({ error: 'Este plan no está disponible en Polar.' });
    }

    const productId = plan.polar_product_id || '';
    const priceId = plan.polar_price_id || '';

    if (!productId) {
      return res.status(400).json({ error: 'Sincroniza el plan con Polar antes de cobrar.' });
    }

    const appUrl = process.env.APP_URL || appBaseUrl() || 'https://doordrop.lat';
    const user = await UserRepo.getById(req.user.id);
    const currency = String(plan.currency || user?.currency || 'EUR').toUpperCase();

    const result = await ship24goCreatePolarCheckoutSession({
      polarToken,
      environment: polarConfig.environment || 'sandbox',
      productId,
      priceId,
      currency,
      customerEmail: user?.email || req.user.email,
      customerName: user?.name || user?.email || req.user.email,
      externalCustomerId: req.user.id,
      customerIp: ship24goCheckoutCustomerIp(req),
      successUrl: `${appUrl}/panel/settings?subscription=polar_success&plan_id=${encodeURIComponent(plan.id)}&checkout_id={CHECKOUT_ID}`,
      returnUrl: `${appUrl}/panel/settings`,
      metadata: {
        purpose: 'subscription',
        user_id: req.user.id,
        plan_id: plan.id,
        plan_name: plan.name
      }
    });

    await writePolarProviderLog(
      'subscription_checkout_create_web_fix',
      { planId, productId, priceId, currency, payload: result.payload },
      result.data,
      result.response.status
    );

    const checkoutUrl = ship24goCheckoutUrlFromPolar(result.data);

    if (!result.response.ok || !checkoutUrl) {
      return res.status(400).json({ error: 'No se pudo crear el checkout de Polar.' });
    }

    res.json({
      success: true,
      url: checkoutUrl,
      checkoutId: result.data.id
    });
  } catch (error: any) {
    console.error('[Polar] subscription checkout web fix error:', error?.message || error);
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/subscriptions/polar/create-checkout', authMiddleware, async (req: any, res) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT *
       FROM plans
       WHERE is_active = 1
         AND polar_enabled = 1
         AND price > 0
       ORDER BY
         CASE WHEN id = 'plan_pro' THEN 0 ELSE 1 END,
         price ASC
       LIMIT 1`
    );

    const plan = rows?.[0];

    if (!plan) {
      return res.status(400).json({ error: 'No hay planes disponibles todavía.' });
    }

    req.body = { ...(req.body || {}), planId: plan.id };

    const keys = await ApiKeysRepo.get();
    const polarConfig = await ship24goPolarRuntimeConfig(keys);
    const polarToken = polarConfig.token;

    if (!polarToken) {
      return res.status(400).json({ error: 'Polar pendiente de configuración.' });
    }

    const productId = plan.polar_product_id || '';
    const priceId = plan.polar_price_id || '';

    if (!productId) {
      return res.status(400).json({ error: 'Sincroniza el plan con Polar antes de cobrar.' });
    }

    const appUrl = process.env.APP_URL || appBaseUrl() || 'https://doordrop.lat';
    const user = await UserRepo.getById(req.user.id);
    const currency = String(plan.currency || user?.currency || 'EUR').toUpperCase();

    const result = await ship24goCreatePolarCheckoutSession({
      polarToken,
      environment: polarConfig.environment || 'sandbox',
      productId,
      priceId,
      currency,
      customerEmail: user?.email || req.user.email,
      customerName: user?.name || user?.email || req.user.email,
      externalCustomerId: req.user.id,
      customerIp: ship24goCheckoutCustomerIp(req),
      successUrl: `${appUrl}/panel/settings?payment_success=true&plan_id=${encodeURIComponent(plan.id)}&checkout_id={CHECKOUT_ID}`,
      returnUrl: `${appUrl}/panel/settings`,
      metadata: {
        purpose: 'subscription',
        user_id: req.user.id,
        plan_id: plan.id,
        plan_name: plan.name
      }
    });

    await writePolarProviderLog(
      'subscription_quick_checkout_web_fix',
      { planId: plan.id, productId, priceId, currency, payload: result.payload },
      result.data,
      result.response.status
    );

    const checkoutUrl = ship24goCheckoutUrlFromPolar(result.data);

    if (!result.response.ok || !checkoutUrl) {
      return res.status(400).json({ error: 'No se pudo crear el checkout de Polar.' });
    }

    res.json({
      success: true,
      url: checkoutUrl,
      checkoutId: result.data.id
    });
  } catch (error: any) {
    console.error('[Polar] quick checkout web fix error:', error?.message || error);
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

// END SHIP24GO_POLAR_WEB_CHECKOUT_FIX_V1_4_37


// 7. Cotizaciones de Envío con motor de proveedores

app.post('/api/spedirepro/drop-off-points', authMiddleware, async (req: any, res) => {
  try {
    const providerCode = String(req.body?.providerCode || req.body?.provider_code || 'spedirepro').toLowerCase().trim();
    const country = String(req.body?.country || 'IT').toUpperCase().slice(0, 2);
    let city = compactText(req.body?.city || '', 80);
    const postcode = compactText(String(req.body?.postcode || req.body?.zipCode || '').replace(/\s+/g, ''), 20);
    const direction = String(req.body?.direction || 'sender').toLowerCase() === 'receiver' ? 'receiver' : 'sender';

    // IT points APIs often require city+CAP. Infer major-city CAP ranges when city missing.
    if (!city && postcode && country === 'IT') {
      const z = postcode.padStart(5, '0').slice(0, 5);
      if (z.startsWith('001')) city = 'Roma';
      else if (z.startsWith('201')) city = 'Milano';
      else if (z.startsWith('101')) city = 'Torino';
      else if (z.startsWith('801')) city = 'Napoli';
      else if (z.startsWith('501')) city = 'Firenze';
      else if (z.startsWith('401')) city = 'Bologna';
      else if (z.startsWith('301')) city = 'Venezia';
      else if (z.startsWith('161')) city = 'Genova';
      else if (z.startsWith('901')) city = 'Palermo';
      else if (z.startsWith('091')) city = 'Cagliari';
      else if (z.startsWith('701')) city = 'Bari';
      else if (z.startsWith('351')) city = 'Padova';
      else if (z.startsWith('371')) city = 'Verona';
      else if (z.startsWith('411')) city = 'Modena';
      else if (z.startsWith('421')) city = 'Reggio Emilia';
      else if (z.startsWith('431')) city = 'Parma';
      else if (z.startsWith('479')) city = 'Rimini';
      else if (z.startsWith('601')) city = 'Ancona';
      else if (z.startsWith('651')) city = 'Pescara';
      else if (z.startsWith('661')) city = 'Chieti';
      else if (z.startsWith('711')) city = 'Foggia';
      else if (z.startsWith('721')) city = 'Brindisi';
      else if (z.startsWith('731')) city = 'Lecce';
      else if (z.startsWith('741')) city = 'Taranto';
      else if (z.startsWith('891')) city = 'Reggio Calabria';
      else if (z.startsWith('951')) city = 'Catania';
      else if (z.startsWith('981')) city = 'Messina';
    }

    if (!city && !postcode && !req.body?.position) {
      return res.status(200).json({ success: true, points: [], message: 'No hay puntos disponibles cerca de esta ubicación.' });
    }

    if (providerCode === 'genei') {
      const provider = await ProviderRepo.getByCode('genei');
      const keys = await ApiKeysRepo.get();
      const result = await searchGeneiDropPoints(provider, keys, {
        country,
        city,
        postcode,
        direction,
        agencyId: req.body?.agencyId || req.body?.serviceId || req.body?.agency_id
      });
      await writeProviderLog('genei', 'drop_off_points', { country, city, postcode, direction, agencyId: req.body?.agencyId || req.body?.serviceId || '' }, { count: result.points.length, attempts: result.attempts }, result.points.length ? 200 : 0);
      return res.json({ success: true, points: result.points, message: result.points.length ? 'Puntos disponibles.' : 'No hay puntos disponibles cerca de esta ubicación.' });
    }

    if (providerCode === 'spediamopro') {
      const provider = await ProviderRepo.getByCode('spediamopro');
      const keys = await ApiKeysRepo.get();
      if (!spediamoProCredentials(provider, keys)) {
        return res.status(200).json({ success: true, points: [], message: 'No hay puntos disponibles cerca de esta ubicación.' });
      }
      const payload: any = { country, postalCode: postcode, city };
      const selectedCourier = String(req.body?.vendors?.[0] || req.body?.courier || '').toLowerCase().replace('poste', 'sda');
      if (['brt','inpost','sda','ups'].includes(selectedCourier)) payload.courier = selectedCourier;
      if (req.body?.address) payload.address = compactText(req.body.address, 60);
      const pudo = await callSpediamoPro(provider, keys, 'POST', 'pudo-points/search', payload);
      const points = normalizeSpediamoProPudoPoints(pudo.response);
      await writeProviderLog('spediamopro', 'pudo_points_search', { country, city, postcode, courier: payload.courier || null }, { httpStatus: pudo.httpStatus, count: points.length }, pudo.httpStatus);
      return res.json({ success: true, points, message: points.length ? 'Puntos disponibles.' : 'No hay puntos disponibles cerca de esta ubicación.' });
    }

    if (providerCode === 'easypost' || providerCode === 'logihub_intl') {
      return res.status(200).json({ success: true, points: [], message: 'No hay puntos disponibles cerca de esta ubicación.' });
    }

    if (providerCode === 'parcelabc' || providerCode === 'logihub') {
      const provider = await ProviderRepo.getByCode('parcelabc');
      const keys = await ApiKeysRepo.get();
      const authToken = provider ? providerSecret('parcelabc', provider, keys) : '';
      if (!authToken) {
        // fall through to spedirepro network
      } else {
        try {
          const response = await fetch(`${providerBaseUrl(provider, 'https://www.parcelabc.com/api-pabc.php')}/drop-off-points`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              authToken,
              country,
              city,
              postcode,
              zipCode: postcode,
              direction,
              vendors: req.body?.vendors || undefined,
            })
          });
          const text = await response.text();
          let data: any = null;
          try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
          const points = normalizeSpedireProDropPoints(data?.points || data?.data || data?.offers || data || []);
          await writeProviderLog('parcelabc', 'drop_off_points', { country, city, postcode, direction }, { httpStatus: response.status, count: points.length }, response.status);
          if (points.length) {
            return res.json({ success: true, points, message: 'Puntos disponibles.' });
          }
        } catch (e: any) {
          await writeProviderLog('parcelabc', 'drop_off_points_failed', { country, city, postcode }, { message: e?.message || 'fail' }, 0).catch(() => null);
        }
      }
    }

    const provider = await ProviderRepo.getByCode('spedirepro');
    const keys = await ApiKeysRepo.get();
    if (!spedireProCredentials(provider, keys)) {
      return res.status(200).json({ success: true, points: [], message: 'No hay puntos disponibles cerca de esta ubicación.' });
    }
    const vendors = allowedSpedireProVendors(req.body?.vendors);
    const requestPayload: any = { country, direction };
    if (city) requestPayload.city = city;
    if (postcode) requestPayload.postcode = postcode;
    if (vendors.length) requestPayload.vendors = vendors;
    if (req.body?.sender_country) requestPayload.sender_country = String(req.body.sender_country).toUpperCase().slice(0, 2);
    const lat = Number(req.body?.position?.lat);
    const lng = Number(req.body?.position?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) requestPayload.position = { lat, lng };

    if (!requestPayload.position && (!city || !postcode)) {
      return res.status(200).json({ success: true, points: [], message: 'No hay puntos disponibles cerca de esta ubicación.' });
    }

    const drop = await callSpedirePro(provider, keys, 'POST', 'v1/drop-off-points', requestPayload);
    const points = normalizeSpedireProDropPoints(drop.response);
    await writeProviderLog('spedirepro', 'drop_off_points', { country, city, postcode, direction, vendors }, { httpStatus: drop.httpStatus, count: points.length }, drop.httpStatus);
    if (!spedireProIsOk(drop.httpStatus, drop.response)) {
      return res.status(200).json({ success: true, points: [], message: 'No hay puntos disponibles cerca de esta ubicación.' });
    }
    return res.json({ success: true, points, message: points.length ? 'Puntos disponibles.' : 'No hay puntos disponibles cerca de esta ubicación.' });
  } catch (e: any) {
    await writeProviderLog('points', 'drop_off_points_failed', {}, { message: e?.message || 'No hay puntos disponibles cerca de esta ubicación.' }, 0).catch(() => null);
    return res.status(200).json({ success: true, points: [], message: 'No hay puntos disponibles cerca de esta ubicación.' });
  }
});


// === SHIP24GO_QUOTE_LOGIHUB_HELPER_V2 ===
async function quoteLogihubIntlProvider(provider: any, ctx: any): Promise<any[]> {
  const {
    countryFrom, countryTo, requestedCurrency,
    normalizedPackages, keys, brand
  } = ctx;
  try {
    if (String(countryFrom || '').toUpperCase() !== 'DO') return [];
    const credentials = logihubIntlCredentials(provider, keys);
    if (!credentials) return [];

    const quotes: any[] = [];
    const totalWeight = normalizedPackages.reduce(
      (sum: number, p: any) => sum + (Number(p.weight || 0) * Number(p.qty || 1)),
      0
    ) || 1;
    const maxL = Math.max(10, ...normalizedPackages.map((p: any) => Number(p.length || 10)));
    const maxW = Math.max(10, ...normalizedPackages.map((p: any) => Number(p.width || 10)));
    const maxH = Math.max(10, ...normalizedPackages.map((p: any) => Number(p.height || 10)));
    const pieces = normalizedPackages.reduce((sum: number, p: any) => sum + Number(p.qty || 1), 0) || 1;
    const levels = ['international_economy', 'international_priority'];
    let rates: Record<string, number> = { EUR: 1, USD: 1.09, DOP: 59.3, GBP: 0.84, MXN: 19.5 };
    try {
      rates = await getFreshRatesInternal();
    } catch {}

    for (const serviceLevel of levels) {
      const startedAt = Date.now();
      const requestPayload: any = {
        dest_country: String(countryTo || '').toUpperCase().slice(0, 2),
        service_level: serviceLevel,
        weight_kg: Number(totalWeight) || 1,
        length_cm: maxL,
        width_cm: maxW,
        height_cm: maxH,
        pieces,
      };
      try {
        const { httpStatus, response } = await callLogihubIntl(provider, keys, 'POST', '/internacional/quote.php', requestPayload);
        await writeProviderLog('logihub_intl', 'quote', { ...requestPayload, durationMs: Date.now() - startedAt }, response, httpStatus);
        if (!response?.ok && httpStatus >= 400) continue;

        const meta = logihubIntlServiceMeta(serviceLevel);
        const totalDop = Number(response?.pricing?.total_dop || response?.total_dop || response?.price || 0);
        if (!totalDop || totalDop <= 0) continue;

        let providerCost = totalDop;
        const targetCur = String(requestedCurrency || 'EUR').toUpperCase();
        if (targetCur !== 'DOP') {
          providerCost = await convertDopToCurrency(totalDop, targetCur, rates);
        }
        const pricing = calculateProviderPrice(provider, providerCost);
        const minDays = Number(response?.delivery?.min_days || 9);
        const maxDays = Number(response?.delivery?.max_days || minDays || 12);
        const deliveryLabel = String(response?.delivery?.label || `${minDays}–${maxDays} días laborables`);
        const logo = String(response?.provider?.logo_url || credentials.logoUrl || LOGIHUB_INTL_LOGO);
        const serviceName = String(response?.service?.name || meta.name);
        const quoteId = generateId('q_');
        const displayName = publicProviderName(provider);

        quotes.push({
          id: quoteId,
          provider: displayName,
          providerDisplayName: displayName,
          publicProviderName: displayName,
          providerInternalName: 'Conector internacional',
          carrierName: 'Servicio internacional',
          serviceType: meta.serviceType,
          serviceTypeLabel: meta.serviceTypeLabel,
          providerCode: 'logihub_intl',
          providerColor: brand.providerColor || '#0ea5e9',
          providerSecondaryColor: brand.providerSecondaryColor || '#0369a1',
          providerLogo: logo,
          priority: brand.priority || credentials.priority || 12,
          serviceId: meta.code,
          service: serviceName,
          collectionTypeName: 'Puerta a puerta',
          deliveryText: deliveryLabel,
          estimatedDays: maxDays,
          estimatedDaysMin: minDays,
          estimatedDaysMax: maxDays,
          price: pricing.providerCost,
          providerCost: pricing.providerCost,
          margin: pricing.marginAmount,
          marginAmount: pricing.marginAmount,
          taxes: 0,
          customerPrice: pricing.customerPrice,
          total: pricing.customerPrice,
          currency: targetCur,
          currencyOriginal: 'DOP',
          providerPriceOriginal: totalDop,
          providerPayload: {
            raw: response,
            quote_id: response?.quote_id,
            service_level: meta.code,
            service_name: serviceName,
            delivery: response?.delivery,
            pricing_dop: response?.pricing,
            logo_url: logo,
            origin_country: 'DO',
            dest_country: String(countryTo || '').toUpperCase().slice(0, 2),
            ship24goCarrierName: 'Servicio internacional',
            ship24goCarrierLogo: logo,
            originalServiceName: serviceName,
          },
        });
      } catch (e: any) {
        await writeProviderLog('logihub_intl', 'quote_failed', requestPayload, { message: e?.message || 'No disponible' }, 0);
      }
    }
    return quotes;
  } catch (e: any) {
    console.error('[Quote] logihub_intl helper failed:', e?.message || e);
    try { await writeProviderLog('logihub_intl', 'quote_failed', { helper: true }, { message: e?.message || String(e) }, 0); } catch {}
    return [];
  }
}


// SHIP24GO_INFER_CITY_FROM_POSTAL_V1 — critical for IT (SpedirePro/SpediamoPro need city+CAP)
function inferCityFromPostal(countryCode: any, postalCode: any, cityHint?: any): string {
  const hint = String(cityHint || '').trim();
  if (hint) return hint;
  const country = String(countryCode || '').toUpperCase().slice(0, 2);
  const zipRaw = String(postalCode || '').replace(/\s+/g, '').trim();
  if (!country || !zipRaw) return '';
  if (country === 'IT') {
    const z = zipRaw.replace(/\D/g, '').padStart(5, '0').slice(0, 5);
    const exact: Record<string, string> = {
      '00118': 'Roma', '00137': 'Roma', '00172': 'Roma', '00177': 'Roma', '00184': 'Roma',
      '00185': 'Roma', '00186': 'Roma', '00187': 'Roma', '00192': 'Roma',
      '20121': 'Milano', '20122': 'Milano', '20123': 'Milano', '20124': 'Milano',
      '10121': 'Torino', '80121': 'Napoli', '50121': 'Firenze', '40121': 'Bologna',
      '30100': 'Venezia', '16121': 'Genova', '90121': 'Palermo', '09124': 'Cagliari',
      '70121': 'Bari', '35121': 'Padova', '37121': 'Verona', '95121': 'Catania', '98121': 'Messina',
    };
    if (exact[z]) return exact[z];
    const p3 = z.slice(0, 3);
    const by3: Record<string, string> = {
      '001': 'Roma', '000': 'Roma', '201': 'Milano', '200': 'Milano', '101': 'Torino', '100': 'Torino',
      '801': 'Napoli', '800': 'Napoli', '501': 'Firenze', '500': 'Firenze', '401': 'Bologna', '400': 'Bologna',
      '301': 'Venezia', '300': 'Venezia', '161': 'Genova', '160': 'Genova', '901': 'Palermo', '900': 'Palermo',
      '091': 'Cagliari', '090': 'Cagliari', '701': 'Bari', '700': 'Bari', '351': 'Padova', '350': 'Padova',
      '371': 'Verona', '370': 'Verona', '411': 'Modena', '421': 'Reggio Emilia', '431': 'Parma', '479': 'Rimini',
      '601': 'Ancona', '651': 'Pescara', '711': 'Foggia', '721': 'Brindisi', '731': 'Lecce', '741': 'Taranto',
      '891': 'Reggio Calabria', '951': 'Catania', '981': 'Messina', '061': 'Perugia', '071': 'Sassari',
      '341': 'Trieste', '331': 'Udine', '241': 'Bergamo', '251': 'Brescia', '531': 'Siena', '561': 'Pisa',
      '841': 'Salerno', '811': 'Caserta', '871': 'Cosenza', '881': 'Catanzaro',
    };
    if (by3[p3]) return by3[p3];
    const p2 = z.slice(0, 2);
    const by2: Record<string, string> = {
      '00': 'Roma', '20': 'Milano', '10': 'Torino', '80': 'Napoli', '50': 'Firenze',
      '40': 'Bologna', '30': 'Venezia', '16': 'Genova', '90': 'Palermo', '09': 'Cagliari', '70': 'Bari',
    };
    return by2[p2] || '';
  }
  if (country === 'ES') {
    const z = zipRaw.replace(/\D/g, '').padStart(5, '0').slice(0, 5);
    const p2 = z.slice(0, 2);
    const by2: Record<string, string> = {
      '28': 'Madrid', '08': 'Barcelona', '46': 'Valencia', '41': 'Sevilla', '50': 'Zaragoza',
      '29': 'Málaga', '03': 'Alicante', '48': 'Bilbao', '15': 'A Coruña', '35': 'Las Palmas',
      '38': 'Santa Cruz de Tenerife', '07': 'Palma', '30': 'Murcia', '47': 'Valladolid', '39': 'Santander',
    };
    return by2[p2] || '';
  }
  return '';
}

app.post('/api/shipments/quote', async (req: any, res) => {
  try {
    const { originZip, destZip, weight, originCountry, destCountry, packages, currency } = req.body;
    const persistQuotes = req.body?.persistQuotes !== false;
    const countryFrom = String(originCountry || 'ES').toUpperCase().slice(0, 2);
    const countryTo = String(destCountry || 'ES').toUpperCase().slice(0, 2);
    const zipFrom = String(originZip || '').trim();
    const zipTo = String(destZip || '').trim();

    // Infer missing cities from CAP (IT SpedirePro/SpediamoPro/PaccoFacile return 0 without city)
    if (!String(req.body.originCity || req.body.origin_city || '').trim()) {
      const inferredOrigin = inferCityFromPostal(countryFrom, zipFrom);
      if (inferredOrigin) {
        req.body.originCity = inferredOrigin;
        req.body.origin_city = inferredOrigin;
      }
    }
    if (!String(req.body.destCity || req.body.dest_city || '').trim()) {
      const inferredDest = inferCityFromPostal(countryTo, zipTo);
      if (inferredDest) {
        req.body.destCity = inferredDest;
        req.body.dest_city = inferredDest;
      }
    }
    let requestedCurrency = String(currency || 'EUR').toUpperCase().slice(0, 3);

    if (!countryFrom || !countryTo || !zipFrom || !zipTo) {
      return res.status(400).json({ error: 'Completa los datos del envío para ver opciones disponibles.' });
    }

    let userId: string | null = null;
    const token = req.headers['authorization'];
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        userId = decoded.userId;
        const quoteUser = await UserRepo.getById(decoded.userId);
        if (quoteUser?.currency) requestedCurrency = normalizeCurrencyCode(quoteUser.currency || requestedCurrency);
      }
    }

    let totalWeight = 1.0;
    if (Array.isArray(packages) && packages.length > 0) {
      // Include qty: 2kg × qty 3 = 6kg total
      totalWeight = totalShipmentWeightKg(packages);
    } else if (weight) {
      totalWeight = Number(weight);
    }
    if (isNaN(totalWeight) || totalWeight <= 0) totalWeight = 1.0;

    const normalizedPackages = (Array.isArray(packages) && packages.length > 0)
      ? packages.map((pkg: any) => ({
          width: Math.max(1, Math.round(Number(pkg.width || 10))),
          height: Math.max(1, Math.round(Number(pkg.height || 10))),
          length: Math.max(1, Math.round(Number(pkg.length || 10))),
          weight: Math.max(0.1, Number(pkg.weight || 1)).toString(),
          qty: Math.max(1, Number(pkg.qty || pkg.quantity || 1))
        }))
      : [{ width: 10, height: 10, length: 10, weight: totalWeight.toString(), qty: 1 }];
    const multiPieces = totalShipmentPieces(normalizedPackages);

    const keys = await ApiKeysRepo.get();
    const providersDb = await ProviderRepo.getAll();
    // Only real shipping quoters (skip freecurrency, polar, google_maps, ecart, …)
    const requestedProviderCodes = Array.isArray(req.body?.providerCodes)
      ? new Set(req.body.providerCodes.map((value: any) => String(value || '').toLowerCase().trim()).filter(Boolean))
      : null;
    const activeProviders = providersDb.filter((provider: any) => {
      // An active flag alone is not enough: a provider that failed connection
      // validation cannot return a reliable quote and only adds avoidable latency.
      if (!provider?.is_active || !provider?.is_connected) return false;
      const code = String(provider.code || '').toLowerCase().trim();
      if (!SHIP24GO_QUOTE_PROVIDER_CODES.has(code)) return false;
      // Progressive requests can ask for one provider at a time. The server
      // still enforces the active+connected allow-list above.
      return !requestedProviderCodes || requestedProviderCodes.has(code);
    });

    if (activeProviders.length === 0) {
      return res.json({ quotes: [], message: 'No hay proveedores disponibles para cotizar en este momento.' });
    }

    // Tariffa uses read-only quotes. Reuse a very short-lived result for the
    // same route/package/plan context, while purchase quotes remain uncached.
    const readOnlyCacheKey = persistQuotes ? '' : readOnlyQuoteCacheKey({
      userId,
      originCountry: countryFrom,
      originZip: zipFrom,
      originCity: req.body?.originCity || req.body?.origin_city,
      destCountry: countryTo,
      destZip: zipTo,
      destCity: req.body?.destCity || req.body?.dest_city,
      currency: requestedCurrency,
      packages: normalizedPackages,
      activeProviders: activeProviders.map((provider: any) => `${provider.code}:${provider.is_connected ? 1 : 0}`).sort(),
    });
    if (readOnlyCacheKey) {
      const cachedResponse = getReadOnlyQuoteCache(readOnlyCacheKey);
      if (cachedResponse) {
        res.setHeader('X-DoorDrop-Quote-Cache', 'HIT');
        return res.json(cachedResponse);
      }
      res.setHeader('X-DoorDrop-Quote-Cache', 'MISS');
    }

    // Fresh FX rates once per request (used by EasyPost and final conversion)
    let quoteFxRates: Record<string, number> = { EUR: 1, USD: 1.09, DOP: 59.3, GBP: 0.84 };
    try {
      quoteFxRates = await getFreshRatesInternal();
    } catch (e: any) {
      console.warn('[Quote FX] rates fetch failed, using fallback', e?.message || e);
    }

    // SHIP24GO_QUOTE_PARALLEL_V1 — all providers in parallel (faster UX)
    const allQuotes: any[] = [];
    const providerResults = await Promise.allSettled(
      activeProviders.map((provider: any) => withQuoteProviderTimeout((async () => {

      // SHIP24GO_PROVIDER_TRY
      const providerCode = String(provider?.code || '').toLowerCase().trim();
      const localQuotes: any[] = [];
      if (!providerCode) return [];
      const brand = providerBrand(provider);
      try {
      if (providerCode === 'parcelabc') {
        const authToken = providerSecret('parcelabc', provider, keys);
        if (!authToken) return localQuotes;

        // ParcelABC only supports a subset of currencies (EUR/USD/GBP…).
        // Always quote in provider native currency, then convert system-wide to requestedCurrency.
        const parcelQuoteCurrency = providerNativeCurrency(provider, 'EUR');
        const requestPayload = {
          authToken,
          countryFrom,
          countryTo,
          zipFrom,
          zipTo,
          currency: parcelQuoteCurrency,
          packages: normalizedPackages
        };

        const startedAt = Date.now();
        try {
          const response = await fetchWithTimeout(`${providerBaseUrl(provider, 'https://www.parcelabc.com/api-pabc.php')}/quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
          }, QUOTE_API_TIMEOUT_MS);
          const textResponse = await response.text();
          const data = textResponse.trim().startsWith('{')
            ? JSON.parse(textResponse)
            : { status: false, errorMessage: 'Respuesta no disponible.' };

          await writeProviderLog('parcelabc', 'quote', { ...requestPayload, durationMs: Date.now() - startedAt }, data, response.status);

          if (data.status && Array.isArray(data.offers)) {
            data.offers.slice(0, brand.maxResults).forEach((offer: any) => {
              const providerCost = Number(offer.price || 0);
              if (!Number.isFinite(providerCost) || providerCost <= 0) return;
              const pricing = calculateProviderPrice(provider, providerCost);
              const quoteId = generateId('q_');
              const minDays = safeEstimatedDays(offer.deliveryMinTime || offer.deliveryTimeText || offer.deliveryMaxTime, 3);
              const maxDays = safeEstimatedDays(offer.deliveryMaxTime || offer.deliveryTimeText || offer.deliveryMinTime, minDays);
              const profile = inferServiceProfile(offer, minDays, maxDays);
              const carrierName = extractCarrierName(offer, offer.serviceName || 'ParcelABC');
              const carrierLogo = extractCarrierLogo(offer, brand.providerLogo);
              const serviceDisplayName = customerServiceName(offer.serviceName, profile.serviceTypeLabel || 'Servicio estándar');
              const displayName = publicProviderName(provider);
              localQuotes.push({
                id: quoteId,
                provider: displayName,
                providerDisplayName: displayName,
                publicProviderName: displayName,
                providerInternalName: provider.name || 'ParcelABC',
                carrierName,
                serviceType: profile.serviceType,
                serviceTypeLabel: profile.serviceTypeLabel,
                providerCode: 'parcelabc',
                providerColor: brand.providerColor,
                providerSecondaryColor: brand.providerSecondaryColor,
                providerLogo: carrierLogo || brand.providerLogo,
                priority: brand.priority,
                serviceId: String(offer.serviceId || ''),
                service: serviceDisplayName,
                collectionTypeId: offer.collectionTypeId || '',
                collectionTypeName: offer.collectionTypeName || '',
                departureType: (() => { const ct = String(offer.collectionTypeName || '').toLowerCase(); if (ct.includes('drop off') || ct.includes('drop-off') || ct.includes('dropoff')) return 'point'; return 'home'; })(),
                arrivalType: (() => { const ct = String(offer.collectionTypeName || '').toLowerCase(); if (ct.includes('pick-up') || ct.includes('pickup') || ct.includes('to pick')) return 'point'; return 'home'; })(),
                deliveryText: String(offer.deliveryTimeText || `${minDays}${maxDays && maxDays !== minDays ? `-${maxDays}` : ''}`),
                estimatedDays: maxDays,
                estimatedDaysMin: minDays,
                estimatedDaysMax: maxDays,
                price: pricing.providerCost,
                providerCost: pricing.providerCost,
                margin: pricing.marginAmount,
                marginAmount: pricing.marginAmount,
                taxes: 0,
                customerPrice: pricing.customerPrice,
                total: pricing.customerPrice,
                currency: normalizeCurrencyCode(data.currency || parcelQuoteCurrency || provider.currency || 'EUR'),
                providerNativeCurrency: normalizeCurrencyCode(data.currency || parcelQuoteCurrency || provider.currency || 'EUR'),
                providerPayload: { ...offer, originalServiceName: offer.serviceName || '', ship24goCarrierName: carrierName, ship24goCarrierLogo: carrierLogo, providerCurrency: parcelQuoteCurrency,
                  departureType: (() => { const ct = String(offer.collectionTypeName || '').toLowerCase(); if (ct.includes('drop off') || ct.includes('drop-off') || ct.includes('dropoff')) return 'point'; return 'home'; })(),
                  arrivalType: (() => { const ct = String(offer.collectionTypeName || '').toLowerCase(); if (ct.includes('pick-up') || ct.includes('pickup') || ct.includes('to pick')) return 'point'; return 'home'; })()
                }
              });
            });
          }
        } catch (e: any) {
          await writeProviderLog('parcelabc', 'quote_failed', sanitizeProviderPayload(requestPayload), { message: e?.message || 'No disponible' }, 0);
        }
      }


      if (providerCode === 'paccofacile') {
        const credentials = paccofacileCredentials(provider, keys);
        if (!credentials) return localQuotes;
        try {
          const originCityHint = String(req.body.originCity || req.body.origin_city || '').trim();
          const destCityHint = String(req.body.destCity || req.body.dest_city || '').trim();
          const pickupLocality = await lookupPaccofacileLocality(provider, keys, countryFrom, zipFrom, originCityHint, QUOTE_API_TIMEOUT_MS);
          const destinationLocality = await lookupPaccofacileLocality(provider, keys, countryTo, zipTo, destCityHint, QUOTE_API_TIMEOUT_MS);
          if (!pickupLocality || !destinationLocality) return localQuotes;

          const requestPayload = {
            shipment_service: {
              parcels: buildPaccofacileParcels(normalizedPackages),
              accessories: [],
              package_content_type: 'GOODS'
            },
            pickup: {
              iso_code: countryFrom,
              postal_code: String(pickupLocality.postal_code || pickupLocality.cap || zipFrom),
              city: String(pickupLocality.locality || originCityHint || '').toUpperCase(),
              StateOrProvinceCode: paccofacileProvince(pickupLocality, countryFrom, pickupLocality?.postal_code || pickupLocality?.cap || zipFrom)
            },
            destination: {
              iso_code: countryTo,
              postal_code: String(destinationLocality.postal_code || destinationLocality.cap || zipTo),
              city: String(destinationLocality.locality || destCityHint || '').toUpperCase(),
              StateOrProvinceCode: paccofacileProvince(destinationLocality, countryTo, destinationLocality?.postal_code || destinationLocality?.cap || zipTo)
            }
          };
          const { httpStatus, response: data } = await callPaccofacile(provider, keys, 'POST', 'service/shipment/quote', requestPayload, QUOTE_API_TIMEOUT_MS);
          await writeProviderLog('paccofacile', 'quote', { origin_zip: zipFrom, dest_zip: zipTo, origin_country: countryFrom, dest_country: countryTo }, data, httpStatus);
          const offers = data?.data?.services_available || data?.services_available || [];
          offers
            .filter((offer: any) => paccofacileServiceSupportsAddressFlow(offer))
            .slice(0, brand.maxResults)
            .forEach((offer: any) => {
            const providerCost = Number(offer?.price_total?.amount || offer?.price_service?.amount || offer?.amount || 0);
            if (!Number.isFinite(providerCost) || providerCost <= 0) return;
            const pricing = calculateProviderPrice(provider, providerCost);
            const quoteId = generateId('q_');
            const days = safeEstimatedDays(offer?.delivery_date?.delivery_days || offer?.carrier_ship_time || offer?.deliveryDays || 3, 3);
            const carrierName = extractCarrierName(offer, offer?.carrier || offer?.name || offer?.service_name || 'Paccofacile');
            const carrierLogo = extractCarrierLogo(offer, brand.providerLogo);
            const serviceName = compactText(`${carrierName} ${offer?.name || offer?.service_name || 'Standard'}`, 160);
            const profile = inferServiceProfile({ ...offer, serviceName, collectionTypeName: offer?.pickup_type || '' }, days, days);
            const displayName = publicProviderName(provider);
            localQuotes.push({
              id: quoteId,
              provider: displayName,
              providerDisplayName: displayName,
              publicProviderName: displayName,
              providerInternalName: provider.name || 'Paccofacile',
              carrierName,
              serviceType: profile.serviceType,
              serviceTypeLabel: profile.serviceTypeLabel,
              providerCode: 'paccofacile',
              providerColor: brand.providerColor,
              providerSecondaryColor: brand.providerSecondaryColor,
              providerLogo: carrierLogo || brand.providerLogo,
              priority: brand.priority,
              serviceId: String(offer?.service_id || offer?.id || `paccofacile_${Date.now()}`),
              service: serviceName,
              collectionTypeName: String(offer?.pickup_type || ''),
              deliveryText: `${days} días`,
              estimatedDays: days,
              estimatedDaysMin: days,
              estimatedDaysMax: days,
              price: pricing.providerCost,
              providerCost: pricing.providerCost,
              margin: pricing.marginAmount,
              marginAmount: pricing.marginAmount,
              taxes: 0,
              customerPrice: pricing.customerPrice,
              total: pricing.customerPrice,
              currency: providerNativeCurrency(provider, 'EUR'),
              providerNativeCurrency: providerNativeCurrency(provider, 'EUR'),
              providerPayload: { ...offer, apiMode: 'paccofacile_v1', selectedService: offer, ship24goCarrierName: carrierName, ship24goCarrierLogo: carrierLogo, ship24goLocalities: { pickup: pickupLocality, destination: destinationLocality } }
            });
          });
        } catch (e: any) {
          await writeProviderLog('paccofacile', 'quote_failed', { origin_zip: zipFrom, dest_zip: zipTo }, { message: e?.message || 'No disponible' }, 0);
        }
      }


      if (providerCode === 'spedirepro') {
        const credentials = spedireProCredentials(provider, keys);
        if (!credentials) return localQuotes;
        try {
          const originCityHint = String(req.body.originCity || req.body.origin_city || '').trim();
          const destCityHint = String(req.body.destCity || req.body.dest_city || '').trim();
          if (!originCityHint || !destCityHint) return localQuotes;
          const requestPayload = { from: { country: countryFrom, city: originCityHint, postcode: zipFrom }, to: { country: countryTo, city: destCityHint, postcode: zipTo }, packages: buildSpedireProPackages(normalizedPackages), protection_amount: 0 };
          const startedAt = Date.now();
          const { httpStatus, response: data } = await callSpedirePro(provider, keys, 'POST', 'v1/get-quotes', requestPayload, QUOTE_API_TIMEOUT_MS);
          await writeProviderLog('spedirepro', 'quote', { origin_zip: zipFrom, dest_zip: zipTo, origin_country: countryFrom, dest_country: countryTo, durationMs: Date.now() - startedAt }, Array.isArray(data) ? { offers: data.length } : data, httpStatus);
          const offers = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
          offers.slice(0, brand.maxResults).forEach((offer: any) => {
            const providerCost = Number(offer?.price || offer?.full_price || 0);
            if (!Number.isFinite(providerCost) || providerCost <= 0) return;
            const pricing = calculateProviderPrice(provider, providerCost);
            const quoteId = generateId('q_');
            const days = safeEstimatedDays(offer?.transit_days || offer?.delivery_days || offer?.delivery_time || 3, 3);
            const carrierName = extractCarrierName(offer, offer?.vendor || offer?.courier || offer?.name || 'SpedirePro');
            const carrierLogo = extractCarrierLogo(offer, brand.providerLogo);
            const serviceName = compactText(offer?.name || `${carrierName} Standard`, 160);
            const profile = inferServiceProfile({ ...offer, serviceName, collectionTypeName: `${offer?.departure_type || ''} ${offer?.arrival_type || ''}` }, days, days);
            const displayName = publicProviderName(provider);
            localQuotes.push({ id: quoteId, provider: displayName, providerDisplayName: displayName, publicProviderName: displayName, providerInternalName: provider.name || 'SpedirePro', carrierName, serviceType: profile.serviceType, serviceTypeLabel: profile.serviceTypeLabel, departureType: String(offer?.departure_type || 'home').toLowerCase(), arrivalType: String(offer?.arrival_type || 'home').toLowerCase(), providerCode: 'spedirepro', providerColor: brand.providerColor, providerSecondaryColor: brand.providerSecondaryColor, providerLogo: carrierLogo || brand.providerLogo, priority: brand.priority, serviceId: String(offer?.id || offer?.courier || `spedirepro_${Date.now()}`), service: serviceName, collectionTypeName: `${offer?.departure_type || 'home'} → ${offer?.arrival_type || 'home'}`, deliveryText: `${days} días`, estimatedDays: days, estimatedDaysMin: days, estimatedDaysMax: days, price: pricing.providerCost, providerCost: pricing.providerCost, margin: pricing.marginAmount, marginAmount: pricing.marginAmount, taxes: 0, customerPrice: pricing.customerPrice, total: pricing.customerPrice, currency: providerNativeCurrency(provider, 'EUR'),
            providerNativeCurrency: providerNativeCurrency(provider, 'EUR'), providerPayload: { ...offer, apiMode: 'spedirepro_v1', selectedService: offer, ship24goCarrierName: carrierName, ship24goCarrierLogo: carrierLogo, departureType: String(offer?.departure_type || 'home').toLowerCase(), arrivalType: String(offer?.arrival_type || 'home').toLowerCase() } });
          });
        } catch (e: any) {
          await writeProviderLog('spedirepro', 'quote_failed', { origin_zip: zipFrom, dest_zip: zipTo }, { message: e?.message || 'No disponible' }, 0);
        }
      }


      if (providerCode === 'spediamopro') {
        const credentials = spediamoProCredentials(provider, keys);
        if (!credentials) return localQuotes;
        try {
          const originCityHint = String(req.body.originCity || req.body.origin_city || '').trim();
          const destCityHint = String(req.body.destCity || req.body.dest_city || '').trim();
          if (!originCityHint || !destCityHint) return localQuotes;
          const requestPayload: any = {
            parcels: buildSpediamoProParcels(normalizedPackages),
            sender: buildSpediamoProQuoteContact(countryFrom, zipFrom, originCityHint),
            consignee: buildSpediamoProQuoteContact(countryTo, zipTo, destCityHint)
          };
          const couriers = Array.isArray(providerConfig(provider)?.couriers) ? providerConfig(provider).couriers : [];
          if (couriers.length) requestPayload.couriers = couriers.map((v: any) => String(v).toLowerCase()).filter(Boolean);
          const startedAt = Date.now();
          const { httpStatus, response: data } = await callSpediamoPro(provider, keys, 'POST', 'quotations', requestPayload, QUOTE_API_TIMEOUT_MS);
          await writeProviderLog('spediamopro', 'quote', { origin_zip: zipFrom, dest_zip: zipTo, origin_country: countryFrom, dest_country: countryTo, durationMs: Date.now() - startedAt }, { httpStatus, offers: Array.isArray(data?.data) ? data.data.length : 0, processId: data?.processId || null }, httpStatus);
          const offers = Array.isArray(data?.data) ? data.data : [];
          offers.slice(0, brand.maxResults).forEach((offer: any) => {
            const providerCost = Number(offer?.totalPrice || 0) / 100;
            if (!Number.isFinite(providerCost) || providerCost <= 0) return;
            const pricing = calculateProviderPrice(provider, providerCost);
            const quoteId = generateId('q_');
            const service = offer?.courierService || {};
            const courierName = spediamoProCourierName(service?.courier);
            const serviceName = compactText(`${courierName} ${service?.code || offer?.serviceCode || 'Standard'}`, 160);
            const days = safeEstimatedDays(offer?.deliveryTime || 3, 3);
            const pointTypes = spediamoProServicePointTypes(offer);
            const flowLabel = `${pointTypes.departure === 'point' ? 'Punto de recogida' : 'Retiro a domicilio'} → ${pointTypes.arrival === 'point' ? 'Punto de entrega' : 'Entrega a domicilio'}`;
            const profile = inferServiceProfile({ ...offer, serviceName, collectionTypeName: `${service?.code || ''} ${flowLabel}` }, days, days);
            const displayName = publicProviderName(provider);
            localQuotes.push({
              id: quoteId,
              provider: displayName,
              providerDisplayName: displayName,
              publicProviderName: displayName,
              providerInternalName: provider.name || 'SpediamoPro',
              carrierName: courierName,
              serviceType: profile.serviceType,
              serviceTypeLabel: profile.serviceTypeLabel,
              departureType: pointTypes.departure,
              arrivalType: pointTypes.arrival,
              providerCode: 'spediamopro',
              providerColor: brand.providerColor,
              providerSecondaryColor: brand.providerSecondaryColor,
              providerLogo: brand.providerLogo,
              priority: brand.priority,
              serviceId: String(offer?.service || service?.id || ''),
              service: serviceName,
              collectionTypeName: flowLabel,
              deliveryText: `${days} días`,
              estimatedDays: days,
              estimatedDaysMin: days,
              estimatedDaysMax: days,
              price: pricing.providerCost,
              providerCost: pricing.providerCost,
              margin: pricing.marginAmount,
              marginAmount: pricing.marginAmount,
              taxes: Number(offer?.priceBreakdown?.vatAmount || 0) / 100,
              customerPrice: pricing.customerPrice,
              total: pricing.customerPrice,
              currency: providerNativeCurrency(provider, 'EUR'),
              providerNativeCurrency: providerNativeCurrency(provider, 'EUR'),
              providerPayload: { ...offer, apiMode: 'spediamopro_v2', selectedService: offer, ship24goCarrierName: courierName, departureType: pointTypes.departure, arrivalType: pointTypes.arrival, deliveryPudoRequired: pointTypes.deliveryPudoRequired }
            });
          });
        } catch (e: any) {
          await writeProviderLog('spediamopro', 'quote_failed', { origin_zip: zipFrom, dest_zip: zipTo }, { message: e?.message || 'No disponible' }, 0);
        }
      }


      if (providerCode === 'easypost') {
        const credentials = easyPostCredentials(provider, keys);
        if (!credentials) return localQuotes;
        try {
          const originCityHint = String(req.body.originCity || req.body.origin_city || '').trim();
          const destCityHint = String(req.body.destCity || req.body.dest_city || '').trim();
          if (!originCityHint || !destCityHint) return localQuotes;
          const requestPayload: any = {
            shipment: {
              from_address: {
                name: 'DoorDrop',
                street1: countryFrom === 'US' ? '417 Montgomery St' : 'Via Roma 1',
                city: originCityHint,
                state: normalizeItalianProvince(req.body.originState || req.body.originProvince || '', countryFrom, zipFrom),
                zip: zipFrom,
                country: countryFrom,
                phone: countryFrom === 'US' ? '4153334445' : '+393331234567',
                email: ship24goProviderContactEmail()
              },
              to_address: {
                name: 'Cliente DoorDrop',
                street1: countryTo === 'US' ? '179 N Harbor Dr' : 'Via Milano 1',
                city: destCityHint,
                state: normalizeItalianProvince(req.body.destState || req.body.destProvince || '', countryTo, zipTo),
                zip: zipTo,
                country: countryTo,
                phone: countryTo === 'US' ? '8573875756' : '+393331234567',
                email: ship24goProviderContactEmail()
              },
              // EasyPost quotes 1 parcel — consolidate multi-package into one box
              parcel: buildEasyPostParcel(consolidatePackagesForSingleParcel(normalizedPackages)),
              options: { label_format: 'PDF' }
            }
          };
          const startedAt = Date.now();
          const { httpStatus, response: data } = await callEasyPost(provider, keys, 'POST', 'shipments', requestPayload, QUOTE_API_TIMEOUT_MS);
          await writeProviderLog('easypost', 'quote', { origin_zip: zipFrom, dest_zip: zipTo, origin_country: countryFrom, dest_country: countryTo, durationMs: Date.now() - startedAt }, { httpStatus, shipmentId: data?.id, rates: Array.isArray(data?.rates) ? data.rates.length : 0 }, httpStatus);
          const rates = Array.isArray(data?.rates) ? data.rates : [];
          const rateCurrency = 'USD';
          const ratesMap = await getFreshRatesInternal();
          rates.slice(0, brand.maxResults).forEach((rate: any) => {
            const providerCostUsd = Number(rate?.rate || 0);
            if (!Number.isFinite(providerCostUsd) || providerCostUsd <= 0) return;
            const providerCostCustomerCurrency = easyPostCurrencyToCustomer(providerCostUsd, rateCurrency, requestedCurrency, ratesMap);
            const pricing = calculateProviderPrice({ ...provider, currency: requestedCurrency }, providerCostCustomerCurrency);
            const quoteId = generateId('q_');
            const courierName = easyPostCarrierName(rate);
            const days = safeEstimatedDays(rate?.delivery_days || 3, 3);
            const serviceName = compactText(`${courierName} ${rate?.service || 'Standard'}`, 160);
            const profile = inferServiceProfile({ ...rate, serviceName, collectionTypeName: rate?.service || '' }, days, days);
            const displayName = publicProviderName(provider);
            localQuotes.push({
              id: quoteId,
              provider: displayName,
              providerDisplayName: displayName,
              publicProviderName: displayName,
              providerInternalName: provider.name || 'EasyPost',
              carrierName: courierName,
              serviceType: profile.serviceType,
              serviceTypeLabel: profile.serviceTypeLabel,
              departureType: 'home',
              arrivalType: 'home',
              providerCode: 'easypost',
              providerColor: brand.providerColor,
              providerSecondaryColor: brand.providerSecondaryColor,
              providerLogo: brand.providerLogo,
              priority: brand.priority,
              serviceId: String(rate?.id || ''),
              service: serviceName,
              collectionTypeName: 'Retiro a domicilio → Entrega a domicilio',
              deliveryText: rate?.delivery_days ? `${rate.delivery_days} días` : (rate?.delivery_date || `${days} días`),
              estimatedDays: days,
              estimatedDaysMin: days,
              estimatedDaysMax: days,
              price: pricing.providerCost,
              providerCost: pricing.providerCost,
              margin: pricing.marginAmount,
              marginAmount: pricing.marginAmount,
              taxes: 0,
              customerPrice: pricing.customerPrice,
              total: pricing.customerPrice,
              currency: requestedCurrency,
              providerPayload: { selectedRate: rate, shipment: data, apiMode: 'easypost_v2', providerCostUsd, providerCurrency: 'USD', rateSource: 'freecurrencyapi', ship24goCarrierName: courierName, departureType: 'home', arrivalType: 'home' }
            });
          });
        } catch (e: any) {
          await writeProviderLog('easypost', 'quote_failed', { origin_zip: zipFrom, dest_zip: zipTo }, { message: e?.message || 'No disponible' }, 0);
        }
      }

      if (providerCode === 'genei') {
        const credential = providerSecret('genei', provider, keys);
        if (!credential) return localQuotes;

        try {
          if (geneiApiMode(provider) === 'v1') {
            const requestPayload = {
              array_bultos: buildGeneiV1Packages(normalizedPackages),
              codigos_origen: zipFrom,
              poblacion_salida: String((req.body.originCity || req.body.origin_city || '')).toUpperCase(),
              iso_pais_salida: countryFrom,
              codigos_destino: zipTo,
              poblacion_llegada: String((req.body.destCity || req.body.dest_city || '')).toUpperCase(),
              iso_pais_llegada: countryTo,
              cod_promo: ''
            };
              const { httpStatus, response: data } = await callGeneiV1(provider, keys, 'obtener_listado_agencias_precios', requestPayload, QUOTE_API_TIMEOUT_MS);
            await writeProviderLog('genei', 'quote_v1', { origin_zip: zipFrom, dest_zip: zipTo, origin_country: countryFrom, dest_country: countryTo }, data, httpStatus);

            const offers = data?.datos_agencia2 && typeof data.datos_agencia2 === 'object' ? Object.values(data.datos_agencia2) : [];
            offers.slice(0, brand.maxResults).forEach((offer: any) => {
              const discounted = Number(offer.importe_dto_promo || 0);
              const providerCost = Number(discounted > 0 ? discounted : offer.importe || offer.total || 0);
              if (!Number.isFinite(providerCost) || providerCost <= 0) return;
              const pricing = calculateProviderPrice(provider, providerCost);
              const quoteId = generateId('q_');
              const serviceHours = Number(offer.servicio_horas_minimo || offer.servicio_horas || 72);
              const days = safeEstimatedDays(Math.ceil((Number.isFinite(serviceHours) && serviceHours > 0 ? serviceHours : 72) / 24), 3);
              const carrierName = extractCarrierName(offer, offer.nombre_completo_agencia || offer.nombre_agencia || `Genei ${offer.id_agencia || ''}`.trim());
              const carrierLogo = extractCarrierLogo(offer, brand.providerLogo);
              const serviceName = offer.nombre_completo_agencia || offer.nombre_agencia || `${carrierName} Genei`.trim();
              const pointTypes = extractGeneiPointTypes(offer);
              const flowLabel = `${pointTypes.departure === 'point' ? 'Punto de recogida' : 'Retiro a domicilio'} → ${pointTypes.arrival === 'point' ? 'Punto de entrega' : 'Entrega a domicilio'}`;
              const profile = inferServiceProfile({ ...offer, serviceName, collectionTypeName: `${offer.nombre_integracion_cliente || ''} ${flowLabel}` }, days, days);
              const displayName = publicProviderName(provider);
              localQuotes.push({
                id: quoteId,
                provider: displayName,
                providerDisplayName: displayName,
                publicProviderName: displayName,
                providerInternalName: provider.name || 'Genei',
                carrierName,
                serviceType: profile.serviceType,
                serviceTypeLabel: profile.serviceTypeLabel,
                departureType: pointTypes.departure,
                arrivalType: pointTypes.arrival,
                providerCode: 'genei',
                providerColor: brand.providerColor,
                providerSecondaryColor: brand.providerSecondaryColor,
                providerLogo: carrierLogo || brand.providerLogo,
                priority: brand.priority,
                serviceId: String(offer.id_agencia || offer.id || `genei_${Date.now()}`),
                service: serviceName,
                collectionTypeName: flowLabel,
                deliveryText: offer.servicio_horas ? `${offer.servicio_horas}h` : `${days} días`,
                estimatedDays: days,
                estimatedDaysMin: days,
                estimatedDaysMax: days,
                price: pricing.providerCost,
                providerCost: pricing.providerCost,
                margin: pricing.marginAmount,
                marginAmount: pricing.marginAmount,
                taxes: 0,
                customerPrice: pricing.customerPrice,
                total: pricing.customerPrice,
                currency: providerNativeCurrency(provider, 'EUR'),
                providerNativeCurrency: providerNativeCurrency(provider, 'EUR'),
                providerPayload: { ...offer, datos_vista: data?.datos_vista || null, apiMode: 'v1', ship24goCarrierName: carrierName, ship24goCarrierLogo: carrierLogo, departureType: pointTypes.departure, arrivalType: pointTypes.arrival }
              });
            });
          } else {
            const params = new URLSearchParams({
              origin_zip: zipFrom,
              dest_zip: zipTo,
              origin_country: countryFrom,
              dest_country: countryTo,
            });
            expandPackagesByQty(normalizedPackages).forEach((pkg: any, idx: number) => {
              params.append(`packages[${idx}][weight]`, String(pkg.weight || 1));
              params.append(`packages[${idx}][width]`, String(pkg.width || 10));
              params.append(`packages[${idx}][height]`, String(pkg.height || 10));
              params.append(`packages[${idx}][length]`, String(pkg.length || 10));
            });
            const bearerToken = await getGeneiToken(credential, QUOTE_API_TIMEOUT_MS);
            const response = await fetchWithTimeout(`https://apiv2.genei.es/api/v2/agencies/prices?${params.toString()}`, {
              method: 'GET',
              headers: { 'Authorization': `Bearer ${bearerToken}` }
            }, QUOTE_API_TIMEOUT_MS);
            const data = await response.json().catch(() => []);
            await writeProviderLog('genei', 'quote', { origin_zip: zipFrom, dest_zip: zipTo, origin_country: countryFrom, dest_country: countryTo }, data, response.status);
            if (Array.isArray(data)) {
              data.slice(0, brand.maxResults).forEach((offer: any) => {
                const providerCost = Number(offer.price || offer.total || 0);
                if (!Number.isFinite(providerCost) || providerCost <= 0) return;
                const pricing = calculateProviderPrice(provider, providerCost);
                const quoteId = generateId('q_');
                const days = safeEstimatedDays(offer.transit_days || offer.delivery_time || offer.transit || offer.days, 2);
                const carrierName = extractCarrierName(offer, offer.service_name || offer.name || offer.agency || 'Genei');
                const carrierLogo = extractCarrierLogo(offer, brand.providerLogo);
                const serviceName = offer.service_name || offer.name || `${carrierName} Standard`;
                const pointTypes = extractGeneiPointTypes(offer);
                const flowLabel = `${pointTypes.departure === 'point' ? 'Punto de recogida' : 'Retiro a domicilio'} → ${pointTypes.arrival === 'point' ? 'Punto de entrega' : 'Entrega a domicilio'}`;
                const profile = inferServiceProfile({ ...offer, serviceName, collectionTypeName: `${offer.collection_type || offer.collectionTypeName || ''} ${flowLabel}` }, days, days);
                const displayName = publicProviderName(provider);
                localQuotes.push({
                  id: quoteId,
                  provider: displayName,
                  providerDisplayName: displayName,
                  publicProviderName: displayName,
                  providerInternalName: provider.name || 'Genei',
                  carrierName,
                  serviceType: profile.serviceType,
                  serviceTypeLabel: profile.serviceTypeLabel,
                  departureType: pointTypes.departure,
                  arrivalType: pointTypes.arrival,
                  providerCode: 'genei',
                  providerColor: brand.providerColor,
                  providerSecondaryColor: brand.providerSecondaryColor,
                  providerLogo: carrierLogo || brand.providerLogo,
                  priority: brand.priority,
                  serviceId: String(offer.service_id || offer.id || `genei_${Date.now()}`),
                  service: serviceName,
                  collectionTypeName: flowLabel,
                  deliveryText: String(offer.transit_days || offer.delivery_time || `${days}`),
                  estimatedDays: days,
                  estimatedDaysMin: days,
                  estimatedDaysMax: days,
                  price: pricing.providerCost,
                  providerCost: pricing.providerCost,
                  margin: pricing.marginAmount,
                  marginAmount: pricing.marginAmount,
                  taxes: 0,
                  customerPrice: pricing.customerPrice,
                  total: pricing.customerPrice,
                  currency: providerNativeCurrency(provider, 'EUR'),
                  providerNativeCurrency: providerNativeCurrency(provider, 'EUR'),
                  providerPayload: { ...offer, originalServiceName: offer.serviceName || '', ship24goCarrierName: carrierName, ship24goCarrierLogo: carrierLogo, departureType: pointTypes.departure, arrivalType: pointTypes.arrival }
                });
              });
            }
          }
        } catch (e: any) {
          await writeProviderLog('genei', 'quote_failed', { origin_zip: zipFrom, dest_zip: zipTo }, { message: e?.message || 'No disponible' }, 0);
        }
      }

      // --- Conector internacional (helper aislado y suspendido) ---
      if (providerCode === 'logihub_intl') {
        const lhQuotes = await quoteLogihubIntlProvider(provider, {
          countryFrom, countryTo, zipFrom, zipTo, requestedCurrency,
          normalizedPackages, keys, brand
        });
        if (lhQuotes.length) localQuotes.push(...lhQuotes);
      }
      } catch (providerErr: any) {
        console.error(`[Quote] provider ${providerCode} failed:`, providerErr?.message || providerErr);
        try {
          await writeProviderLog(providerCode, 'quote_failed', { origin_zip: zipFrom, dest_zip: zipTo, isolated: true }, { message: providerErr?.message || String(providerErr) }, 0);
        } catch {}
      }
      return localQuotes;
      })(), String(provider?.code || '').toLowerCase().trim()))
    );
    for (const result of providerResults) {
      if (result.status === 'fulfilled' && Array.isArray(result.value) && result.value.length) {
        allQuotes.push(...result.value);
      } else if (result.status === 'rejected') {
        console.error('[Quote] provider promise rejected:', result.reason?.message || result.reason);
      }
    }

    // SHIP24GO_FX_QUOTE_NORMALIZE_V1 — every offer in the customer's requested currency
    const allQuotesFx = allQuotes.map((q: any) => {
      try {
        // EasyPost and the international connector already convert to requestedCurrency; normalize anyway.
        return convertQuoteToCurrency(q, requestedCurrency, quoteFxRates);
      } catch {
        return { ...q, currency: requestedCurrency };
      }
    });
    allQuotes.length = 0;
    allQuotes.push(...allQuotesFx);

    // SHIP24GO_QUOTE_PLAN_DISCOUNT_V1_4_37
    let activePlanDiscountPercent = 0;
    let activePlanName = 'DoorDrop Básico';
    let activePlanId = 'plan_basic';

    if (userId) {
      try {
        const [planRows]: any = await pool.query(
          `SELECT
              pl.id AS plan_id,
              pl.name AS plan_name,
              COALESCE(pl.discount_percent, 0) AS discount_percent
            FROM subscriptions sub
            INNER JOIN plans pl ON pl.id = sub.plan_id
            WHERE sub.user_id = ?
              AND sub.status IN ('active','trialing')
              AND sub.current_period_end > UTC_TIMESTAMP()
              AND pl.is_active = 1
            ORDER BY COALESCE(pl.discount_percent, 0) DESC, sub.created_at DESC
            LIMIT 1`,
          [userId]
        );

        if (planRows?.[0]) {
          activePlanId = String(planRows[0].plan_id || 'plan_basic');
          activePlanName = String(planRows[0].plan_name || 'DoorDrop Básico');
          activePlanDiscountPercent = normalizeDoorDropPlanDiscount(planRows[0].discount_percent);
        }
      } catch (e) {
        activePlanDiscountPercent = 0;
        activePlanName = 'DoorDrop Básico';
        activePlanId = 'plan_basic';
      }
    }

    // Public plan comparison: expose only customer-facing plan data, never provider cost or margin.
    let quotePlans: any[] = [];
    try {
      const [publicPlanRows]: any = await pool.query(
        `SELECT id, name, price, currency, COALESCE(discount_percent, 0) AS discount_percent
         FROM plans
         WHERE is_active = 1
         ORDER BY price ASC, discount_percent ASC, name ASC`
      );
      quotePlans = (publicPlanRows || []).map((plan: any) => ({
        planId: String(plan.id),
        planName: String(plan.name || 'DoorDrop'),
        planPrice: roundMoney(Number(plan.price || 0)),
        planCurrency: normalizeCurrencyCode(plan.currency || 'EUR'),
        discountPercent: normalizeDoorDropPlanDiscount(plan.discount_percent)
      }));
    } catch (e) {
      console.warn('[Quote Plans] no se pudo cargar la comparación de planes:', e?.message || e);
    }
    if (!quotePlans.length) {
      quotePlans = [{ planId: 'plan_basic', planName: 'DoorDrop Básico', planPrice: 0, planCurrency: 'EUR', discountPercent: 0 }];
    }

    const discountedQuotes = allQuotes.map((quote: any) => {
      const originalTotal = roundMoney(Number(quote.customerPrice || quote.total || 0));
      const originalMargin = roundMoney(Number(quote.marginAmount || quote.margin || 0));
      const discountPercent = activePlanDiscountPercent;
      const discountAmount = discountPercent > 0 ? roundMoney(originalTotal * (discountPercent / 100)) : 0;
      const finalTotal = discountPercent > 0 ? roundMoney(Math.max(0.01, originalTotal - discountAmount)) : originalTotal;

      return {
        ...quote,
        originalCustomerPrice: originalTotal,
        originalTotal,
        planDiscountPercent: discountPercent,
        planDiscountAmount: discountAmount,
        planName: activePlanName,
        planId: activePlanId,
        customerPrice: finalTotal,
        total: finalTotal,
        marginAmount: roundMoney(Math.max(0, originalMargin - discountAmount)),
        margin: roundMoney(Math.max(0, originalMargin - discountAmount)),
        planComparisons: quotePlans.map((plan: any) => {
          const planDiscount = Number(plan.discountPercent || 0);
          const planDiscountAmount = planDiscount > 0 ? roundMoney(originalTotal * (planDiscount / 100)) : 0;
          return {
            ...plan,
            quotePrice: roundMoney(Math.max(0.01, originalTotal - planDiscountAmount)),
            isActive: String(plan.planId) === String(activePlanId)
          };
        })
      };
    });

    // Diversify: max 4 per provider, up to 24 total (was hard slice 10 → only genei/parcelabc)
    const sortedQuotes = diversifyQuotesByProvider(discountedQuotes, 24, 4)
      .map((q: any) => ({
        ...q,
        currency: requestedCurrency,
        originCountry: countryFrom,
        destCountry: countryTo,
        originZip: zipFrom,
        destZip: zipTo,
        originCity: String(req.body?.originCity || req.body?.origin_city || '').trim(),
        destCity: String(req.body?.destCity || req.body?.dest_city || '').trim(),
      }));

    if (persistQuotes) {
      const [providers]: any = await pool.query('SELECT id, code FROM providers WHERE is_active = 1');
      for (const q of sortedQuotes) {
        const dbProvider = providers.find((provider: any) => provider.code.toLowerCase() === String(q.providerCode || q.provider).toLowerCase());
        const providerId = dbProvider ? dbProvider.id : null;
        const estimatedMin = safeEstimatedDays(q.estimatedDaysMin ?? q.estimatedDays, 3);
        const estimatedMax = safeEstimatedDays(q.estimatedDaysMax ?? q.estimatedDays ?? estimatedMin, estimatedMin);
        await pool.query(
          `INSERT INTO quotes (id, user_id, provider_id, provider_code, service_id, service_name, origin_country, origin_zip, dest_country, dest_zip, base_price, margin_amount, taxes_amount, total_amount, currency, estimated_days_min, estimated_days_max, provider_payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            q.id,
            userId,
            providerId,
            q.providerCode || q.provider?.toLowerCase() || null,
            q.serviceId?.toString() || null,
            q.service,
            countryFrom,
            zipFrom,
            countryTo,
            zipTo,
            q.providerCost || q.price,
            q.marginAmount || q.margin || 0,
            0,
            q.customerPrice || q.total,
            q.currency || requestedCurrency,
            estimatedMin,
            estimatedMax,
            JSON.stringify({
              providerCode: q.providerCode || q.provider?.toLowerCase(),
              carrierName: q.carrierName || '',
              carrierLogo: q.providerLogo || '',
              serviceName: q.service || '',
              raw: q.providerPayload || null,
              packages: normalizedPackages,
              planDiscountPercent: q.planDiscountPercent || 0,
              planDiscountAmount: q.planDiscountAmount || 0,
              originalCustomerPrice: q.originalCustomerPrice || q.total,
              planName: q.planName || 'DoorDrop Básico',
              planId: q.planId || 'plan_basic'
            })
          ]
        ).catch((e) => console.error('[Diagnóstico Interno] No se pudo guardar la cotización.'));
      }
    }

    const emptyMsg = sortedQuotes.length
      ? undefined
      : (multiPieces > 1
          ? `No encontramos opciones para esta ruta con ${multiPieces} bultos. Prueba con un solo paquete o reduce peso/medidas.`
          : 'No encontramos opciones disponibles para esta ruta.');
    const quoteResponse = {
      quotes: sortedQuotes,
      currency: requestedCurrency,
      fxBase: 'EUR',
      packagesCount: multiPieces,
      packageLines: normalizedPackages.length,
      totalWeightKg: totalWeight,
      plans: quotePlans,
      multiPackageSupport: multiPackageProviderSupport(),
      message: emptyMsg
    };
    // Never cache a timeout/empty response: a temporarily slow provider must
    // not make the next customer request inherit an empty result.
    if (readOnlyCacheKey && sortedQuotes.length > 0) setReadOnlyQuoteCache(readOnlyCacheKey, quoteResponse);
    res.json(quoteResponse);
  } catch (error: any) {
    console.error('[Diagnóstico Interno] Error cotizando:', error?.message || error, error?.stack || '');
    if (!res.headersSent) {
      res.status(500).json({
        error: 'La cotización no está disponible en este momento.',
        message: 'La cotización no está disponible en este momento. Intenta de nuevo en unos segundos.',
        quotes: []
      });
    }
  }
});

// 8. Crear un Envío
app.post('/api/shipments', authMiddleware, async (req: any, res) => {
  try {
    const { quoteId, sender, recipient, packages, customs, content, reference, declaredValue, exportReason, termsOfTrade, manifest, paymentMethod = 'wallet' } = req.body;
    const normalizedPaymentMethod = String(paymentMethod || 'wallet').trim().toLowerCase();
    if (!['wallet', 'paypal'].includes(normalizedPaymentMethod)) {
      return res.status(400).json({ error: 'Método de pago no válido.' });
    }
    const normalizedPackages = Array.isArray(packages) && packages.length > 0 ? packages : [{ width: 10, height: 10, length: 10, weight: 1, qty: 1 }];
    const keys = await ApiKeysRepo.get();

    const userInDb = await UserRepo.getById(req.user.id);
    if (!userInDb) return res.status(404).json({ error: 'No se pudo completar la operación.' });

    const [quoteRows]: any = await pool.query(
      `SELECT q.*, p.id AS db_provider_id, p.code AS db_provider_code, p.name AS db_provider_name
       FROM quotes q
       LEFT JOIN providers p ON p.id = q.provider_id
       WHERE q.id = ? AND (q.user_id = ? OR q.user_id IS NULL)
       LIMIT 1`,
      [quoteId, req.user.id]
    );
    const quote = quoteRows[0];
    if (!quote) return res.status(404).json({ error: 'Cotización no encontrada.' });

    const providerCode = String(quote.provider_code || quote.db_provider_code || '').toLowerCase();
    if (!providerCode || !['parcelabc', 'genei', 'paccofacile', 'spedirepro', 'spediamopro', 'easypost', 'logihub_intl'].includes(providerCode)) {
      return res.status(400).json({ error: 'Proveedor no disponible todavía.' });
    }

    const fallbackEmail = providerFallbackEmail(recipient?.email, sender?.email, userInDb.email);
    const senderForShipment = normalizeShipmentPartyEmail(sender, fallbackEmail);
    const recipientForShipment = normalizeShipmentPartyEmail(recipient, fallbackEmail);

    // Pretty shipment id: SHIP-8393-9 (retry; SHIP-XXXX-YY if crowded)
    let shipmentId = generateId('shp_');
    for (let attempt = 0; attempt < 12; attempt++) {
      const [exists]: any = await pool.query('SELECT id FROM shipments WHERE id = ? LIMIT 1', [shipmentId]);
      if (!exists?.length) break;
      if (attempt >= 6) {
        const n4 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        const n2 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
        shipmentId = `SHIP-${n4}-${n2}`;
      } else {
        shipmentId = generateId('shp_');
      }
    }
    // SHIP24GO_FX_WALLET_CHARGE_V1 — charge wallet in account currency
    const quoteCurrency = normalizeCurrencyCode(quote.currency || 'EUR');
    const walletCurrency = normalizeCurrencyCode(userInDb.currency || quoteCurrency || 'EUR');
    let cost = Number(quote.total_amount || 0);
    let chargeCurrency = quoteCurrency;
    try {
      if (quoteCurrency !== walletCurrency) {
        const walletRates = await getFreshRatesInternal();
        cost = convertMoneyAmountStrict(cost, quoteCurrency, walletCurrency, walletRates);
        chargeCurrency = walletCurrency;
      }
    } catch (fxErr: any) {
      console.warn('[Create shipment FX] conversion unavailable');
      if (fxErr?.code === 'FX_UNAVAILABLE') {
        return res.status(503).json({ error: 'La tasa de cambio no está disponible. No se creó ni cobró el envío.' });
      }
      throw fxErr;
    }
    cost = roundMoney(cost);
    const userBalance = Number(userInDb.balance || 0);
    const shouldChargeWallet = Number(manifest ?? 1) === 1;

    const saveToAddressBook = async (type: string, addr: any) => {
      if (!addr) return;
      const fullName = addr.name || addr.full_name || '';
      const address = addr.address || addr.addressLine1 || '';
      if (!fullName || !address) return;
      const [existing]: any = await pool.query(
        'SELECT id FROM address_book WHERE user_id = ? AND type = ? AND full_name = ? AND address = ?',
        [req.user.id, type, fullName, address]
      );
      if (existing.length === 0) {
        await pool.query(
          `INSERT INTO address_book (id, user_id, type, full_name, company, country, city, zip_code, address, civic_number, formatted_address, google_place_id, phone, email, observations)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            generateId('adb_'), req.user.id, type, fullName, addr.company || '', addr.country || 'ES', addr.city || '',
            addr.zipCode || addr.post_code || '', address, addr.civicNumber || '', addr.formattedAddress || address, addr.googlePlaceId || '', addr.phone || '', addr.email || '', addr.observations || ''
          ]
        );
      }
    };
    if (senderForShipment?.saveToBook) await saveToAddressBook('sender', senderForShipment);
    if (recipientForShipment?.saveToBook) await saveToAddressBook('recipient', recipientForShipment);

    const requestedManifest = Number(manifest ?? 1) === 1;
    if (normalizedPaymentMethod === 'paypal') {
      if (!requestedManifest) {
        return res.status(400).json({ error: 'El pago PayPal solo está disponible para crear el envío ahora.' });
      }
      if (!ship24goPayPalIntegrationEnabled(keys)) {
        return res.status(400).json({ error: ship24goPayPalUnavailableMessage(keys) });
      }

      const internalTracking = `S24G-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      const pendingShipment = {
        id: shipmentId,
        user_id: req.user.id,
        quote_id: quoteId,
        provider_id: quote.db_provider_id || quote.provider_id || null,
        provider_code: providerCode,
        provider_shipment_code: null,
        provider_tracking_code: null,
        tracking_code: internalTracking,
        order_number: shipmentId,
        reference: reference || '',
        status: 'pending_payment',
        status_label: 'Pendiente de pago',
        sender: senderForShipment,
        recipient: recipientForShipment,
        packages: normalizedPackages.map((pkg: any) => ({ ...pkg, customs: Array.isArray(customs) ? customs : [] })),
        label_url: null,
        label_base64: null,
        track_url: null,
        payment_url: null,
        provider_payload_json: {
          quoteId,
          providerCode,
          paymentMethod: 'paypal',
          content: compactText(content || 'General goods', 150),
          declaredValue,
          exportReason,
          termsOfTrade,
          services: req.body?.services || null
        },
        walletDeduction: 0,
        currency: quoteCurrency
      };
      await ShipmentRepo.create(pendingShipment);
      await TrackingEventRepo.create({
        shipment_id: shipmentId,
        tracking_code: internalTracking,
        status: 'pending_payment',
        status_label: 'Pendiente de pago',
        description: 'El envío fue creado y está pendiente de confirmación del pago PayPal.'
      });

      try {
        await ensureShip24GoBillingColumns();
        const checkout = await ship24goCreatePayPalCheckoutOrder({
          referenceId: shipmentId,
          amount: Number(quote.total_amount || 0),
          currency: quoteCurrency,
          purpose: 'shipment_payment',
          description: `Envío DoorDrop ${internalTracking}`,
          returnUrl: `${appBaseUrl()}/panel/shipments?paypal_payment=success&shipment_id=${encodeURIComponent(shipmentId)}`,
          cancelUrl: `${appBaseUrl()}/panel/shipments?paypal_payment=cancel&shipment_id=${encodeURIComponent(shipmentId)}`
        });
        await pool.query(
          `INSERT INTO payments (id, user_id, shipment_id, provider, external_payment_id, amount, currency, status, purpose, provider_payment_id, metadata_json)
           VALUES (?, ?, ?, 'paypal', ?, ?, ?, 'pending', 'shipment_payment', ?, ?)`,
          [
            generateId('pay_'),
            req.user.id,
            shipmentId,
            checkout.orderId,
            checkout.chargeAmount,
            checkout.chargeCurrency,
            checkout.orderId,
            JSON.stringify({ shipmentId, quoteId, sourceAmount: Number(quote.total_amount || 0), sourceCurrency: quoteCurrency })
          ]
        );
        await pool.query(
          `UPDATE shipments SET payment_url = ?, provider_payload_json = ?, updated_at = NOW() WHERE id = ?`,
          [checkout.checkoutUrl, JSON.stringify({ ...pendingShipment.provider_payload_json, paypalOrderId: checkout.orderId, chargeAmount: checkout.chargeAmount, chargeCurrency: checkout.chargeCurrency }), shipmentId]
        );
        return res.status(201).json({
          success: true,
          pendingPayment: true,
          pendingLabel: true,
          checkoutUrl: checkout.checkoutUrl,
          paypalOrderId: checkout.orderId,
          chargeAmount: checkout.chargeAmount,
          chargeCurrency: checkout.chargeCurrency,
          message: 'Envío creado. Completa el pago seguro con PayPal para preparar la etiqueta.',
          shipment: { id: shipmentId, trackingCode: internalTracking, status: 'Pendiente de pago', paymentUrl: checkout.checkoutUrl }
        });
      } catch (error: any) {
        await pool.query(
          `UPDATE shipments SET status = 'payment_failed', status_label = 'Pago no iniciado', label_status = 'pending', label_error = ?, updated_at = NOW() WHERE id = ?`,
          ['No se pudo abrir el pago seguro con PayPal.', shipmentId]
        ).catch(() => null);
        console.error('[PayPal shipment] checkout create failed:', error?.code || error?.message || 'error');
        return res.status(400).json({ error: 'No se pudo abrir el pago seguro con PayPal.' });
      }
    }

    const makeDraft = async (reason: string, trackingCode?: string, providerResult?: any) => {
      const internalTracking = trackingCode || `S24G-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      const draftShipment = {
        id: shipmentId,
        user_id: req.user.id,
        quote_id: quoteId,
        provider_id: quote.db_provider_id || quote.provider_id || null,
        provider_code: providerCode,
        provider_shipment_code: providerResult?.providerShipmentCode || null,
        provider_tracking_code: providerResult?.providerTracking || null,
        tracking_code: internalTracking,
        order_number: shipmentId,
        reference: reference || '',
        status: 'draft',
        status_label: 'Borrador',
        sender: senderForShipment,
        recipient: recipientForShipment,
        packages: normalizedPackages.map((pkg: any) => ({ ...pkg, customs: Array.isArray(customs) ? customs : [] })),
        label_url: null,
        label_base64: null,
        track_url: null,
        payment_url: providerResult?.paymentUrl || null,
        walletDeduction: 0,
        draftReason: reason,
        draftPayload: { quoteId, sender: senderForShipment, recipient: recipientForShipment, packages: normalizedPackages, customs, content, reference, declaredValue, exportReason, termsOfTrade, manifest, services: req.body?.services || null },
        provider_payload_json: providerResult?.providerPayload || null
      };
      await ShipmentRepo.create(draftShipment);
      await TrackingEventRepo.create({
        shipment_id: shipmentId,
        tracking_code: internalTracking,
        status: 'draft',
        status_label: 'Borrador',
        description: reason === 'saldo_insuficiente'
          ? 'Tu envío fue guardado como borrador por saldo insuficiente.'
          : 'Tu envío fue guardado como borrador.'
      });
      return res.json({
        success: true,
        isDraft: true,
        message: reason === 'saldo_insuficiente'
          ? 'Saldo insuficiente para completar este envío. Guardamos tu envío como borrador para que puedas finalizarlo cuando recargues tu saldo.'
          : 'Tu envío fue guardado como borrador.',
        shipmentId
      });
    };

    const hasEnoughBalance = userBalance >= cost;
    const providerManifest = requestedManifest && hasEnoughBalance ? 1 : 0;
    const canChargeWalletNow = requestedManifest && hasEnoughBalance;

    if (requestedManifest && !hasEnoughBalance) {
      const internalTracking = `S24G-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      const pendingShipment = {
        id: shipmentId,
        user_id: req.user.id,
        quote_id: quoteId,
        provider_id: quote.db_provider_id || quote.provider_id || null,
        provider_code: providerCode,
        provider_shipment_code: null,
        provider_tracking_code: null,
        tracking_code: internalTracking,
        order_number: shipmentId,
        reference: reference || '',
        status: 'pending_customer_balance',
        status_label: 'Pendiente de saldo',
        sender: senderForShipment,
        recipient: recipientForShipment,
        packages: normalizedPackages.map((pkg: any) => ({ ...pkg, customs: Array.isArray(customs) ? customs : [] })),
        label_url: null,
        label_base64: null,
        track_url: null,
        payment_url: null,
        provider_payload_json: { quoteId, providerCode, pendingReason: 'customer_balance', content: compactText(content || 'General goods', 150), services: req.body?.services || null },
        walletDeduction: 0,
        currency: chargeCurrency || quote.currency || 'EUR'
      };
      await ShipmentRepo.create(pendingShipment);
      await pool.query(
        `UPDATE shipments SET label_status = 'pending', label_error = 'Pendiente de saldo', provider_attempts = 0, updated_at = NOW() WHERE id = ?`,
        [shipmentId]
      );
      await ensureShipmentJob(shipmentId, req.user.id, 'payment_manifest', 'pending', 'Pendiente de saldo.');
      await TrackingEventRepo.create({
        shipment_id: shipmentId,
        tracking_code: internalTracking,
        status: 'pending_customer_balance',
        status_label: 'Pendiente de saldo',
        description: 'Tu envío fue recibido. Cuando recargues saldo se preparará la etiqueta.'
      });
      await sendShipmentCreatedEmail(await ShipmentRepo.getById(shipmentId));
      return res.json({
        success: true,
        pendingPayment: true,
        pendingLabel: true,
        message: 'Tu envío fue recibido. Recarga tu monedero y la etiqueta se generará automáticamente.',
        shipment: { id: shipmentId, trackingCode: internalTracking, status: 'Pendiente de saldo' }
      });
    }

    const providerResult = await callProviderCreate({
      providerCode,
      quote,
      shipmentId,
      sender: senderForShipment,
      recipient: recipientForShipment,
      packages: normalizedPackages,
      customs,
      content,
      reference,
      declaredValue,
      exportReason,
      termsOfTrade,
      manifest: providerManifest,
      services: req.body?.services || null,
      keys
    });

    if (!providerResult.success) {
      const walletDeduction = providerResult.nonBillable ? 0 : (canChargeWalletNow ? cost : 0);
      const internalTracking = providerResult.trackingCode || `S24G-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      const queuedShipment = {
        id: shipmentId,
        user_id: req.user.id,
        quote_id: quoteId,
        provider_id: quote.db_provider_id || quote.provider_id || null,
        provider_code: providerCode,
        provider_shipment_code: providerResult.providerShipmentCode || null,
        provider_tracking_code: providerResult.providerTracking || null,
        tracking_code: internalTracking,
        order_number: shipmentId,
        reference: reference || '',
        status: 'pending_provider',
        status_label: 'Preparando etiqueta',
        sender: senderForShipment,
        recipient: recipientForShipment,
        packages: normalizedPackages.map((pkg: any) => ({ ...pkg, customs: Array.isArray(customs) ? customs : [] })),
        label_url: null,
        label_base64: null,
        track_url: null,
        payment_url: null,
        provider_payload_json: providerResult.providerPayload || null,
        walletDeduction,
        walletDescription: `Cargo por envío ${internalTracking} (${quote.service_name})`,
        currency: chargeCurrency || quote.currency || 'EUR'
      };

      await ShipmentRepo.create(queuedShipment);
      await pool.query(
        `UPDATE shipments SET label_status = 'pending', label_error = ?, provider_attempts = 1, last_provider_attempt_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [providerResult.errorMessage || 'Etiqueta en preparación', shipmentId]
      );
      await ensureShipmentJob(shipmentId, req.user.id, providerManifest === 0 ? 'payment_manifest' : 'provider_create', 'pending', providerManifest === 0 ? 'Pendiente de saldo.' : 'Etiqueta en preparación.');
      await TrackingEventRepo.create({
        shipment_id: shipmentId,
        tracking_code: internalTracking,
        status: 'pending_provider',
        status_label: 'Preparando etiqueta',
        description: 'El envío fue recibido y la etiqueta está en preparación.'
      });
      await sendShipmentCreatedEmail(await ShipmentRepo.getById(shipmentId));

      return res.json({
        success: true,
        pendingLabel: true,
        message: 'Tu envío fue recibido. La etiqueta se preparará automáticamente cuando la red logística confirme la disponibilidad.',
        shipment: { id: shipmentId, trackingCode: internalTracking, status: 'Preparando etiqueta' }
      });
    }

    const walletDeduction = providerResult.nonBillable ? 0 : (canChargeWalletNow ? cost : 0);
    const newShipment = {
      id: shipmentId,
      user_id: req.user.id,
      quote_id: quoteId,
      provider_id: quote.db_provider_id || quote.provider_id || null,
      provider_code: providerCode,
      provider_shipment_code: providerResult.providerShipmentCode || null,
      provider_tracking_code: providerResult.providerTracking || null,
      tracking_code: providerResult.trackingCode,
      order_number: shipmentId,
      reference: reference || '',
      status: providerResult.status,
      status_label: providerResult.statusLabel,
      sender: senderForShipment,
      recipient: recipientForShipment,
      packages: providerResult.providerPackages || normalizedPackages.map((pkg: any) => ({ ...pkg, customs: Array.isArray(customs) ? customs : [] })),
      label_url: providerResult.labelUrl || null,
      label_base64: null,
      track_url: providerResult.trackUrl || (providerResult.trackingCode ? `${process.env.APP_URL || 'https://doordrop.lat'}/track/${providerResult.trackingCode}` : null),
      payment_url: providerResult.paymentUrl || null,
      provider_payload_json: providerResult.providerPayload || null,
      walletDeduction,
      walletDescription: `Cargo por envío ${providerResult.trackingCode} (${quote.service_name})`,
      currency: chargeCurrency || quote.currency || 'EUR'
    };

    await ShipmentRepo.create(newShipment);
    await TrackingEventRepo.create({
      shipment_id: shipmentId,
      tracking_code: providerResult.trackingCode,
      status: providerResult.status,
      status_label: providerResult.statusLabel,
      description: Number(manifest ?? 1) === 1 ? 'El envío fue creado correctamente.' : 'El envío fue preparado y queda pendiente de pago.'
    });

    const cachedLabel = await cacheShipmentLabelFromSource(await ShipmentRepo.getById(shipmentId), providerResult.labelUrl || '', providerResult.labelBase64 || '');
    if (!cachedLabel.stored && !cachedLabel.labelUrl) {
      await pool.query(`UPDATE shipments SET label_status = 'pending', status = IF(status = 'tramitado', 'pending_label', status), status_label = IF(status_label = 'Tramitado', 'Etiqueta en preparación', status_label), updated_at = NOW() WHERE id = ?`, [shipmentId]);
      await ensureShipmentJob(shipmentId, req.user.id, providerManifest === 0 ? 'payment_manifest' : 'label_fetch', 'pending', providerManifest === 0 ? 'Pendiente de saldo.' : 'Etiqueta en preparación.');
    }
    await sendShipmentCreatedEmail(await ShipmentRepo.getById(shipmentId));

    return res.json({
      success: true,
      pendingPayment: providerManifest === 0,
      pendingLabel: providerManifest === 1 && !(providerResult.labelUrl || providerResult.labelBase64),
      message: providerManifest === 0
        ? 'Tu envío fue recibido. Recarga tu monedero y la etiqueta se generará automáticamente.'
        : (!(providerResult.labelUrl || providerResult.labelBase64) ? 'Tu envío fue recibido. La etiqueta se preparará automáticamente.' : 'Envío creado correctamente.'),
      shipment: {
        id: shipmentId,
        trackingCode: providerResult.trackingCode,
        providerTracking: providerResult.providerTracking,
        status: providerResult.statusLabel,
        labelUrl: providerResult.labelUrl,
        paymentUrl: providerResult.paymentUrl
      }
    });
  } catch (error) {
    console.error('[Diagnóstico Interno] Error creando envío:', error);
    return res.status(500).json({ error: 'No se pudo completar la operación. Intenta nuevamente más tarde.' });
  }
});

// 8.1 Finalizar borrador
app.post('/api/shipments/:id/finalize', authMiddleware, async (req: any, res) => {
  try {
    await ensureWalletCurrencySchema();
    const draftShipment = await ShipmentRepo.getById(req.params.id);
    if (!draftShipment || draftShipment.user_id !== req.user.id || draftShipment.status !== 'draft') {
      return res.status(404).json({ error: 'No hay datos para mostrar.' });
    }

    const [quoteRows]: any = await pool.query(
      `SELECT q.*, p.id AS db_provider_id, p.code AS db_provider_code
       FROM quotes q LEFT JOIN providers p ON p.id = q.provider_id WHERE q.id = ? LIMIT 1`,
      [draftShipment.quote_id]
    );
    const quote = quoteRows[0];
    if (!quote) return res.status(404).json({ error: 'Cotización no encontrada.' });

    const userInDb = await UserRepo.getById(req.user.id);
    if (!userInDb) return res.status(404).json({ error: 'No se pudo encontrar la cuenta.' });
    const quoteCurrency = normalizeCurrencyCode(quote.currency || 'EUR');
    const walletCurrency = normalizeCurrencyCode(userInDb.currency || 'EUR');
    const quoteAmount = roundMoney(Number(quote.total_amount || 0));
    let walletRates: Record<string, number> = { EUR: 1 };
    let cost = quoteAmount;
    try {
      if (quoteCurrency !== walletCurrency) {
        walletRates = await getFreshRatesInternal();
        cost = convertMoneyAmountStrict(quoteAmount, quoteCurrency, walletCurrency, walletRates);
      }
    } catch (fxErr: any) {
      if (fxErr?.code === 'FX_UNAVAILABLE') {
        return res.status(503).json({ error: 'La tasa de cambio no está disponible. No se cobró el envío.' });
      }
      throw fxErr;
    }
    if (Number(userInDb.balance || 0) < cost) {
      return res.json({ success: true, isDraft: true, message: 'Saldo insuficiente para completar este envío.' });
    }

    const sender = typeof draftShipment.sender_json === 'string' ? JSON.parse(draftShipment.sender_json) : draftShipment.sender_json;
    const recipient = typeof draftShipment.recipient_json === 'string' ? JSON.parse(draftShipment.recipient_json) : draftShipment.recipient_json;
    const [pkgRows]: any = await pool.query('SELECT * FROM shipment_packages WHERE shipment_id = ?', [draftShipment.id]);
    const normalizedPackages = pkgRows.map((pkg: any) => ({
      width: Number(pkg.width_cm), height: Number(pkg.height_cm), length: Number(pkg.length_cm), weight: Number(pkg.weight_kg), qty: Number(pkg.quantity)
    }));
    const providerCode = String(quote.provider_code || quote.db_provider_code || draftShipment.provider_code || '').toLowerCase();
    const keys = await ApiKeysRepo.get();
    const providerResult = await callProviderCreate({
      providerCode,
      quote,
      shipmentId: draftShipment.id,
      sender,
      recipient,
      packages: normalizedPackages.length ? normalizedPackages : [{ width: 10, height: 10, length: 10, weight: 1, qty: 1 }],
      customs: [],
      manifest: 1,
      services: parseJsonSafe(draftShipment.provider_payload_json)?.services || null,
      keys
    });
    if (!providerResult.success) {
      const internalTracking = providerResult.trackingCode || draftShipment.tracking_code || `S24G-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const walletUser = await lockedWalletUser(conn, req.user.id);
        if (walletUser.currency !== walletCurrency) throw new Error('La moneda del wallet cambió. Intenta finalizar el borrador nuevamente.');
        await applyWalletMutation(conn, {
          userId: req.user.id,
          type: 'debit',
          amount: quoteAmount,
          currency: quoteCurrency,
          description: `Cargo por envío ${internalTracking}`,
          referenceType: 'shipment',
          referenceId: draftShipment.id,
          rates: walletRates
        });
        await conn.query(
          `UPDATE shipments SET tracking_code = ?, status = 'pending_provider', status_label = 'Preparando etiqueta', label_status = 'pending', label_error = ?, provider_payload_json = ?, provider_attempts = COALESCE(provider_attempts, 0) + 1, last_provider_attempt_at = NOW(), updated_at = NOW() WHERE id = ?`,
          [internalTracking, providerResult.errorMessage || 'Etiqueta en preparación', JSON.stringify(providerResult.providerPayload || {}), draftShipment.id]
        );
        await conn.query(`UPDATE shipment_drafts SET status = 'finalized', updated_at = NOW() WHERE shipment_id = ?`, [draftShipment.id]);
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
      await ensureShipmentJob(draftShipment.id, req.user.id, 'provider_create', 'pending', 'Etiqueta en preparación.');
      await TrackingEventRepo.create({ shipment_id: draftShipment.id, tracking_code: internalTracking, status: 'pending_provider', status_label: 'Preparando etiqueta', description: 'El envío fue recibido y la etiqueta está en preparación.' });
      await sendShipmentCreatedEmail(await ShipmentRepo.getById(draftShipment.id));
      return res.json({ success: true, pendingLabel: true, message: 'Tu envío fue recibido. La etiqueta se preparará automáticamente cuando la red logística confirme la disponibilidad.', shipment: { id: draftShipment.id, trackingCode: internalTracking, status: 'Preparando etiqueta' } });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const walletUser = await lockedWalletUser(conn, req.user.id);
      if (walletUser.currency !== walletCurrency) throw new Error('La moneda del wallet cambió. Intenta finalizar el borrador nuevamente.');
      await applyWalletMutation(conn, {
        userId: req.user.id,
        type: 'debit',
        amount: quoteAmount,
        currency: quoteCurrency,
        description: `Cargo por envío ${providerResult.trackingCode}`,
        referenceType: 'shipment',
        referenceId: draftShipment.id,
        rates: walletRates
      });
      await conn.query(
        `UPDATE shipments SET provider_shipment_code = ?, provider_tracking_code = ?, tracking_code = ?, status = ?, status_label = ?, label_url = ?, track_url = ?, payment_url = ?, provider_payload_json = ?, label_status = ?, label_error = NULL, provider_attempts = COALESCE(provider_attempts, 0) + 1, last_provider_attempt_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [providerResult.providerShipmentCode || null, providerResult.providerTracking || null, providerResult.trackingCode, (providerResult.labelUrl || providerResult.labelBase64) ? providerResult.status : 'pending_label', (providerResult.labelUrl || providerResult.labelBase64) ? providerResult.statusLabel : 'Etiqueta en preparación', providerResult.labelUrl || null, providerResult.trackUrl || null, providerResult.paymentUrl || null, JSON.stringify(providerResult.providerPayload || {}), (providerResult.labelUrl || providerResult.labelBase64) ? 'available' : 'pending', draftShipment.id]
      );
      await conn.query(`UPDATE shipment_drafts SET status = 'finalized', updated_at = NOW() WHERE shipment_id = ?`, [draftShipment.id]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    const refreshedDraftShipment = await ShipmentRepo.getById(draftShipment.id);
    const cachedLabel = await cacheShipmentLabelFromSource(refreshedDraftShipment, providerResult.labelUrl || '', providerResult.labelBase64 || '');
    if (!cachedLabel.stored && !cachedLabel.labelUrl) {
      await ensureShipmentJob(draftShipment.id, req.user.id, 'label_fetch', 'pending', 'Etiqueta en preparación.');
    }

    await TrackingEventRepo.create({ shipment_id: draftShipment.id, tracking_code: providerResult.trackingCode, status: (providerResult.labelUrl || providerResult.labelBase64) ? providerResult.status : 'pending_label', status_label: (providerResult.labelUrl || providerResult.labelBase64) ? providerResult.statusLabel : 'Etiqueta en preparación', description: 'El borrador fue finalizado correctamente.' });
    await sendShipmentCreatedEmail(await ShipmentRepo.getById(draftShipment.id));
    return res.json({ success: true, shipment: { id: draftShipment.id, trackingCode: providerResult.trackingCode, status: (providerResult.labelUrl || providerResult.labelBase64) ? providerResult.statusLabel : 'Etiqueta en preparación', labelUrl: providerResult.labelUrl } });
  } catch (error: any) {
    console.error('[Diagnóstico Interno] Error finalizando borrador:', error);
    if (error?.code === 'FX_UNAVAILABLE') return res.status(503).json({ error: 'La tasa de cambio no está disponible. El borrador no fue cobrado.' });
    if (error?.code === 'WALLET_INSUFFICIENT') return res.json({ success: true, isDraft: true, message: 'Saldo insuficiente para completar este envío.' });
    if (String(error?.message || '').includes('La moneda del wallet cambió')) return res.status(409).json({ error: 'La moneda del wallet cambió. Actualiza el panel e inténtalo nuevamente.' });
    return res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});


// 8.2 Modificar envío antes de que la etiqueta esté disponible
app.put('/api/shipments/:id', authMiddleware, async (req: any, res) => {
  const conn = await pool.getConnection();
  try {
    const shipment = await ShipmentRepo.getById(req.params.id);
    if (!shipment || (req.user.role !== 'super_admin' && shipment.user_id !== req.user.id)) {
      return res.status(404).json({ error: 'No hay datos para mostrar.' });
    }
    if (!isShipmentEditableBeforeLabel(shipment)) {
      return res.status(400).json({ error: 'Este envío ya está en proceso final y no se puede modificar desde el panel.' });
    }

    const sender = req.body.sender || (typeof shipment.sender_json === 'string' ? JSON.parse(shipment.sender_json) : shipment.sender_json);
    const recipient = req.body.recipient || (typeof shipment.recipient_json === 'string' ? JSON.parse(shipment.recipient_json) : shipment.recipient_json);
    const packages = Array.isArray(req.body.packages) && req.body.packages.length > 0 ? req.body.packages : null;

    await conn.beginTransaction();
    await conn.query(
      `UPDATE shipments SET sender_json = ?, recipient_json = ?, reference = COALESCE(?, reference), label_error = NULL, updated_at = NOW() WHERE id = ?`,
      [JSON.stringify(sender || {}), JSON.stringify(recipient || {}), req.body.reference || null, shipment.id]
    );
    await conn.query('DELETE FROM shipment_addresses WHERE shipment_id = ?', [shipment.id]);
    const insertAddress = async (type: 'sender' | 'recipient', addr: any) => {
      await conn.query(
        `INSERT INTO shipment_addresses (id, shipment_id, type, full_name, company, country, city, zip_code, address, phone, email, observations)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId('adr_'), shipment.id, type,
          addr?.name || addr?.full_name || '', addr?.company || '', addr?.country || 'ES', addr?.city || '',
          addr?.zipCode || addr?.post_code || '', addr?.address || addr?.addressLine1 || '', addr?.phone || '', addr?.email || '', addr?.observations || ''
        ]
      );
    };
    await insertAddress('sender', sender || {});
    await insertAddress('recipient', recipient || {});

    if (packages) {
      await conn.query('DELETE FROM shipment_customs_items WHERE shipment_package_id IN (SELECT id FROM shipment_packages WHERE shipment_id = ?)', [shipment.id]);
      await conn.query('DELETE FROM shipment_packages WHERE shipment_id = ?', [shipment.id]);
      for (const pkg of packages) {
        await conn.query(
          `INSERT INTO shipment_packages (id, shipment_id, width_cm, height_cm, length_cm, weight_kg, quantity)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [generateId('pkg_'), shipment.id, Number(pkg.width || pkg.width_cm || 10), Number(pkg.height || pkg.height_cm || 10), Number(pkg.length || pkg.length_cm || 10), Number(pkg.weight || pkg.weight_kg || 1), Number(pkg.qty || pkg.quantity || 1)]
        );
      }
    }

    await conn.query(
      `UPDATE shipment_drafts SET payload_json = JSON_SET(COALESCE(payload_json, JSON_OBJECT()), '$.sender', CAST(? AS JSON), '$.recipient', CAST(? AS JSON), '$.packages', CAST(? AS JSON)), updated_at = NOW()
       WHERE shipment_id = ? AND status = 'open'`,
      [JSON.stringify(sender || {}), JSON.stringify(recipient || {}), JSON.stringify(packages || []), shipment.id]
    ).catch(() => {});

    const shouldPrepareAgain = String(shipment.status || '').toLowerCase() !== 'draft';
    if (shouldPrepareAgain) {
      await conn.query(
        `UPDATE shipments
         SET provider_shipment_code = NULL, provider_tracking_code = NULL, label_url = NULL, label_base64 = NULL, payment_url = NULL,
             status = 'pending_provider', status_label = 'Preparando etiqueta', label_status = 'pending', label_error = NULL, updated_at = NOW()
         WHERE id = ?`,
        [shipment.id]
      );
    }

    await conn.commit();

    if (shouldPrepareAgain) {
      await ensureShipmentJob(shipment.id, shipment.user_id, 'provider_create', 'pending', 'Preparando etiqueta.');
    }

    await TrackingEventRepo.create({
      shipment_id: shipment.id,
      tracking_code: shipment.tracking_code,
      status: 'updated',
      status_label: 'Datos actualizados',
      description: shouldPrepareAgain
        ? 'Los datos del envío fueron actualizados y la etiqueta queda en preparación.'
        : 'Los datos del envío fueron actualizados antes de generar la etiqueta.'
    });

    res.json({ success: true, message: shouldPrepareAgain ? 'Envío actualizado. La etiqueta queda en preparación.' : 'Envío actualizado correctamente.' });
  } catch (error) {
    await conn.rollback();
    console.error('[Diagnóstico Interno] Error actualizando envío:', error);
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  } finally {
    conn.release();
  }
});

// 8.3 Reintentar preparación de etiqueta desde el panel
app.post('/api/shipments/:id/retry-label', authMiddleware, async (req: any, res) => {
  try {
    const shipment = await ShipmentRepo.getById(req.params.id);
    if (!shipment || (req.user.role !== 'super_admin' && shipment.user_id !== req.user.id)) {
      return res.status(404).json({ error: 'No hay datos para mostrar.' });
    }
    const result = await processShipmentPreparation(shipment.id);
    res.json({ success: result.success, message: result.message || 'Preparación en curso.', result });
  } catch (error) {
    console.error('[Diagnóstico Interno] Error reintentando etiqueta:', error);
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

// --- LIBRETA DE DIRECCIONES ---
app.get('/api/address-book', authMiddleware, async (req: any, res) => {
  try {
    const type = req.query.type;
    let query = 'SELECT * FROM address_book WHERE user_id = ?';
    let params = [req.user.id];
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    query += ' ORDER BY created_at DESC';
    const [rows]: any = await pool.query(query, params);
    
    res.json({
      addresses: rows.map((r: any) => ({
        id: r.id,
        type: r.type,
        name: r.full_name,
        company: r.company,
        country: r.country,
        city: r.city,
        zipCode: r.zip_code,
        address: r.address,
        civicNumber: r.civic_number || '',
        formattedAddress: r.formatted_address || r.address || '',
        googlePlaceId: r.google_place_id || '',
        phone: r.phone,
        email: r.email,
        observations: r.observations,
        isDefault: Boolean(r.is_default)
      }))
    });
  } catch (error) {
    console.error('[Backend] Error fetching address book:', error);
    res.status(500).json({ error: 'Error al obtener la libreta de direcciones.' });
  }
});

app.post('/api/address-book', authMiddleware, async (req: any, res) => {
  try {
    const { id, type, name, company, country, city, zipCode, address, civicNumber, formattedAddress, googlePlaceId, phone, email, observations, isDefault } = req.body;
    
    if (isDefault) {
      await pool.query('UPDATE address_book SET is_default = 0 WHERE user_id = ? AND type = ?', [req.user.id, type]);
    }
    
    if (id) {
      await pool.query(
        `UPDATE address_book 
         SET type = ?, full_name = ?, company = ?, country = ?, city = ?, zip_code = ?, address = ?, civic_number = ?, formatted_address = ?, google_place_id = ?, phone = ?, email = ?, observations = ?, is_default = ?
         WHERE id = ? AND user_id = ?`,
        [type, name, company, country, city, zipCode, address, civicNumber || '', formattedAddress || '', googlePlaceId || '', phone, email, observations, isDefault ? 1 : 0, id, req.user.id]
      );
      res.json({ success: true, message: 'Dirección actualizada con éxito.' });
    } else {
      const newId = generateId('adb_');
      await pool.query(
        `INSERT INTO address_book (id, user_id, type, full_name, company, country, city, zip_code, address, civic_number, formatted_address, google_place_id, phone, email, observations, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId, req.user.id, type, name, company || '', country || 'ES', city || '', zipCode || '', address || '', civicNumber || '', formattedAddress || '', googlePlaceId || '', phone || '', email || '', observations || '', isDefault ? 1 : 0]
      );
      res.json({ success: true, message: 'Dirección guardada con éxito.', id: newId });
    }
  } catch (error) {
    console.error('[Backend] Error saving address:', error);
    res.status(500).json({ error: 'Error al guardar la dirección.' });
  }
});

app.delete('/api/address-book/:id', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM address_book WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true, message: 'Dirección eliminada con éxito.' });
  } catch (error) {
    console.error('[Backend] Error deleting address:', error);
    res.status(500).json({ error: 'Error al eliminar la dirección.' });
  }
});

// --- WEBHOOK GENEI ---

function verifyWebhookHmac(rawBody: string, signatureHeader: string, secret: string): boolean {
  const supplied = String(signatureHeader || '').trim().replace(/^(sha256=|v1=)/i, '').trim().toLowerCase();
  const expectedHex = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex').toLowerCase();
  const expectedBase64 = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64').toLowerCase();
  return [expectedHex, expectedBase64].some((expected) => {
    const left = Buffer.from(supplied);
    const right = Buffer.from(expected);
    return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
  });
}

app.post('/api/webhooks/spedirepro', async (req: any, res) => {
  try {
    const provider = await ProviderRepo.getByCode('spedirepro');
    const webhookSecret = String(process.env.SPEDIREPRO_WEBHOOK_SECRET || providerConfig(provider || {}).webhookSecret || '').trim();
    const rawBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString('utf8')
      : JSON.stringify(req.body || {});
    const webhookSignature = String(
      req.get('X-SpedirePro-Signature') ||
      req.get('X-Webhook-Signature') ||
      req.get('X-Signature') ||
      ''
    );
    if (!webhookSecret) {
      return res.status(503).json({ success: false, message: 'Webhook pendiente de configuración segura.' });
    }
    if (!verifyWebhookHmac(rawBody, webhookSignature, webhookSecret)) {
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }
    const payload = req.body || {};
    const normalized = normalizeSpedireProWebhookPayload(payload);
    const externalId = String(normalized.reference || normalized.order || normalized.tracking || crypto.randomBytes(8).toString('hex'));
    const eventType = String(normalized.eventType || 'shipment_update').slice(0, 120);

    await pool.query(
      `INSERT INTO webhook_events (id, provider_code, external_id, event_type, payload_json, processed_at)
       VALUES (?, 'spedirepro', ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE event_type = VALUES(event_type), payload_json = VALUES(payload_json), processed_at = NOW()`,
      [generateId('wh_'), externalId, eventType, JSON.stringify(payload)]
    ).catch(() => null);

    const shipment = await findShipmentForSpedireProReference([
      normalized.reference,
      normalized.order,
      normalized.tracking,
      normalized.data?.merchant_reference,
      normalized.data?.order_reference,
      normalized.data?.reference,
      normalized.data?.tracker
    ]);

    if (!shipment) {
      await writeProviderLog('spedirepro', 'webhook_unmatched', { eventType, references: [normalized.reference, normalized.order, normalized.tracking].filter(Boolean) }, payload, 200);
      return res.json({ success: true, message: 'received' });
    }

    const refs = [normalized.reference, normalized.order, normalized.tracking, shipment.provider_shipment_code, shipment.provider_tracking_code, shipment.tracking_code, shipment.order_number].filter(Boolean);
    const mapped = mapSpedireProStatus(normalized.rawStatus, normalized.description || 'Actualizado');
    const trackingForCustomer = normalized.tracking || shipment.provider_tracking_code || shipment.tracking_code || normalized.reference;
    const providerReference = normalized.reference || normalized.order || shipment.provider_shipment_code || '';
    const eventDescription = normalized.description || (eventType.toLowerCase().includes('pickup')
      ? (normalized.pickupStatus ? `Recogida actualizada: ${normalized.pickupStatus}` : 'Recogida actualizada')
      : mapped.label);

    await pool.query(
      `UPDATE shipments
       SET provider_shipment_code = COALESCE(?, provider_shipment_code),
           provider_tracking_code = COALESCE(?, provider_tracking_code),
           tracking_code = COALESCE(?, tracking_code),
           track_url = COALESCE(?, track_url),
           label_url = COALESCE(?, label_url),
           label_base64 = COALESCE(?, label_base64),
           label_status = CASE WHEN (? IS NOT NULL AND ? <> '') OR (? IS NOT NULL AND ? <> '') THEN 'stored' ELSE label_status END,
           provider_payload_json = JSON_MERGE_PATCH(COALESCE(provider_payload_json, JSON_OBJECT()), CAST(? AS JSON)),
           updated_at = NOW()
       WHERE id = ?`,
      [
        providerReference || null,
        normalized.tracking || null,
        trackingForCustomer || null,
        normalized.trackingUrl || null,
        normalized.labelUrl || null,
        normalized.labelBase64 || null,
        normalized.labelBase64 || null,
        normalized.labelBase64 || '',
        normalized.labelUrl || null,
        normalized.labelUrl || '',
        JSON.stringify({ spedireproWebhook: payload, courier: normalized.courier || undefined }),
        shipment.id
      ]
    ).catch(async () => {
      await pool.query(
        `UPDATE shipments
         SET provider_shipment_code = COALESCE(?, provider_shipment_code),
             provider_tracking_code = COALESCE(?, provider_tracking_code),
             tracking_code = COALESCE(?, tracking_code),
             track_url = COALESCE(?, track_url),
             label_url = COALESCE(?, label_url),
             label_base64 = COALESCE(?, label_base64),
             label_status = CASE WHEN (? IS NOT NULL AND ? <> '') OR (? IS NOT NULL AND ? <> '') THEN 'stored' ELSE label_status END,
             updated_at = NOW()
         WHERE id = ?`,
        [providerReference || null, normalized.tracking || null, trackingForCustomer || null, normalized.trackingUrl || null, normalized.labelUrl || null, normalized.labelBase64 || null, normalized.labelBase64 || null, normalized.labelBase64 || '', normalized.labelUrl || null, normalized.labelUrl || '', shipment.id]
      );
    });

    if (normalized.labelBase64 || normalized.labelUrl) {
      await cacheShipmentLabelFromSource({ ...shipment, provider_code: 'spedirepro' }, normalized.labelUrl || '', normalized.labelBase64 || '').catch(() => null);
    } else if (['B', 'O', 'N', 'G', 'T', 'S'].includes(String(normalized.rawStatus || '').toUpperCase()) || eventType.toLowerCase().includes('created')) {
      await fetchAndStoreSpedireProLabel({ ...shipment, tracking_code: trackingForCustomer }, refs).catch(() => null);
    }

    await updateShipmentOperationalStatus(
      { ...shipment, provider_code: 'spedirepro', tracking_code: trackingForCustomer },
      { ...mapped, code: normalized.rawStatus || eventType },
      eventDescription,
      normalized.eventTime ? new Date(normalized.eventTime).toISOString().slice(0, 19).replace('T', ' ') : undefined
    );

    if (normalized.pickupStatus || eventType.toLowerCase().includes('pickup')) {
      await createTrackingEventOnce({
        shipment_id: shipment.id,
        tracking_code: trackingForCustomer,
        status: 'pickup_update',
        status_code: normalized.pickupStatus || eventType,
        status_label: 'Recogida actualizada',
        description: normalized.pickupNumber ? `${eventDescription} · ${normalized.pickupNumber}` : eventDescription,
        event_time: normalized.eventTime ? new Date(normalized.eventTime).toISOString().slice(0, 19).replace('T', ' ') : undefined
      });
    }

    await writeProviderLog('spedirepro', 'shipment_webhook', { shipmentId: shipment.id, eventType }, { processed: true, reference: providerReference, tracking: trackingForCustomer, hasLabel: Boolean(normalized.labelUrl || normalized.labelBase64) }, 200);
    res.json({ success: true, message: 'received' });
  } catch (e: any) {
    await writeProviderLog('spedirepro', 'webhook_failed', {}, { message: e?.message || 'No se pudo completar la operación.' }, 0).catch(() => null);
    res.status(200).json({ success: true, message: 'received' });
  }
});



// Webhook del conector internacional
app.post('/api/webhooks/logihub', async (req: any, res) => {
  try {
    const raw = typeof req.rawBody === 'string'
      ? req.rawBody
      : (Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {}));
    const signature = String(req.get('X-Logihub-Signature') || req.headers['x-logihub-signature'] || '');
    const event = String(req.get('X-Logihub-Event') || req.headers['x-logihub-event'] || 'tracking.updated');

    const provider = await ProviderRepo.getByCode('logihub_intl');
    const secret = logihubIntlConfig(provider).webhookSecret || process.env.LOGIHUB_WEBHOOK_SECRET || '';
    if (!secret) {
      await writeProviderLog('logihub_intl', 'webhook_missing_secret', { event }, { rejected: true }, 503);
      return res.status(503).json({ ok: false, message: 'Webhook pendiente de configuración segura.' });
    }
    if (!verifyWebhookHmac(raw, signature, secret)) {
      await writeProviderLog('logihub_intl', 'webhook_invalid_signature', { event }, { rejected: true }, 401);
      return res.status(401).json({ ok: false, message: 'Invalid signature' });
    }

    const data = req.body || {};
    const tracking = String(data.tracking_number || data.tracking || '');
    const statusRaw = String(data.status || '');
    const statusLabel = String(data.status_label || statusRaw);
    const mapped = logihubIntlMapStatus(statusRaw, statusLabel);

    await pool.query(
      `INSERT INTO webhook_events (id, provider_code, external_id, event_type, payload_json, processed_at)
       VALUES (?, 'logihub_intl', ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE event_type = VALUES(event_type), payload_json = VALUES(payload_json), processed_at = NOW()`,
      [generateId('wh_'), tracking || crypto.randomBytes(8).toString('hex'), event.slice(0, 120), raw]
    ).catch(() => null);

    await writeProviderLog('logihub_intl', 'webhook_received', { event, tracking }, data, 200);

    if (tracking) {
      const [rows]: any = await pool.query(
        `SELECT * FROM shipments
         WHERE provider_code = 'logihub_intl'
           AND (tracking_code = ? OR provider_tracking_code = ? OR provider_shipment_code = ?)
         ORDER BY created_at DESC LIMIT 1`,
        [tracking, tracking, tracking]
      );
      const shipment = rows?.[0];
      if (shipment) {
        await pool.query(
          `UPDATE shipments SET status = ?, status_label = ?, updated_at = NOW() WHERE id = ?`,
          [mapped.status, mapped.label, shipment.id]
        );
        await TrackingEventRepo.create({
          shipment_id: shipment.id,
          tracking_code: tracking,
          status: mapped.status,
          status_label: mapped.label,
          description: mapped.label,
        }).catch(() => null);
      }
    }

    return res.status(200).json({ ok: true, received: true, tracking, status: statusRaw });
  } catch (e: any) {
    console.error('[logihub webhook]', e?.message || e);
    return res.status(200).json({ ok: true, received: true });
  }
});


app.post('/api/webhooks/easypost', async (req: any, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString('utf8')
      : JSON.stringify(req.body || {});
    const webhookSecret = String(process.env.EASYPOST_WEBHOOK_SECRET || '').trim();
    const webhookSignature = String(
      req.get('X-Hmac-Signature') ||
      req.get('X-Easypost-Signature') ||
      req.get('X-Webhook-Signature') ||
      ''
    );
    if (!webhookSecret) {
      return res.status(503).json({ success: false, message: 'Webhook pendiente de configuración segura.' });
    }
    if (!verifyWebhookHmac(rawBody, webhookSignature, webhookSecret)) {
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }
    const payload = req.body || {};
    const normalized = normalizeEasyPostWebhookPayload(payload);
    const externalId = String(normalized.eventId || normalized.shipmentId || normalized.trackingCode || crypto.randomBytes(8).toString('hex'));
    await pool.query(
      `INSERT INTO webhook_events (id, provider_code, external_id, event_type, payload_json, processed_at)
       VALUES (?, 'easypost', ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE event_type = VALUES(event_type), payload_json = VALUES(payload_json), processed_at = NOW()`,
      [generateId('wh_'), externalId, String(normalized.eventType || 'easypost.event').slice(0, 120), JSON.stringify(payload)]
    ).catch(() => null);

    const refs = [normalized.shipmentId, normalized.trackerId, normalized.trackingCode].filter(Boolean);
    let shipment: any = null;
    if (refs.length) {
      const [rows]: any = await pool.query(
        `SELECT * FROM shipments WHERE provider_code = 'easypost' AND (provider_shipment_code IN (?) OR provider_tracking_code IN (?) OR tracking_code IN (?)) ORDER BY created_at DESC LIMIT 1`,
        [refs, refs, refs]
      ).catch(async () => [[], []] as any);
      shipment = rows?.[0] || null;
    }

    if (!shipment) {
      await writeProviderLog('easypost', 'webhook_unmatched', { eventType: normalized.eventType, refs }, payload, 200).catch(() => null);
      return res.status(200).json({ success: true, message: 'received' });
    }

    const mapped = easyPostStatusMap(normalized.status);
    await pool.query(
      `UPDATE shipments SET provider_tracking_code = COALESCE(?, provider_tracking_code), tracking_code = COALESCE(?, tracking_code), track_url = COALESCE(?, track_url), label_url = COALESCE(?, label_url), status = ?, status_label = ?, provider_payload_json = JSON_MERGE_PATCH(COALESCE(provider_payload_json, JSON_OBJECT()), CAST(? AS JSON)), updated_at = NOW() WHERE id = ?`,
      [normalized.trackingCode || null, normalized.trackingCode || null, normalized.publicUrl || null, normalized.labelUrl || null, mapped.status, mapped.label, JSON.stringify({ easypostWebhook: payload }), shipment.id]
    ).catch(async () => {
      await pool.query(
        `UPDATE shipments SET provider_tracking_code = COALESCE(?, provider_tracking_code), tracking_code = COALESCE(?, tracking_code), track_url = COALESCE(?, track_url), label_url = COALESCE(?, label_url), status = ?, status_label = ?, updated_at = NOW() WHERE id = ?`,
        [normalized.trackingCode || null, normalized.trackingCode || null, normalized.publicUrl || null, normalized.labelUrl || null, mapped.status, mapped.label, shipment.id]
      );
    });

    await createTrackingEventOnce({
      shipment_id: shipment.id,
      tracking_code: normalized.trackingCode || shipment.tracking_code,
      status: mapped.status,
      status_code: normalized.status || normalized.eventType,
      status_label: mapped.label,
      description: normalized.statusDetail || mapped.label,
      event_time: new Date().toISOString().slice(0, 19).replace('T', ' ')
    }).catch(() => null);

    if (normalized.labelUrl) {
      await cacheShipmentLabelFromSource({ ...shipment, provider_code: 'easypost' }, normalized.labelUrl, '').catch(() => null);
    } else if (shipment.provider_shipment_code) {
      await fetchProviderLabelForShipment({ ...shipment, provider_code: 'easypost' }).catch(() => null);
    }

    await writeProviderLog('easypost', 'shipment_webhook', { shipmentId: shipment.id, eventType: normalized.eventType }, { processed: true, tracking: normalized.trackingCode, status: mapped.status }, 200).catch(() => null);
    res.status(200).json({ success: true, message: 'received' });
  } catch (e: any) {
    await writeProviderLog('easypost', 'webhook_failed', {}, { message: e?.message || 'No se pudo completar la operación.' }, 0).catch(() => null);
    res.status(200).json({ success: true, message: 'received' });
  }
});

app.post('/api/admin/easypost/webhook/create', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const provider = await ProviderRepo.getByCode('easypost');
    const keys = await ApiKeysRepo.get();
    if (!easyPostCredentials(provider, keys)) return res.json({ success: false, message: 'Credencial privada pendiente.' });
    const cfg = providerConfig(provider || {});
    const webhookUrl = String(req.body?.url || cfg.webhookUrl || `${process.env.APP_URL || 'https://doordrop.lat'}/api/webhooks/easypost`);
    const payload: any = { webhook: { url: webhookUrl } };
    const secret = String(process.env.EASYPOST_WEBHOOK_SECRET || cfg.webhookSecret || '').trim();
    if (secret) payload.webhook.webhook_secret = secret;
    const created = await callEasyPost(provider, keys, 'POST', 'webhooks', payload);
    await writeProviderLog('easypost', 'webhook_create', { url: webhookUrl }, { httpStatus: created.httpStatus, id: created.response?.id || created.response?.webhook?.id, hasSecret: Boolean(secret) }, created.httpStatus);
    if (!easyPostIsOk(created.httpStatus, created.response)) return res.json({ success: false, message: 'No se pudo crear el webhook.', result: created.response });
    return res.json({ success: true, message: 'Webhook configurado correctamente.', webhookUrl, webhook: created.response });
  } catch (e: any) {
    await writeProviderLog('easypost', 'webhook_create_failed', {}, { message: e?.message || 'No se pudo completar la operación.' }, 0).catch(() => null);
    res.status(200).json({ success: false, message: 'No se pudo crear el webhook.' });
  }
});

app.post('/api/webhooks/genei', async (req: any, res) => {
  try {
    const provider = await ProviderRepo.getByCode('genei');
    const webhookSecret = String(process.env.GENEI_WEBHOOK_SECRET || providerConfig(provider || {}).webhookSecret || '').trim();
    const rawBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString('utf8')
      : JSON.stringify(req.body || {});
    const webhookSignature = String(
      req.get('X-Genei-Signature') ||
      req.get('X-Webhook-Signature') ||
      req.get('X-Signature') ||
      ''
    );
    if (!webhookSecret) {
      return res.status(503).json({ success: false, message: 'Webhook pendiente de configuración segura.' });
    }
    if (!verifyWebhookHmac(rawBody, webhookSignature, webhookSecret)) {
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }
    const payload = req.body;
    const { status, message, data } = payload;
    if (!data || !data.codigo_envio) {
      await writeProviderLog('genei', 'webhook_unmatched', {}, payload, 200).catch(() => null);
      return res.status(200).json({ success: true, message: 'received' });
    }

    const shipmentCode = data.codigo_envio;
    const trackingCode = data.codigo_seguimiento || '';
    const rawEstado = data.estado;
    const nombreEstado = data.nombre_estado || 'Actualizado';

    const [shipmentRows]: any = await pool.query(
      'SELECT id, user_id FROM shipments WHERE provider_shipment_code = ? OR provider_tracking_code = ? OR tracking_code = ?',
      [shipmentCode, trackingCode, shipmentCode]
    );

    if (shipmentRows.length === 0) {
      await writeProviderLog('genei', 'webhook_unmatched', { shipmentCode, trackingCode }, payload, 200).catch(() => null);
      return res.status(200).json({ success: true, message: 'received' });
    }

    const shipment = shipmentRows[0];
    
    let internalStatus = 'enviado_proveedor';
    let internalStatusLabel = nombreEstado;

    const code = Number(rawEstado);
    if (code === 7) {
      internalStatus = 'pendiente_pago';
      internalStatusLabel = 'Pendiente de pago';
    } else if (code === 6) {
      internalStatus = 'pendiente_tramitar';
      internalStatusLabel = 'Pendiente de tramitación';
    } else if (code === 1) {
      internalStatus = 'tramitado';
      internalStatusLabel = 'Tramitado';
    } else if (code === 2) {
      internalStatus = 'pendiente_deposito';
      internalStatusLabel = 'Pendiente de depósito';
    } else if (code === 80) {
      internalStatus = 'en_reparto';
      internalStatusLabel = 'En reparto';
    } else if (code === 85) {
      internalStatus = 'recogida_pendiente';
      internalStatusLabel = 'Disponible en oficina';
    } else if (code === 3) {
      internalStatus = 'entregado';
      internalStatusLabel = 'Entregado';
    } else if (code === 5) {
      internalStatus = 'en_transito';
      internalStatusLabel = 'En tránsito';
    } else if (code === 9 || code === 10 || code === 15 || code === 78) {
      internalStatus = 'incidencia';
      internalStatusLabel = 'Incidencia';
    } else if (code === 14) {
      internalStatus = 'devuelto';
      internalStatusLabel = 'Devuelto';
    } else if (code === 77 || code === 79) {
      internalStatus = 'cancelado';
      internalStatusLabel = 'Cancelado';
    }

    await pool.query(
      `UPDATE shipments 
       SET status = ?, status_label = ?, provider_tracking_code = ?, updated_at = NOW()
       WHERE id = ?`,
      [internalStatus, internalStatusLabel, trackingCode || data.codigo_seguimiento || shipmentCode, shipment.id]
    );

    await pool.query(
      `INSERT INTO tracking_events (id, shipment_id, provider_event_id, tracking_code, status_code, status_label, description, event_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        generateId('evt_'),
        shipment.id,
        rawEstado?.toString() || 'GENEI_HOOK',
        trackingCode || shipmentCode,
        internalStatus,
        internalStatusLabel,
        message || nombreEstado
      ]
    );

    await pool.query(
      `INSERT INTO provider_logs (id, provider_code, action_type, request_payload, response_payload, http_status)
       VALUES (?, 'genei', 'webhook_update', ?, ?, 200)`,
      [generateId('log_'), JSON.stringify(req.headers), JSON.stringify(payload)]
    );

    res.json({ success: true, message: 'received' });
  } catch (error: any) {
    await writeProviderLog('genei', 'webhook_failed', {}, { message: error?.message || 'No se pudo completar la operación.' }, 0).catch(() => null);
    res.status(200).json({ success: true, message: 'received' });
  }
});

// PayPal: Get Config
app.get('/api/payments/paypal/config', authMiddleware, async (req, res) => {
  const keys = await ApiKeysRepo.get();
  const configured = ship24goPayPalCredentialsReady(keys);
  res.json({
    configured,
    enabled: ship24goPayPalIntegrationEnabled(keys),
    clientId: keys?.paypalClientId || ''
  });
});

// Helper de PayPal Access Token
async function getPayPalAccessToken(clientId: string, clientSecret: string, environment = '') {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${ship24goPayPalApiBase(environment)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!response.ok) {
    throw new Error('No se pudo autenticar con PayPal. Verifica las credenciales.');
  }
  const data: any = await response.json();
  return data.access_token;
}

// PayPal: Create Order
app.post('/api/payments/paypal/create-order', authMiddleware, async (req: any, res) => {
  try {
    const { amount } = req.body;
    const keys = await ApiKeysRepo.get();
    
    if (!ship24goPayPalIntegrationEnabled(keys)) {
      return res.status(400).json({ error: ship24goPayPalUnavailableMessage(keys) });
    }

    const accessToken = await getPayPalAccessToken(keys.paypalClientId, keys.paypalClientSecret, keys.paypalEnvironment);
    const response = await fetch(`${ship24goPayPalApiBase(keys.paypalEnvironment)}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'EUR',
            value: Number(amount).toFixed(2)
          },
          description: 'Servicio de envío logístico DoorDrop'
        }]
      })
    });

    const orderData: any = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: orderData.message || 'Error al crear la orden en PayPal' });
    }

    res.json({ id: orderData.id });
  } catch (error: any) {
    console.error('[PayPal Error]:', error);
    res.status(500).json({ error: error.message || 'Error interno al procesar el pago con PayPal' });
  }
});

// PayPal: Capture Order
app.post('/api/payments/paypal/capture-order', authMiddleware, async (req: any, res) => {
  try {
    const { orderId } = req.body;
    const keys = await ApiKeysRepo.get();

    if (!ship24goPayPalIntegrationEnabled(keys)) {
      return res.status(400).json({ error: ship24goPayPalUnavailableMessage(keys) });
    }

    const accessToken = await getPayPalAccessToken(keys.paypalClientId, keys.paypalClientSecret, keys.paypalEnvironment);
    const response = await fetch(`${ship24goPayPalApiBase(keys.paypalEnvironment)}/v2/checkout/orders/${encodeURIComponent(String(orderId || ''))}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const captureData: any = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: captureData.message || 'Error al capturar la orden en PayPal' });
    }

    res.json({ success: true, captureData });
  } catch (error: any) {
    console.error('[PayPal Capture Error]:', error);
    res.status(500).json({ error: error.message || 'Error interno al capturar el pago' });
  }
});

// Polar: Create Subscription Checkout
app.post('/api/subscriptions/polar/create-checkout', authMiddleware, async (req: any, res) => {
  try {
    const keys = await ApiKeysRepo.get();
    if (!ship24goPolarIntegrationEnabled(keys) || !keys?.polarProductId) {
      return res.status(400).json({ error: 'Configuración de Polar incompleta. Por favor, configura Polar API Token y Product ID en el panel de administrador.' });
    }

    const isSandbox = keys.polarApiToken.includes('test') || keys.polarApiToken.startsWith('polar_at_test') || !keys.polarApiToken.startsWith('polar_at_prod');
    const apiBase = isSandbox ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh';

    const origin = req.headers.origin || 'http://localhost:3000';
    const successUrl = `${origin}/panel/settings?payment_success=true`;

    const response = await fetch(`${apiBase}/v1/checkouts/custom`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${keys.polarApiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_id: keys.polarProductId,
        success_url: successUrl,
        customer_email: req.user.email
      })
    });

    const data: any = await response.json();
    if (!response.ok) {
      console.error('[Polar API Error]:', data);
      return res.status(response.status).json({ error: data.detail || 'Error al crear la sesión de checkout en Polar' });
    }

    res.json({ url: data.url });
  } catch (error: any) {
    console.error('[Polar Error]:', error);
    res.status(500).json({ error: error.message || 'Error interno al procesar la suscripción con Polar' });
  }
});


function customerPublicShipmentStatus(shipment: any) {
  const rawLabel = String(shipment?.status_label || '').toLowerCase();
  const rawStatus = String(shipment?.status || '').toLowerCase();
  const hasLabel = Boolean(shipment?.label_base64 || shipment?.label_url);
  if (hasLabel) return 'Etiqueta lista';
  if (rawLabel.includes('prueba') || rawStatus.includes('sandbox')) return 'Etiqueta en preparación';
  if (rawStatus.includes('pending_label') || rawStatus.includes('pending_provider') || rawLabel.includes('prepar')) return 'Etiqueta en preparación';
  if (rawStatus.includes('customer_balance') || rawLabel.includes('saldo')) return 'Pendiente de saldo';
  if (rawStatus.includes('transit') || rawLabel.includes('tránsito') || rawLabel.includes('transito')) return 'En tránsito';
  if (rawStatus.includes('delivered') || rawLabel.includes('entreg')) return 'Entregado';
  if (rawStatus.includes('cancel')) return 'Cancelado';
  return shipment?.status_label || 'En proceso';
}

function customerPublicShipmentStatusCode(shipment: any) {
  const rawLabel = String(shipment?.status_label || '').toLowerCase();
  const rawStatus = String(shipment?.status || '').toLowerCase();
  if (rawLabel.includes('prueba') || rawStatus.includes('sandbox')) return 'pending_label';
  if (shipment?.label_base64 || shipment?.label_url) return 'label_ready';
  return shipment?.status || 'created';
}

// Listar Envíos
app.get('/api/shipments', authMiddleware, async (req: any, res) => {
  try {
    let shipmentsList = [];
    if (req.user.role === 'super_admin') {
      shipmentsList = await ShipmentRepo.getAll();
    } else {
      shipmentsList = await ShipmentRepo.getByUserId(req.user.id);
    }
    
    const packageMap = new Map<string, any[]>();
    if (shipmentsList.length > 0) {
      const ids = shipmentsList.map((s: any) => s.id);
      const placeholders = ids.map(() => '?').join(',');
      const [pkgRows]: any = await pool.query(`SELECT * FROM shipment_packages WHERE shipment_id IN (${placeholders})`, ids);
      for (const pkg of pkgRows) {
        const list = packageMap.get(pkg.shipment_id) || [];
        list.push({
          width: Number(pkg.width_cm || 10),
          height: Number(pkg.height_cm || 10),
          length: Number(pkg.length_cm || 10),
          weight: Number(pkg.weight_kg || 1),
          qty: Number(pkg.quantity || 1)
        });
        packageMap.set(pkg.shipment_id, list);
      }
    }

    const cancellationMap = new Map<string, any>();
    if (shipmentsList.length > 0) {
      const ids = shipmentsList.map((s: any) => s.id);
      const placeholders = ids.map(() => '?').join(',');
      try {
        const [cancelRows]: any = await pool.query(`SELECT * FROM cancellation_requests WHERE shipment_id IN (${placeholders})`, ids);
        for (const row of cancelRows) cancellationMap.set(row.shipment_id, row);
      } catch {}
    }

    const providersDb = await ProviderRepo.getAll().catch(() => []);
    const providerMap = new Map<string, any>(providersDb.map((p: any) => [String(p.code || '').toLowerCase(), p]));
    const quoteMap = new Map<string, any>();
    if (shipmentsList.length > 0) {
      const quoteIds = [...new Set(shipmentsList.map((s: any) => s.quote_id).filter(Boolean))];
      if (quoteIds.length) {
        const placeholders = quoteIds.map(() => '?').join(',');
        try {
          const [quoteRows]: any = await pool.query(`SELECT id, service_name, provider_payload_json FROM quotes WHERE id IN (${placeholders})`, quoteIds);
          for (const row of quoteRows) quoteMap.set(row.id, row);
        } catch {}
      }
    }

    // Normalizar a formato frontend (JSON.parse sender/recipient)
    const normalized = shipmentsList.map(s => {
      const provider = providerMap.get(String(s.provider_code || '').toLowerCase());
      const payload = parseJsonSafe(s.provider_payload_json);
      const quoteRow = quoteMap.get(s.quote_id);
      const quotePayload = parseJsonSafe(quoteRow?.provider_payload_json);
      const carrierSource = quotePayload?.carrierName || quotePayload?.raw?.ship24goCarrierName || quotePayload?.raw?.selectedService?.ship24goCarrierName || quotePayload?.raw?.courierService?.courier || quotePayload?.raw?.courier || quotePayload?.raw?.carrier || quotePayload?.raw?.nombre_agencia || payload?.carrierName || payload?.ship24goCarrierName || payload?.carrier || payload?.courier || payload?.tracking?.carrier || payload?.accept?.courier || quoteRow?.service_name || s.provider_code || '';
      const carrierName = inferCarrierName(carrierSource);
      return ({
      id: s.id,
      userId: s.user_id,
      trackingCode: s.tracking_code,
      providerTracking: req.user.role === 'super_admin' ? (s.provider_tracking_code || '') : '',
      providerDisplayName: publicProviderName(provider || {}),
      carrierName,
      status: req.user.role === 'super_admin' ? (s.status_label || 'Creado') : customerPublicShipmentStatus(s),
      statusCode: req.user.role === 'super_admin' ? (s.status || 'created') : customerPublicShipmentStatusCode(s),
      labelStatus: s.label_status || (s.label_base64 || s.label_url ? 'available' : 'pending'),
      labelReady: Boolean(s.label_base64 || s.label_url),
      isDraft: String(s.status || '').toLowerCase() === 'draft',
      canEdit: isShipmentEditableBeforeLabel(s),
      canFinalize: String(s.status || '').toLowerCase() === 'draft',
      canRetryLabel: ['pending_provider','pending_label'].includes(String(s.status || '').toLowerCase()),
      cancellationRequest: cancellationMap.get(s.id) || null,
      canRequestCancellation: !cancellationMap.get(s.id) && canRequestCancellationForShipment(s),
      labelDownloadUrl: (s.label_base64 || s.label_url) ? labelFileUrlForShipment(s) : '',
      createdAt: s.created_at,
      sender: typeof s.sender_json === 'string' ? JSON.parse(s.sender_json) : s.sender_json,
      recipient: typeof s.recipient_json === 'string' ? JSON.parse(s.recipient_json) : s.recipient_json,
      packages: packageMap.get(s.id) || [],
      quote: s.quote_id ? { total: s.quote_id, serviceName: quoteRow?.service_name || '', carrier: carrierName } : null
    });
    });
    
    res.json({ shipments: normalized });
  } catch (error) {
    console.error('[Get Shipments Error]:', error);
    res.status(500).json({ error: 'No se pudo cargar la información.' });
  }
});

// Tracking Público
app.get('/api/tracking/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const [shipmentRows]: any = await pool.query(
      `SELECT * FROM shipments
       WHERE tracking_code = ? OR provider_shipment_code = ? OR provider_tracking_code = ? OR order_number = ? OR id = ?
       LIMIT 1`,
      [code, code, code, code, code]
    );
    const shipment = shipmentRows?.[0];
    if (!shipment) {
      return res.status(404).json({ error: 'No hay datos para mostrar con este código de rastreo.' });
    }
    
    // Intentar actualizar desde el proveedor sin exponer datos internos.
    try {
      if (shipment.provider_code && !['entregado','cancelado','cancelled','draft'].includes(String(shipment.status || '').toLowerCase())) {
        await syncShipmentStatusFromProvider(shipment.id);
      }
    } catch {}

    const current = await ShipmentRepo.getById(shipment.id);
    const events = await TrackingEventRepo.getByShipmentId(shipment.id);
    const recipient = typeof current.recipient_json === 'string' ? JSON.parse(current.recipient_json) : current.recipient_json;
    const requestedLang = normalizeMailLanguage(req.query.lang || detectLanguageFromRequest(req));
    
    // Mapear eventos a formato esperado por UI
    let normalizedEvents = events.map(e => ({
      id: e.id,
      status: e.status_label || 'Creado',
      description: e.description || e.status_label || 'Actualizado',
      date: e.event_time,
      location: e.location || ''
    }));

    if (!normalizedEvents.length) {
      normalizedEvents = [{
        id: 'current',
        status: current.status_label || 'Creado',
        description: 'El envío fue recibido y está disponible para seguimiento.',
        date: current.updated_at || current.created_at || new Date().toISOString(),
        location: recipient?.city || ''
      }];
    }

    const providerPayload = typeof current.provider_payload_json === 'string' ? JSON.parse(current.provider_payload_json || '{}') : (current.provider_payload_json || {});
    const courierName = String(providerPayload?.courier || providerPayload?.spedireproWebhook?.courier || providerPayload?.detail?.courier || providerPayload?.create?.courier || '').trim();

    res.json({
      trackingCode: current.tracking_code || code,
      providerTrackingCode: current.provider_tracking_code || '',
      status: current.status_label || 'Creado',
      statusCode: current.status || 'created',
      language: requestedLang,
      courier: courierName || '',
      trackingUrl: current.track_url || '',
      labelReady: Boolean(current.label_base64 || current.label_url),
      recipient: recipient?.city || 'ES',
      destination: [recipient?.city, recipient?.country].filter(Boolean).join(', '),
      updatedAt: current.updated_at || current.created_at,
      events: normalizedEvents
    });
  } catch (error) {
    console.error('[Diagnóstico Interno] Error tracking:', error);
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});


// Tracking real por proveedor: ParcelABC
app.get('/api/tracking/parcelabc/:code', authMiddleware, async (req: any, res) => {
  try {
    const keys = await ApiKeysRepo.get();
    const provider = await ProviderRepo.getByCode('parcelabc');
    const authToken = providerSecret('parcelabc', provider, keys);
    if (!authToken) return res.status(400).json({ error: 'Proveedor no disponible todavía.' });
    const code = req.params.code;
    const response = await fetch(`${providerBaseUrl(provider, 'https://www.parcelabc.com/api-pabc.php')}/tracking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authToken, parcelCode: code })
    });
    const data = await response.json().catch(async () => ({ status: false, errorMessage: await response.text() }));
    await writeProviderLog('parcelabc', 'tracking', { parcelCode: code }, data, response.status);

    const shipment = await ShipmentRepo.getByTrackingCode(code);
    if (shipment && data?.trackingList?.[code]?.packages) {
      for (const pkg of data.trackingList[code].packages) {
        for (const ev of (pkg.tracking || [])) {
          const mapped = mapParcelAbcTrackStatus(ev.statusId);
          await TrackingEventRepo.create({
            shipment_id: shipment.id,
            tracking_code: code,
            status: mapped.status,
            status_label: mapped.label,
            description: ev.comments || mapped.label,
            event_time: ev.time ? ev.time.replace(' ', 'T').slice(0, 19).replace('T', ' ') : undefined
          });
        }
      }
    }
    res.json({ success: !!data?.status, tracking: data });
  } catch (error) {
    console.error('[Diagnóstico Interno] Error tracking ParcelABC:', error);
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

// Tracking real por proveedor: Genei
app.get('/api/tracking/genei/:code', authMiddleware, async (req: any, res) => {
  try {
    const keys = await ApiKeysRepo.get();
    if (!keys?.genei) return res.status(400).json({ error: 'Proveedor no disponible todavía.' });
    const token = await getGeneiToken(keys.genei);
    const code = req.params.code;
    const response = await fetch(`https://apiv2.genei.es/api/v2/shipments/${encodeURIComponent(code)}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json().catch(async () => ({ status: false, message: await response.text() }));
    await writeProviderLog('genei', 'tracking', { shipmentCode: code }, data, response.status);
    res.json({ success: response.ok, tracking: data });
  } catch (error) {
    console.error('[Diagnóstico Interno] Error tracking Genei:', error);
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

// Etiquetas por envío
app.get('/api/shipments/:id/label', authMiddleware, async (req: any, res) => {
  try {
    const shipment = await ShipmentRepo.getById(req.params.id);
    if (!shipment || (req.user.role !== 'super_admin' && shipment.user_id !== req.user.id)) {
      return res.status(404).json({ error: 'No hay datos para mostrar.' });
    }

    let current = shipment;
    if (!current.label_base64) {
      await fetchProviderLabelForShipment(current);
      current = await ShipmentRepo.getById(req.params.id);
    }

    if (current?.label_base64) {
      return res.json({
        labelBase64: current.label_base64,
        format: 'pdf',
        downloadUrl: `/api/shipments/${current.id}/label/file`
      });
    }

    return res.status(404).json({ error: 'Tu etiqueta no está disponible todavía.' });
  } catch (error) {
    console.error('[Diagnóstico Interno] Error etiqueta:', error);
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.get('/api/shipments/:id/label/file', async (req: any, res) => {
  try {
    let shipment = await ShipmentRepo.getById(req.params.id);
    if (!shipment) {
      return res.status(404).send('No hay datos para mostrar.');
    }

    const tokenOk = isValidLabelAccessToken(shipment, req.query.lt);
    if (!tokenOk) {
      const authHeader = req.headers['authorization'];
      const decoded = authHeader ? verifyToken(authHeader) : null;
      const user = decoded?.userId ? await UserRepo.getById(decoded.userId) : null;
      const isOwner = Boolean(user && (user.role === 'super_admin' || user.id === shipment.user_id));
      if (!isOwner) {
        res.status(401).setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Etiqueta no disponible</title><style>body{font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;display:grid;place-items:center;min-height:100vh}.card{background:#fff;border:1px solid #e2e8f0;border-radius:24px;box-shadow:0 20px 50px rgba(15,23,42,.08);max-width:520px;padding:32px;text-align:center}.btn{display:inline-block;margin-top:18px;background:#2563eb;color:white;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:999px}</style></head><body><main class="card"><h1>Acceso protegido</h1><p>Para ver o descargar esta etiqueta, abre tu panel de DoorDrop y selecciona el envío correspondiente.</p><a class="btn" href="/panel/shipments">Ir a mis envíos</a></main></body></html>`);
      }
    }

    if (!shipment.label_base64) {
      await fetchProviderLabelForShipment(shipment);
      shipment = await ShipmentRepo.getById(req.params.id);
    }
    if (!shipment?.label_base64) {
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Etiqueta en preparación</title><style>body{font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;display:grid;place-items:center;min-height:100vh}.card{background:#fff;border:1px solid #e2e8f0;border-radius:24px;box-shadow:0 20px 50px rgba(15,23,42,.08);max-width:520px;padding:32px;text-align:center}.pill{display:inline-block;background:#fef3c7;color:#92400e;border-radius:999px;padding:7px 12px;font-weight:800;font-size:13px}.btn{display:inline-block;margin-top:18px;background:#2563eb;color:white;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:999px}</style></head><body><main class="card"><span class="pill">Etiqueta en preparación</span><h1>Tu etiqueta todavía no está disponible</h1><p>Estamos preparando la etiqueta. Te avisaremos cuando esté lista para descargar.</p><a class="btn" href="/panel/shipments">Volver a mis envíos</a></main></body></html>`);
    }
    const buffer = Buffer.from(String(shipment.label_base64), 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    const disposition = String(req.query.download || '') === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename="${shipment.tracking_code || shipment.id}.pdf"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(buffer);
  } catch (error) {
    console.error('[Diagnóstico Interno] Error archivo etiqueta:', error);
    res.status(500).send('No se pudo completar la operación.');
  }
});

// Admin: Estadísticas
app.get('/api/admin/stats', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const allUsers = await UserRepo.getAll();
    const allShipments = await ShipmentRepo.getAll();
    const allStores = await StoreRepo.getAll();
    
    res.json({
      totalUsers: allUsers.filter(u => u.role === 'customer').length,
      totalShipments: allShipments.length,
      activeStores: allStores.length,
      recentShipments: allShipments.slice(0, 5).map(s => ({
        id: s.id,
        trackingCode: s.tracking_code,
        status: s.status_label,
        createdAt: s.created_at
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

// Admin: Equipo interno / Staff
app.get('/api/admin/staff', authMiddleware, requireSuperAdmin, async (_req: any, res: any) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT s.id AS staff_id, s.user_id, s.title, s.permissions_json, s.last_login_at,
              s.created_at AS staff_created_at, s.updated_at AS staff_updated_at,
              u.name, u.email, u.phone, u.role, u.status, u.created_at, u.updated_at
         FROM admin_staff s
         INNER JOIN users u ON u.id = s.user_id
        WHERE u.role = 'support'
        ORDER BY CASE WHEN u.status = 'active' THEN 0 ELSE 1 END, u.created_at DESC`
    );
    res.json({ success: true, staff: rows.map(publicStaffRow) });
  } catch (error) {
    console.error('[Admin Staff] Error listing staff:', error);
    res.status(500).json({ error: 'No se pudo cargar el equipo interno.' });
  }
});

app.post('/api/admin/staff', authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  const conn = await pool.getConnection();
  try {
    const name = String(req.body?.name || '').trim().slice(0, 191);
    const email = normalizeStaffEmail(req.body?.email);
    const phone = String(req.body?.phone || '').trim().slice(0, 50);
    const title = String(req.body?.title || 'Soporte DoorDrop').trim().slice(0, 120) || 'Soporte DoorDrop';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const permissions = normalizeStaffPermissions(req.body?.permissions);

    if (!name || !isValidStaffEmail(email)) {
      return res.status(400).json({ error: 'El nombre y un correo válido son obligatorios.' });
    }
    if (password.length < 12) {
      return res.status(400).json({ error: 'La contraseña del equipo debe tener al menos 12 caracteres.' });
    }

    await conn.beginTransaction();
    const [existing]: any = await conn.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'Ese correo ya está registrado en DoorDrop.' });
    }

    const userId = generateId('usr_');
    const staffId = generateId('stf_');
    await conn.query(
      `INSERT INTO users (id, email, password_hash, name, phone, country, currency, role, business_type, balance, status)
       VALUES (?, ?, ?, ?, ?, 'ES', 'EUR', 'support', 'DoorDrop Staff', 0.00, 'active')`,
      [userId, email, hashPassword(password), name, phone]
    );
    await conn.query(
      `INSERT INTO admin_staff (id, user_id, title, permissions_json, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [staffId, userId, title, JSON.stringify(permissions), req.user.id]
    );
    await conn.commit();

    const created = await getAdminStaffById(staffId);
    await writeAdminStaffLog('staff_created', { adminId: req.user.id, staffId, userId, email, permissions }, { success: true });
    res.status(201).json({ success: true, message: 'Miembro del equipo creado correctamente.', staff: publicStaffRow(created) });
  } catch (error: any) {
    try { await conn.rollback(); } catch {}
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese correo ya está registrado en DoorDrop.' });
    console.error('[Admin Staff] Error creating staff:', error);
    res.status(500).json({ error: 'No se pudo crear el miembro del equipo.' });
  } finally {
    conn.release();
  }
});

app.put('/api/admin/staff/:id', authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const current = await getAdminStaffById(String(req.params.id || ''), conn);
    if (!current) {
      await conn.rollback();
      return res.status(404).json({ error: 'Miembro del equipo no encontrado.' });
    }

    const name = req.body?.name === undefined ? String(current.name || '') : String(req.body.name || '').trim().slice(0, 191);
    const email = req.body?.email === undefined ? String(current.email || '') : normalizeStaffEmail(req.body.email);
    const phone = req.body?.phone === undefined ? String(current.phone || '') : String(req.body.phone || '').trim().slice(0, 50);
    const title = req.body?.title === undefined ? String(current.title || 'Soporte DoorDrop') : String(req.body.title || '').trim().slice(0, 120);
    const status = req.body?.status === undefined ? String(current.status || 'active') : String(req.body.status || '').trim().toLowerCase();
    const permissions = req.body?.permissions === undefined
      ? normalizeStaffPermissions(safeJsonParse(current.permissions_json, DEFAULT_STAFF_PERMISSIONS), DEFAULT_STAFF_PERMISSIONS)
      : normalizeStaffPermissions(req.body.permissions, []);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!name || !isValidStaffEmail(email)) {
      await conn.rollback();
      return res.status(400).json({ error: 'El nombre y un correo válido son obligatorios.' });
    }
    if (!['active', 'suspended', 'closed'].includes(status)) {
      await conn.rollback();
      return res.status(400).json({ error: 'Selecciona un estado válido.' });
    }
    if (password && password.length < 12) {
      await conn.rollback();
      return res.status(400).json({ error: 'La contraseña del equipo debe tener al menos 12 caracteres.' });
    }

    if (email !== String(current.email || '').toLowerCase()) {
      const [existing]: any = await conn.query('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [email, current.user_id]);
      if (existing.length > 0) {
        await conn.rollback();
        return res.status(409).json({ error: 'Ese correo ya está registrado en DoorDrop.' });
      }
    }

    const statusChanged = status !== String(current.status || 'active');
    const userFields = ['name = ?', 'email = ?', 'phone = ?', 'status = ?'];
    const userValues: any[] = [name, email, phone, status];
    if (password) {
      userFields.push('password_hash = ?', 'auth_token_version = COALESCE(auth_token_version, 1) + 1');
      userValues.push(hashPassword(password));
    } else if (statusChanged) {
      userFields.push('auth_token_version = COALESCE(auth_token_version, 1) + 1');
    }
    userValues.push(current.user_id);

    await conn.query(`UPDATE users SET ${userFields.join(', ')} WHERE id = ? AND role = 'support'`, userValues);
    await conn.query(
      `UPDATE admin_staff SET title = ?, permissions_json = ?, updated_at = NOW() WHERE id = ?`,
      [title || 'Soporte DoorDrop', JSON.stringify(permissions), req.params.id]
    );
    await conn.commit();

    const updated = await getAdminStaffById(String(req.params.id));
    const changed = ['name', 'email', 'phone', 'title', 'permissions'];
    if (password) changed.push('password');
    if (statusChanged) changed.push('status');
    await writeAdminStaffLog('staff_updated', { adminId: req.user.id, staffId: req.params.id, changed }, { success: true });
    res.json({ success: true, message: 'Miembro del equipo actualizado correctamente.', staff: publicStaffRow(updated) });
  } catch (error: any) {
    try { await conn.rollback(); } catch {}
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese correo ya está registrado en DoorDrop.' });
    console.error('[Admin Staff] Error updating staff:', error);
    res.status(500).json({ error: 'No se pudo actualizar el miembro del equipo.' });
  } finally {
    conn.release();
  }
});

// Admin: Clientes
function isDoorDropClient(user: any): boolean {
  return Boolean(user && user.role === 'customer');
}

function normalizeClientForAdmin(u: any) {
  const cardDetails = safeJsonParse(u.card_details_json, null);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone || '',
    country: u.country || 'ES',
    currency: normalizeCurrencyCode(u.currency || 'EUR'),
    businessType: u.business_type,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
    balance: Number(u.balance || 0),
    status: u.status || 'active',
    cardConnected: Boolean(u.card_connected),
    cardDetails,
    paypalConnected: Boolean(u.paypal_connected),
    paypalEmail: u.paypal_email || '',
    debtAmount: Number(u.balance || 0) < 0 ? Math.abs(Number(u.balance || 0)) : 0
  };
}

app.get('/api/admin/clients', authMiddleware, requireSuperAdmin, async (_req: any, res) => {
  try {
    const allUsers = await UserRepo.getAll();
    const clients = allUsers
      .filter(isDoorDropClient)
      .map(normalizeClientForAdmin)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    res.json({ clients });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.get('/api/admin/clients/:id', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const user = await UserRepo.getById(req.params.id);
    if (!isDoorDropClient(user)) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    const [companies]: any = await pool.query('SELECT * FROM companies WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [user.id]);
    const [stores]: any = await pool.query('SELECT id, platform, external_store_id, store_name, status, created_at FROM stores WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', [user.id]);
    const [shipments]: any = await pool.query('SELECT id, tracking_code, provider_tracking_code, status_label, provider_code, created_at FROM shipments WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', [user.id]);
    const [transactions]: any = await pool.query('SELECT id, type, amount, currency, description, reference_type, created_at FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', [user.id]);
    const [topups]: any = await pool.query('SELECT id, amount, currency, method, status, created_at FROM wallet_topups WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', [user.id]);

    res.json({
      client: normalizeClientForAdmin(user),
      companies: companies || [],
      stores: stores || [],
      shipments: shipments || [],
      transactions: transactions || [],
      topups: topups || []
    });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/admin/clients/:id/status', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const status = String(req.body?.status || '').toLowerCase();
    if (!['active', 'suspended', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Selecciona un estado válido.' });
    }

    const user = await UserRepo.getById(req.params.id);
    if (!isDoorDropClient(user)) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    await UserRepo.update(user.id, { status });
    const updated = await UserRepo.getById(user.id);
    await writeAdminClientLog('client_status_update', { adminId: req.user.id, clientId: user.id, status }, { success: true });

    res.json({
      success: true,
      message: status === 'active' ? 'Cliente activado correctamente.' : status === 'suspended' ? 'Cliente bloqueado correctamente.' : 'Cliente cerrado correctamente.',
      client: normalizeClientForAdmin(updated)
    });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/admin/clients/:id/recharge', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureWalletCurrencySchema();
    const requestedAmount = Number(req.body?.amount || 0);
    const requestedCurrency = normalizeCurrencyCode(req.body?.currency || 'EUR');
    const note = String(req.body?.note || '').trim().slice(0, 160);

    if (!requestedAmount || requestedAmount <= 0) {
      return res.status(400).json({ error: 'Ingresa un monto válido.' });
    }

    const user = await UserRepo.getById(req.params.id);
    if (!isDoorDropClient(user)) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    const clientCurrency = normalizeCurrencyCode(user.currency || 'EUR');
    const rates = await getFreshRatesInternal();

    await conn.beginTransaction();
    const mutation = await applyWalletMutation(conn, {
      userId: user.id,
      type: 'credit',
      amount: requestedAmount,
      currency: requestedCurrency,
      description: note || `Recarga administrativa exacta ${requestedAmount.toFixed(2)} ${requestedCurrency} — sin margen ni impuestos`.slice(0, 255),
      referenceType: 'admin_recharge',
      referenceId: generateId('adj_'),
      rates
    });
    await conn.commit();

    const updated = await UserRepo.getById(user.id);
    const payload = {
      requestedAmount: roundMoney(requestedAmount),
      requestedCurrency,
      creditedAmount: mutation.walletAmount,
      creditedCurrency: clientCurrency,
      rateSource: 'rates_cache',
      newBalance: mutation.newBalance
    };
    await writeAdminClientLog('client_recharge', { adminId: req.user.id, clientId: user.id, ...payload }, { success: true });

    res.json({
      success: true,
      message: 'Recarga aplicada correctamente.',
      ...payload,
      client: normalizeClientForAdmin(updated)
    });
  } catch (error: any) {
    try { await conn.rollback(); } catch {}
    if (error?.code === 'FX_UNAVAILABLE') return res.status(503).json({ error: 'La tasa de cambio no está disponible. El saldo no fue modificado.' });
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  } finally {
    conn.release();
  }
});

app.post('/api/admin/clients/:id/clear-debt', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureWalletCurrencySchema();
    const note = String(req.body?.note || '').trim().slice(0, 160);
    await conn.beginTransaction();
    const user = await lockedWalletUser(conn, req.params.id);
    if (!isDoorDropClient(user)) {
      await conn.rollback();
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    const balance = roundMoney(Number(user.balance || 0));
    if (balance >= 0) {
      await conn.rollback();
      return res.json({ success: true, message: 'El cliente no tiene saldo pendiente.', creditedAmount: 0, client: normalizeClientForAdmin(user) });
    }

    const clientCurrency = normalizeCurrencyCode(user.currency || 'EUR');
    const creditedAmount = roundMoney(Math.abs(balance));
    const txId = generateId('wtx_');

    await conn.query('UPDATE users SET balance = 0 WHERE id = ?', [user.id]);
    await conn.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, currency, source_amount, source_currency, fx_rate, description, reference_type, reference_id, status, admin_note)
       VALUES (?, ?, 'credit', ?, ?, ?, ?, 1, ?, 'admin_debt_clear', ?, 'completed', ?)`,
      [txId, user.id, creditedAmount, clientCurrency, creditedAmount, clientCurrency, note || 'Ajuste administrativo de saldo pendiente', txId, note]
    );
    await conn.commit();

    const updated = await UserRepo.getById(user.id);
    await writeAdminClientLog('client_debt_clear', { adminId: req.user.id, clientId: user.id, creditedAmount, clientCurrency }, { success: true });

    res.json({
      success: true,
      message: 'Saldo pendiente ajustado correctamente.',
      creditedAmount,
      creditedCurrency: clientCurrency,
      client: normalizeClientForAdmin(updated)
    });
  } catch (error: any) {
    try { await conn.rollback(); } catch {}
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  } finally {
    conn.release();
  }
});

app.post('/api/admin/clients/:id/remove-card', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const user = await UserRepo.getById(req.params.id);
    if (!isDoorDropClient(user)) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    await UserRepo.update(user.id, { card_connected: 0, card_details_json: null });
    const updated = await UserRepo.getById(user.id);
    await writeAdminClientLog('client_card_removed', { adminId: req.user.id, clientId: user.id }, { success: true });

    res.json({ success: true, message: 'Tarjeta desvinculada correctamente.', client: normalizeClientForAdmin(updated) });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/admin/clients/:id/impersonate', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const user = await UserRepo.getById(req.params.id);
    if (!isDoorDropClient(user)) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    const token = generateToken({ userId: user.id, role: user.role, adminUserId: req.user.id, impersonated: true, authTokenVersion: Number(user.auth_token_version || 1) });
    await writeAdminClientLog('client_impersonation', { adminId: req.user.id, clientId: user.id }, { success: true });

    res.json({
      success: true,
      message: 'Acceso de cliente preparado correctamente.',
      token,
      client: normalizeClientForAdmin(user)
    });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

// Admin: Envíos
app.get('/api/admin/shipments', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const shipmentsList = await ShipmentRepo.getAll();
    const packageMap = new Map<string, any[]>();
    if (shipmentsList.length > 0) {
      const ids = shipmentsList.map((s: any) => s.id);
      const placeholders = ids.map(() => '?').join(',');
      const [pkgRows]: any = await pool.query(`SELECT * FROM shipment_packages WHERE shipment_id IN (${placeholders})`, ids);
      for (const pkg of pkgRows) {
        const list = packageMap.get(pkg.shipment_id) || [];
        list.push({ width: Number(pkg.width_cm || 10), height: Number(pkg.height_cm || 10), length: Number(pkg.length_cm || 10), weight: Number(pkg.weight_kg || 1), qty: Number(pkg.quantity || 1) });
        packageMap.set(pkg.shipment_id, list);
      }
    }

    const providersDb = await ProviderRepo.getAll().catch(() => []);
    const providerMap = new Map<string, any>(providersDb.map((p: any) => [String(p.code || '').toLowerCase(), p]));
    const quoteMap = new Map<string, any>();
    if (shipmentsList.length > 0) {
      const quoteIds = [...new Set(shipmentsList.map((s: any) => s.quote_id).filter(Boolean))];
      if (quoteIds.length) {
        const placeholders = quoteIds.map(() => '?').join(',');
        try {
          const [quoteRows]: any = await pool.query(`SELECT id, service_name, provider_payload_json FROM quotes WHERE id IN (${placeholders})`, quoteIds);
          for (const row of quoteRows) quoteMap.set(row.id, row);
        } catch {}
      }
    }

    const normalized = shipmentsList.map(s => {
      const provider = providerMap.get(String(s.provider_code || '').toLowerCase());
      const payload = parseJsonSafe(s.provider_payload_json);
      const quoteRow = quoteMap.get(s.quote_id);
      const quotePayload = parseJsonSafe(quoteRow?.provider_payload_json);
      const carrierSource = quotePayload?.carrierName || quotePayload?.raw?.ship24goCarrierName || quotePayload?.raw?.selectedService?.ship24goCarrierName || quotePayload?.raw?.courierService?.courier || quotePayload?.raw?.courier || quotePayload?.raw?.carrier || quotePayload?.raw?.nombre_agencia || payload?.detail?.data?.shipment?.carrier || payload?.detail?.data?.carrier || payload?.save?.data?.shipment?.carrier || payload?.carrierName || payload?.ship24goCarrierName || payload?.carrier || payload?.courier || payload?.tracking?.carrier || payload?.accept?.courier || payload?.service || payload?.service_name || quoteRow?.service_name || '';
      const providerInternalName = provider?.name || s.provider_code || 'Red logística';
      const carrierName = inferCarrierName(carrierSource || providerInternalName);
      return ({
      id: s.id,
      userId: s.user_id,
      trackingCode: s.tracking_code,
      providerTracking: s.provider_tracking_code || '',
      providerCode: s.provider_code || '',
      providerName: providerInternalName,
      providerInternalName,
      providerDisplayName: publicProviderName(provider || {}),
      carrierName,
      status: req.user.role === 'super_admin' ? (s.status_label || 'Creado') : customerPublicShipmentStatus(s),
      statusCode: req.user.role === 'super_admin' ? (s.status || 'created') : customerPublicShipmentStatusCode(s),
      labelStatus: s.label_status || (s.label_base64 || s.label_url ? 'available' : 'pending'),
      labelReady: Boolean(s.label_base64 || s.label_url),
      isDraft: String(s.status || '').toLowerCase() === 'draft',
      canEdit: isShipmentEditableBeforeLabel(s),
      canFinalize: String(s.status || '').toLowerCase() === 'draft',
      canRetryLabel: ['pending_provider','pending_label'].includes(String(s.status || '').toLowerCase()),
      labelDownloadUrl: (s.label_base64 || s.label_url) ? labelFileUrlForShipment(s) : '',
      providerAttempts: Number(s.provider_attempts || 0),
      createdAt: s.created_at,
      sender: typeof s.sender_json === 'string' ? JSON.parse(s.sender_json) : s.sender_json,
      recipient: typeof s.recipient_json === 'string' ? JSON.parse(s.recipient_json) : s.recipient_json,
      packages: packageMap.get(s.id) || [],
      quote: { agency: providerInternalName, carrier: carrierName, serviceName: quoteRow?.service_name || '' }
    });
    });
    res.json({ shipments: normalized });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

// Admin: Actualizar Estado del Envío
app.post('/api/admin/shipments/:id/status', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const { status } = req.body;
    const shipment = await ShipmentRepo.getById(req.params.id);
    if (!shipment) return res.status(404).json({ error: 'Envío no encontrado' });
    
    await ShipmentRepo.updateStatus(shipment.id, status.toLowerCase(), status);
    
    await TrackingEventRepo.create({
      shipment_id: shipment.id,
      tracking_code: shipment.tracking_code,
      status: status.toLowerCase(),
      status_label: status,
      description: `Estado actualizado a: ${status} por el administrador`
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});


// Admin: Paccofacile sandbox buy + label
app.post('/api/admin/shipments/:id/paccofacile-sandbox-label', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const result = await runPaccofacileBuyAndLabelForShipment(req.params.id, req.user?.id);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error: any) {
    await writeProviderLog('paccofacile', 'label_endpoint_failed', { shipmentId: req.params.id, adminId: req.user?.id }, { message: error?.message || 'No se pudo completar la operación.' }, 0).catch(() => null);
    res.status(500).json({ success: false, message: 'No se pudo completar la operación.' });
  }
});

// Admin: Proveedores
app.get('/api/admin/providers', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    await ensureProviderSeeds();
    const keys = await ApiKeysRepo.get();
    const providers = await enrichProvidersWithBalances(await ProviderRepo.getAll(), keys);
    res.json({ providers: providers.map(mapAdminProvider) });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/admin/providers', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    await ProviderRepo.updateAll(req.body.providers || []);
    const keys = await ApiKeysRepo.get();
    const providers = await enrichProvidersWithBalances(await ProviderRepo.getAll(), keys);
    res.json({ success: true, providers: providers.map(mapAdminProvider), message: 'Proveedor guardado correctamente.' });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/admin/providers/test', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  const { providerCode } = req.body;
  try {
    const keys = await ApiKeysRepo.get();
    if (providerCode === 'parcelabc') {
      const provider = await ProviderRepo.getByCode('parcelabc');
      const authToken = providerSecret('parcelabc', provider, keys);
      if (!authToken) {
        return res.json({ success: false, message: 'Credencial privada pendiente.' });
      }
      const requestPayload = {
        authToken,
        countryFrom: 'ES',
        countryTo: 'ES',
        zipFrom: '28001',
        zipTo: '08001',
        currency: provider?.currency || 'EUR',
        packages: [{ width: 10, height: 10, length: 10, weight: '1', qty: 1 }]
      };
      const response = await fetchWithTimeout(`${providerBaseUrl(provider, 'https://www.parcelabc.com/api-pabc.php')}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      });
      const data = await response.json().catch(() => ({ status: false, errorMessage: 'Respuesta no disponible.' }));
      await writeProviderLog('parcelabc', 'test_connection', requestPayload, data, response.status);
      if (data.status) {
        await pool.query("UPDATE providers SET is_connected = 1, last_connection_status = 'ok', last_connection_message = 'Proveedor conectado correctamente', last_tested_at = NOW() WHERE code = 'parcelabc'");
        return res.json({ success: true, message: 'Proveedor conectado correctamente.' });
      } else {
        await pool.query("UPDATE providers SET is_connected = 0, last_connection_status = 'failed', last_connection_message = ?, last_tested_at = NOW() WHERE code = 'parcelabc'", ['No se pudieron obtener opciones en la prueba']);
        return res.json({ success: false, message: 'No se pudieron obtener opciones en la prueba.' });
      }
    } else if (providerCode === 'genei') {
      const provider = await ProviderRepo.getByCode('genei');
      const credential = providerSecret('genei', provider, keys);
      if (!credential) {
        return res.json({ success: false, message: 'Credencial privada pendiente.' });
      }
      try {
        if (geneiApiMode(provider) === 'v1') {
          const { httpStatus, response: data } = await callGeneiV1(provider, keys, 'obtener_id_usuario', {});
          await writeProviderLog('genei', 'test_connection_v1', {}, data, httpStatus);
          if (data?.id_usuario) {
            await pool.query("UPDATE providers SET is_connected = 1, last_connection_status = 'ok', last_connection_message = 'Genei V1 conectado correctamente', last_tested_at = NOW() WHERE code = 'genei'");
            return res.json({ success: true, message: 'Proveedor conectado correctamente.' });
          }
          await pool.query("UPDATE providers SET is_connected = 0, last_connection_status = 'failed', last_connection_message = ?, last_tested_at = NOW() WHERE code = 'genei'", [data?.resultado_text || data?.message || 'No se pudo validar Genei']);
          return res.json({ success: false, message: 'No se pudo validar Genei.' });
        }
        const token = await getGeneiToken(credential);
        if (token) {
          await pool.query("UPDATE providers SET is_connected = 1, last_connection_status = 'ok', last_connection_message = 'Token generado con éxito', last_tested_at = NOW() WHERE code = 'genei'");
          return res.json({ success: true, message: 'Conexión exitosa con Genei. Token Bearer generado.' });
        }
      } catch (e: any) {
        await pool.query("UPDATE providers SET is_connected = 0, last_connection_status = 'failed', last_connection_message = ?, last_tested_at = NOW() WHERE code = 'genei'", [e.message || 'Error de conexión']);
        return res.json({ success: false, message: `No se pudo validar Genei.` });
      }
    } else if (providerCode === 'paccofacile') {
      const provider = await ProviderRepo.getByCode('paccofacile');
      const credentials = paccofacileCredentials(provider, keys);
      if (!credentials) {
        await pool.query("UPDATE providers SET is_connected = 0, last_connection_status = 'failed', last_connection_message = 'Credencial privada pendiente', last_tested_at = NOW() WHERE code = 'paccofacile'");
        return res.json({ success: false, message: 'Credencial privada pendiente.' });
      }
      const test = await runPaccofacileSandboxFullTest(provider, keys);
      await writeProviderLog('paccofacile', 'sandbox_full_test', { mode: paccofacileMode(provider) }, test, 200);
      if (test.ok) {
        await pool.query("UPDATE providers SET is_active = 1, is_connected = 1, last_connection_status = 'ok', last_connection_message = ?, last_tested_at = NOW() WHERE code = 'paccofacile'", [test.message || 'Paccofacile sandbox conectado correctamente']);
        return res.json({ success: true, message: test.message || 'Prueba sandbox completada correctamente.', result: test });
      }
      await pool.query("UPDATE providers SET is_connected = 0, last_connection_status = 'failed', last_connection_message = ?, last_tested_at = NOW() WHERE code = 'paccofacile'", [test.message || 'No se pudo validar Paccofacile']);
      return res.json({ success: false, message: test.message || 'No se pudo validar Paccofacile.', result: test });
    } else if (providerCode === 'spedirepro') {
      const provider = await ProviderRepo.getByCode('spedirepro');
      const credentials = spedireProCredentials(provider, keys);
      if (!credentials) {
        await pool.query("UPDATE providers SET is_connected = 0, last_connection_status = 'failed', last_connection_message = 'Credencial privada pendiente', last_tested_at = NOW() WHERE code = 'spedirepro'");
        return res.json({ success: false, message: 'Credencial privada pendiente.' });
      }
      const me = await callSpedirePro(provider, keys, 'GET', 'v1/me');
      await writeProviderLog('spedirepro', 'test_connection', {}, { httpStatus: me.httpStatus, hasBalance: me.response?.credits_amount !== undefined }, me.httpStatus);
      if (spedireProIsOk(me.httpStatus, me.response)) {
        const amount = Number(me.response?.credits_amount || 0);
        const message = `SpedirePro conectado correctamente. Saldo disponible: ${amount.toFixed(2)} ${provider?.currency || 'EUR'}`;
        await pool.query("UPDATE providers SET is_active = 1, is_connected = 1, last_connection_status = 'ok', last_connection_message = ?, last_tested_at = NOW() WHERE code = 'spedirepro'", [message]);
        return res.json({ success: true, message, result: { balance: amount, currency: provider?.currency || 'EUR' } });
      }
      await pool.query("UPDATE providers SET is_connected = 0, last_connection_status = 'failed', last_connection_message = ?, last_tested_at = NOW() WHERE code = 'spedirepro'", [spedireProMessage(me.response, 'No se pudo validar SpedirePro')]);
      return res.json({ success: false, message: spedireProMessage(me.response, 'No se pudo validar SpedirePro') });
    } else if (providerCode === 'spediamopro') {
      const provider = await ProviderRepo.getByCode('spediamopro');
      const credentials = spediamoProCredentials(provider, keys);
      if (!credentials) {
        await pool.query("UPDATE providers SET is_connected = 0, last_connection_status = 'failed', last_connection_message = 'Credencial privada pendiente', last_tested_at = NOW() WHERE code = 'spediamopro'");
        return res.json({ success: false, message: 'Credencial privada pendiente.' });
      }
      const wallet = await callSpediamoPro(provider, keys, 'GET', 'wallet');
      await writeProviderLog('spediamopro', 'test_connection', {}, { httpStatus: wallet.httpStatus, hasBalance: wallet.response?.data?.balance !== undefined, processId: wallet.response?.processId || null }, wallet.httpStatus);
      if (spediamoProIsOk(wallet.httpStatus, wallet.response)) {
        const cents = Number(wallet.response?.data?.balance || wallet.response?.balance || 0);
        const amount = cents / 100;
        const message = `SpediamoPro conectado correctamente. Saldo disponible: ${amount.toFixed(2)} ${provider?.currency || 'EUR'}`;
        await pool.query("UPDATE providers SET is_active = 1, is_connected = 1, last_connection_status = 'ok', last_connection_message = ?, last_tested_at = NOW() WHERE code = 'spediamopro'", [message]);
        return res.json({ success: true, message, result: { balance: amount, currency: provider?.currency || 'EUR' } });
      }
      await pool.query("UPDATE providers SET is_connected = 0, last_connection_status = 'failed', last_connection_message = ?, last_tested_at = NOW() WHERE code = 'spediamopro'", [spediamoProMessage(wallet.response, 'No se pudo validar SpediamoPro')]);
      return res.json({ success: false, message: spediamoProMessage(wallet.response, 'No se pudo validar SpediamoPro') });
    } else if (providerCode === 'easypost') {
      const provider = await ProviderRepo.getByCode('easypost');
      const credentials = easyPostCredentials(provider, keys);
      if (!credentials) {
        await pool.query("UPDATE providers SET is_connected = 0, last_connection_status = 'failed', last_connection_message = 'Credencial privada pendiente', last_tested_at = NOW() WHERE code = 'easypost'");
        return res.json({ success: false, message: 'Credencial privada pendiente.' });
      }
      const accounts = await callEasyPost(provider, keys, 'GET', 'carrier_accounts');
      await writeProviderLog('easypost', 'test_connection', {}, { httpStatus: accounts.httpStatus, hasAccounts: Array.isArray(accounts.response) || Array.isArray(accounts.response?.carrier_accounts) }, accounts.httpStatus);
      if (easyPostIsOk(accounts.httpStatus, accounts.response)) {
        const message = easyPostMode(provider) === 'production' ? 'EasyPost conectado correctamente en producción.' : 'EasyPost conectado correctamente en modo prueba.';
        await pool.query("UPDATE providers SET is_active = 1, is_connected = 1, last_connection_status = 'ok', last_connection_message = ?, last_tested_at = NOW() WHERE code = 'easypost'", [message]);
        return res.json({ success: true, message, result: { mode: easyPostMode(provider), currency: 'USD' } });
      }
      await pool.query("UPDATE providers SET is_connected = 0, last_connection_status = 'failed', last_connection_message = ?, last_tested_at = NOW() WHERE code = 'easypost'", [easyPostMessage(accounts.response, 'No se pudo validar EasyPost')]);
      return res.json({ success: false, message: easyPostMessage(accounts.response, 'No se pudo validar EasyPost') });
    } else if (providerCode === 'polar') {
      const polarToken = keys?.polarApiToken || process.env.POLAR_ACCESS_TOKEN || '';
      if (!polarToken) {
        await pool.query("UPDATE providers SET is_connected = 0, last_connection_status = 'failed', last_connection_message = 'Credencial privada pendiente', last_tested_at = NOW() WHERE code = 'polar'");
        return res.json({ success: false, message: 'Credencial privada pendiente.' });
      }

      const apiBase = getPolarApiBase(polarToken, keys?.polarEnvironment || process.env.POLAR_ENV || 'sandbox');
      const response = await fetch(`${apiBase}/v1/webhooks/endpoints`, {
        headers: { Authorization: `Bearer ${polarToken}`, Accept: 'application/json' }
      });

      const data = await response.json().catch(() => ({}));
      await writePolarProviderLog('test_connection', { apiBase }, data, response.status);

      if (response.ok) {
        await pool.query("UPDATE providers SET is_connected = 1, last_connection_status = 'ok', last_connection_message = 'Polar conectado correctamente', last_tested_at = NOW() WHERE code = 'polar'");
        return res.json({ success: true, message: 'Conexión exitosa con Polar.' });
      }

      await pool.query("UPDATE providers SET is_connected = 0, last_connection_status = 'failed', last_connection_message = 'No se pudo validar Polar', last_tested_at = NOW() WHERE code = 'polar'");
      return res.json({ success: false, message: 'No se pudo validar Polar. Revisa la credencial privada.' });
    } else {
      return res.json({ success: false, message: 'Proveedor no disponible todavía.' });
    }
  } catch (error: any) {
    console.error('Test connection error:', error);
    res.json({ success: false, message: `Error del servidor: ${error.message || error}` });
  }
});


app.get('/api/admin/polar/webhooks', authMiddleware, requireSuperAdmin, async (_req: any, res) => {
  try {
    const keys = await ApiKeysRepo.get();
    const polarToken = keys?.polarApiToken || process.env.POLAR_ACCESS_TOKEN || '';
    if (!polarToken) return res.status(400).json({ error: 'Credencial privada pendiente.' });

    const apiBase = getPolarApiBase(polarToken, keys?.polarEnvironment || process.env.POLAR_ENV || 'sandbox');
    const response = await fetch(`${apiBase}/v1/webhooks/endpoints`, {
      headers: { Authorization: `Bearer ${polarToken}`, Accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    await writePolarProviderLog('webhook_list', { apiBase }, data, response.status);

    if (!response.ok) return res.status(400).json({ error: 'No se pudo consultar Polar.' });

    res.json({ webhooks: data.items || data.result || data.data || data });
  } catch {
    res.status(500).json({ error: 'No se pudo consultar Polar.' });
  }
});

app.post('/api/admin/polar/webhook/create', authMiddleware, requireSuperAdmin, async (_req: any, res) => {
  try {
    const keys = await ApiKeysRepo.get();
    const polarToken = keys?.polarApiToken || process.env.POLAR_ACCESS_TOKEN || '';
    if (!polarToken) return res.status(400).json({ error: 'Credencial privada pendiente.' });

    const appUrl = process.env.APP_URL || 'https://doordrop.lat';
    const webhookUrl = `${appUrl}/api/webhooks/polar`;
    const apiBase = getPolarApiBase(polarToken, keys?.polarEnvironment || process.env.POLAR_ENV || 'sandbox');

    const payload = {
      url: webhookUrl,
      format: 'raw',
      enabled: true,
      name: 'DoorDrop Wallet y Suscripciones',
      events: [
        'checkout.created',
        'checkout.updated',
        'order.paid',
        'order.refunded',
        'subscription.created',
        'subscription.updated',
        'subscription.active',
        'subscription.canceled',
        'subscription.revoked',
        'subscription.past_due'
      ]
    };

    const response = await fetch(`${apiBase}/v1/webhooks/endpoints`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${polarToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data: any = await response.json().catch(() => ({}));
    await writePolarProviderLog('webhook_create', { url: webhookUrl, events: payload.events }, data, response.status);

    if (!response.ok) {
      return res.status(400).json({ error: 'No se pudo crear el webhook en Polar.' });
    }

    await pool.query(
      `UPDATE api_keys
       SET polarWebhookId = ?, polarWebhookSecret = ?, polarWebhookUrl = ?
       WHERE id = 1`,
      [data.id || '', data.secret || '', webhookUrl]
    );

    await pool.query(
      `UPDATE providers
       SET is_active = 1, is_connected = 1, last_connection_status = 'ok',
           last_connection_message = 'Webhook configurado correctamente', last_tested_at = NOW()
       WHERE code = 'polar'`
    );

    res.json({
      success: true,
      message: 'Webhook de Polar configurado correctamente.',
      webhook: {
        id: data.id,
        url: webhookUrl,
        enabled: data.enabled
      }
    });
  } catch (error: any) {
    console.error('[Polar] webhook create error:', error?.message || error);
    res.status(500).json({ error: 'No se pudo crear el webhook en Polar.' });
  }
});

app.post('/api/webhooks/polar', async (req: any, res) => {
  try {
    await ensureShip24GoBillingColumns();
    await ensureWalletCurrencySchema();
    const keys = await ApiKeysRepo.get();
    let webhookSecret = String(keys?.polarWebhookSecret || '').trim();
    if (!webhookSecret) {
      try {
        const [secretRows]: any = await pool.query(
          `SELECT setting_value
             FROM admin_settings
            WHERE setting_key IN ('payments.polar.webhook_secret', 'polar.webhook_secret')
              AND setting_value IS NOT NULL AND setting_value <> ''
            ORDER BY CASE setting_key WHEN 'payments.polar.webhook_secret' THEN 0 ELSE 1 END
            LIMIT 1`
        );
        webhookSecret = String(secretRows?.[0]?.setting_value || '').trim();
      } catch {}
    }
    const rawBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString('utf8')
      : JSON.stringify(req.body || {});
    if (!webhookSecret) {
      console.error('[Polar] Webhook rejected: secret is not configured.');
      return res.status(503).json({ received: false, error: 'Webhook de Polar pendiente de configuración.' });
    }

    let payload: any;
    try {
      payload = validatePolarWebhookEvent(rawBody, req.headers, webhookSecret);
    } catch (error: any) {
      if (error instanceof PolarWebhookVerificationError) {
        console.warn('[Polar] Webhook rejected: invalid signature.');
        return res.status(403).json({ received: false });
      }

      // Signature verification already ran before the SDK schema parser. If
      // Polar adds a field or event variant before this SDK is updated, keep
      // the signed event acknowledged instead of causing endless retries.
      try {
        payload = JSON.parse(rawBody);
        console.warn('[Polar] Signed webhook accepted with an unrecognized payload shape.');
      } catch {
        console.error('[Polar] Webhook payload could not be parsed after signature verification.');
        return res.status(400).json({ received: false });
      }
    }

    const eventType = payload.type || payload.event || payload.name || '';
    const data = payload.data || payload.payload || payload;
    const metadata = data.metadata || data.checkout?.metadata || data.order?.metadata || {};
    const topupId = metadata.topup_id || metadata.topupId || null;
    const purpose = metadata.purpose || '';

    const eventId = String(req.headers['webhook-id'] || payload.id || data.id || `${eventType}:${Date.now()}`);
    const [eventRows]: any = await pool.query(
      `SELECT id FROM payment_webhook_events WHERE provider = 'polar' AND event_id = ? LIMIT 1`,
      [eventId]
    );
    if (eventRows?.length) return res.status(202).json({ received: true, duplicate: true });
    await pool.query(
      `INSERT INTO payment_webhook_events (provider, event_id, event_type, status, payload_json)
       VALUES ('polar', ?, ?, 'received', ?)`,
      [eventId, eventType, JSON.stringify(payload)]
    );

    await writePolarProviderLog('webhook_received', { eventType, topupId, purpose, eventId }, payload, 202);

    const isPaidEvent =
      eventType === 'order.paid' ||
      (eventType === 'checkout.updated' && String(data.status || '').toLowerCase() === 'succeeded');

    let walletNotification: any = null;
    if (isPaidEvent && purpose === 'wallet_topup' && topupId) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [rows]: any = await conn.query(
          `SELECT * FROM wallet_topups WHERE id = ? FOR UPDATE`,
          [topupId]
        );

        const topup = rows?.[0];
        if (topup && !['paid', 'completed', 'success'].includes(String(topup.status || '').toLowerCase())) {
          const amount = roundMoney(Number(topup.amount || metadata.requested_amount || metadata.amount || 0));
          if (!amount || amount <= 0) { throw new Error('Monto de recarga no válido.'); }
          const currency = normalizeCurrencyCode(topup.currency || metadata.currency || 'EUR');

          await conn.query(
            `UPDATE wallet_topups
             SET status = 'completed', provider_reference = ?
             WHERE id = ?`,
            [data.id || data.order_id || data.checkout_id || topup.provider_reference || topupId, topupId]
          );

          const rates = await getFreshRatesInternal();
          const mutation = await applyWalletMutation(conn, {
            userId: topup.user_id,
            type: 'credit',
            amount,
            currency,
            description: 'Recarga confirmada por Polar — saldo exacto',
            referenceType: 'wallet_topup',
            referenceId: topupId,
            rates
          });

          walletNotification = {
            userId: topup.user_id,
            email: mutation.user?.email || '',
            name: mutation.user?.name || '',
            language: mutation.user?.country || 'es',
            amount: mutation.walletAmount,
            currency: mutation.walletCurrency,
            newBalance: mutation.newBalance,
            paymentMethod: topup.payment_provider || 'Polar'
          };
        }

        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }

    if (walletNotification?.email) {
      await sendNotificationEvent({
          eventCode: 'wallet_topup_success',
          entityType: 'wallet_topup',
          entityId: String(topupId),
          userId: walletNotification.userId,
          audience: 'customer',
          toEmail: walletNotification.email,
          recipientName: walletNotification.name,
          language: walletNotification.language,
          variables: {
            userName: walletNotification.name,
            amount: Number(walletNotification.amount).toFixed(2),
            currency: walletNotification.currency,
            newBalance: Number(walletNotification.newBalance).toFixed(2),
            paymentMethod: walletNotification.paymentMethod,
            panelUrl: `${(process.env.APP_URL || 'https://doordrop.lat').replace(/\/+$/, '')}/panel/billing`
          }
        }).catch(() => null);
      }
    }

    const failedPaymentStatus = String(data.status || '').toLowerCase();
    const isFailedWalletEvent =
      ['order.failed', 'order.canceled', 'order.cancelled', 'checkout.failed', 'payment.failed'].includes(String(eventType).toLowerCase())
      || (eventType === 'checkout.updated' && ['failed', 'canceled', 'cancelled', 'expired'].includes(failedPaymentStatus));
    if (isFailedWalletEvent && purpose === 'wallet_topup' && topupId) {
      const [topupRows]: any = await pool.query(
        `SELECT t.id, t.user_id, t.amount, t.currency, t.payment_provider, u.name, u.email, u.country
         FROM wallet_topups t LEFT JOIN users u ON u.id = t.user_id
         WHERE t.id = ? AND t.status NOT IN ('completed','paid','success') LIMIT 1`,
        [topupId]
      );
      const topup = topupRows?.[0];
      if (topup) {
        await pool.query('UPDATE wallet_topups SET status = \'failed\', provider_reference = COALESCE(provider_reference, ?) WHERE id = ?', [data.id || data.order_id || topupId, topupId]);
        if (isValidEmailForProvider(topup.email)) {
          await sendNotificationEvent({
            eventCode: 'wallet_topup_failed',
            entityType: 'wallet_topup',
            entityId: String(topup.id),
            userId: topup.user_id,
            audience: 'customer',
            toEmail: topup.email,
            recipientName: topup.name || '',
            language: topup.country || 'es',
            variables: {
              userName: topup.name || topup.email,
              amount: Number(topup.amount || 0).toFixed(2),
              currency: String(topup.currency || 'EUR').toUpperCase(),
              paymentMethod: topup.payment_provider || 'Polar',
              billingUrl: `${(process.env.APP_URL || 'https://doordrop.lat').replace(/\/+$/, '')}/panel/billing`,
              errorMessage: 'El proveedor de pago no confirmó la recarga. No se acreditó saldo.'
            }
          }).catch(() => null);
        }
      }
    }

    if (eventType.startsWith('subscription.')) {
      const subscriptionData: any = data.subscription || data;
      const providerSubscriptionId = String(
        subscriptionData.id || subscriptionData.subscription_id || payload.subscription_id || ''
      ).trim();
      const providerCustomerId = String(
        subscriptionData.customer?.id || subscriptionData.customer_id || subscriptionData.external_customer_id || ''
      ).trim() || null;
      const providerProductId = String(
        subscriptionData.product_id || subscriptionData.product?.id || metadata.polar_product_id || ''
      ).trim();
      const metadataUserId = String(
        metadata.user_id || metadata.userId || metadata.external_customer_id || ''
      ).trim();
      const metadataPlanId = String(
        metadata.omnichannel_plan_id || metadata.plan_id || ''
      ).trim();
      const metadataPlanCode = String(
        metadata.omnichannel_plan_code || metadata.plan_code || ''
      ).trim();

      let userId = metadataUserId;
      let existingSubscription: any = null;
      if (providerSubscriptionId) {
        const [existingRows]: any = await pool.query(
          `SELECT * FROM omnichannel_subscriptions
            WHERE provider = 'polar' AND provider_subscription_id = ?
            LIMIT 1`,
          [providerSubscriptionId]
        );
        existingSubscription = existingRows?.[0] || null;
        if (!userId && existingSubscription?.user_id) userId = String(existingSubscription.user_id);
      }

      let plan: any = null;
      if (metadataPlanId || metadataPlanCode) {
        const [planRows]: any = await pool.query(
          `SELECT * FROM omnichannel_plan_catalog
            WHERE is_active = 1 AND (id = ? OR code = ?)
            LIMIT 1`,
          [metadataPlanId || metadataPlanCode, metadataPlanCode || metadataPlanId]
        );
        plan = planRows?.[0] || null;
      }
      if (!plan && providerProductId) {
        const [planRows]: any = await pool.query(
          `SELECT * FROM omnichannel_plan_catalog
            WHERE is_active = 1 AND polar_product_id = ?
            LIMIT 1`,
          [providerProductId]
        );
        plan = planRows?.[0] || null;
      }
      if (!plan && existingSubscription?.plan_code) {
        const [planRows]: any = await pool.query(
          `SELECT * FROM omnichannel_plan_catalog
            WHERE is_active = 1 AND code = ?
            LIMIT 1`,
          [existingSubscription.plan_code]
        );
        plan = planRows?.[0] || null;
      }

      const rawStatus = String(subscriptionData.status || '').toLowerCase();
      let entitlementStatus = rawStatus;
      if (eventType === 'subscription.active') entitlementStatus = 'active';
      else if (eventType === 'subscription.past_due') entitlementStatus = 'past_due';
      else if (eventType === 'subscription.canceled' || eventType === 'subscription.cancelled') entitlementStatus = 'canceled';
      else if (eventType === 'subscription.revoked') entitlementStatus = 'revoked';
      if (!['active', 'trialing', 'past_due', 'canceled', 'cancelled', 'revoked', 'expired', 'pending'].includes(entitlementStatus)) {
        entitlementStatus = 'pending';
      }

      const periodStart = subscriptionData.current_period_start || subscriptionData.period_start || null;
      const periodEnd = subscriptionData.current_period_end || subscriptionData.period_end || null;
      let metadataAddOns: any[] = [];
      if (Array.isArray(metadata.add_ons)) {
        metadataAddOns = metadata.add_ons;
      } else if (typeof metadata.add_ons === 'string') {
        try {
          const parsed = JSON.parse(metadata.add_ons);
          metadataAddOns = Array.isArray(parsed) ? parsed : [metadata.add_ons];
        } catch {
          metadataAddOns = metadata.add_ons.split(',');
        }
      }
      const addOnCodes = [...new Set(metadataAddOns.map((value: any) => String(value || '').trim()).filter(Boolean))];
      let addOnTotal = 0;
      let commentAutomation = 0;
      let autoPublish = 0;
      let extraChannels = 0;
      for (const addOnCode of addOnCodes) {
        const [addOnRows]: any = await pool.query(
          `SELECT price FROM omnichannel_addon_catalog
            WHERE code = ? AND is_active = 1
            LIMIT 1`,
          [addOnCode]
        );
        const addOn = addOnRows?.[0];
        if (!addOn) continue;
        addOnTotal += Number(addOn.price || 0);
        if (addOnCode === 'comment_automation') commentAutomation = 1;
        if (addOnCode === 'auto_publish') autoPublish = 1;
        if (addOnCode === 'extra_channel') extraChannels += 1;
      }
      if (userId && plan && providerSubscriptionId) {
        const [userRows]: any = await pool.query('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
        if (userRows?.length) {
          await pool.query(
            `INSERT INTO omnichannel_subscriptions
              (user_id, plan_code, status, provider, provider_subscription_id, provider_customer_id,
               polar_product_id, channels_limit, ai_enabled, comment_automation, auto_publish,
               extra_channels_count, monthly_price, currency, renews_at, current_period_start,
               current_period_end, last_payment_status, last_provider_event_id, metadata_json)
             VALUES (?, ?, ?, 'polar', ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               plan_code = VALUES(plan_code), status = VALUES(status), provider = 'polar',
               provider_subscription_id = VALUES(provider_subscription_id),
               provider_customer_id = VALUES(provider_customer_id), polar_product_id = VALUES(polar_product_id),
               channels_limit = VALUES(channels_limit), ai_enabled = VALUES(ai_enabled),
               comment_automation = VALUES(comment_automation), auto_publish = VALUES(auto_publish),
               extra_channels_count = VALUES(extra_channels_count),
               monthly_price = VALUES(monthly_price), currency = VALUES(currency),
               renews_at = COALESCE(VALUES(renews_at), renews_at),
               current_period_start = COALESCE(VALUES(current_period_start), current_period_start),
               current_period_end = COALESCE(VALUES(current_period_end), current_period_end),
               last_payment_status = VALUES(last_payment_status),
               last_provider_event_id = VALUES(last_provider_event_id), metadata_json = VALUES(metadata_json),
               updated_at = CURRENT_TIMESTAMP`,
            [
              userId,
              plan.code,
              entitlementStatus,
              providerSubscriptionId,
              providerCustomerId,
              providerProductId || plan.polar_product_id || null,
              Number(plan.channels_limit || 0),
              commentAutomation,
              autoPublish,
              extraChannels,
              Number(plan.price || 0) + addOnTotal,
              String(plan.currency || 'USD').toUpperCase(),
              periodEnd,
              periodStart,
              periodEnd,
              rawStatus || entitlementStatus,
              eventId,
              JSON.stringify({ ...metadata, provider_event_id: eventId })
            ]
          );

          const [pendingPayments]: any = await pool.query(
            `SELECT id FROM subscription_payments
              WHERE user_id = ? AND plan_id = ? AND provider = 'polar' AND status = 'pending'
              ORDER BY created_at DESC LIMIT 1`,
            [userId, plan.id]
          );
          if (pendingPayments?.[0]?.id) {
            await pool.query(
              `UPDATE subscription_payments
                  SET status = ?, provider_payment_id = COALESCE(provider_payment_id, ?),
                      provider_subscription_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
              [entitlementStatus === 'active' || entitlementStatus === 'trialing' ? 'completed' : entitlementStatus, subscriptionData.order_id || subscriptionData.order?.id || null, providerSubscriptionId, pendingPayments[0].id]
            );
          }
        } else {
          await writePolarProviderLog('omnichannel_subscription_unknown_user', { eventType, eventId }, { userId }, 422);
        }
      } else {
        await writePolarProviderLog(
          'omnichannel_subscription_unmapped',
          { eventType, eventId, hasUserId: Boolean(userId), hasPlan: Boolean(plan), hasSubscriptionId: Boolean(providerSubscriptionId) },
          {},
          422
        );
      }
      await writePolarProviderLog('subscription_event', { eventType, eventId, module: 'omnichannel' }, { status: entitlementStatus }, 202);
    }

    await pool.query(
      `UPDATE payment_webhook_events
          SET status = 'processed', processed_at = CURRENT_TIMESTAMP
        WHERE provider = 'polar' AND event_id = ?`,
      [eventId]
    );

    res.status(202).json({ received: true });
  } catch (error: any) {
    console.error('[Polar] webhook error:', error?.message || error);
    res.status(500).json({ received: false });
  }
});



app.get('/api/admin/polar/status', authMiddleware, requireSuperAdmin, async (_req: any, res) => {
  try {
    const keys = await ApiKeysRepo.get();
    res.json({
      webhookUrl: keys?.polarWebhookUrl || ship24goPolarWebhookUrl(),
      polarConfigured: Boolean(keys?.polarApiToken || process.env.POLAR_ACCESS_TOKEN),
      walletProductId: keys?.polarWalletProductId || keys?.polarProductId || '',
      subscriptionProductId: keys?.polarSubscriptionProductId || '',
      webhookId: keys?.polarWebhookId || '',
      webhookSecretConfigured: Boolean(keys?.polarWebhookSecret)
    });
  } catch {
    res.status(500).json({ error: 'No se pudo consultar la configuración de Polar.' });
  }
});

app.post('/api/admin/polar/webhook/create', authMiddleware, requireSuperAdmin, async (_req: any, res) => {
  try {
    const keys = await ApiKeysRepo.get();
    const polarToken = keys?.polarApiToken || process.env.POLAR_ACCESS_TOKEN || '';
    if (!polarToken) return res.status(400).json({ error: 'Credencial privada pendiente.' });

    const webhookUrl = ship24goPolarWebhookUrl();
    const apiBase = ship24goPolarApiBase(polarToken, keys?.polarEnvironment || process.env.POLAR_ENV || 'sandbox');

    const payload = {
      url: webhookUrl,
      format: 'raw',
      name: 'DoorDrop Wallet y Suscripciones',
      enabled: true,
      events: [
        'order.paid',
        'order.refunded',
        'subscription.created',
        'subscription.updated',
        'subscription.active',
        'subscription.canceled',
        'subscription.revoked',
        'checkout.created',
        'checkout.updated'
      ]
    };

    const response = await fetch(`${apiBase}/v1/webhooks/endpoints`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${polarToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data: any = await response.json().catch(() => ({}));
    await ship24goPolarLog('webhook_create', { url: webhookUrl, events: payload.events }, data, response.status);

    if (!response.ok) {
      return res.status(400).json({
        error: 'No se pudo crear el webhook automáticamente. Puedes copiar la URL y agregarla manualmente en Polar.'
      });
    }

    await pool.query(
      `UPDATE api_keys
       SET polarWebhookId = ?, polarWebhookSecret = ?, polarWebhookUrl = ?
       WHERE id = 1`,
      [data.id || '', data.secret || '', webhookUrl]
    );

    await pool.query(
      `UPDATE providers
       SET is_active = 1, is_connected = 1, last_connection_status = 'ok',
           last_connection_message = 'Webhook configurado correctamente', last_tested_at = NOW()
       WHERE code = 'polar'`
    );

    res.json({
      success: true,
      message: 'Webhook de Polar configurado correctamente.',
      webhookUrl,
      webhook: data
    });
  } catch (error: any) {
    console.error('[Polar] webhook create error:', error?.message || error);
    res.status(500).json({ error: 'No se pudo crear el webhook de Polar.' });
  }
});

app.post('/api/admin/polar/products/sync', authMiddleware, requireSuperAdmin, async (_req: any, res) => {
  try {
    await ensureShip24GoBillingColumns();
    const keys = await ApiKeysRepo.get();
    const polarConfig = await ship24goPolarRuntimeConfig(keys);
    const polarToken = polarConfig.token;

    if (!polarToken) {
      return res.status(400).json({ error: 'Credencial privada de Polar pendiente.' });
    }

    const environment = polarConfig.environment || 'sandbox';
    const apiBase = ship24goPolarApiBase(polarToken, environment);

    const [plansRows]: any = await pool.query(`
      SELECT id, code, name, price, currency, discount_percent, features_json, is_active,
             polar_product_id, polar_price_id, polar_sync_status
      FROM plans
      WHERE is_active = 1
        AND price > 0
        AND code NOT LIKE 'polar_%'
        AND name NOT LIKE 'Factura INV-%'
        AND name NOT LIKE 'VPS -%'
        AND name NOT LIKE 'Private Package%'
        AND name NOT LIKE 'Subscription Package%'
        AND name NOT LIKE 'Life Time%'
      ORDER BY price ASC, name ASC
    `);

    if (!plansRows.length) {
      return res.status(400).json({ error: 'No hay planes internos de DoorDrop para publicar.' });
    }

    const listResponse = await fetch(`${apiBase}/v1/products/?limit=100`, {
      headers: { Authorization: `Bearer ${polarToken}`, Accept: 'application/json' }
    });
    const listData: any = await listResponse.json().catch(() => ({}));

    if (!listResponse.ok) {
      await ship24goPolarLog('ship24go_publish_list_error', { apiBase, environment }, listData, listResponse.status);
      return res.status(400).json({ error: 'No se pudo conectar con Polar. Revisa las credenciales y el ambiente.' });
    }

    const existingProducts = Array.isArray(listData.items)
      ? listData.items
      : Array.isArray(listData.data)
        ? listData.data
        : Array.isArray(listData.result)
          ? listData.result
          : Array.isArray(listData.products)
            ? listData.products
            : [];

    const byShip24GoPlanId = new Map<string, any>();
    for (const product of existingProducts) {
      const metadata = product.metadata || {};
      const planId = metadata.local_plan_id || metadata.ship24go_plan_id;
      if (metadata.source === 'ship24go' && planId) byShip24GoPlanId.set(String(planId), product);
    }

    function cleanName(name: string) {
      return String(name || 'DoorDrop Plan').trim().slice(0, 64);
    }

    function planCurrency(plan: any) {
      return String(plan.currency || 'EUR').toLowerCase().slice(0, 3);
    }

    function planCents(plan: any) {
      return Math.max(0, Math.round(Number(plan.price || 0) * 100));
    }

    function planPrices(plan: any) {
      const cents = planCents(plan);
      if (cents <= 0) return [{ amount_type: 'free' }];
      const currency = planCurrency(plan);
      const prices: any[] = [
        { amount_type: 'fixed', price_amount: cents, price_currency: 'usd' }
      ];
      if (currency && currency !== 'usd') {
        prices.push({ amount_type: 'fixed', price_amount: cents, price_currency: currency });
      }
      return prices;
    }

    function findPriceIdByCurrency(obj: any, currency: string): string {
      if (!obj || typeof obj !== 'object') return '';
      if (Array.isArray(obj)) {
        for (const item of obj) {
          const found = findPriceIdByCurrency(item, currency);
          if (found) return found;
        }
        return '';
      }
      const current = String(obj.price_currency || obj.currency || '').toLowerCase();
      if (obj.id && current === String(currency || '').toLowerCase()) return String(obj.id);
      for (const key of Object.keys(obj)) {
        const found = findPriceIdByCurrency(obj[key], currency);
        if (found) return found;
      }
      return '';
    }

    function findAnyPriceId(obj: any): string {
      if (!obj || typeof obj !== 'object') return '';
      if (Array.isArray(obj)) {
        for (const item of obj) {
          const found = findAnyPriceId(item);
          if (found) return found;
        }
        return '';
      }
      if (obj.id && (obj.amount_type || obj.price_amount || obj.price_currency || obj.currency || obj.type === 'recurring' || obj.type === 'price')) return String(obj.id);
      for (const key of Object.keys(obj)) {
        const found = findAnyPriceId(obj[key]);
        if (found) return found;
      }
      return '';
    }

    async function createOrLoadPlanProduct(plan: any) {
      const existing = plan.polar_product_id
        ? existingProducts.find((p: any) => String(p.id) === String(plan.polar_product_id))
        : byShip24GoPlanId.get(String(plan.id));

      let data = existing || null;
      let status = 200;
      let action = existing ? 'existing' : 'created';

      if (!data?.id) {
        const payload = {
          name: cleanName(plan.name),
          description: `DoorDrop ${plan.name} - plan de suscripción`,
          visibility: 'public',
          recurring_interval: 'month',
          recurring_interval_count: 1,
          prices: planPrices(plan),
          metadata: {
            source: 'ship24go',
            local_plan_id: String(plan.id),
            ship24go_plan_id: String(plan.id),
            ship24go_plan_code: String(plan.code || ''),
            ship24go_environment: environment
          }
        };

        const response = await fetch(`${apiBase}/v1/products/`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${polarToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload)
        });
        data = await response.json().catch(() => ({}));
        status = response.status;
        await ship24goPolarLog('ship24go_plan_create', { planId: plan.id, payload }, data, response.status);
      }

      if (!data?.id) {
        await pool.query(`UPDATE plans SET polar_sync_status = 'failed' WHERE id = ?`, [plan.id]);
        return { ok: false, plan_id: plan.id, plan_name: plan.name, status, error: data };
      }

      const preferredCurrency = planCurrency(plan);
      const priceId = findPriceIdByCurrency(data, preferredCurrency) || findPriceIdByCurrency(data, 'eur') || findPriceIdByCurrency(data, 'usd') || findAnyPriceId(data);

      await pool.query(
        `UPDATE plans
         SET polar_product_id = ?,
             polar_price_id = ?,
             polar_sync_status = ?,
             polar_last_synced_at = NOW()
         WHERE id = ?`,
        [data.id, priceId || '', priceId ? 'synced' : 'failed', plan.id]
      );

      return {
        ok: Boolean(priceId),
        plan_id: plan.id,
        plan_name: plan.name,
        polar_product_id: data.id,
        polar_price_id: priceId || '',
        action,
        status
      };
    }

    const [omnichannelRows]: any = await pool.query(`
      SELECT id, code, name, description, price, currency, features_json, is_active,
             polar_product_id, polar_price_id, polar_enabled
      FROM omnichannel_plan_catalog
      WHERE is_active = 1
        AND polar_enabled = 1
        AND price > 0
      ORDER BY price ASC, name ASC
    `);

    const [omnichannelAddonRows]: any = await pool.query(`
      SELECT id, code, name, description, price, currency, is_active,
             polar_product_id, polar_price_id, polar_enabled
      FROM omnichannel_addon_catalog
      WHERE is_active = 1
        AND polar_enabled = 1
        AND price > 0
      ORDER BY price ASC, name ASC
    `);

    async function createOrLoadCatalogProduct(item: any, catalogType: 'omnichannel_plan' | 'omnichannel_addon') {
      const existing = item.polar_product_id
        ? existingProducts.find((product: any) => String(product.id) === String(item.polar_product_id))
        : null;
      const metadataMatch = existing || existingProducts.find((product: any) => {
        const metadata = product.metadata || {};
        return metadata.source === 'ship24go'
          && metadata.catalog_type === catalogType
          && String(metadata.local_catalog_id || '') === String(item.id);
      });

      let data = metadataMatch || null;
      let status = metadataMatch ? 200 : null;
      let action = metadataMatch ? 'existing' : 'created';

      if (!data?.id) {
        const payload = {
          name: cleanName(item.name),
          description: String(item.description || `DoorDrop ${item.name || 'Omnicanal'}`).slice(0, 500),
          visibility: 'public',
          recurring_interval: 'month',
          recurring_interval_count: 1,
          prices: planPrices(item),
          metadata: {
            source: 'ship24go',
            catalog_type: catalogType,
            local_catalog_id: String(item.id),
            ship24go_catalog_code: String(item.code || ''),
            ship24go_environment: environment
          }
        };

        const response = await fetch(`${apiBase}/v1/products/`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${polarToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload)
        });
        data = await response.json().catch(() => ({}));
        status = response.status;
        await ship24goPolarLog('ship24go_catalog_product_create', { catalogType, catalogId: item.id, payload }, data, response.status);
      }

      const productId = String(data?.id || data?.product?.id || '');
      const preferredCurrency = planCurrency(item);
      const priceId = findPriceIdByCurrency(data, preferredCurrency) || findPriceIdByCurrency(data, 'eur') || findPriceIdByCurrency(data, 'usd') || findAnyPriceId(data);
      const table = catalogType === 'omnichannel_plan' ? 'omnichannel_plan_catalog' : 'omnichannel_addon_catalog';

      if (productId && priceId) {
        await pool.query(
          `UPDATE ${table}
           SET polar_product_id = ?, polar_price_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [productId, priceId, item.id]
        );
      }

      return {
        ok: Boolean(productId && priceId),
        catalog_type: catalogType,
        catalog_id: item.id,
        catalog_code: item.code,
        catalog_name: item.name,
        currency: item.currency,
        product_id: productId || '',
        price_id: priceId || '',
        action,
        status
      };
    }

    const results: any[] = [];
    for (const plan of plansRows) {
      const result = await createOrLoadPlanProduct(plan);
      results.push(result);
    }

    const omnichannelPlanResults: any[] = [];
    for (const plan of omnichannelRows) {
      omnichannelPlanResults.push(await createOrLoadCatalogProduct(plan, 'omnichannel_plan'));
    }

    const omnichannelAddonResults: any[] = [];
    for (const addon of omnichannelAddonRows) {
      omnichannelAddonResults.push(await createOrLoadCatalogProduct(addon, 'omnichannel_addon'));
    }

    const walletExisting = existingProducts.find((p: any) => p?.metadata?.source === 'ship24go' && p?.metadata?.purpose === 'wallet_topup');
    let walletProductId = walletExisting?.id || '';
    let walletStatus = walletExisting?.id ? 'existing' : 'pending';
    let walletError: any = null;

    if (!walletProductId) {
      const walletPayload: any = {
        name: 'DoorDrop Wallet Recarga',
        description: 'Producto interno para recargas variables de saldo DoorDrop.',
        visibility: 'public',
        prices: [
          { amount_type: 'fixed', price_amount: 100, price_currency: 'usd' },
          { amount_type: 'fixed', price_amount: 100, price_currency: 'eur' }
        ],
        metadata: { source: 'ship24go', purpose: 'wallet_topup', ship24go_environment: environment }
      };

      const walletResponse = await fetch(`${apiBase}/v1/products/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${polarToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(walletPayload)
      });
      const walletData: any = await walletResponse.json().catch(() => ({}));
      await ship24goPolarLog('ship24go_wallet_product_publish', walletPayload, walletData, walletResponse.status);
      if (walletResponse.ok && walletData?.id) {
        walletProductId = walletData.id;
        walletStatus = 'created';
      } else {
        walletStatus = 'failed';
        walletError = walletData;
      }
    }

    const success = results.filter(r => r.ok);
    const allProductResults = [...results, ...omnichannelPlanResults, ...omnichannelAddonResults];
    const failed = allProductResults.filter(r => !r.ok);
    const firstSubscription = success.find(r => r.plan_id !== 'plan_basic')?.polar_product_id || success[0]?.polar_product_id || '';

    await pool.query(
      `UPDATE api_keys
       SET polarWalletProductId = COALESCE(NULLIF(?, ''), polarWalletProductId),
           polarProductId = COALESCE(NULLIF(polarProductId, ''), ?),
           polarSubscriptionProductId = COALESCE(NULLIF(polarSubscriptionProductId, ''), ?),
           polarWebhookUrl = COALESCE(NULLIF(polarWebhookUrl, ''), ?)
       WHERE id = 1`,
      [walletProductId, firstSubscription, firstSubscription, ship24goPolarWebhookUrl()]
    );

    await pool.query(
      `UPDATE providers
       SET is_active = 1,
           is_connected = 1,
           last_connection_status = ?,
           last_connection_message = ?,
           last_tested_at = NOW()
       WHERE code = 'polar'`,
      [failed.length ? 'warning' : 'ok', failed.length ? 'Sincronización parcial de planes Polar' : 'Planes DoorDrop publicados en Polar']
    );

    const [freshPlans]: any = await pool.query(`
      SELECT id, code, name, price, currency, discount_percent, features_json, is_active,
             polar_product_id, polar_price_id, polar_sync_status, polar_last_synced_at
      FROM plans
      WHERE is_active = 1
        AND code NOT LIKE 'polar_%'
      ORDER BY price ASC, name ASC
    `);

    res.json({
      success: failed.length === 0,
      message: failed.length
        ? `Se sincronizaron ${success.length} planes y ${failed.length} quedaron pendientes.`
        : `Planes DoorDrop sincronizados correctamente.`,
      walletProductId,
      walletStatus,
      walletError,
      subscriptionProductId: firstSubscription,
      results,
      omnichannelPlans: omnichannelPlanResults,
      omnichannelAddons: omnichannelAddonResults,
      plans: freshPlans.map(ship24goPublicPlan)
    });
  } catch (error: any) {
    console.error('[Polar] ship24go publish products error:', error?.message || error);
    res.status(500).json({ error: 'No se pudieron publicar los planes DoorDrop en Polar.' });
  }
});


// SHIP24GO_BANK_TRANSFER_WALLET_ENDPOINTS_V1435
app.get('/api/bank-accounts', authMiddleware, async (req: any, res) => {
  try {
    await ensureBankTransferWalletTables();
    const user = await UserRepo.getById(req.user.id);
    const lang = String(req.query.lang || user?.language || 'es').slice(0, 5);
    const requestedCurrency = normalizeCurrencyCode(req.query.currency || user?.currency || 'EUR');
    const [rows]: any = await pool.query(
      `SELECT * FROM bank_accounts WHERE is_active = 1 AND currency = ? ORDER BY sort_order ASC`,
      [requestedCurrency]
    );
    const exact = rows || [];
    let accounts = exact;
    if (!accounts.length) {
      const [fallback]: any = await pool.query(`SELECT * FROM bank_accounts WHERE is_active = 1 AND currency IN ('USD','EUR') ORDER BY FIELD(currency, ?, 'USD','EUR'), sort_order ASC`, [requestedCurrency]);
      accounts = fallback || [];
    }
    res.json({
      success: true,
      currency: requestedCurrency,
      exactCurrency: exact.length > 0,
      accounts: accounts.map((r: any) => ({
        ...publicBankAccount(r, lang),
        currencyMismatch: normalizeCurrencyCode(r.currency) !== requestedCurrency
      }))
    });
  } catch {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/user/wallet/transfer-proof', authMiddleware, async (req: any, res) => {
  try {
    await ensureBankTransferWalletTables();
    const user = await UserRepo.getById(req.user.id);
    if (!user) return res.status(404).json({ error: 'No se pudo encontrar la cuenta.' });
    const amount = roundMoney(Number(req.body?.amount || 0));
    const currency = normalizeCurrencyCode(req.body?.currency || user.currency || 'EUR');
    const bankAccountId = String(req.body?.bankAccountId || '').trim();
    const reference = String(req.body?.referenceNumber || '').trim().slice(0, 180);
    const payerName = String(req.body?.payerName || user.name || '').trim().slice(0, 180);
    const note = String(req.body?.note || '').trim().slice(0, 1000);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Ingresa un monto válido.' });
    if (!bankAccountId) return res.status(400).json({ error: 'Selecciona una cuenta bancaria.' });
    const [accounts]: any = await pool.query(`SELECT * FROM bank_accounts WHERE id = ? AND is_active = 1 LIMIT 1`, [bankAccountId]);
    const account = accounts?.[0];
    if (!account) return res.status(400).json({ error: 'Selecciona una cuenta bancaria disponible.' });
    const accountCurrency = normalizeCurrencyCode(account.currency || 'EUR');
    if (currency !== accountCurrency) {
      return res.status(400).json({ error: `El monto debe estar expresado en ${accountCurrency}, la moneda de la cuenta bancaria seleccionada.` });
    }
    const receiptId = generateId('rcp_');
    let receiptUrl = '';
    const file = normalizeReceiptFile(req.body?.receiptBase64 || '');
    if (file.buffer) {
      if (file.buffer.length > 6 * 1024 * 1024) return res.status(400).json({ error: 'El comprobante es muy grande.' });
      const allowed = ['pdf','png','jpg','webp'];
      const ext = allowed.includes(file.ext) ? file.ext : 'bin';
      const dir = path.join(process.cwd(), 'public', 'uploads', 'payment-receipts');
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${receiptId}.${ext}`;
      fs.writeFileSync(path.join(dir, filename), file.buffer);
      receiptUrl = `/uploads/payment-receipts/${filename}`;
    }
    if (!receiptUrl) return res.status(400).json({ error: 'Sube el comprobante de pago.' });

    await pool.query(`INSERT INTO payment_receipts (id, user_id, bank_account_id, amount, currency, status, reference_number, payer_name, note, receipt_file_url)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`, [receiptId, user.id, bankAccountId, amount, currency, reference, payerName, note, receiptUrl]);
    try {
      await pool.query(`INSERT INTO wallet_topups (id, user_id, amount, currency, method, status, external_reference, payment_provider, provider_reference, receipt_id, proof_url)
        VALUES (?, ?, ?, ?, 'bank_transfer', 'pending', ?, 'bank_transfer', ?, ?, ?)`, [generateId('top_'), user.id, amount, currency, reference || receiptId, receiptId, receiptId, receiptUrl]);
    } catch {}
    res.json({ success: true, status: 'pending', receiptId, message: 'Comprobante recibido. Tu saldo se acreditará cuando sea revisado.' });
  } catch (error) {
    console.error('[Diagnóstico Interno] payment receipt:', error);
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.get('/api/admin/bank-accounts', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    await ensureBankTransferWalletTables();
    const lang = String(req.query.lang || 'es').slice(0, 5);
    const [rows]: any = await pool.query(`SELECT * FROM bank_accounts ORDER BY sort_order ASC, currency ASC`);
    res.json({ success: true, accounts: (rows || []).map((r: any) => publicBankAccount(r, lang)) });
  } catch {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/admin/bank-accounts', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    await ensureBankTransferWalletTables();
    const body = req.body || {};
    const id = String(body.id || generateId('bank_')).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    const currency = normalizeCurrencyCode(body.currency || 'USD');
    await pool.query(`INSERT INTO bank_accounts (id, code, currency, country_code, account_holder, bank_name, bank_address, details_json, instructions_json, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE code=VALUES(code), currency=VALUES(currency), country_code=VALUES(country_code), account_holder=VALUES(account_holder), bank_name=VALUES(bank_name), bank_address=VALUES(bank_address), details_json=VALUES(details_json), instructions_json=VALUES(instructions_json), is_active=VALUES(is_active), sort_order=VALUES(sort_order), updated_at=NOW()`,
      [id, String(body.code || id).slice(0,80), currency, String(body.countryCode || '').slice(0,10), String(body.accountHolder || '').slice(0,191), String(body.bankName || '').slice(0,191), String(body.bankAddress || '').slice(0,255), JSON.stringify(body.details || {}), JSON.stringify(body.instructions || {}), body.isActive === false ? 0 : 1, Number(body.sortOrder || 0)]);
    const [rows]: any = await pool.query(`SELECT * FROM bank_accounts WHERE id = ?`, [id]);
    res.json({ success: true, account: publicBankAccount(rows?.[0] || {}, 'es') });
  } catch {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.get('/api/admin/payment-receipts', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    await ensureBankTransferWalletTables();
    const status = String(req.query.status || 'all').toLowerCase();
    const where = ['all',''].includes(status) ? '' : `WHERE r.status = ${pool.escape(status)}`;
    const [rows]: any = await pool.query(`SELECT r.*, u.email AS user_email, u.name AS user_name, u.balance AS user_balance, u.currency AS user_currency, b.bank_name, b.account_holder, b.currency AS bank_currency
      FROM payment_receipts r
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN bank_accounts b ON b.id = r.bank_account_id
      ${where}
      ORDER BY r.created_at DESC LIMIT 200`);
    res.json({ success: true, receipts: (rows || []).map((r: any) => ({
      id: r.id, userId: r.user_id, userName: r.user_name, userEmail: r.user_email, userBalance: Number(r.user_balance || 0), userCurrency: r.user_currency,
      bankAccountId: r.bank_account_id, bankName: r.bank_name, accountHolder: r.account_holder, amount: Number(r.amount || 0), currency: r.currency,
      status: r.status, referenceNumber: r.reference_number, payerName: r.payer_name, note: r.note, receiptFileUrl: r.receipt_file_url, adminNote: r.admin_note,
      createdAt: r.created_at, reviewedAt: r.reviewed_at
    })) });
  } catch {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/admin/payment-receipts/:id/approve', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  const conn = await pool.getConnection();
  let walletNotification: any = null;
  try {
    await ensureBankTransferWalletTables();
    await ensureWalletCurrencySchema();
    const note = String(req.body?.adminNote || '').trim().slice(0, 1000);
    await conn.beginTransaction();
    const [rows]: any = await conn.query(`SELECT * FROM payment_receipts WHERE id = ? FOR UPDATE`, [req.params.id]);
    const receipt = rows?.[0];
    if (!receipt) throw new Error('not_found');
    if (receipt.status !== 'pending') {
      await conn.rollback();
      return res.json({ success: true, message: 'Este comprobante ya fue revisado.' });
    }
    const amount = roundMoney(Number(receipt.amount || 0));
    const currency = normalizeCurrencyCode(receipt.currency || 'USD');
    if (!amount || amount <= 0) throw new Error('El importe de la transferencia no es válido.');
    const [topupRows]: any = await conn.query('SELECT id FROM wallet_topups WHERE receipt_id = ? ORDER BY created_at DESC LIMIT 1', [receipt.id]);
    const rates = await getFreshRatesInternal();
    const mutation = await applyWalletMutation(conn, {
      userId: receipt.user_id,
      type: 'credit',
      amount,
      currency,
      description: 'Recarga por transferencia aprobada',
      referenceType: 'payment_receipt',
      referenceId: receipt.id,
      adminNote: note,
      rates
    });
    const userRows: any[] = [mutation.user];
    await conn.query(`UPDATE payment_receipts SET status='approved', admin_note=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?`, [note, req.user.id, receipt.id]);
    try { await conn.query(`UPDATE wallet_topups SET status='completed', updated_at=NOW() WHERE receipt_id=?`, [receipt.id]); } catch {}
    await conn.commit();
    walletNotification = {
      userId: receipt.user_id,
      topupId: topupRows?.[0]?.id || receipt.id,
      name: userRows?.[0]?.name || '',
      email: userRows?.[0]?.email || '',
      language: userRows?.[0]?.country || 'es',
      amount: mutation.walletAmount,
      currency: mutation.walletCurrency,
      sourceAmount: amount,
      sourceCurrency: currency,
      newBalance: mutation.newBalance
    };
    if (isValidEmailForProvider(walletNotification.email)) {
      await sendNotificationEvent({
        eventCode: 'wallet_topup_success',
        entityType: 'wallet_topup',
        entityId: String(walletNotification.topupId),
        userId: walletNotification.userId,
        audience: 'customer',
        toEmail: walletNotification.email,
        recipientName: walletNotification.name,
        language: walletNotification.language,
        variables: {
          userName: walletNotification.name,
          amount: Number(walletNotification.amount).toFixed(2),
          currency: walletNotification.currency,
          newBalance: Number(walletNotification.newBalance).toFixed(2),
          paymentMethod: 'Transferencia bancaria',
          panelUrl: `${(process.env.APP_URL || 'https://doordrop.lat').replace(/\/+$/, '')}/panel/billing`
        }
      }).catch(() => undefined);
    }
    res.json({ success: true, message: 'Comprobante aprobado y saldo acreditado.' });
  } catch (error: any) {
    try { await conn.rollback(); } catch {}
    if (error?.code === 'FX_UNAVAILABLE') return res.status(503).json({ error: 'La tasa de cambio no está disponible. El comprobante sigue pendiente.' });
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  } finally {
    conn.release();
  }
});

app.post('/api/admin/payment-receipts/:id/reject', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    await ensureBankTransferWalletTables();
    const note = String(req.body?.adminNote || '').trim().slice(0, 1000);
    const [receiptRows]: any = await pool.query(
      `SELECT r.*, u.name, u.email, u.country
       FROM payment_receipts r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.id = ? AND r.status = 'pending' LIMIT 1`,
      [req.params.id]
    );
    const receipt = receiptRows?.[0];
    if (!receipt) return res.json({ success: true, message: 'Este comprobante ya fue revisado.' });
    await pool.query(`UPDATE payment_receipts SET status='rejected', admin_note=?, reviewed_by=?, reviewed_at=NOW() WHERE id=? AND status='pending'`, [note, req.user.id, req.params.id]);
    let topupId = req.params.id;
    try {
      const [topupRows]: any = await pool.query(`SELECT id FROM wallet_topups WHERE receipt_id=? ORDER BY created_at DESC LIMIT 1`, [req.params.id]);
      topupId = topupRows?.[0]?.id || topupId;
      await pool.query(`UPDATE wallet_topups SET status='failed', updated_at=NOW() WHERE receipt_id=?`, [req.params.id]);
    } catch {}
    if (isValidEmailForProvider(receipt.email)) {
      await sendNotificationEvent({
        eventCode: 'wallet_topup_failed',
        entityType: 'wallet_topup',
        entityId: String(topupId),
        userId: receipt.user_id,
        audience: 'customer',
        toEmail: receipt.email,
        recipientName: receipt.name || '',
        language: receipt.country || 'es',
        variables: {
          userName: receipt.name || receipt.email,
          amount: Number(receipt.amount || 0).toFixed(2),
          currency: normalizeCurrencyCode(receipt.currency || 'USD'),
          paymentMethod: 'Transferencia bancaria',
          billingUrl: `${(process.env.APP_URL || 'https://doordrop.lat').replace(/\/+$/, '')}/panel/billing`,
          errorMessage: note || 'El comprobante no fue aprobado por el equipo de operaciones.'
        }
      }).catch(() => undefined);
    }
    res.json({ success: true, message: 'Comprobante marcado para revisión.' });
  } catch {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/admin/clients/:id/adjust-balance', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureWalletCurrencySchema();
    const mode = String(req.body?.mode || 'credit').toLowerCase();
    const amount = roundMoney(Number(req.body?.amount || 0));
    const note = String(req.body?.note || '').trim().slice(0, 1000);
    if (!['credit','debit','set'].includes(mode)) return res.status(400).json({ error: 'Selecciona una acción válida.' });
    if (!Number.isFinite(amount) || amount < 0 || (mode !== 'set' && amount === 0)) return res.status(400).json({ error: 'Ingresa un monto válido.' });
    await conn.beginTransaction();
    const user = await lockedWalletUser(conn, req.params.id);
    if (!user || user.role === 'super_admin') {
      await conn.rollback();
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }
    const sourceCurrency = normalizeCurrencyCode(req.body?.currency || user.currency || 'EUR');
    const rates = sourceCurrency === user.currency ? { EUR: 1 } : await getFreshRatesInternal();
    const requestedWalletAmount = convertMoneyAmountStrict(amount, sourceCurrency, user.currency, rates);
    const current = roundMoney(Number(user.balance || 0));
    const delta = mode === 'set' ? roundMoney(requestedWalletAmount - current) : (mode === 'debit' ? -requestedWalletAmount : requestedWalletAmount);
    if (delta < 0 && current + delta < 0) {
      const error: any = new Error('Saldo insuficiente para aplicar el ajuste.');
      error.code = 'WALLET_INSUFFICIENT';
      throw error;
    }
    if (delta !== 0) {
      const referenceId = generateId('adj_');
      const nextBalance = roundMoney(current + delta);
      await conn.query(`UPDATE users SET balance = ? WHERE id = ?`, [nextBalance, user.id]);
      await conn.query(`INSERT INTO wallet_transactions (id, user_id, type, amount, currency, source_amount, source_currency, fx_rate, description, reference_type, reference_id, status, admin_note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin_adjustment', ?, 'completed', ?)`, [generateId('wtx_'), user.id, delta >= 0 ? 'credit' : 'debit', Math.abs(delta), user.currency, amount, sourceCurrency, walletFxRate(sourceCurrency, user.currency, rates), mode === 'set' ? 'Ajuste administrativo de saldo' : (delta > 0 ? 'Ajuste administrativo positivo' : 'Ajuste administrativo negativo'), referenceId, note]);
    }
    await conn.commit();
    const updated = await UserRepo.getById(user.id);
    res.json({ success: true, client: normalizeClientForAdmin(updated), message: 'Saldo actualizado correctamente.', requestedAmount: amount, requestedCurrency: sourceCurrency, appliedAmount: Math.abs(delta), appliedCurrency: user.currency });
  } catch (error: any) {
    try { await conn.rollback(); } catch {}
    if (error?.code === 'FX_UNAVAILABLE') return res.status(503).json({ error: 'La tasa de cambio no está disponible. El saldo no fue modificado.' });
    if (error?.code === 'WALLET_INSUFFICIENT') return res.status(400).json({ error: 'El saldo no puede quedar negativo.' });
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  } finally {
    conn.release();
  }
});

// Admin: Configuración general
app.get('/api/admin/settings', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const apiKeys = await ApiKeysRepo.get();
    const settings = await AdminSettingsRepo.get();
    res.json({ apiKeys, brand: settings.brand, ai: await publicAISettings(), cron: { ...(settings.cron || {}), labelCronKey: await getCronKey() } });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/admin/settings', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    if (req.body.apiKeys) {
      await ApiKeysRepo.update(req.body.apiKeys);
    }
    if (req.body.brand) {
      const brandPayload = await saveIncomingBrandAssets(req, req.body.brand);
      await AdminSettingsRepo.updateBrand(brandPayload);
    }
    if (req.body.ai) {
      await AdminSettingsRepo.updateAI(req.body.ai);
    }

    const apiKeys = await ApiKeysRepo.get();
    const settings = await AdminSettingsRepo.get();
    res.json({ success: true, apiKeys, brand: settings.brand, ai: await publicAISettings() });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.get('/api/admin/ai-settings', authMiddleware, requireSuperAdmin, async (_req: any, res) => {
  try {
    res.json({ success: true, ai: await publicAISettings() });
  } catch {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.put('/api/admin/ai-settings', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const ai = await AdminSettingsRepo.updateAI(req.body || {});
    res.json({ success: true, ai });
  } catch {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});



// Admin: SpedirePro integración, saldos y comunicaciones
app.get('/api/admin/spedirepro/integration', authMiddleware, requireSuperAdmin, async (_req: any, res) => {
  try {
    const keys = await ApiKeysRepo.get();
    const provider = await ProviderRepo.getByCode('spedirepro');
    const credentialsReady = Boolean(spedireProCredentials(provider, keys));
    const balance = provider ? await getProviderBalanceInfo(provider, keys).catch(() => null) : null;
    res.json({
      success: true,
      webhookUrl: spedireProWebhookUrl(),
      trackingBaseUrl: `${appBaseUrl()}/tracking?code=`,
      provider: provider ? {
        code: provider.code,
        name: provider.name,
        isActive: Boolean(provider.is_active),
        isConnected: Boolean(provider.is_connected),
        lastConnectionStatus: provider.last_connection_status || '',
        lastConnectionMessage: provider.last_connection_message || '',
        balance
      } : null,
      credentialsReady,
      wallet: { endpoint: '/v1/wallet', method: 'GET', title: 'Movimientos de saldo' },
      webhookHistory: { endpoint: '/v1/shipment/webhooks', method: 'POST', title: 'Historial de comunicaciones' },
      events: [
        { code: 'shipment_created', title: 'Spedizione creata', description: 'Confirma creación del envío y puede incluir referencia, tracking y etiqueta.' },
        { code: 'shipment_updated', title: 'Aggiornamenti spedizione', description: 'Actualiza el estado público del tracking en DoorDrop.' },
        { code: 'pickup_result', title: 'Esito prenotazione pickup contestuale', description: 'Registra el resultado de la recogida cuando aplica.' }
      ]
    });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.get('/api/admin/spedirepro/wallet', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const keys = await ApiKeysRepo.get();
    const provider = await ProviderRepo.getByCode('spedirepro');
    if (!spedireProCredentials(provider, keys)) return res.status(400).json({ error: 'Proveedor no disponible todavía.' });
    const params = new URLSearchParams();
    params.set('page', String(req.query.page || 1));
    if (req.query.causal) params.set('causal', String(req.query.causal));
    const wallet = await callSpedirePro(provider, keys, 'GET', `v1/wallet?${params.toString()}`);
    await writeProviderLog('spedirepro', 'wallet_history', { page: req.query.page || 1, causal: req.query.causal || '' }, { httpStatus: wallet.httpStatus }, wallet.httpStatus);
    if (!spedireProIsOk(wallet.httpStatus, wallet.response)) return res.status(400).json({ error: spedireProMessage(wallet.response, 'No se pudieron cargar los movimientos.') });
    res.json({ success: true, ...wallet.response });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.get('/api/admin/spedirepro/webhook-history', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const reference = String(req.query.reference || '').trim();
    const tracker = String(req.query.tracker || req.query.tracking || '').trim();
    if (!reference && !tracker) return res.json({ success: true, items: [], message: 'Ingresa una referencia o tracking.' });
    const keys = await ApiKeysRepo.get();
    const provider = await ProviderRepo.getByCode('spedirepro');
    if (!spedireProCredentials(provider, keys)) return res.status(400).json({ error: 'Proveedor no disponible todavía.' });
    const history = await callSpedirePro(provider, keys, 'POST', 'v1/shipment/webhooks', { reference: reference || undefined, tracker: tracker || undefined });
    await writeProviderLog('spedirepro', 'webhook_history', { reference, tracker }, { httpStatus: history.httpStatus, count: Array.isArray(history.response) ? history.response.length : undefined }, history.httpStatus);
    if (!spedireProIsOk(history.httpStatus, history.response)) return res.status(400).json({ error: spedireProMessage(history.response, 'No se pudo cargar el historial.') });
    res.json({ success: true, items: Array.isArray(history.response) ? history.response : (history.response?.data || []), raw: history.response });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.get('/api/admin/spedirepro/local-webhooks', authMiddleware, requireSuperAdmin, async (_req: any, res) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT id, external_id AS externalId, event_type AS eventType, processed_at AS processedAt, created_at AS createdAt
       FROM webhook_events
       WHERE provider_code = 'spedirepro'
       ORDER BY created_at DESC
       LIMIT 50`
    );
    res.json({ success: true, items: rows });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

// Admin: Automatización de etiquetas
app.get('/api/admin/label-cron/status', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const key = await getCronKey();
    const appUrl = (process.env.APP_URL || 'https://doordrop.lat').replace(/\/$/, '');
    const [summaryRows]: any = await pool.query(`
      SELECT
        SUM(CASE WHEN status IN ('pending_provider','pending_label') OR label_status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN label_base64 IS NOT NULL AND label_base64 <> '' THEN 1 ELSE 0 END) AS ready,
        SUM(CASE WHEN status = 'pending_provider' THEN 1 ELSE 0 END) AS waitingProvider,
        SUM(CASE WHEN status = 'pending_label' THEN 1 ELSE 0 END) AS waitingLabel
      FROM shipments
    `);
    const [jobs]: any = await pool.query(`
      SELECT j.id, j.shipment_id AS shipmentId, j.job_type AS jobType, j.status, j.attempts, j.last_message AS message, j.next_run_at AS nextRunAt, s.tracking_code AS trackingCode, s.status_label AS statusLabel
      FROM shipment_processing_jobs j
      LEFT JOIN shipments s ON s.id = j.shipment_id
      ORDER BY j.updated_at DESC
      LIMIT 25
    `);
    res.json({
      success: true,
      summary: {
        pending: Number(summaryRows?.[0]?.pending || 0),
        ready: Number(summaryRows?.[0]?.ready || 0),
        waitingProvider: Number(summaryRows?.[0]?.waitingProvider || 0),
        waitingLabel: Number(summaryRows?.[0]?.waitingLabel || 0)
      },
      jobs,
      cronUrl: `${appUrl}/api/cron/shipments/process?key=${key}`,
      curlCommand: `curl -fsS "${appUrl}/api/cron/shipments/process?key=${key}" >/dev/null 2>&1`,
      recommendedInterval: 'Cada 5 minutos'
    });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/admin/label-cron/run', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const results = await processPendingShipments(Number(req.body?.limit || 10));
    res.json({ success: true, processed: results.length, results });
  } catch (error) {
    console.error('[Diagnóstico Interno] Error ejecutando automatización:', error);
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.get('/api/cron/shipments/process', async (req: any, res) => {
  try {
    const key = String(req.query.key || req.headers['x-cron-key'] || '').trim();
    const expected = await getCronKey();
    if (!key || key !== expected) {
      return res.status(403).json({ ok: false, message: 'Acceso no disponible.' });
    }
    const results = await processPendingShipments(Number(req.query.limit || 10));
    res.json({ ok: true, processed: results.length, results });
  } catch (error) {
    console.error('[Diagnóstico Interno] Error cron etiquetas:', error);
    res.status(500).json({ ok: false, message: 'No se pudo completar la operación.' });
  }
});


// Admin: Actualización de estados de envíos
app.get('/api/admin/status-cron/status', authMiddleware, requireSuperAdmin, async (_req: any, res) => {
  try {
    const key = await getCronKey();
    const appUrl = appBaseUrl();
    const [summaryRows]: any = await pool.query(`
      SELECT
        SUM(CASE WHEN status IN ('tramitado','pendiente_tramitar','pending_label','label_ready','pending_provider','pending_pickup') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status IN ('en_transito','in_transit') THEN 1 ELSE 0 END) AS inTransit,
        SUM(CASE WHEN status IN ('en_reparto','out_for_delivery') THEN 1 ELSE 0 END) AS outForDelivery,
        SUM(CASE WHEN status IN ('entregado','delivered') THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN status IN ('incidencia','exception') THEN 1 ELSE 0 END) AS issues
      FROM shipments
    `);
    const [recent]: any = await pool.query(`
      SELECT e.id, e.shipment_id AS shipmentId, e.tracking_code AS trackingCode, e.status_code AS statusCode, e.status_label AS statusLabel, e.description, e.event_time AS eventTime, s.provider_code AS providerCode
      FROM tracking_events e
      LEFT JOIN shipments s ON s.id = e.shipment_id
      ORDER BY e.event_time DESC, e.created_at DESC
      LIMIT 40
    `);
    res.json({
      success: true,
      summary: {
        active: Number(summaryRows?.[0]?.active || 0),
        inTransit: Number(summaryRows?.[0]?.inTransit || 0),
        outForDelivery: Number(summaryRows?.[0]?.outForDelivery || 0),
        delivered: Number(summaryRows?.[0]?.delivered || 0),
        issues: Number(summaryRows?.[0]?.issues || 0)
      },
      recent,
      cronUrl: `${appUrl}/api/cron/shipments/status?key=${key}`,
      curlCommand: `curl -fsS "${appUrl}/api/cron/shipments/status?key=${key}" >/dev/null 2>&1`,
      recommendedInterval: 'Cada 15 minutos'
    });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/admin/status-cron/run', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const results = await processShipmentStatusUpdates(Number(req.body?.limit || 25));
    res.json({ success: true, processed: results.length, results });
  } catch (error) {
    console.error('[Diagnóstico Interno] Error actualizando estados:', error);
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.get('/api/cron/shipments/status', async (req: any, res) => {
  try {
    const key = String(req.query.key || req.headers['x-cron-key'] || '').trim();
    const expected = await getCronKey();
    if (!key || key !== expected) {
      return res.status(403).json({ ok: false, message: 'Acceso no disponible.' });
    }
    const results = await processShipmentStatusUpdates(Number(req.query.limit || 25));
    res.json({ ok: true, processed: results.length, results });
  } catch (error) {
    console.error('[Diagnóstico Interno] Error cron estados:', error);
    res.status(500).json({ ok: false, message: 'No se pudo completar la operación.' });
  }
});

app.get('/api/admin/email/logs', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const [rows]: any = await pool.query(`
      SELECT l.id, l.shipment_id AS shipmentId, l.user_id AS userId, l.to_email AS toEmail, l.subject, l.language, l.event_code AS eventCode, l.status, l.provider_code AS providerCode, l.message_id AS messageId, l.error_message AS errorMessage, l.created_at AS createdAt, l.sent_at AS sentAt, s.tracking_code AS trackingCode
      FROM email_logs l
      LEFT JOIN shipments s ON s.id = l.shipment_id
      ORDER BY l.created_at DESC
      LIMIT 100
    `);
    res.json({ success: true, logs: rows });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/admin/email/test', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const to = isValidEmailForProvider(req.body?.to || '');
    if (!to) return res.status(400).json({ error: 'Ingresa un correo válido.' });
    const lang = normalizeMailLanguage(req.body?.language || 'es');
    const fakeShipment = { id: generateId('test_'), user_id: req.user.id, tracking_code: 'S24G-TEST', provider_code: 'system', recipient_json: { email: to } };
    const result = await sendShipmentStatusEmail(fakeShipment, 'tramitado', lang === 'it' ? 'Spedizione elaborata' : lang === 'en' ? 'Shipment processed' : lang === 'fr' ? 'Envoi traité' : 'Envío tramitado', 'Mensaje de prueba de notificación DoorDrop.');
    res.json({ success: Boolean(result.sent), result });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});



// SHIP24GO V1.4.36 — suscripciones, PayPal, Polar y wallet
function ship24goPayPalApiBase(environment: string = '') {
  const env = String(environment || process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
  return env === 'production' || env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

function ship24goPayPalCredentialsReady(keys: any) {
  const clientId = String(keys?.paypalClientId || process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = String(keys?.paypalClientSecret || process.env.PAYPAL_CLIENT_SECRET || '').trim();
  return Boolean(clientId && clientSecret);
}

function ship24goPayPalIntegrationEnabled(keys: any) {
  return keys?.paymentPaypalEnabled !== 0 && ship24goPayPalCredentialsReady(keys);
}

const PAYPAL_AUTH_PROVIDER = 'paypal';
const PAYPAL_AUTH_STATE_COOKIE = 'doordrop_paypal_auth_state';
const PAYPAL_AUTH_HANDOFF_COOKIE = 'doordrop_paypal_auth_handoff';
const PAYPAL_AUTH_STATE_TTL_MS = 10 * 60 * 1000;
const PAYPAL_AUTH_HANDOFF_TTL_MS = 5 * 60 * 1000;

function paypalAuthCookieSecure() {
  return String(process.env.APP_URL || '').startsWith('https://') || process.env.NODE_ENV === 'production';
}

function appendSetCookie(res: any, cookie: string) {
  const existing = res.getHeader('Set-Cookie');
  const cookies = Array.isArray(existing) ? existing.map(String) : (existing ? [String(existing)] : []);
  res.setHeader('Set-Cookie', [...cookies, cookie]);
}

function setPaypalAuthCookie(res: any, name: string, value: string, maxAge: number) {
  const flags = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}`];
  if (paypalAuthCookieSecure()) flags.push('Secure');
  appendSetCookie(res, flags.join('; '));
}

function clearPaypalAuthCookie(res: any, name: string) {
  const flags = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (paypalAuthCookieSecure()) flags.push('Secure');
  appendSetCookie(res, flags.join('; '));
}

function hashPaypalAuthValue(value: string) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function constantTimeStringEqual(left: string, right: string) {
  const leftHash = Buffer.from(hashPaypalAuthValue(left), 'hex');
  const rightHash = Buffer.from(hashPaypalAuthValue(right), 'hex');
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function paypalLoginConfig(keys: any) {
  const environment = String(keys?.paypalEnvironment || process.env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'production' || String(keys?.paypalEnvironment || process.env.PAYPAL_ENV || '').toLowerCase() === 'live'
    ? 'production'
    : 'sandbox';
  const configured = ship24goPayPalIntegrationEnabled(keys);
  const host = environment === 'production' ? 'www.paypal.com' : 'www.sandbox.paypal.com';
  return {
    enabled: configured,
    environment,
    authorizationEndpoint: `https://${host}/connect`,
    redirectUri: `${appBaseUrl()}/api/auth/paypal/callback`,
    scopes: ['openid', 'profile', 'email']
  };
}

function buildPaypalLoginUrl(config: any, state: string) {
  const clientId = String(config?.clientId || '').trim();
  const query = new URLSearchParams({
    flowEntry: 'static',
    client_id: clientId,
    response_type: 'code',
    scope: 'openid profile email',
    redirect_uri: String(config.redirectUri),
    state
  });
  return `${config.authorizationEndpoint}?${query.toString()}`;
}

async function createPaypalAuthState(flow: 'login' | 'register' | 'link', userId: string | null, res: any) {
  const keys = await ApiKeysRepo.get();
  const config = paypalLoginConfig(keys);
  if (!config.enabled) {
    const error: any = new Error('PayPal no está disponible.');
    error.code = 'PAYPAL_AUTH_UNAVAILABLE';
    throw error;
  }

  const state = crypto.randomBytes(32).toString('base64url');
  const stateId = generateId('oauth_');
  await pool.query('DELETE FROM oauth_login_states WHERE expires_at < NOW() OR (consumed_at IS NOT NULL AND consumed_at < DATE_SUB(NOW(), INTERVAL 1 DAY))');
  await pool.query(
    `INSERT INTO oauth_login_states (id, provider_code, user_id, state_hash, flow, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [stateId, PAYPAL_AUTH_PROVIDER, userId || null, hashPaypalAuthValue(state), flow, new Date(Date.now() + PAYPAL_AUTH_STATE_TTL_MS)]
  );
  setPaypalAuthCookie(res, PAYPAL_AUTH_STATE_COOKIE, state, PAYPAL_AUTH_STATE_TTL_MS);

  return {
    url: buildPaypalLoginUrl({ ...config, clientId: String(keys?.paypalClientId || process.env.PAYPAL_CLIENT_ID || '').trim() }, state),
    environment: config.environment
  };
}

async function claimPaypalAuthState(state: string) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows]: any = await conn.query(
      `SELECT id, user_id, flow
         FROM oauth_login_states
        WHERE provider_code = ? AND state_hash = ? AND consumed_at IS NULL AND expires_at > NOW()
        LIMIT 1 FOR UPDATE`,
      [PAYPAL_AUTH_PROVIDER, hashPaypalAuthValue(state)]
    );
    if (!rows.length) {
      await conn.rollback();
      return null;
    }
    await conn.query('UPDATE oauth_login_states SET consumed_at = NOW() WHERE id = ?', [rows[0].id]);
    await conn.commit();
    return { userId: rows[0].user_id ? String(rows[0].user_id) : null, flow: String(rows[0].flow || 'login') };
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

async function exchangePaypalLoginCode(code: string, keys: any) {
  const clientId = String(keys?.paypalClientId || process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = String(keys?.paypalClientSecret || process.env.PAYPAL_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) throw new Error('PayPal no está disponible.');
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetchWithTimeout(`${ship24goPayPalApiBase(keys?.paypalEnvironment)}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code }).toString()
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) throw new Error('PayPal no pudo completar la autenticación.');
  return String(data.access_token);
}

async function fetchPaypalLoginIdentity(accessToken: string, keys: any) {
  const response = await fetchWithTimeout(`${ship24goPayPalApiBase(keys?.paypalEnvironment)}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('PayPal no pudo devolver el perfil.');

  const subject = String(data?.user_id || data?.sub || '').trim().slice(0, 255);
  const email = String(data?.email || '').trim().toLowerCase().slice(0, 191);
  const emailVerified = data?.email_verified === true || String(data?.email_verified || '').toLowerCase() === 'true';
  const name = String(data?.name || [data?.given_name, data?.family_name].filter(Boolean).join(' ') || email.split('@')[0] || '').trim().slice(0, 191);
  const country = String(data?.address?.country_code || data?.country_code || '').trim().toUpperCase().slice(0, 2);
  const locale = String(data?.locale || '').trim().slice(0, 20);
  const avatarUrl = String(data?.picture || '').trim().slice(0, 1024);
  if (!subject || !email || !emailVerified) throw new Error('PayPal no entregó un correo electrónico verificado.');

  return {
    subject,
    email,
    emailVerified,
    name: name || 'Cliente DoorDrop',
    country,
    locale,
    avatarUrl,
    profile: { subject, email, emailVerified, name: name || 'Cliente DoorDrop', country, locale, avatarUrl }
  };
}

async function resolvePaypalUser(state: { userId: string | null; flow: string }, identity: any) {
  const conn = await pool.getConnection();
  let created = false;
  let user: any = null;
  try {
    await conn.beginTransaction();
    const [identityRows]: any = await conn.query(
      `SELECT id, user_id FROM user_auth_identities
        WHERE provider_code = ? AND provider_subject = ?
        LIMIT 1 FOR UPDATE`,
      [PAYPAL_AUTH_PROVIDER, identity.subject]
    );

    if (identityRows.length) {
      if (state.userId && String(identityRows[0].user_id) !== String(state.userId)) throw new Error('La cuenta de PayPal ya está vinculada a otro usuario.');
      const [rows]: any = await conn.query('SELECT * FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [identityRows[0].user_id]);
      user = rows[0] || null;
    } else {
      if (state.flow === 'link' && !state.userId) throw new Error('La vinculación de PayPal expiró.');
      if (state.userId) {
        const [rows]: any = await conn.query('SELECT * FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [state.userId]);
        user = rows[0] || null;
      } else {
        const [rows]: any = await conn.query('SELECT * FROM users WHERE email = ? LIMIT 1 FOR UPDATE', [identity.email]);
        user = rows[0] || null;
      }
    }

    if (user && user.role !== 'customer') throw new Error('Las cuentas operativas no pueden acceder con PayPal.');
    if (!user) {
      const userId = generateId('usr_');
      await conn.query(
        `INSERT INTO users
          (id, email, password_hash, name, phone, country, currency, language, role, business_type, balance, paypal_connected, paypal_email, email_verified_at, email_verification_required, status)
         VALUES (?, ?, ?, ?, ?, ?, 'EUR', ?, 'customer', 'Solo quiero enviar paquetes', 0.00, 1, ?, NOW(), 0, 'active')`,
        [
          userId,
          identity.email,
          hashPassword(crypto.randomBytes(32).toString('hex')),
          identity.name,
          '',
          identity.country || 'ES',
          normalizeMailLanguage(identity.locale || identity.country || 'ES'),
          identity.email
        ]
      );
      const [rows]: any = await conn.query('SELECT * FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
      user = rows[0] || null;
      created = true;
    }
    if (!user || (user.status && user.status !== 'active')) throw new Error('La cuenta DoorDrop no está disponible.');

    const [userIdentityRows]: any = await conn.query(
      `SELECT id, provider_subject FROM user_auth_identities
        WHERE provider_code = ? AND user_id = ?
        LIMIT 1 FOR UPDATE`,
      [PAYPAL_AUTH_PROVIDER, user.id]
    );
    if (userIdentityRows.length && String(userIdentityRows[0].provider_subject) !== identity.subject) throw new Error('Esta cuenta ya tiene otro PayPal vinculado.');

    if (identityRows.length) {
      await conn.query(
        `UPDATE user_auth_identities
            SET email = ?, display_name = ?, avatar_url = ?, profile_json = ?
          WHERE id = ?`,
        [identity.email, identity.name, identity.avatarUrl || null, JSON.stringify(identity.profile), identityRows[0].id]
      );
    } else {
      await conn.query(
        `INSERT INTO user_auth_identities
          (id, user_id, provider_code, provider_subject, email, display_name, avatar_url, profile_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [generateId('identity_'), user.id, PAYPAL_AUTH_PROVIDER, identity.subject, identity.email, identity.name, identity.avatarUrl || null, JSON.stringify(identity.profile)]
      );
    }
    await conn.query(
      `UPDATE users
          SET paypal_connected = 1,
              paypal_email = ?,
              email_verified_at = COALESCE(email_verified_at, NOW()),
              email_verification_required = 0,
              language = COALESCE(NULLIF(language, ''), ?)
        WHERE id = ?`,
      [identity.email, normalizeMailLanguage(identity.locale || identity.country || user.language || 'ES'), user.id]
    );
    const [freshRows]: any = await conn.query('SELECT * FROM users WHERE id = ? LIMIT 1', [user.id]);
    user = freshRows[0] || user;
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }

  if (created) {
    await sendNotificationEvent({
      eventCode: 'user_registered',
      entityType: 'user',
      entityId: String(user.id),
      userId: String(user.id),
      audience: 'customer',
      toEmail: user.email,
      recipientName: user.name,
      language: normalizeMailLanguage(identity.locale || identity.country || 'ES'),
      variables: { userName: user.name, userEmail: user.email }
    }).catch(() => {});
  }
  return user;
}

async function createPaypalAuthHandoff(userId: string) {
  const handoff = crypto.randomBytes(32).toString('base64url');
  await pool.query('DELETE FROM oauth_login_handoffs WHERE expires_at < NOW() OR (consumed_at IS NOT NULL AND consumed_at < DATE_SUB(NOW(), INTERVAL 1 DAY))');
  await pool.query(
    `INSERT INTO oauth_login_handoffs (id, user_id, token_hash, return_path, expires_at)
     VALUES (?, ?, ?, '/panel', ?)`,
    [generateId('handoff_'), userId, hashPaypalAuthValue(handoff), new Date(Date.now() + PAYPAL_AUTH_HANDOFF_TTL_MS)]
  );
  return handoff;
}

async function consumePaypalAuthHandoff(handoff: string) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows]: any = await conn.query(
      `SELECT h.id, h.user_id, h.return_path, u.*
         FROM oauth_login_handoffs h
         INNER JOIN users u ON u.id = h.user_id
        WHERE h.token_hash = ? AND h.consumed_at IS NULL AND h.expires_at > NOW()
        LIMIT 1 FOR UPDATE`,
      [hashPaypalAuthValue(handoff)]
    );
    if (!rows.length) {
      await conn.rollback();
      return null;
    }
    await conn.query('UPDATE oauth_login_handoffs SET consumed_at = NOW() WHERE id = ?', [rows[0].id]);
    await conn.commit();
    return rows[0];
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

function ship24goPayPalUnavailableMessage(keys: any) {
  if (keys?.paymentPaypalEnabled === 0) return 'Este método de pago no está disponible.';
  return 'PayPal pendiente de configuración.';
}

function ship24goPolarCredentialsReady(keys: any) {
  return Boolean(keys?.polarApiToken || process.env.POLAR_ACCESS_TOKEN);
}

function ship24goPolarIntegrationEnabled(keys: any) {
  return keys?.paymentPolarEnabled !== 0 && ship24goPolarCredentialsReady(keys);
}

async function ship24goGetPayPalAccessToken(keys: any) {
  const clientId = String(keys?.paypalClientId || process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = String(keys?.paypalClientSecret || process.env.PAYPAL_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) throw new Error('Credenciales de PayPal pendientes.');
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${ship24goPayPalApiBase(keys?.paypalEnvironment)}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error_description || 'No se pudo autenticar PayPal.');
  return data.access_token;
}

async function ship24goCreatePayPalCheckoutOrder(options: {
  referenceId: string;
  amount: number;
  currency: string;
  purpose: 'marketplace_order' | 'shipment_payment';
  description: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const keys = await ApiKeysRepo.get();
  if (!ship24goPayPalIntegrationEnabled(keys)) {
    const error: any = new Error(ship24goPayPalUnavailableMessage(keys));
    error.code = 'PAYPAL_UNAVAILABLE';
    throw error;
  }
  const sourceCurrency = normalizeCurrencyCode(options.currency || 'EUR');
  const sourceAmount = roundMoney(Number(options.amount || 0));
  const rates = sourceCurrency === 'EUR' ? { EUR: 1 } : await getFreshRatesInternal();
  const chargeAmount = convertMoneyAmountStrict(sourceAmount, sourceCurrency, 'EUR', rates);
  if (!chargeAmount || chargeAmount <= 0) throw new Error('El importe del pago no es válido.');

  const token = await ship24goGetPayPalAccessToken(keys);
  const base = ship24goPayPalApiBase(keys?.paypalEnvironment);
  const orderResponse = await fetch(`${base}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': options.referenceId
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        custom_id: `doordrop:${options.purpose}:${options.referenceId}`,
        description: options.description,
        amount: { currency_code: 'EUR', value: chargeAmount.toFixed(2) }
      }],
      application_context: {
        brand_name: 'DoorDrop',
        user_action: 'PAY_NOW',
        return_url: options.returnUrl,
        cancel_url: options.cancelUrl
      }
    })
  });
  const order: any = await orderResponse.json().catch(() => ({}));
  await writeProviderLog(
    'paypal',
    `${options.purpose}_checkout_create`,
    { referenceId: options.referenceId, amount: sourceAmount, currency: sourceCurrency, chargeAmount, chargeCurrency: 'EUR' },
    { httpStatus: orderResponse.status, id: order?.id, hasApprovalUrl: Boolean((order?.links || []).find((link: any) => link.rel === 'approve')) },
    orderResponse.status
  );
  const checkoutUrl = (order.links || []).find((link: any) => link.rel === 'approve')?.href || '';
  if (!orderResponse.ok || !order.id || !checkoutUrl) throw new Error('No se pudo crear el checkout de PayPal.');
  return { orderId: String(order.id), checkoutUrl, chargeAmount, chargeCurrency: 'EUR' };
}

function ship24goPublicPlan(plan: any) {
  return {
    id: plan.id,
    code: plan.code || '',
    name: plan.name,
    price: Number(plan.price || 0),
    currency: String(plan.currency || 'EUR').toUpperCase(),
    discount: Number(plan.discount_percent || plan.discount || 0),
    billingInterval: plan.billing_interval || 'month',
    isActive: plan.is_active !== 0,
    walletEnabled: plan.wallet_enabled !== 0,
    polarEnabled: plan.polar_enabled !== 0,
    paypalEnabled: plan.paypal_enabled !== 0,
    polarProductId: plan.polar_product_id || '',
    polarPriceId: plan.polar_price_id || '',
    polarSyncStatus: plan.polar_sync_status || 'pending',
    paypalProductId: plan.paypal_product_id || '',
    paypalPlanId: plan.paypal_plan_id || '',
    paypalSyncStatus: plan.paypal_sync_status || 'pending'
  };
}

app.get('/api/subscription-plans', authMiddleware, async (_req: any, res) => {
  try {
    const keys = await ApiKeysRepo.get();
    const plans = (await PlanRepo.getAll())
      .map(ship24goPublicPlan)
      .filter((p: any) => p.isActive && p.id !== 'plan_basic' && Number(p.price || 0) > 0);
    res.json({
      plans,
      methods: {
        wallet: keys?.paymentWalletEnabled !== 0,
        polar: ship24goPolarIntegrationEnabled(keys),
        paypal: ship24goPayPalIntegrationEnabled(keys)
      }
    });
  } catch {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/subscriptions/wallet/activate', authMiddleware, async (req: any, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureWalletCurrencySchema();
    const planId = String(req.body?.planId || '').trim();
    if (!planId) return res.status(400).json({ error: 'Selecciona un plan.' });
    const keys = await ApiKeysRepo.get();
    if (keys?.paymentWalletEnabled === 0) return res.status(400).json({ error: 'Este método de pago no está disponible.' });
    await conn.beginTransaction();
    const [planRows]: any = await conn.query('SELECT * FROM plans WHERE id = ? AND is_active = 1 FOR UPDATE', [planId]);
    const plan = planRows?.[0];
    if (!plan || plan.wallet_enabled === 0) throw new Error('Este plan no está disponible para wallet.');
    const amount = roundMoney(Number(plan.price || 0));
    const currency = String(plan.currency || 'EUR').toUpperCase();
    const rates = await getFreshRatesInternal();
    const subscriptionId = generateId('sub_');
    const paymentId = generateId('pay_');
    const mutation = await applyWalletMutation(conn, {
      userId: req.user.id,
      type: 'debit',
      amount,
      currency,
      description: `Suscripción ${plan.name}`,
      referenceType: 'subscription',
      referenceId: subscriptionId,
      rates
    });
    await conn.query(`INSERT INTO subscriptions (id, user_id, plan_id, provider, external_subscription_id, status, current_period_start, current_period_end, metadata_json) VALUES (?, ?, ?, 'wallet', ?, 'active', NOW(), DATE_ADD(NOW(), INTERVAL 1 MONTH), ?)`, [subscriptionId, req.user.id, plan.id, subscriptionId, JSON.stringify({ method: 'wallet', planName: plan.name })]);
    await conn.query(`INSERT INTO payments (id, user_id, provider, external_payment_id, amount, currency, status, plan_id, subscription_id, purpose, metadata_json) VALUES (?, ?, 'wallet', ?, ?, ?, 'paid', ?, ?, 'subscription', ?)`, [paymentId, req.user.id, subscriptionId, mutation.walletAmount, mutation.walletCurrency, plan.id, subscriptionId, JSON.stringify({ planName: plan.name, planAmount: amount, planCurrency: currency })]);
    await conn.commit();
    const [fresh]: any = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    res.json({ success: true, subscriptionId, user: fresh?.[0] || null, message: 'Suscripción activada con wallet.' });
  } catch (error: any) {
    await conn.rollback();
    res.status(400).json({ error: error?.message || 'No se pudo activar la suscripción.' });
  } finally {
    conn.release();
  }
});

app.post('/api/subscriptions/paypal/create-checkout', authMiddleware, async (req: any, res) => {
  try {
    const planId = String(req.body?.planId || '').trim();
    const keys = await ApiKeysRepo.get();
    if (!ship24goPayPalIntegrationEnabled(keys)) return res.status(400).json({ error: ship24goPayPalUnavailableMessage(keys) });
    const [rows]: any = await pool.query('SELECT * FROM plans WHERE id = ? AND is_active = 1 LIMIT 1', [planId]);
    const plan = rows?.[0];
    if (!plan || plan.paypal_enabled === 0) return res.status(400).json({ error: 'Este plan no está disponible en PayPal.' });
    const token = await ship24goGetPayPalAccessToken(keys);
    const base = ship24goPayPalApiBase(keys?.paypalEnvironment);
    const appUrl = appBaseUrl();

    if (plan.paypal_plan_id) {
      const response = await fetch(`${base}/v1/billing/subscriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({
          plan_id: plan.paypal_plan_id,
          custom_id: JSON.stringify({ userId: req.user.id, planId: plan.id, purpose: 'subscription' }).slice(0, 120),
          application_context: {
            brand_name: 'DoorDrop',
            locale: 'en-US',
            return_url: `${appUrl}/panel/settings?subscription=paypal_success`,
            cancel_url: `${appUrl}/panel/settings?subscription=paypal_cancel`
          }
        })
      });
      const data: any = await response.json().catch(() => ({}));
      if (!response.ok) return res.status(400).json({ error: 'No se pudo crear la suscripción en PayPal.' });
      const approve = (data.links || []).find((l: any) => l.rel === 'approve')?.href;
      return res.json({ url: approve, subscriptionId: data.id });
    }

    const orderResponse = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          custom_id: JSON.stringify({ userId: req.user.id, planId: plan.id, purpose: 'subscription' }).slice(0, 120),
          description: `Suscripción ${plan.name}`,
          amount: { currency_code: String(plan.currency || 'EUR').toUpperCase(), value: Number(plan.price || 0).toFixed(2) }
        }],
        application_context: { return_url: `${appUrl}/panel/settings?subscription=paypal_success`, cancel_url: `${appUrl}/panel/settings?subscription=paypal_cancel` }
      })
    });
    const order: any = await orderResponse.json().catch(() => ({}));
    if (!orderResponse.ok) return res.status(400).json({ error: 'No se pudo crear el pago en PayPal.' });
    res.json({ url: (order.links || []).find((l: any) => l.rel === 'approve')?.href, orderId: order.id });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'No se pudo completar la operación.' });
  }
});

app.post('/api/subscriptions/polar/plan-checkout', authMiddleware, async (req: any, res) => {
  try {
    const planId = String(req.body?.planId || '').trim();
    const keys = await ApiKeysRepo.get();
    if (keys?.paymentPolarEnabled === 0) return res.status(400).json({ error: 'Este método de pago no está disponible.' });
    const polarToken = keys?.polarApiToken || process.env.POLAR_ACCESS_TOKEN || '';
    if (!polarToken) return res.status(400).json({ error: 'Polar pendiente de configuración.' });
    const [rows]: any = await pool.query('SELECT * FROM plans WHERE id = ? AND is_active = 1 LIMIT 1', [planId]);
    const plan = rows?.[0];
    if (!plan || plan.polar_enabled === 0) return res.status(400).json({ error: 'Este plan no está disponible en Polar.' });
    const productId = plan.polar_product_id || keys?.polarSubscriptionProductId || keys?.polarProductId;
    if (!productId) return res.status(400).json({ error: 'Sincroniza el plan con Polar antes de cobrar.' });
    const apiBase = getPolarApiBase(polarToken, keys?.polarEnvironment || process.env.POLAR_ENV || 'sandbox');
    const appUrl = appBaseUrl();
    const payload = {
      product_id: productId,
      success_url: `${appUrl}/panel/settings?subscription=polar_success&plan_id=${encodeURIComponent(plan.id)}&checkout_id={CHECKOUT_ID}`,
      return_url: `${appUrl}/panel/settings`,
      customer_email: req.user.email,
      metadata: { purpose: 'subscription', user_id: req.user.id, plan_id: plan.id, plan_name: plan.name }
    };
    const response = await fetch(`${apiBase}/v1/checkouts/custom`, { method: 'POST', headers: { Authorization: `Bearer ${polarToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data: any = await response.json().catch(() => ({}));
    await writePolarProviderLog('subscription_checkout_create', { planId, productId }, data, response.status);
    if (!response.ok) return res.status(400).json({ error: 'No se pudo crear el checkout de Polar.' });
    res.json({ url: data.url || data.checkout_url, checkoutId: data.id });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'No se pudo completar la operación.' });
  }
});

app.post('/api/admin/paypal/webhook/create', authMiddleware, requireSuperAdmin, async (_req: any, res) => {
  try {
    const keys = await ApiKeysRepo.get();
    if (!ship24goPayPalIntegrationEnabled(keys)) return res.status(400).json({ error: ship24goPayPalUnavailableMessage(keys) });
    const token = await ship24goGetPayPalAccessToken(keys);
    const base = ship24goPayPalApiBase(keys?.paypalEnvironment);
    const webhookUrl = `${appBaseUrl()}/api/webhooks/paypal`;
    const payload = { url: webhookUrl, event_types: [
      { name: 'CHECKOUT.ORDER.APPROVED' }, { name: 'PAYMENT.CAPTURE.COMPLETED' }, { name: 'PAYMENT.CAPTURE.DENIED' }, { name: 'PAYMENT.CAPTURE.REFUNDED' },
      { name: 'BILLING.SUBSCRIPTION.CREATED' }, { name: 'BILLING.SUBSCRIPTION.ACTIVATED' }, { name: 'BILLING.SUBSCRIPTION.UPDATED' },
      { name: 'BILLING.SUBSCRIPTION.CANCELLED' }, { name: 'BILLING.SUBSCRIPTION.SUSPENDED' }, { name: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED' }, { name: 'BILLING.SUBSCRIPTION.EXPIRED' }
    ] };

    let existing: any = null;
    const listResponse = await fetch(`${base}/v1/notifications/webhooks`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    const listData: any = await listResponse.json().catch(() => ({}));
    if (listResponse.ok && Array.isArray(listData.webhooks)) {
      existing = listData.webhooks.find((webhook: any) => String(webhook.url || '').replace(/\/$/, '') === webhookUrl.replace(/\/$/, '')) || null;
    }
    if (!existing && keys?.paypalWebhookId) {
      const existingResponse = await fetch(`${base}/v1/notifications/webhooks/${encodeURIComponent(String(keys.paypalWebhookId))}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      });
      const existingData: any = await existingResponse.json().catch(() => ({}));
      if (existingResponse.ok && String(existingData.url || '').replace(/\/$/, '') === webhookUrl.replace(/\/$/, '')) existing = existingData;
    }
    if (existing?.id) {
      await pool.query('UPDATE api_keys SET paypalWebhookId = ?, paypalWebhookUrl = ? WHERE id = 1', [existing.id, webhookUrl]);
      return res.json({ success: true, created: false, message: 'El webhook de PayPal ya estaba configurado.', webhook: { id: existing.id, url: webhookUrl }, webhookUrl });
    }

    const response = await fetch(`${base}/v1/notifications/webhooks`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(400).json({ error: 'No se pudo crear el webhook en PayPal.' });
    await pool.query('UPDATE api_keys SET paypalWebhookId = ?, paypalWebhookUrl = ? WHERE id = 1', [data.id || '', webhookUrl]);
    res.json({ success: true, message: 'Webhook de PayPal configurado correctamente.', webhook: data, webhookUrl });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'No se pudo crear el webhook de PayPal.' });
  }
});

app.post('/api/admin/paypal/products/sync', authMiddleware, requireSuperAdmin, async (_req: any, res) => {
  try {
    const keys = await ApiKeysRepo.get();
    if (!ship24goPayPalIntegrationEnabled(keys)) return res.status(400).json({ error: ship24goPayPalUnavailableMessage(keys) });
    const token = await ship24goGetPayPalAccessToken(keys);
    const base = ship24goPayPalApiBase(keys?.paypalEnvironment);
    const plans = await PlanRepo.getAll();
    const synced: any[] = [];
    const syncErrors: any[] = [];
    for (const plan of plans) {
      if (plan.is_active === 0 || plan.paypal_enabled === 0) continue;
      let productId = plan.paypal_product_id || '';
      if (!productId) {
        const productResponse = await fetch(`${base}/v1/catalogs/products`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `${plan.id}-product` },
          body: JSON.stringify({ name: `DoorDrop ${plan.name}`, type: 'SERVICE', category: 'SERVICES', description: `Plan ${plan.name} de DoorDrop` })
        });
        const product: any = await productResponse.json().catch(() => ({}));
        if (!productResponse.ok) {
          syncErrors.push({ plan: plan.name, stage: 'product', status: productResponse.status, error: product?.name || product?.details?.[0]?.issue || 'PayPal rechazó el producto.' });
          continue;
        }
        productId = product.id;
      }
      let paypalPlanId = plan.paypal_plan_id || '';
      if (!paypalPlanId) {
        const planResponse = await fetch(`${base}/v1/billing/plans`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `${plan.id}-billing-plan` },
          body: JSON.stringify({
            product_id: productId,
            name: `DoorDrop ${plan.name}`,
            description: `Suscripción mensual ${plan.name}`,
            status: 'ACTIVE',
            billing_cycles: [{ frequency: { interval_unit: 'MONTH', interval_count: 1 }, tenure_type: 'REGULAR', sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: Number(plan.price || 0).toFixed(2), currency_code: String(plan.currency || 'EUR').toUpperCase() } } }],
            payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CONTINUE', payment_failure_threshold: 3 }
          })
        });
        const pp: any = await planResponse.json().catch(() => ({}));
        if (!planResponse.ok) {
          syncErrors.push({ plan: plan.name, stage: 'billing_plan', status: planResponse.status, error: pp?.name || pp?.details?.[0]?.issue || 'PayPal rechazó el plan.' });
          continue;
        }
        paypalPlanId = pp.id;
      }
      await pool.query('UPDATE plans SET paypal_product_id = ?, paypal_plan_id = ?, paypal_sync_status = ?, paypal_last_synced_at = NOW() WHERE id = ?', [productId, paypalPlanId, 'synced', plan.id]);
      synced.push({ plan: plan.name, productId, paypalPlanId, status: 'synced' });
    }
    const fresh = (await PlanRepo.getAll()).map(ship24goPublicPlan);
    res.status(syncErrors.length ? 400 : 200).json({
      success: syncErrors.length === 0,
      message: syncErrors.length
        ? `${synced.length} plan(es) sincronizado(s); ${syncErrors.length} no se pudo(ieron) sincronizar.`
        : 'Planes sincronizados con PayPal.',
      synced,
      errors: syncErrors,
      plans: fresh
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'No se pudieron sincronizar los planes con PayPal.' });
  }
});

function ship24goPayPalHeader(req: any, name: string) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
}

function ship24goParsePayPalMetadata(value: any) {
  if (value && typeof value === 'object') return value;
  const raw = String(value || '').trim();
  if (raw.startsWith('doordrop:wallet:')) {
    return { purpose: 'wallet_topup', topupId: raw.slice('doordrop:wallet:'.length) };
  }
  if (raw.startsWith('doordrop:marketplace_order:')) {
    return { purpose: 'marketplace_order', marketplaceOrderId: raw.slice('doordrop:marketplace_order:'.length) };
  }
  if (raw.startsWith('doordrop:shipment_payment:')) {
    return { purpose: 'shipment_payment', shipmentId: raw.slice('doordrop:shipment_payment:'.length) };
  }
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function ship24goPayPalDateTime(value: any): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ');
}

function ship24goPayPalSubscriptionPeriod(resource: any) {
  return {
    // PayPal exposes the boundary of the paid period as next_billing_time.
    currentPeriodEnd: ship24goPayPalDateTime(
      resource?.billing_info?.next_billing_time
        || resource?.next_billing_time
        || resource?.current_period_end
    ),
    currentPeriodStart: ship24goPayPalDateTime(
      resource?.current_period_start || resource?.start_time
    )
  };
}

async function ship24goVerifyPayPalWebhook(req: any, keys: any) {
  const webhookId = String(keys?.paypalWebhookId || '').trim();
  const authAlgo = ship24goPayPalHeader(req, 'paypal-auth-algo');
  const certUrl = ship24goPayPalHeader(req, 'paypal-cert-url');
  const transmissionId = ship24goPayPalHeader(req, 'paypal-transmission-id');
  const transmissionSig = ship24goPayPalHeader(req, 'paypal-transmission-sig');
  const transmissionTime = ship24goPayPalHeader(req, 'paypal-transmission-time');
  if (!webhookId || !authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return { ok: false, status: 503, token: '' };
  }

  try {
    const token = await ship24goGetPayPalAccessToken(keys);
    const response = await fetch(`${ship24goPayPalApiBase(keys?.paypalEnvironment)}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: req.body || {}
      })
    });
    const data: any = await response.json().catch(() => ({}));
    return { ok: response.ok && data?.verification_status === 'SUCCESS', status: response.ok ? 403 : 503, token };
  } catch {
    return { ok: false, status: 503, token: '' };
  }
}

async function ship24goPayPalOrderMetadata(orderId: string, keys: any, accessToken = '') {
  if (!orderId || !ship24goPayPalCredentialsReady(keys)) return { metadata: {}, order: null };
  try {
    const token = accessToken || await ship24goGetPayPalAccessToken(keys);
    const response = await fetch(`${ship24goPayPalApiBase(keys?.paypalEnvironment)}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    const order: any = await response.json().catch(() => ({}));
    if (!response.ok) return { metadata: {}, order: null };
    const purchaseUnit = Array.isArray(order.purchase_units) ? order.purchase_units[0] : null;
    return { metadata: ship24goParsePayPalMetadata(purchaseUnit?.custom_id || purchaseUnit?.custom), order };
  } catch {
    return { metadata: {}, order: null };
  }
}

app.post('/api/webhooks/paypal', async (req: any, res) => {
  try {
    const keys = await ApiKeysRepo.get();
    const verification = await ship24goVerifyPayPalWebhook(req, keys);
    if (!verification.ok) return res.status(verification.status || 403).json({ received: false });

    const payload = req.body || {};
    const eventType = payload.event_type || payload.event || '';
    const resource = payload.resource || {};
    // PayPal resource IDs (especially subscription IDs) are reused across
    // lifecycle events. The event ID is the only safe deduplication key.
    const reference = String(payload.id || resource.id || '').trim();
    if (!reference) return res.status(400).json({ received: false });
    const paypalPeriod = ship24goPayPalSubscriptionPeriod(resource);

    const [existingRows]: any = await pool.query(
      `SELECT id, processed_status FROM webhook_events WHERE provider_code = 'paypal' AND external_id = ? LIMIT 1`,
      [reference]
    );
    if (existingRows?.[0]?.processed_status === 'processed') return res.status(202).json({ received: true, duplicate: true });
    if (!existingRows?.length) {
      await pool.query(
        `INSERT INTO webhook_events (id, provider_code, external_id, event_type, payload_json, processed_status, provider_reference)
         VALUES (?, 'paypal', ?, ?, ?, 'received', ?)`,
        [generateId('wh_'), reference, eventType, JSON.stringify(payload), reference]
      );
    }

    let metadata = ship24goParsePayPalMetadata(resource.custom_id || resource.custom);
    const orderId = String(resource?.supplementary_data?.related_ids?.order_id || resource?.order_id || '').trim();
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED' && (!metadata.userId || (!metadata.planId && !metadata.topupId && !metadata.topup_id)) && orderId) {
      const orderInfo = await ship24goPayPalOrderMetadata(orderId, keys, verification.token);
      metadata = { ...orderInfo.metadata, ...metadata };
    }

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED' && (metadata.purpose || '') === 'marketplace_order') {
      const marketplaceOrderId = metadata.marketplaceOrderId || metadata.marketplace_order_id;
      if (marketplaceOrderId) {
        const paymentReference = String(resource.id || reference).trim();
        const paidOrder = await MarketplaceRepo.markOrderPaid(String(marketplaceOrderId), paymentReference);
        if (paidOrder.activated) {
          const [orderRows]: any = await pool.query(
            `SELECT o.*, l.title AS listing_title, ub.name AS buyer_name, ub.email AS buyer_email,
                    us.name AS seller_name, us.email AS seller_email
               FROM marketplace_orders o
               JOIN marketplace_listings l ON l.id = o.listing_id
               JOIN users ub ON ub.id = o.buyer_id
               JOIN users us ON us.id = o.seller_id
              WHERE o.id = ? LIMIT 1`,
            [marketplaceOrderId]
          );
          const paid = orderRows?.[0];
          if (paid) {
            const appUrl = appBaseUrl().replace(/\/+$/, '');
            const orderUrl = `${appUrl}/panel/marketplace?tab=orders`;
            const total = (Number(paid.total_amount_minor || 0) / 100).toFixed(2);
            await Promise.all([
              sendNotificationEvent({
                eventCode: 'marketplace_order_paid_buyer',
                entityType: 'marketplace_order',
                entityId: String(paid.id),
                userId: paid.buyer_id,
                audience: 'buyer',
                toEmail: paid.buyer_email || '',
                recipientName: paid.buyer_name || paid.buyer_email || '',
                language: 'es',
                variables: { userName: paid.buyer_name || paid.buyer_email || '', orderNumber: paid.order_number, listingTitle: paid.listing_title, totalAmount: total, currency: paid.currency, orderStatus: 'Pagado', orderUrl, sellerName: paid.seller_name || '' }
              }).catch(() => null),
              sendNotificationEvent({
                eventCode: 'marketplace_sale_received',
                entityType: 'marketplace_order',
                entityId: String(paid.id),
                userId: paid.seller_id,
                audience: 'seller',
                toEmail: paid.seller_email || '',
                recipientName: paid.seller_name || paid.seller_email || '',
                language: 'es',
                variables: { sellerName: paid.seller_name || paid.seller_email || '', orderNumber: paid.order_number, listingTitle: paid.listing_title, totalAmount: total, currency: paid.currency, buyerName: paid.buyer_name || '', orderUrl, shippingAddressUrl: orderUrl }
              }).catch(() => null)
            ]);
          }
        }
      }
    }

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED' && (metadata.purpose || '') === 'shipment_payment') {
      const shipmentId = String(metadata.shipmentId || metadata.shipment_id || '').trim();
      if (shipmentId) {
        const paymentReference = String(resource.id || reference).trim();
        const conn = await pool.getConnection();
        let shouldPrepare = false;
        let shipmentUserId = '';
        try {
          await conn.beginTransaction();
          const [paymentRows]: any = await conn.query(
            `SELECT id, status FROM payments WHERE shipment_id = ? AND provider = 'paypal' AND purpose = 'shipment_payment' LIMIT 1 FOR UPDATE`,
            [shipmentId]
          );
          const payment = paymentRows?.[0];
          if (!payment) throw new Error('Pago PayPal de envío no encontrado.');
          if (String(payment.status) !== 'paid') {
            await conn.query(
              `UPDATE payments SET status = 'paid', external_payment_id = ?, provider_payment_id = ?, raw_payload_json = ?, updated_at = NOW() WHERE id = ?`,
              [paymentReference, paymentReference, JSON.stringify(payload), payment.id]
            );
            const [shipmentRows]: any = await conn.query(`SELECT user_id, status FROM shipments WHERE id = ? FOR UPDATE`, [shipmentId]);
            const shipment = shipmentRows?.[0];
            if (!shipment) throw new Error('Envío asociado al pago no encontrado.');
            shipmentUserId = String(shipment.user_id || '');
            shouldPrepare = String(shipment.status) === 'pending_payment';
            if (shouldPrepare) {
              await conn.query(
                `UPDATE shipments SET status = 'pending_provider', status_label = 'Preparando etiqueta', payment_url = NULL, updated_at = NOW() WHERE id = ? AND status = 'pending_payment'`,
                [shipmentId]
              );
            }
          }
          await conn.commit();
        } catch (error) {
          await conn.rollback();
          throw error;
        } finally {
          conn.release();
        }
        if (shouldPrepare) {
          await TrackingEventRepo.create({ shipment_id: shipmentId, tracking_code: '', status: 'payment_confirmed', status_label: 'Pago PayPal confirmado', description: 'El pago PayPal fue confirmado y la etiqueta está en preparación.' }).catch(() => null);
          try {
            await processShipmentPreparation(shipmentId);
          } catch (error: any) {
            await ensureShipmentJob(shipmentId, shipmentUserId, 'provider_create', 'pending', 'Pago confirmado; etiqueta en preparación.').catch(() => null);
            console.error('[PayPal shipment] preparation deferred:', error?.message || 'error');
          }
        }
      }
    }

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
      const userId = metadata.userId || metadata.user_id;
      const planId = metadata.planId || metadata.plan_id;

      const topupId = metadata.topupId || metadata.topup_id;
      if (eventType === 'PAYMENT.CAPTURE.COMPLETED' && topupId && (metadata.purpose || '') === 'wallet_topup') {
        const conn = await pool.getConnection();
        let walletNotification: any = null;
        try {
          await conn.beginTransaction();
          const [topupRows]: any = await conn.query(`SELECT * FROM wallet_topups WHERE id = ? FOR UPDATE`, [topupId]);
          const topup = topupRows?.[0];
          if (!topup) throw new Error('Recarga PayPal no encontrada.');
          if (!['paid', 'completed', 'success'].includes(String(topup.status || '').toLowerCase())) {
            const amount = roundMoney(Number(topup.amount || metadata.requestedAmount || metadata.requested_amount || 0));
            const currency = normalizeCurrencyCode(topup.currency || metadata.walletCurrency || metadata.currency || 'EUR');
            if (!amount || amount <= 0) throw new Error('Monto de recarga PayPal no válido.');
            await conn.query(`UPDATE wallet_topups SET status = 'completed', provider_reference = ? WHERE id = ?`, [resource.id || reference, topupId]);
            const rates = await getFreshRatesInternal();
            const mutation = await applyWalletMutation(conn, {
              userId: topup.user_id,
              type: 'credit',
              amount,
              currency,
              description: 'Recarga confirmada por PayPal — saldo exacto',
              referenceType: 'wallet_topup',
              referenceId: topupId,
              rates
            });
            walletNotification = {
              userId: topup.user_id,
              email: mutation.user?.email || '',
              name: mutation.user?.name || '',
              language: mutation.user?.country || 'es',
              amount: mutation.walletAmount,
              currency: mutation.walletCurrency,
              newBalance: mutation.newBalance,
              paymentMethod: 'PayPal'
            };
          }
          await conn.commit();
        } catch (error) {
          await conn.rollback();
          throw error;
        } finally {
          conn.release();
        }
        if (walletNotification?.email) {
          await sendNotificationEvent({
            eventCode: 'wallet_topup_success',
            entityType: 'wallet_topup',
            entityId: String(topupId),
            userId: walletNotification.userId,
            audience: 'customer',
            toEmail: walletNotification.email,
            recipientName: walletNotification.name,
            language: walletNotification.language,
            variables: {
              userName: walletNotification.name,
              amount: Number(walletNotification.amount).toFixed(2),
              currency: walletNotification.currency,
              newBalance: Number(walletNotification.newBalance).toFixed(2),
              paymentMethod: walletNotification.paymentMethod,
              panelUrl: `${appBaseUrl()}/panel/settings/wallet`
            }
          }).catch(() => null);
        }
      }

      if (userId && planId) {
        const [plans]: any = await pool.query('SELECT * FROM plans WHERE id = ? LIMIT 1', [planId]);
        const plan = plans?.[0];
        if (plan) {
          const externalId = resource.id || reference;
          const [existingSubscriptions]: any = await pool.query(`SELECT id FROM subscriptions WHERE provider = 'paypal' AND external_subscription_id = ? LIMIT 1`, [externalId]);
          const subId = existingSubscriptions?.[0]?.id || generateId('sub_');
          if (!existingSubscriptions?.length) {
            await pool.query(`INSERT INTO subscriptions (id, user_id, plan_id, provider, external_subscription_id, status, current_period_start, current_period_end, metadata_json) VALUES (?, ?, ?, 'paypal', ?, 'active', ?, ?, ?)`, [subId, userId, planId, externalId, paypalPeriod.currentPeriodStart, paypalPeriod.currentPeriodEnd, JSON.stringify({ eventType })]);
            await pool.query(`INSERT INTO payments (id, user_id, provider, external_payment_id, amount, currency, status, plan_id, subscription_id, purpose, raw_payload_json, metadata_json) VALUES (?, ?, 'paypal', ?, ?, ?, 'paid', ?, ?, 'subscription', ?, ?)`, [generateId('pay_'), userId, externalId, Number(plan.price || 0), String(plan.currency || 'EUR').toUpperCase(), planId, subId, JSON.stringify(payload), JSON.stringify({ eventType })]);
          }
        }
      }
    }

    if (eventType.startsWith('BILLING.SUBSCRIPTION.') && resource.id) {
      const statusMap: Record<string, string> = {
        // The subscriptions.status enum has no pending/suspended values.
        // Keep those pre-activation or interrupted states fail-closed.
        'BILLING.SUBSCRIPTION.CREATED': 'past_due',
        'BILLING.SUBSCRIPTION.UPDATED': 'active',
        'BILLING.SUBSCRIPTION.CANCELLED': 'canceled',
        'BILLING.SUBSCRIPTION.SUSPENDED': 'past_due',
        'BILLING.SUBSCRIPTION.PAYMENT.FAILED': 'past_due',
        'BILLING.SUBSCRIPTION.PAYMENT.COMPLETED': 'active',
        'BILLING.SUBSCRIPTION.EXPIRED': 'expired'
      };
      const nextStatus = statusMap[eventType];
      if (nextStatus) {
        await pool.query(
          `UPDATE subscriptions
              SET status = ?,
                  current_period_start = COALESCE(?, current_period_start),
                  current_period_end = COALESCE(?, current_period_end),
                  updated_at = UTC_TIMESTAMP()
            WHERE provider = 'paypal' AND external_subscription_id = ?`,
          [nextStatus, paypalPeriod.currentPeriodStart, paypalPeriod.currentPeriodEnd, resource.id]
        );
      }
    }

    await pool.query(`UPDATE webhook_events SET processed_status = 'processed' WHERE provider_code = 'paypal' AND external_id = ?`, [reference]);
    res.status(202).json({ received: true });
  } catch (error: any) {
    console.error('[PayPal webhook] error:', error?.message || error);
    try {
      const reference = String(req.body?.id || req.body?.resource?.id || '').trim();
      if (reference) await pool.query(`UPDATE webhook_events SET processed_status = 'failed' WHERE provider_code = 'paypal' AND external_id = ?`, [reference]);
    } catch {}
    res.status(500).json({ received: false });
  }
});

// Admin: Planes
app.get('/api/admin/plans', authMiddleware, async (req: any, res) => {
  try {
    const plans = await PlanRepo.getAll();
    res.json({ plans: plans.map(ship24goPublicPlan) });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/admin/plans', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    if (!Array.isArray(req.body?.plans)) {
      return res.status(400).json({ error: 'El formato de planes no es válido.' });
    }
    const normalizedPlans = req.body.plans.map((plan: any) => ({
      ...plan,
      discount: normalizeDoorDropPlanDiscount(plan.discount ?? plan.discount_percent)
    }));
    await PlanRepo.updateAll(normalizedPlans);
    const plans = await PlanRepo.getAll();
    res.json({ success: true, plans });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

// Admin: Reportes
function reportPeriodToDates(query: any) {
  const period = String(query?.period || 'month').toLowerCase();
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  let dateFrom = String(query?.dateFrom || '').slice(0, 10);
  let dateTo = String(query?.dateTo || '').slice(0, 10);
  if (!dateFrom) {
    const d = new Date(today);
    if (period === 'today') {
      dateFrom = iso(today);
    } else if (period === 'week') {
      d.setDate(d.getDate() - 6);
      dateFrom = iso(d);
    } else if (period === 'year') {
      d.setMonth(0, 1);
      dateFrom = iso(d);
    } else if (period === 'all') {
      dateFrom = '';
    } else {
      d.setDate(1);
      dateFrom = iso(d);
    }
  }
  if (!dateTo && period !== 'all') dateTo = iso(today);
  return { period, dateFrom, dateTo };
}

function buildAdminReportWhere(query: any) {
  const { period, dateFrom, dateTo } = reportPeriodToDates(query);
  const where: string[] = [];
  const params: any[] = [];
  const search = String(query?.search || '').trim();
  const provider = String(query?.provider || '').trim().toLowerCase();
  const status = String(query?.status || '').trim().toLowerCase();
  if (dateFrom) {
    where.push('s.created_at >= ?');
    params.push(`${dateFrom} 00:00:00`);
  }
  if (dateTo) {
    where.push('s.created_at <= ?');
    params.push(`${dateTo} 23:59:59`);
  }
  if (provider && provider !== 'all') {
    where.push('LOWER(COALESCE(s.provider_code, q.provider_code, p.code, \'\')) = ?');
    params.push(provider);
  }
  if (status && status !== 'all') {
    if (status === 'active') {
      where.push("LOWER(COALESCE(s.status, '')) NOT IN ('draft','cancelado','cancelled')");
    } else {
      where.push('LOWER(COALESCE(s.status, s.status_label, \'\')) LIKE ?');
      params.push(`%${status}%`);
    }
  }
  if (search) {
    where.push(`(
      s.tracking_code LIKE ? OR s.provider_tracking_code LIKE ? OR s.provider_shipment_code LIKE ? OR s.order_number LIKE ? OR
      u.email LIKE ? OR u.name LIKE ? OR q.service_name LIKE ? OR s.provider_code LIKE ?
    )`);
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like, like, like);
  }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params, period, dateFrom, dateTo };
}

function adminReportFinancialFromRow(row: any) {
  const providerCost = roundMoney(Number(row.providerCost || 0));
  const listPrice = roundMoney(Number(row.listPrice || 0));
  const clientPrice = roundMoney(Number(row.clientPrice || 0));
  const paidGross = roundMoney(Number(row.debitAmount || 0) + Number(row.paymentPaidAmount || 0));
  const refunds = roundMoney(Number(row.refundAmount || 0) + Number(row.paymentRefundAmount || 0));
  const paidNet = roundMoney(Math.max(0, paidGross - refunds));
  const discountAmount = roundMoney(Math.max(0, listPrice - clientPrice));
  const expectedProfit = roundMoney(clientPrice - providerCost);
  const actualProfit = paidNet > 0 ? roundMoney(paidNet - providerCost) : 0;
  const isCancelled = ['draft','cancelado','cancelled','refunded','refund'].some((s) => String(row.statusCode || row.statusLabel || '').toLowerCase().includes(s));
  const lossAmount = paidNet > 0 && paidNet < providerCost ? roundMoney(providerCost - paidNet) : (isCancelled && providerCost > paidNet ? roundMoney(Math.max(0, providerCost - paidNet)) : 0);
  return { providerCost, listPrice, clientPrice, paidGross, refunds, paidNet, discountAmount, expectedProfit, actualProfit, lossAmount };
}

function adminReportCarrierFromRow(row: any) {
  const shipmentPayload = parseJsonSafe(row.shipmentPayloadJson) || {};
  const quotePayload = parseJsonSafe(row.quotePayloadJson) || {};
  const carrierSource = quotePayload?.carrierName || quotePayload?.raw?.ship24goCarrierName || quotePayload?.raw?.selectedService?.ship24goCarrierName || quotePayload?.raw?.courierService?.courier || quotePayload?.raw?.courier || quotePayload?.raw?.carrier || quotePayload?.raw?.nombre_agencia || quotePayload?.raw?.nombre_completo_agencia || shipmentPayload?.detail?.data?.shipment?.carrier || shipmentPayload?.detail?.data?.carrier || shipmentPayload?.save?.data?.shipment?.carrier || shipmentPayload?.carrierName || shipmentPayload?.ship24goCarrierName || shipmentPayload?.carrier || shipmentPayload?.courier || shipmentPayload?.tracking?.carrier || shipmentPayload?.accept?.courier || shipmentPayload?.service || shipmentPayload?.service_name || row.serviceName || row.providerCode || '';
  return inferCarrierName(carrierSource);
}

function adminReportAddressSummary(value: any) {
  const data = parseJsonSafe(value) || {};
  return {
    name: data.fullName || data.full_name || data.name || data.company || '',
    country: String(data.country || data.countryCode || '').toUpperCase(),
    city: data.city || '',
    zip: data.zip || data.zipCode || data.post_code || data.postal_code || ''
  };
}

// Admin: Reportes financieros tipo Excel
app.get('/api/admin/reports', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const { whereSql, params, period, dateFrom, dateTo } = buildAdminReportWhere(req.query || {});
    const page = Math.max(1, Number(req.query?.page || 1));
    const limit = Math.max(10, Math.min(200, Number(req.query?.limit || 50)));
    const offset = (page - 1) * limit;

    const baseFrom = `
      FROM shipments s
      LEFT JOIN quotes q ON q.id = s.quote_id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN providers p ON p.id = COALESCE(s.provider_id, q.provider_id)
      LEFT JOIN (
        SELECT reference_id, user_id,
               SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END) AS debit_amount,
               SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END) AS refund_amount
        FROM wallet_transactions
        WHERE reference_type = 'shipment'
        GROUP BY reference_id, user_id
      ) wt ON wt.reference_id = s.id AND wt.user_id = s.user_id
      LEFT JOIN (
        SELECT shipment_id,
               SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS paid_amount,
               SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END) AS refunded_amount
        FROM payments
        GROUP BY shipment_id
      ) pay ON pay.shipment_id = s.id
      LEFT JOIN (
        SELECT sub.user_id, MAX(pl.discount_percent) AS discount_percent, MAX(pl.name) AS plan_name
        FROM subscriptions sub
        INNER JOIN plans pl ON pl.id = sub.plan_id
        WHERE sub.status IN ('active','trialing')
          AND sub.current_period_end > UTC_TIMESTAMP()
        GROUP BY sub.user_id
      ) plan ON plan.user_id = s.user_id
    `;

    const [countRows]: any = await pool.query(`SELECT COUNT(*) AS total ${baseFrom} ${whereSql}`, params);
    const totalRows = Number(countRows?.[0]?.total || 0);

    const [rows]: any = await pool.query(`
      SELECT
        s.id,
        s.tracking_code AS trackingCode,
        s.provider_tracking_code AS providerTrackingCode,
        s.provider_shipment_code AS providerShipmentCode,
        s.order_number AS orderNumber,
        COALESCE(s.provider_code, q.provider_code, p.code, '') AS providerCode,
        COALESCE(p.name, s.provider_code, q.provider_code, 'Agencia') AS providerName,
        s.status AS statusCode,
        s.status_label AS statusLabel,
        s.label_status AS labelStatus,
        s.sender_json AS senderJson,
        s.recipient_json AS recipientJson,
        s.provider_payload_json AS shipmentPayloadJson,
        q.provider_payload_json AS quotePayloadJson,
        q.service_name AS serviceName,
        COALESCE(q.currency, 'EUR') AS currency,
        COALESCE(q.base_price, 0) AS providerCost,
        COALESCE(q.base_price, 0) + COALESCE(q.margin_amount, 0) + COALESCE(q.taxes_amount, 0) AS listPrice,
        COALESCE(q.margin_amount, 0) AS marginAmount,
        COALESCE(q.taxes_amount, 0) AS taxesAmount,
        COALESCE(q.total_amount, 0) AS clientPrice,
        COALESCE(wt.debit_amount, 0) AS debitAmount,
        COALESCE(wt.refund_amount, 0) AS refundAmount,
        COALESCE(pay.paid_amount, 0) AS paymentPaidAmount,
        COALESCE(pay.refunded_amount, 0) AS paymentRefundAmount,
        COALESCE(plan.discount_percent, 0) AS discountPercent,
        COALESCE(plan.plan_name, '') AS planName,
        u.name AS clientName,
        u.email AS clientEmail,
        s.created_at AS createdAt,
        s.updated_at AS updatedAt
      ${baseFrom}
      ${whereSql}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const mappedRows = rows.map((row: any) => {
      const finance = adminReportFinancialFromRow(row);
      const sender = adminReportAddressSummary(row.senderJson);
      const recipient = adminReportAddressSummary(row.recipientJson);
      const carrierName = adminReportCarrierFromRow(row);
      const paymentStatus = finance.paidNet > 0 ? 'Pagado' : (String(row.statusCode || '').toLowerCase() === 'draft' ? 'Borrador' : 'Pendiente');
      return {
        id: row.id,
        date: row.createdAt,
        updatedAt: row.updatedAt,
        trackingCode: row.trackingCode || '',
        providerTrackingCode: row.providerTrackingCode || '',
        providerShipmentCode: row.providerShipmentCode || '',
        orderNumber: row.orderNumber || '',
        clientName: row.clientName || 'Cliente',
        clientEmail: row.clientEmail || '',
        providerCode: row.providerCode || '',
        providerName: row.providerName || 'Agencia',
        carrierName,
        serviceName: row.serviceName || carrierName || 'Servicio estándar',
        statusCode: row.statusCode || '',
        statusLabel: row.statusLabel || 'Creado',
        labelStatus: row.labelStatus || 'pending',
        paymentStatus,
        currency: row.currency || 'EUR',
        planName: row.planName || '',
        discountPercent: Number(row.discountPercent || 0),
        sender,
        recipient,
        ...finance
      };
    });

    const [summaryRows]: any = await pool.query(`
      SELECT
        COUNT(*) AS totalShipments,
        COALESCE(SUM(COALESCE(q.base_price, 0)), 0) AS purchaseCost,
        COALESCE(SUM(COALESCE(q.base_price, 0) + COALESCE(q.margin_amount, 0) + COALESCE(q.taxes_amount, 0)), 0) AS listPrice,
        COALESCE(SUM(COALESCE(q.total_amount, 0)), 0) AS clientRevenue,
        COALESCE(SUM(COALESCE(q.margin_amount, 0)), 0) AS expectedProfit,
        COALESCE(SUM(COALESCE(wt.debit_amount, 0) + COALESCE(pay.paid_amount, 0)), 0) AS paidGross,
        COALESCE(SUM(COALESCE(wt.refund_amount, 0) + COALESCE(pay.refunded_amount, 0)), 0) AS refunds,
        COALESCE(AVG(COALESCE(q.total_amount, 0)), 0) AS avgShipmentCost
      ${baseFrom}
      ${whereSql}
    `, params);
    const summaryRaw = summaryRows?.[0] || {};
    const paidNet = roundMoney(Number(summaryRaw.paidGross || 0) - Number(summaryRaw.refunds || 0));
    const purchaseCost = roundMoney(Number(summaryRaw.purchaseCost || 0));
    const clientRevenue = roundMoney(Number(summaryRaw.clientRevenue || 0));
    const listPrice = roundMoney(Number(summaryRaw.listPrice || 0));

    const [dailyRows]: any = await pool.query(`
      SELECT DATE(s.created_at) AS day, COALESCE(SUM(q.total_amount), 0) AS revenue, COUNT(*) AS shipments
      ${baseFrom}
      ${whereSql}
      GROUP BY DATE(s.created_at)
      ORDER BY day ASC
      LIMIT 31
    `, params);

    const [providerRows]: any = await pool.query(`
      SELECT COALESCE(s.provider_code, q.provider_code, p.code, 'Agencia') AS provider, COUNT(*) AS shipments,
             COALESCE(SUM(q.base_price), 0) AS purchaseCost, COALESCE(SUM(q.total_amount), 0) AS revenue
      ${baseFrom}
      ${whereSql}
      GROUP BY provider
      ORDER BY shipments DESC, revenue DESC
      LIMIT 12
    `, params);

    const [countryRows]: any = await pool.query(`
      SELECT
        UPPER(COALESCE(
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.recipient_json, '$.country')), ''),
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.recipient_json, '$.countryCode')), ''),
          'OT'
        )) AS country,
        COUNT(*) AS shipments,
        COALESCE(SUM(q.total_amount), 0) AS revenue
      ${baseFrom}
      ${whereSql}
      GROUP BY country
      ORDER BY shipments DESC, revenue DESC
      LIMIT 12
    `, params);

    const summary = {
      totalShipments: Number(summaryRaw.totalShipments || 0),
      totalRevenue: clientRevenue,
      clientRevenue,
      purchaseCost,
      listPrice,
      discountAmount: roundMoney(Math.max(0, listPrice - clientRevenue)),
      paidGross: roundMoney(Number(summaryRaw.paidGross || 0)),
      refunds: roundMoney(Number(summaryRaw.refunds || 0)),
      paidNet,
      expectedProfit: roundMoney(clientRevenue - purchaseCost),
      netProfit: paidNet > 0 ? roundMoney(paidNet - purchaseCost) : 0,
      lossAmount: paidNet > 0 && paidNet < purchaseCost ? roundMoney(purchaseCost - paidNet) : 0,
      avgShipmentCost: roundMoney(Number(summaryRaw.avgShipmentCost || 0))
    };

    res.json({
      summary,
      rows: mappedRows,
      pagination: { page, limit, totalRows, totalPages: Math.max(1, Math.ceil(totalRows / limit)) },
      filters: { period, dateFrom, dateTo, provider: req.query?.provider || 'all', status: req.query?.status || 'all', search: req.query?.search || '' },
      daily: dailyRows.map((r: any) => ({ day: r.day, revenue: Number(r.revenue || 0), shipments: Number(r.shipments || 0) })),
      countries: countryRows.map((r: any) => ({ country: r.country || 'OT', shipments: Number(r.shipments || 0), revenue: Number(r.revenue || 0) })),
      providers: providerRows.map((r: any) => ({ provider: r.provider || 'Agencia', shipments: Number(r.shipments || 0), revenue: Number(r.revenue || 0), purchaseCost: Number(r.purchaseCost || 0), profit: Number(r.revenue || 0) - Number(r.purchaseCost || 0) }))
    });
  } catch (error) {
    console.error('[Diagnóstico Interno] Error en reportes administrativos:', error);
    res.status(500).json({ error: 'No se pudo cargar el reporte financiero.' });
  }
});

// Cliente: Reportes
app.get('/api/user/reports', authMiddleware, async (req: any, res) => {
  try {
    const [summaryRows]: any = await pool.query(`
      SELECT
        COUNT(*) AS totalShipments,
        SUM(CASE WHEN s.status_label IN ('Pendiente','Procesando') OR s.status IN ('created','processing','pending') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN s.status_label IN ('En Tránsito') OR s.status IN ('in_transit','transit') THEN 1 ELSE 0 END) AS transit,
        SUM(CASE WHEN s.status_label IN ('Entregado') OR s.status IN ('delivered') THEN 1 ELSE 0 END) AS delivered,
        COALESCE(SUM(CASE WHEN s.status NOT IN ('draft','cancelado','cancelled') THEN q.total_amount ELSE 0 END), 0) AS totalSpent
      FROM shipments s
      LEFT JOIN quotes q ON q.id = s.quote_id
      WHERE s.user_id = ?
    `, [req.user.id]);
    const [dailyRows]: any = await pool.query(`
      SELECT DATE(s.created_at) AS day, COUNT(*) AS shipments, COALESCE(SUM(q.total_amount), 0) AS total
      FROM shipments s
      LEFT JOIN quotes q ON q.id = s.quote_id
      WHERE s.user_id = ?
        AND s.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        AND s.status NOT IN ('draft','cancelado','cancelled')
      GROUP BY DATE(s.created_at)
      ORDER BY day ASC
    `, [req.user.id]);
    const [countryRows]: any = await pool.query(`
      SELECT
        UPPER(COALESCE(
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.recipient_json, '$.country')), ''),
          NULLIF(sa.country, ''),
          'OT'
        )) AS country,
        COUNT(*) AS shipments,
        COALESCE(SUM(q.total_amount), 0) AS total
      FROM shipments s
      LEFT JOIN quotes q ON q.id = s.quote_id
      LEFT JOIN shipment_addresses sa ON sa.shipment_id = s.id AND sa.type = 'recipient'
      WHERE s.user_id = ?
        AND s.status NOT IN ('draft','cancelado','cancelled')
      GROUP BY country
      ORDER BY shipments DESC, total DESC
      LIMIT 6
    `, [req.user.id]);

    res.json({
      summary: {
        totalShipments: Number(summaryRows?.[0]?.totalShipments || 0),
        pending: Number(summaryRows?.[0]?.pending || 0),
        transit: Number(summaryRows?.[0]?.transit || 0),
        delivered: Number(summaryRows?.[0]?.delivered || 0),
        totalSpent: Number(summaryRows?.[0]?.totalSpent || 0)
      },
      daily: dailyRows.map((r: any) => ({ day: r.day, shipments: Number(r.shipments || 0), total: Number(r.total || 0) })),
      countries: countryRows.map((r: any) => ({ country: r.country || 'OT', shipments: Number(r.shipments || 0), total: Number(r.total || 0) }))
    });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo cargar la información.' });
  }
});

// --- SOPORTE POR TICKETS ---

let aiClient: any = null;
function getGeminiClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

const fallbacks: Record<string, Record<string, string>> = {
  es: {
    tracking_problem: "Hola, lamentamos el inconveniente con el seguimiento de tu envío. Hemos verificado con el transportista y el estado de tu tracking se actualizará en las próximas horas. Por favor, vuelve a revisar al final del día.",
    delayed_shipment: "Lamentamos que tu envío esté demorado. Hemos escalado esta consulta directamente con el departamento de logística de la paquetería para acelerar la entrega. Te mantendremos informado en este ticket.",
    weight_mismatch: "Hemos registrado la discrepancia en el peso declarado frente a la lectura del courier. Nuestro equipo está revisando los datos de cubicación para ajustar la facturación de forma justa y evitar cargos adicionales indebidos."
  },
  en: {
    tracking_problem: "Hello, we apologize for the issue with tracking your shipment. We have checked with the carrier and the tracking status is expected to update within the next few hours. Please check again later today.",
    delayed_shipment: "We are sorry that your shipment is delayed. We have escalated this query directly with the logistics department of the courier to expedite delivery. We will keep you updated in this ticket.",
    weight_mismatch: "We have recorded the weight discrepancy reported by the courier. Our team is auditing the volume and weight metrics to adjust billing fairly and prevent unjustified extra fees."
  },
  it: {
    tracking_problem: "Ciao, ci scusiamo per il problema con il tracciamento della tua spedizione. Abbiamo verificato con il corriere e lo stato del tracking dovrebbe aggiornarsi nelle prossime ore. Ti invitiamo a controllare più tardi.",
    delayed_shipment: "Siamo spiacenti che la tua spedizione sia in ritardo. Abbiamo inoltrato questa richiesta direttamente al reparto logistico del corriere per accelerare la consegna. Ti terremo aggiornato in questo ticket.",
    weight_mismatch: "Abbiamo registrato la discrepanza di peso rispetto alla lettura del corriere. Il nostro team sta esaminando le metriche di volume e peso per regolare equamente la fatturazione ed evitare costi aggiuntivi ingiustificati."
  },
  fr: {
    tracking_problem: "Bonjour, nous nous excusons pour le problème de suivi de votre envoi. Nous avons vérifié auprès du transporteur et le statut du suivi devrait se mettre à jour dans les prochaines heures. Veuillez vérifier à nouveau plus tard.",
    delayed_shipment: "Nous sommes désolés pour le retard de votre envoi. Nous avons transmis cette demande directement au service logistique du transporteur afin d'accélérer la livraison. Nous vous tiendrons informé dans ce ticket.",
    weight_mismatch: "Nous avons enregistré l'écart de poids signalé par le transporteur. Notre équipe examine les dimensions et le poids pour ajuster la facturation équitablement et éviter des frais supplémentaires injustifiés."
  }
};


async function getAISupportReply(category: string, description: string, trackingCode: string, lang: string) {
  const language = normalizeCopilotLanguage(lang);
  const catKey = category.includes('tracking') ? 'tracking_problem' : (category.includes('retraso') || category.includes('delay') || category.includes('retard') || category.includes('ritardo')) ? 'delayed_shipment' : 'weight_mismatch';
  try {
    const prompt = `Ticket category: ${category}
Description: ${description}
Tracking code: ${trackingCode || 'N/A'}

Write a professional logistics support reply for DoorDrop. Use the customer's language (${language}). Use the word courier for shipping partners. Do not expose internal systems, raw data, keys, logs, tables or technical errors. Keep it friendly and concise.`;
    const response = await callAIText([
      { role: 'system', content: ship24goSupportSystemPrompt(language) },
      { role: 'user', content: prompt }
    ], language, { maxOutputTokens: 450 });
    if (response.text) return cleanCopilotOutput(response.text);
  } catch (err) {
    console.warn('[AI Support] OpenAI unavailable, using customer-safe fallback.');
  }
  return fallbacks[language]?.[catKey] || fallbacks['es']['tracking_problem'];
}

const COPILOT_LANGUAGES: Record<string, string> = {
  es: 'Spanish', en: 'English', it: 'Italian', fr: 'French', de: 'German', zh: 'Chinese'
};

const copilotMessages: Record<string, Record<string, string>> = {
  es: {
    missingMessage: 'Escribe tu consulta para ayudarte.',
    greeting: '¡Hola! Soy el Copiloto de DoorDrop. Puedo ayudarte con envíos, seguimiento, tickets, facturación e integraciones. ¿Qué necesitas?',
    ticketTracking: 'Seguimiento de envío',
    ticketShipment: 'Creación de envío',
    ticketBilling: 'Facturación y saldo',
    ticketPayments: 'Pagos y suscripción',
    ticketIntegrations: 'Integraciones',
    ticketAccount: 'Acceso y cuenta',
    ticketGeneral: 'Consulta de soporte',
    ticketRequestLabel: 'Solicitud del cliente',
    ticketTopicLabel: 'Tema',
    ticketConversationLabel: 'Contexto de la conversación',
    ticketReasonLabel: 'Motivo de escalación',
    ticketReasonHuman: 'La solicitud requiere revisión humana.',
    noData: 'No encontramos información suficiente para responder con seguridad. Un agente continuará la asistencia.',
    ticketCreated: 'Hemos creado un ticket para que un agente continúe la asistencia.',
    unavailable: 'Estamos revisando tu solicitud. Un agente continuará la asistencia.',
    title: 'Asistencia del Copiloto AI',
    category: 'Asistencia humana',
    summary: 'Resumen de conversación AI Copilot',
    handoffReply: 'Gracias por tu mensaje. Un agente de DoorDrop continuará la asistencia desde este ticket.'
  },
  en: {
    missingMessage: 'Write your question so we can help you.',
    greeting: 'Hello! I’m the DoorDrop Copilot. I can help with shipments, tracking, tickets, billing and integrations. What do you need?',
    ticketTracking: 'Shipment tracking',
    ticketShipment: 'Shipment creation',
    ticketBilling: 'Billing and balance',
    ticketPayments: 'Payments and subscription',
    ticketIntegrations: 'Integrations',
    ticketAccount: 'Account and access',
    ticketGeneral: 'Support request',
    ticketRequestLabel: 'Customer request',
    ticketTopicLabel: 'Topic',
    ticketConversationLabel: 'Conversation context',
    ticketReasonLabel: 'Escalation reason',
    ticketReasonHuman: 'The request requires human review.',
    noData: 'We could not find enough information to answer safely. An agent will continue the assistance.',
    ticketCreated: 'We created a ticket so an agent can continue the assistance.',
    unavailable: 'We are reviewing your request. An agent will continue the assistance.',
    title: 'AI Copilot Assistance',
    category: 'Human assistance',
    summary: 'AI Copilot conversation summary',
    handoffReply: 'Thank you for your message. A DoorDrop agent will continue the assistance from this ticket.'
  },
  it: {
    missingMessage: 'Scrivi la tua richiesta per poterti aiutare.',
    greeting: 'Ciao! Sono il Copilota DoorDrop. Posso aiutarti con spedizioni, tracciamento, ticket, fatturazione e integrazioni. Di cosa hai bisogno?',
    ticketTracking: 'Tracciamento della spedizione',
    ticketShipment: 'Creazione della spedizione',
    ticketBilling: 'Fatturazione e saldo',
    ticketPayments: 'Pagamenti e abbonamento',
    ticketIntegrations: 'Integrazioni',
    ticketAccount: 'Accesso e account',
    ticketGeneral: 'Richiesta di supporto',
    ticketRequestLabel: 'Richiesta del cliente',
    ticketTopicLabel: 'Argomento',
    ticketConversationLabel: 'Contesto della conversazione',
    ticketReasonLabel: 'Motivo dell’escalation',
    ticketReasonHuman: 'La richiesta richiede una revisione umana.',
    noData: 'Non abbiamo trovato informazioni sufficienti per rispondere in sicurezza. Un agente continuerà l’assistenza.',
    ticketCreated: 'Abbiamo creato un ticket così un agente può continuare l’assistenza.',
    unavailable: 'Stiamo esaminando la tua richiesta. Un agente continuerà l’assistenza.',
    title: 'Assistenza Copilota IA',
    category: 'Assistenza umana',
    summary: 'Riepilogo conversazione Copilota IA',
    handoffReply: 'Grazie per il tuo messaggio. Un agente DoorDrop continuerà l’assistenza da questo ticket.'
  },
  fr: {
    missingMessage: 'Écrivez votre demande afin que nous puissions vous aider.',
    greeting: 'Bonjour ! Je suis le Copilote DoorDrop. Je peux vous aider avec les envois, le suivi, les tickets, la facturation et les intégrations. Que souhaitez-vous faire ?',
    ticketTracking: 'Suivi de l’envoi',
    ticketShipment: 'Création d’un envoi',
    ticketBilling: 'Facturation et solde',
    ticketPayments: 'Paiements et abonnement',
    ticketIntegrations: 'Intégrations',
    ticketAccount: 'Accès et compte',
    ticketGeneral: 'Demande de support',
    ticketRequestLabel: 'Demande du client',
    ticketTopicLabel: 'Sujet',
    ticketConversationLabel: 'Contexte de la conversation',
    ticketReasonLabel: 'Motif de l’escalade',
    ticketReasonHuman: 'La demande nécessite une vérification humaine.',
    noData: 'Nous n’avons pas trouvé suffisamment d’informations pour répondre avec sécurité. Un agent poursuivra l’assistance.',
    ticketCreated: 'Nous avons créé un ticket afin qu’un agent poursuive l’assistance.',
    unavailable: 'Nous examinons votre demande. Un agent poursuivra l’assistance.',
    title: 'Assistance Copilote IA',
    category: 'Assistance humaine',
    summary: 'Résumé de conversation Copilote IA',
    handoffReply: 'Merci pour votre message. Un agent DoorDrop poursuivra l’assistance depuis ce ticket.'
  },
  de: {
    missingMessage: 'Schreiben Sie Ihre Anfrage, damit wir helfen können.',
    greeting: 'Hallo! Ich bin der DoorDrop-Copilot. Ich helfe bei Sendungen, Tracking, Tickets, Abrechnung und Integrationen. Wobei kann ich helfen?',
    ticketTracking: 'Sendungsverfolgung',
    ticketShipment: 'Sendung erstellen',
    ticketBilling: 'Abrechnung und Guthaben',
    ticketPayments: 'Zahlungen und Abonnement',
    ticketIntegrations: 'Integrationen',
    ticketAccount: 'Konto und Zugang',
    ticketGeneral: 'Supportanfrage',
    ticketRequestLabel: 'Kundenanfrage',
    ticketTopicLabel: 'Thema',
    ticketConversationLabel: 'Gesprächskontext',
    ticketReasonLabel: 'Grund der Eskalation',
    ticketReasonHuman: 'Die Anfrage erfordert eine menschliche Prüfung.',
    noData: 'Wir haben nicht genügend Informationen gefunden, um sicher zu antworten. Ein Mitarbeiter setzt die Unterstützung fort.',
    ticketCreated: 'Wir haben ein Ticket erstellt, damit ein Mitarbeiter die Unterstützung fortsetzen kann.',
    unavailable: 'Wir prüfen Ihre Anfrage. Ein Mitarbeiter setzt die Unterstützung fort.',
    title: 'KI-Copilot Unterstützung',
    category: 'Menschliche Unterstützung',
    summary: 'Zusammenfassung der KI-Copilot Unterhaltung',
    handoffReply: 'Vielen Dank für Ihre Nachricht. Ein DoorDrop Mitarbeiter setzt die Unterstützung über dieses Ticket fort.'
  },
  zh: {
    missingMessage: '请写下您的问题，以便我们为您提供帮助。',
    greeting: '您好！我是 DoorDrop AI 助手，可以帮助您处理寄件、追踪、工单、账单和集成。请问需要什么帮助？',
    ticketTracking: '包裹追踪',
    ticketShipment: '创建运单',
    ticketBilling: '账单与余额',
    ticketPayments: '付款与订阅',
    ticketIntegrations: '集成',
    ticketAccount: '账户与登录',
    ticketGeneral: '支持请求',
    ticketRequestLabel: '客户请求',
    ticketTopicLabel: '主题',
    ticketConversationLabel: '对话上下文',
    ticketReasonLabel: '升级原因',
    ticketReasonHuman: '该请求需要人工审核。',
    noData: '我们没有找到足够的信息来安全回复。客服人员将继续协助。',
    ticketCreated: '我们已创建工单，客服人员将继续协助。',
    unavailable: '我们正在查看您的请求。客服人员将继续协助。',
    title: 'AI 助手协助',
    category: '人工协助',
    summary: 'AI 助手对话摘要',
    handoffReply: '感谢您的留言。DoorDrop 客服人员将通过此工单继续协助您。'
  }
};

function normalizeCopilotLanguage(value: any): string {
  const raw = String(value || '').toLowerCase().trim();
  if (raw.startsWith('en')) return 'en';
  if (raw.startsWith('it')) return 'it';
  if (raw.startsWith('fr')) return 'fr';
  if (raw.startsWith('de')) return 'de';
  if (raw.startsWith('zh')) return 'zh';
  return 'es';
}

function copilotText(lang: string, key: string): string {
  const language = normalizeCopilotLanguage(lang);
  return copilotMessages[language]?.[key] || copilotMessages.es[key] || key;
}

function copilotTicketTopicKey(message: string, history: any[] = []): string {
  const source = [
    ...history.filter((item: any) => item?.role === 'user').map((item: any) => item?.content),
    message
  ].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ' ');
  if (/(tracking|tracci|seguimiento|rastre|dove si trova|where is|donde esta)/.test(source)) return 'ticketTracking';
  if (/(factur|invoice|billing|wallet|saldo|balance|recarga|recharge|refund|reembolso|rimborso)/.test(source)) return 'ticketBilling';
  if (/(pagament|payment|pago|paypal|polar|suscrip|abbon|subscription|plan)/.test(source)) return 'ticketPayments';
  if (/(integr|shopify|amazon|ebay|temu|wix|store|tienda|boutique)/.test(source)) return 'ticketIntegrations';
  if (/(password|contrasena|acces|login|cuenta|account|konto|mot de passe)/.test(source)) return 'ticketAccount';
  if (/(spediz|envio|shipment|package|paquet|pacco|courier|carrier|transport)/.test(source)) return 'ticketShipment';
  return 'ticketGeneral';
}

function buildCopilotTicketSubject(lang: string, message: string, history: any[] = []): string {
  return `DoorDrop · ${copilotText(lang, copilotTicketTopicKey(message, history))}`.slice(0, 160);
}

function isSimpleCopilotGreeting(message: string): boolean {
  const text = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[!?.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text.length > 80) return false;
  return /^(?:ciao|salve|buongiorno|buonasera|buonanotte|hola|buenos dias|buenas tardes|buenas noches|hello|hi|hey|good morning|good afternoon|good evening|bonjour|bonsoir|guten tag|guten morgen|guten abend|ni hao|你好)(?: (?:doordrop|door drop|team|equipo|support|supporto|assistance))?$/.test(text);
}

function escapeRegExp(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactCopilotProviderDetails(value: any, hiddenTerms: string[] = []): string {
  let text = cleanCopilotOutput(value);
  const terms = hiddenTerms
    .map((term) => String(term || '').trim())
    .filter((term) => term.length >= 3 && !/^doordrop$/i.test(term))
    .sort((a, b) => b.length - a.length);
  for (const term of terms) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi'), 'courier DoorDrop');
  }
  return text;
}

function ship24goSupportSystemPrompt(lang: string): string {
  return `You are DoorDrop Copilot, a professional logistics support assistant.
Respond in ${COPILOT_LANGUAGES[normalizeCopilotLanguage(lang)] || 'Spanish'}.
Use only the context provided by DoorDrop backend. Do not invent shipment status, invoices, balances, labels, provider responses or internal facts.
Use the public word "courier" for shipping partners. Do not name a courier unless DoorDrop has explicitly marked that exact name as customer-visible in the provided context.
Never mention internal database tables, schemas, payloads, logs, environment variables, API keys, SQL, migrations, endpoints, stack traces, debug details, or hidden configuration.
Never reveal provider codes, upstream aggregators, suppliers, brokers, purchase sources, internal margins, internal costs, or the names of services DoorDrop uses behind the scenes. If asked where DoorDrop buys or routes transport, say only that DoorDrop uses a connected logistics network and offers the available service and final price.
If the context does not include a live quote, do not escalate just because a price needs shipment details: explain which details are required and ask the customer for them. Append the exact marker [[HUMAN_ESCALATION]] only when the customer explicitly requests a human, reports a problem that cannot be resolved with the context, or a human decision/action is genuinely required.
Keep answers clear, commercial, friendly and concise. Prefer a direct answer with short bullets and no more than 120 words unless more detail is necessary.`;
}

function cleanCopilotOutput(value: any): string {
  return String(value || '')
    .replace(/\[\[HUMAN_ESCALATION\]\]/g, '')
    .replace(/\bbroker\b/gi, 'courier')
    .replace(/\bSQL\b/g, 'data')
    .replace(/\bdatabase\b/gi, 'system information')
    .replace(/\bschema\b/gi, 'configuration')
    .replace(/\bmigration\b/gi, 'update')
    .replace(/\bendpoint\b/gi, 'service')
    .trim();
}

function hasHumanEscalationMarker(value: any): boolean {
  return String(value || '').includes('[[HUMAN_ESCALATION]]');
}

function shouldForceHumanEscalation(message: string): boolean {
  const text = String(message || '').toLowerCase();
  return [
    'humano', 'persona', 'agente', 'soporte humano', 'asesor',
    'human', 'agent', 'representative',
    'operatore', 'persona reale',
    'humain', 'agent',
    'mitarbeiter', '客服', '人工'
  ].some((needle) => text.includes(needle));
}

function parseOpenAIText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  const output = Array.isArray(data?.output) ? data.output : [];
  const parts: string[] = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (typeof c?.text === 'string') parts.push(c.text);
      if (typeof c?.content === 'string') parts.push(c.content);
    }
  }
  return parts.join('\n').trim();
}

function parseChatCompletionText(data: any): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((part: any) => typeof part === 'string' ? part : (part?.text || part?.content || '')).join('\n').trim();
  }
  return '';
}

async function getStoredAISettings(): Promise<any> {
  const settings = await AdminSettingsRepo.get().catch(() => ({}));
  return settings?.ai || {};
}

async function publicAISettings(): Promise<any> {
  const stored = await getStoredAISettings();
  const requestedProvider = String(stored.provider || '').trim().toLowerCase();
  const provider = requestedProvider === 'groq' || requestedProvider === 'openai'
    ? requestedProvider
    : (stored.groqApiKey || process.env.GROQ_API_KEY ? 'groq' : 'openai');
  const openaiKey = stored.openaiApiKey || process.env.OPENAI_API_KEY || '';
  const groqKey = stored.groqApiKey || process.env.GROQ_API_KEY || '';
  const key = provider === 'groq' ? groqKey : openaiKey;
  const defaultModel = provider === 'groq'
    ? (process.env.GROQ_MODEL || 'openai/gpt-oss-20b')
    : (process.env.OPENAI_MODEL || 'gpt-5.4-mini');
  return {
    enabled: stored.enabled !== false,
    provider,
    model: stored.model || defaultModel,
    autoTicket: stored.autoTicket !== false,
    maxContextRecords: Math.max(5, Math.min(50, Number(stored.maxContextRecords || process.env.AI_COPILOT_MAX_CONTEXT_RECORDS || 20))),
    publicProviderWord: 'courier',
    instructions: stored.instructions || '',
    openaiApiKey: openaiKey ? '••••••••' : '',
    groqApiKey: groqKey ? '••••••••' : '',
    hasOpenAIKey: Boolean(openaiKey),
    hasGroqKey: Boolean(groqKey),
    hasKey: Boolean(key)
  };
}

async function callAIText(messages: Array<{ role: string; content: string }>, lang: string, opts: any = {}): Promise<{ text: string; model: string }> {
  const stored = await getStoredAISettings();
  const requestedProvider = String(stored.provider || '').trim().toLowerCase();
  const provider = requestedProvider === 'groq' || requestedProvider === 'openai'
    ? requestedProvider
    : (stored.groqApiKey || process.env.GROQ_API_KEY ? 'groq' : 'openai');
  const apiKey = provider === 'groq'
    ? (stored.groqApiKey || process.env.GROQ_API_KEY)
    : (stored.openaiApiKey || process.env.OPENAI_API_KEY);
  const defaultModel = provider === 'groq'
    ? (process.env.GROQ_MODEL || 'openai/gpt-oss-20b')
    : (process.env.OPENAI_MODEL || 'gpt-5.4-mini');
  const model = String(stored.model || defaultModel).trim();
  if (!apiKey) throw new Error('AI key unavailable');
  if (stored.enabled === false) throw new Error('AI disabled');

  if (provider === 'groq') {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: Math.max(200, Math.min(1200, Number(opts.maxOutputTokens || 700))),
        temperature: 0.2
      })
    });

    if (!response.ok) {
      console.warn('[AI Copilot] Groq request failed:', response.status);
      throw new Error('AI request unavailable');
    }

    const data = await response.json();
    return { text: parseChatCompletionText(data), model };
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: messages,
      max_output_tokens: Math.max(200, Math.min(1200, Number(opts.maxOutputTokens || 700))),
      store: false
    })
  });

  if (!response.ok) {
    console.warn('[AI Copilot] OpenAI request failed:', response.status);
    throw new Error('AI request unavailable');
  }

  const data = await response.json();
  return { text: parseOpenAIText(data), model };
}

let copilotTablesReady = false;
async function ensureCopilotTables() {
  if (copilotTablesReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_conversations (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'es',
    status VARCHAR(30) NOT NULL DEFAULT 'open',
    ticket_id CHAR(36) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ai_conversations_user_created (user_id, created_at),
    INDEX idx_ai_conversations_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_messages (
    id CHAR(36) PRIMARY KEY,
    conversation_id CHAR(36) NOT NULL,
    user_id CHAR(36) NULL,
    role VARCHAR(30) NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ai_messages_conversation_created (conversation_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_handoffs (
    id CHAR(36) PRIMARY KEY,
    conversation_id CHAR(36) NOT NULL,
    ticket_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'es',
    reason VARCHAR(120) NULL,
    summary TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ai_handoffs_user_created (user_id, created_at),
    INDEX idx_ai_handoffs_ticket (ticket_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  copilotTablesReady = true;
}

async function getOrCreateCopilotConversation(userId: string, lang: string, conversationId?: string): Promise<string> {
  await ensureCopilotTables();
  const safeId = String(conversationId || '').trim();
  if (safeId) {
    const [rows]: any = await pool.query('SELECT id FROM ai_conversations WHERE id = ? AND user_id = ? LIMIT 1', [safeId, userId]);
    if (rows.length) return safeId;
  }
  const id = generateId('aic_');
  await pool.query('INSERT INTO ai_conversations (id, user_id, language, status) VALUES (?, ?, ?, ?)', [id, userId, normalizeCopilotLanguage(lang), 'open']);
  return id;
}

async function saveCopilotMessage(conversationId: string, userId: string | null, role: string, content: string) {
  await ensureCopilotTables();
  await pool.query('INSERT INTO ai_messages (id, conversation_id, user_id, role, content) VALUES (?, ?, ?, ?, ?)', [generateId('aim_'), conversationId, userId, role, String(content || '').slice(0, 12000)]);
}

function compactJson(value: any, max = 20000): string {
  const text = JSON.stringify(value, null, 2);
  return text.length > max ? `${text.slice(0, max)}\n...` : text;
}

async function buildCopilotContext(req: any, limit: number) {
  const isSuperAdmin = req.user.role === 'super_admin';
  const providers = isSuperAdmin ? await ProviderRepo.getAll().catch(() => []) : [];
  const providerSummary = providers.map((p: any) => ({
    code: p.code,
    name: p.name,
    active: Boolean(p.is_active),
    connected: Boolean(p.is_connected),
    lastStatus: p.last_connection_status || null
  })).slice(0, limit);

  if (isSuperAdmin) {
    const [users, shipments, stores, tickets, plans]: any[] = await Promise.all([
      UserRepo.getAll().catch(() => []),
      ShipmentRepo.getAll().catch(() => []),
      StoreRepo.getAll().catch(() => []),
      TicketRepo.getAll().catch(() => []),
      PlanRepo.getAll().catch(() => [])
    ]);
    return {
      role: 'super_admin',
      summary: {
        totalUsers: users.length,
        totalShipments: shipments.length,
        totalStores: stores.length,
        totalTickets: tickets.length,
        openTickets: tickets.filter((t: any) => t.status === 'open').length
      },
      recentShipments: shipments.slice(0, limit).map((s: any) => ({ id: s.id, trackingCode: s.tracking_code, courier: s.provider_code, status: s.status_label || s.status, createdAt: s.created_at })),
      recentTickets: tickets.slice(0, limit).map((t: any) => ({ id: t.id, subject: t.subject, category: t.category, status: t.status, createdAt: t.created_at })),
      plans: plans.map((p: any) => ({ code: p.code, name: p.name, price: p.price, currency: p.currency, active: Boolean(p.is_active) })),
      couriers: providerSummary
    };
  }

  const [myShipments, myTickets, myStores, myCompany, plans]: any[] = await Promise.all([
    ShipmentRepo.getByUserId(req.user.id).catch(() => []),
    TicketRepo.getByUserId(req.user.id).catch(() => []),
    StoreRepo.getByUserId(req.user.id).catch(() => []),
    CompanyRepo.getByUserId(req.user.id).catch(() => null),
    PlanRepo.getAll().catch(() => [])
  ]);

  const shipments = myShipments.slice(0, limit);
  const shipmentEvents: any[] = [];
  for (const shipment of shipments.slice(0, 6)) {
    try {
      const events = await TrackingEventRepo.getByShipmentId(shipment.id);
      shipmentEvents.push({ shipmentId: shipment.id, trackingCode: shipment.tracking_code, events: events.slice(0, 5).map((e: any) => ({ status: e.status_label || e.status_code, description: e.description, eventTime: e.event_time })) });
    } catch {}
  }

  return {
    role: 'customer',
    customer: {
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      country: req.user.country,
      currency: req.user.currency,
      balance: Number(req.user.balance || 0)
    },
    company: myCompany ? { name: myCompany.company_name, city: myCompany.city, country: myCompany.country } : null,
    shipments: shipments.map((s: any) => ({
      id: s.id,
      trackingCode: s.tracking_code,
      status: s.status_label || s.status,
      createdAt: s.created_at,
      updatedAt: s.updated_at
    })),
    trackingEvents: shipmentEvents,
    stores: myStores.slice(0, limit).map((st: any) => ({ id: st.id, platform: st.platform, name: st.store_name, status: st.status })),
    tickets: myTickets.slice(0, limit).map((t: any) => ({ id: t.id, subject: t.subject, category: t.category, status: t.status, createdAt: t.created_at })),
    plans: plans.map((p: any) => ({ code: p.code, name: p.name, price: p.price, currency: p.currency, active: Boolean(p.is_active) }))
  };
}

async function getHiddenCopilotProviderTerms(): Promise<string[]> {
  const providers = await ProviderRepo.getAll().catch(() => []);
  return providers.flatMap((provider: any) => [provider?.name, provider?.code]).filter(Boolean);
}

async function createCopilotHumanTicket(req: any, conversationId: string, lang: string, message: string, history: any[], reason: string) {
  await ensureCopilotTables();
  const language = normalizeCopilotLanguage(lang);
  const ticketId = generateId('tkt_');
  const hiddenProviderTerms = await getHiddenCopilotProviderTerms();
  const safeMessage = redactCopilotProviderDetails(String(message || '').slice(0, 1200), hiddenProviderTerms);
  const historyLines = (history || []).slice(-8).map((m: any) => `${m.role === 'user' ? copilotText(language, 'ticketRequestLabel') : 'AI'}: ${redactCopilotProviderDetails(String(m.content || '').slice(0, 700), hiddenProviderTerms)}`).join('\n');
  const subject = buildCopilotTicketSubject(language, message, history);
  const description = [
    `${copilotText(language, 'ticketRequestLabel')}: ${safeMessage}`,
    `${copilotText(language, 'ticketTopicLabel')}: ${subject}`,
    historyLines ? `${copilotText(language, 'ticketConversationLabel')}:\n${historyLines}` : '',
    `${copilotText(language, 'ticketReasonLabel')}: ${copilotText(language, 'ticketReasonHuman')}`
  ].filter(Boolean).join('\n\n').slice(0, 12000);

  await TicketRepo.create({
    id: ticketId,
    user_id: req.user.id,
    subject,
    category: 'ai_copilot_handoff',
    description,
    tracking_code: '',
    status: 'open'
  });
  await TicketRepo.addReply({
    id: generateId('rep_'),
    ticket_id: ticketId,
    sender_role: 'system',
    message: copilotText(language, 'handoffReply')
  });
  await pool.query('UPDATE ai_conversations SET status = ?, ticket_id = ? WHERE id = ?', ['human_handoff', ticketId, conversationId]);
  const handoffId = generateId('aih_');
  await pool.query('INSERT INTO ai_handoffs (id, conversation_id, ticket_id, user_id, language, reason, summary) VALUES (?, ?, ?, ?, ?, ?, ?)', [handoffId, conversationId, ticketId, req.user.id, language, reason, description.slice(0, 4000)]);

  const ticketUrl = `${appBaseUrl()}/panel/tickets/${encodeURIComponent(ticketId)}`;
  const customerEmail = isValidEmailForProvider(req.user.email);
  if (customerEmail) {
    await sendNotificationEvent({
      eventCode: 'ai_handoff_customer',
      entityType: 'ai_handoff',
      entityId: handoffId,
      audience: 'customer',
      userId: req.user.id,
      toEmail: customerEmail,
      recipientName: req.user.name,
      language,
      variables: {
        userName: req.user.name || customerEmail,
        ticketId,
        ticketUrl,
        summary: String(message || '').trim().slice(0, 1200),
        statusLabel: 'En revisión por un agente'
      }
    }).catch(() => undefined);
  }

  const internalEmail = isValidEmailForProvider(process.env.CANCELLATION_REVIEW_EMAIL)
    || isValidEmailForProvider(process.env.ADMIN_EMAIL)
    || '';
  if (internalEmail) {
    await sendNotificationEvent({
      eventCode: 'ai_handoff_internal',
      entityType: 'ai_handoff',
      entityId: handoffId,
      audience: 'internal',
      toEmail: internalEmail,
      recipientName: 'Equipo DoorDrop',
      language: 'es',
      variables: {
        customerName: req.user.name || customerEmail || 'Cliente DoorDrop',
        customerEmail: customerEmail || 'No disponible',
        ticketId,
        ticketUrl,
        channel: 'AI Copilot',
        reason,
        summary: String(message || '').trim().slice(0, 1200)
      }
    }).catch(() => undefined);
  }
  return await TicketRepo.getById(ticketId);
}

async function handleCopilotMessage(req: any, res: any) {
  const { message, history, lang, conversationId } = req.body || {};
  const language = normalizeCopilotLanguage(lang || req.user?.language || 'es');
  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) return res.status(400).json({ error: copilotText(language, 'missingMessage') });

  const aiSettings = await publicAISettings();
  const conversation = await getOrCreateCopilotConversation(req.user.id, language, conversationId);
  await saveCopilotMessage(conversation, req.user.id, 'user', cleanMessage);

  let responseText = '';
  let escalated = false;
  let ticket: any = null;

  try {
    const forceEscalation = shouldForceHumanEscalation(cleanMessage);

    if (forceEscalation) {
      responseText = copilotText(language, 'unavailable');
      escalated = true;
    } else if (isSimpleCopilotGreeting(cleanMessage)) {
      responseText = copilotText(language, 'greeting');
    } else {
      const context = await buildCopilotContext(req, Number(aiSettings.maxContextRecords || 20));
      const hiddenProviderTerms = req.user.role === 'super_admin' ? [] : await getHiddenCopilotProviderTerms();
      const historyText = (history || []).slice(-8).map((msg: any) => `${msg.role === 'user' ? 'Customer' : 'Assistant'}: ${redactCopilotProviderDetails(String(msg.content || '').slice(0, 900), hiddenProviderTerms)}`).join('\n');
      const prompt = `Customer message: ${cleanMessage}

Recent conversation:
${historyText || 'No previous messages.'}

DoorDrop backend context:
${compactJson(context)}

Answer the customer now. If shipment details are missing for a live quote, ask for those details instead of escalating. Append [[HUMAN_ESCALATION]] only under the escalation rule above.`;
      const ai = await callAIText([
        { role: 'system', content: `${ship24goSupportSystemPrompt(language)}\nAdditional admin instructions: ${String((await getStoredAISettings()).instructions || '').slice(0, 1200)}` },
        { role: 'user', content: prompt }
      ], language);
      escalated = hasHumanEscalationMarker(ai.text);
      responseText = redactCopilotProviderDetails(ai.text, hiddenProviderTerms) || copilotText(language, 'noData');
      if (!responseText || escalated) escalated = true;
    }
  } catch (error) {
    console.warn('[AI Copilot] Using human handoff fallback.');
    responseText = copilotText(language, 'unavailable');
    escalated = true;
  }

  if (escalated && aiSettings.autoTicket !== false) {
    ticket = await createCopilotHumanTicket(req, conversation, language, cleanMessage, history || [], 'needs_human_support').catch((err) => {
      console.warn('[AI Copilot] Could not create handoff ticket.');
      return null;
    });
    responseText = responseText || copilotText(language, 'ticketCreated');
  }

  await saveCopilotMessage(conversation, null, 'assistant', responseText);
  res.json({ success: true, response: responseText, conversationId: conversation, escalated, ticket: ticket ? { id: ticket.id, subject: ticket.subject, status: ticket.status } : null });
}


const CANCELLATION_REASON_LABELS: Record<string, Record<string, string>> = {
  es: { service_not_needed: 'Ya no necesito realizar el envío', incorrect_shipment_data: 'Los datos del envío son incorrectos', duplicate_shipment: 'El envío fue creado por duplicado', delivery_time: 'El plazo de entrega no me conviene', price: 'El precio final no me conviene', other: 'Otro motivo' },
  en: { service_not_needed: 'I no longer need this shipment', incorrect_shipment_data: 'The shipment details are incorrect', duplicate_shipment: 'The shipment was created twice', delivery_time: 'The delivery time does not work for me', price: 'The final price does not work for me', other: 'Other reason' },
  it: { service_not_needed: 'Non ho più bisogno di effettuare la spedizione', incorrect_shipment_data: 'I dati della spedizione non sono corretti', duplicate_shipment: 'La spedizione è stata creata due volte', delivery_time: 'Il tempo di consegna non è adatto', price: 'Il prezzo finale non è adatto', other: 'Altro motivo' },
  fr: { service_not_needed: 'Je n’ai plus besoin de cet envoi', incorrect_shipment_data: 'Les informations de l’envoi sont incorrectes', duplicate_shipment: 'L’envoi a été créé deux fois', delivery_time: 'Le délai de livraison ne me convient pas', price: 'Le prix final ne me convient pas', other: 'Autre motif' },
  de: { service_not_needed: 'Ich benötige diese Sendung nicht mehr', incorrect_shipment_data: 'Die Sendungsdaten sind falsch', duplicate_shipment: 'Die Sendung wurde doppelt erstellt', delivery_time: 'Die Lieferzeit passt nicht', price: 'Der Endpreis passt nicht', other: 'Anderer Grund' },
};

app.post('/api/shipments/:id/cancellation-reason/suggest', authMiddleware, async (req: any, res) => {
  try {
    const shipment = await ShipmentRepo.getById(req.params.id);
    if (!shipment || shipment.user_id !== req.user.id) return res.status(404).json({ error: 'No hay datos para mostrar.' });
    if (!canRequestCancellationForShipment(shipment)) return res.status(400).json({ error: 'Este envío no permite solicitar cancelación en este momento.' });

    const language = normalizeCopilotLanguage(req.body?.lang || req.user?.language || 'es');
    const code = String(req.body?.reasonCode || 'other');
    const label = CANCELLATION_REASON_LABELS[language]?.[code] || CANCELLATION_REASON_LABELS.es[code] || CANCELLATION_REASON_LABELS.es.other;
    const customerDetail = String(req.body?.detail || '').trim().slice(0, 1200);
    const count = Math.max(1, Math.min(100, Number(req.body?.shipmentCount || 1)));
    const fallback = customerDetail || label;

    try {
      const ai = await callAIText([
        { role: 'system', content: `You rewrite a customer's shipment cancellation explanation in ${COPILOT_LANGUAGES[language] || 'Spanish'}. Be factual, polite and concise (maximum 70 words). Preserve the customer's meaning. Do not invent dates, promises, refunds, legal claims, courier actions or personal data. Return only the improved explanation.` },
        { role: 'user', content: `Selected reason: ${label}\nShipments included: ${count}\nCustomer detail: ${customerDetail || 'No additional detail provided.'}` },
      ], language, { maxOutputTokens: 180 });
      return res.json({ success: true, suggestion: cleanCopilotOutput(ai.text).slice(0, 1500), source: 'ai' });
    } catch {
      return res.json({ success: true, suggestion: fallback.slice(0, 1500), source: 'predefined' });
    }
  } catch {
    return res.status(500).json({ error: 'No se pudo preparar la explicación.' });
  }
});

// Solicitar cancelación: el cliente abre un ticket, el reembolso queda pendiente de revisión.
app.post('/api/shipments/:id/cancel-request', authMiddleware, async (req: any, res) => {
  const conn = await pool.getConnection();
  try {
    const shipment = await ShipmentRepo.getById(req.params.id);
    if (!shipment || shipment.user_id !== req.user.id) {
      return res.status(404).json({ error: 'No hay datos para mostrar.' });
    }
    if (!canRequestCancellationForShipment(shipment)) {
      return res.status(400).json({ error: 'Este envío no permite solicitar cancelación en este momento.' });
    }

    const [existing]: any = await pool.query(
      `SELECT * FROM cancellation_requests WHERE shipment_id = ? AND status IN ('pending_review','approved','refunded') LIMIT 1`,
      [shipment.id]
    );
    if (existing.length) {
      return res.json({ success: true, message: 'Tu solicitud ya está en revisión.', cancellationRequest: existing[0] });
    }

    const charge = await getShipmentChargeAmount(shipment.id);
    if (charge.amount <= 0) {
      return res.status(400).json({ error: 'No hay un importe disponible para revisar.' });
    }

    const reason = String(req.body?.reason || '').trim().slice(0, 2000) || 'El cliente solicita cancelar el envío y revisión de reembolso.';
    const ticketId = generateId('tkt_');
    const requestId = generateId('can_');
    const tracking = shipment.tracking_code || shipment.provider_shipment_code || shipment.id;

    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO tickets (id, user_id, subject, category, description, tracking_code, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [ticketId, req.user.id, `Solicitud de cancelación ${tracking}`, 'cancellation_request', reason, tracking, 'open']
    );
    await conn.query(
      'INSERT INTO ticket_replies (id, ticket_id, sender_user_id, sender_role, message) VALUES (?, ?, ?, ?, ?)',
      [generateId('rep_'), ticketId, null, 'system', 'Hemos recibido tu solicitud. El equipo revisará el estado del envío antes de aprobar cualquier reembolso. No se realizará ningún reembolso automático.']
    );
    await conn.query(
      `INSERT INTO cancellation_requests (id, shipment_id, ticket_id, user_id, amount, currency, status, reason)
       VALUES (?, ?, ?, ?, ?, ?, 'pending_review', ?)`,
      [requestId, shipment.id, ticketId, req.user.id, charge.amount, charge.currency, reason]
    );
    await conn.commit();

    const cancellation = { id: requestId, shipment_id: shipment.id, ticket_id: ticketId, user_id: req.user.id, amount: charge.amount, currency: charge.currency, status: 'pending_review', reason };
    await sendCancellationEmail(shipment, cancellation, 'cancellation_request_received').catch(() => null);
    await sendCancellationEmail(shipment, cancellation, 'cancellation_request_internal').catch(() => null);

    res.json({ success: true, message: 'Tu solicitud fue recibida. Nuestro equipo la revisará y te responderá por correo y ticket.', ticketId, cancellationRequest: cancellation });
  } catch (error: any) {
    try { await conn.rollback(); } catch {}
    res.status(500).json({ error: 'No se pudo completar la solicitud.' });
  } finally {
    conn.release();
  }
});

app.post('/api/admin/cancellation-requests/:id/approve', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureWalletCurrencySchema();
    const note = String(req.body?.note || '').trim().slice(0, 1000) || 'Solicitud aprobada. Importe acreditado en el monedero del cliente.';
    await conn.beginTransaction();
    const [rows]: any = await conn.query(`SELECT * FROM cancellation_requests WHERE id = ? FOR UPDATE`, [req.params.id]);
    const request = rows[0];
    if (!request) return res.status(404).json({ error: 'No hay datos para mostrar.' });
    if (!['pending_review','approved'].includes(String(request.status))) {
      await conn.rollback();
      return res.status(400).json({ error: 'Esta solicitud ya fue revisada.' });
    }
    if (request.refund_transaction_id) {
      await conn.rollback();
      return res.status(400).json({ error: 'El reembolso ya fue aplicado.' });
    }
    const amount = roundMoney(Number(request.amount || 0));
    if (amount <= 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'No hay un importe disponible para reembolsar.' });
    }
    const refundTxId = generateId('wtx_');
    const rates = await getFreshRatesInternal();
    const mutation = await applyWalletMutation(conn, {
      userId: request.user_id,
      type: 'credit',
      amount,
      currency: request.currency || 'EUR',
      description: 'Reembolso aprobado por cancelación de envío',
      referenceType: 'cancellation_refund',
      referenceId: request.shipment_id,
      transactionId: refundTxId,
      rates
    });
    await conn.query(
      `UPDATE cancellation_requests SET status = 'refunded', admin_note = ?, reviewed_by = ?, reviewed_at = NOW(), refund_transaction_id = ?, updated_at = NOW() WHERE id = ?`,
      [note, req.user.id, refundTxId, request.id]
    );
    await conn.query(`UPDATE tickets SET status = 'resolved', updated_at = NOW() WHERE id = ?`, [request.ticket_id]);
    await conn.query(
      'INSERT INTO ticket_replies (id, ticket_id, sender_user_id, sender_role, message) VALUES (?, ?, ?, ?, ?)',
      [generateId('rep_'), request.ticket_id, req.user.id, 'super_admin', note]
    );
    await conn.query(`UPDATE shipments SET status = 'reembolso_aprobado', status_label = 'Reembolso aprobado', updated_at = NOW() WHERE id = ?`, [request.shipment_id]);
    await conn.commit();

    const shipment = await ShipmentRepo.getById(request.shipment_id);
    await TrackingEventRepo.create({ shipment_id: request.shipment_id, tracking_code: shipment?.tracking_code || '', status: 'reembolso_aprobado', status_label: 'Reembolso aprobado', description: 'La solicitud de cancelación fue aprobada y el importe fue acreditado en el monedero.' });
    await sendCancellationEmail(shipment, { ...request, status: 'refunded', refund_transaction_id: refundTxId, amount: mutation.walletAmount, currency: mutation.walletCurrency }, 'cancellation_approved_refunded', { adminNote: note }).catch(() => null);

    res.json({ success: true, message: 'Reembolso aprobado y acreditado en el monedero.', refundTransactionId: refundTxId });
  } catch (error: any) {
    try { await conn.rollback(); } catch {}
    if (error?.code === 'FX_UNAVAILABLE') return res.status(503).json({ error: 'La tasa de cambio no está disponible. El reembolso no fue aplicado.' });
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  } finally {
    conn.release();
  }
});

app.post('/api/admin/cancellation-requests/:id/reject', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  const conn = await pool.getConnection();
  try {
    const note = String(req.body?.note || '').trim().slice(0, 1000) || 'Solicitud revisada. No fue posible aprobar el reembolso en este momento.';
    await conn.beginTransaction();
    const [rows]: any = await conn.query(`SELECT * FROM cancellation_requests WHERE id = ? FOR UPDATE`, [req.params.id]);
    const request = rows[0];
    if (!request) return res.status(404).json({ error: 'No hay datos para mostrar.' });
    if (String(request.status) !== 'pending_review') {
      await conn.rollback();
      return res.status(400).json({ error: 'Esta solicitud ya fue revisada.' });
    }
    await conn.query(
      `UPDATE cancellation_requests SET status = 'rejected', admin_note = ?, reviewed_by = ?, reviewed_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [note, req.user.id, request.id]
    );
    await conn.query(
      'INSERT INTO ticket_replies (id, ticket_id, sender_user_id, sender_role, message) VALUES (?, ?, ?, ?, ?)',
      [generateId('rep_'), request.ticket_id, req.user.id, 'super_admin', note]
    );
    await conn.commit();

    const shipment = await ShipmentRepo.getById(request.shipment_id);
    await sendCancellationEmail(shipment, { ...request, status: 'rejected' }, 'cancellation_rejected', { adminNote: note }).catch(() => null);

    res.json({ success: true, message: 'Solicitud rechazada. El cliente fue notificado.' });
  } catch (error: any) {
    try { await conn.rollback(); } catch {}
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  } finally {
    conn.release();
  }
});

// Obtener tickets
app.get('/api/tickets', authMiddleware, async (req: any, res) => {
  try {
    let ticketsList = [];
    if (req.user.role === 'super_admin') {
      ticketsList = await TicketRepo.getAll();
      ticketsList = await attachCancellationRequestsToTickets(ticketsList);
    } else {
      ticketsList = await TicketRepo.getByUserId(req.user.id);
      ticketsList = await attachCancellationRequestsToTickets(ticketsList);
    }
    res.json({ tickets: ticketsList });
  } catch (error) {
    res.status(500).json({ error: 'No se pudieron cargar los tickets.' });
  }
});

// Crear ticket
app.post('/api/tickets', authMiddleware, async (req: any, res) => {
  try {
    const { subject, category, description, trackingCode, lang } = req.body;
    if (!subject || !category || !description) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    const ticketId = generateId('tkt_');
    const newTicket = {
      id: ticketId,
      user_id: req.user.id,
      subject,
      category,
      description,
      tracking_code: trackingCode || '',
      status: 'open'
    };

    await TicketRepo.create(newTicket);

    // Respuesta IA
    const aiText = await getAISupportReply(category, description, trackingCode, lang || 'es');
    await TicketRepo.addReply({
      id: generateId('rep_'),
      ticket_id: ticketId,
      sender_role: 'system',
      message: aiText
    });

    const ticketWithReplies = await TicketRepo.getById(ticketId);
    res.json({ success: true, ticket: ticketWithReplies });
  } catch (error) {
    console.error('[Tickets] Error al crear:', error);
    res.status(500).json({ error: 'No se pudo crear el ticket de soporte.' });
  }
});

// Responder ticket
app.post('/api/tickets/:id/reply', authMiddleware, async (req: any, res) => {
  try {
    const { message, sender } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
    }

    const ticket = await TicketRepo.getById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado.' });
    }

    if (req.user.role !== 'super_admin' && ticket.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const roleMapped = req.user.role === 'super_admin' ? 'super_admin' : 'customer';
    
    await TicketRepo.addReply({
      id: generateId('rep_'),
      ticket_id: ticket.id,
      sender_user_id: req.user.id,
      sender_role: roleMapped,
      message
    });

    const updatedTicket = await TicketRepo.getById(ticket.id);
    const reply = updatedTicket.replies[updatedTicket.replies.length - 1];

    if (roleMapped === 'super_admin') {
      const customer = await UserRepo.getById(ticket.user_id);
      const customerEmail = isValidEmailForProvider(customer?.email);
      if (customerEmail) {
        await sendNotificationEvent({
          eventCode: 'ticket_reply_customer',
          entityType: 'ticket_reply',
          entityId: reply.id,
          audience: 'customer',
          userId: ticket.user_id,
          toEmail: customerEmail,
          recipientName: customer?.name,
          language: customer?.language || 'es',
          variables: {
            userName: customer?.name || customerEmail,
            ticketId: ticket.id,
            ticketUrl: `${appBaseUrl()}/panel/tickets/${encodeURIComponent(ticket.id)}`,
            agentName: req.user.name || 'Equipo DoorDrop',
            replyPreview: String(message).replace(/\s+/g, ' ').trim().slice(0, 1200)
          }
        }).catch(() => undefined);
      }
    }

    res.json({ success: true, reply, ticket: updatedTicket });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo enviar la respuesta.' });
  }
});

// Sugerencia IA para Administrador
app.post('/api/tickets/:id/ai-suggest', authMiddleware, async (req: any, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const { lang } = req.body;
    const ticket = await TicketRepo.getById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado.' });
    }

    const aiText = await getAISupportReply(ticket.category, ticket.description, ticket.tracking_code, lang || 'es');
    res.json({ success: true, message: aiText });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo generar la sugerencia de IA.' });
  }
});

// Resolver ticket
app.post('/api/tickets/:id/resolve', authMiddleware, async (req: any, res) => {
  try {
    const ticket = await TicketRepo.getById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado.' });
    }

    if (req.user.role !== 'super_admin' && ticket.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    await TicketRepo.resolve(ticket.id);
    const updated = await TicketRepo.getById(ticket.id);

    const customer = await UserRepo.getById(ticket.user_id);
    const customerEmail = isValidEmailForProvider(customer?.email);
    if (customerEmail) {
      await sendNotificationEvent({
        eventCode: 'ticket_resolved_customer',
        entityType: 'ticket',
        entityId: ticket.id,
        audience: 'customer',
        userId: ticket.user_id,
        toEmail: customerEmail,
        recipientName: customer?.name,
        language: customer?.language || 'es',
        variables: {
          userName: customer?.name || customerEmail,
          ticketId: ticket.id,
          ticketUrl: `${appBaseUrl()}/panel/tickets/${encodeURIComponent(ticket.id)}`,
          resolvedAt: new Date().toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })
        }
      }).catch(() => undefined);
    }

    res.json({ success: true, ticket: updated });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo resolver el ticket.' });
  }
});


// --- SHIP24GO V1.4.37: páginas dedicadas Polar y PayPal ---
function cleanPaymentProviderCode(raw: any) {
  const value = String(raw || '').toLowerCase().trim();
  return value === 'paypal' ? 'paypal' : value === 'polar' ? 'polar' : '';
}
function publicPaymentSettingsFromKeys(provider: 'polar' | 'paypal', keys: any) {
  const appUrl = appBaseUrl();
  if (provider === 'polar') {
    return {
      enabled: keys?.paymentPolarEnabled !== 0,
      environment: keys?.polarEnvironment || process.env.POLAR_ENV || 'sandbox',
      apiToken: '',
      apiTokenSaved: Boolean(keys?.polarApiToken || process.env.POLAR_ACCESS_TOKEN),
      webhookSecret: '',
      webhookSecretSaved: Boolean(keys?.polarWebhookSecret),
      webhookId: keys?.polarWebhookId || '',
      webhookUrl: keys?.polarWebhookUrl || `${appUrl}/api/webhooks/polar`
    };
  }
  return {
    enabled: keys?.paymentPaypalEnabled !== 0,
    environment: keys?.paypalEnvironment || 'sandbox',
    clientId: keys?.paypalClientId || '',
    clientSecret: '',
    clientSecretSaved: Boolean(keys?.paypalClientSecret),
    webhookId: keys?.paypalWebhookId || '',
    webhookSecret: '',
    webhookSecretSaved: Boolean(keys?.paypalWebhookSecret),
    webhookUrl: keys?.paypalWebhookUrl || `${appUrl}/api/webhooks/paypal`
  };
}
function publicPaymentStatusFromKeys(provider: 'polar' | 'paypal', keys: any) {
  if (provider === 'polar') {
    const configured = ship24goPolarCredentialsReady(keys);
    const webhookReady = Boolean(keys?.polarWebhookId || keys?.polarWebhookSecret || keys?.polarWebhookUrl);
    const enabled = ship24goPolarIntegrationEnabled(keys);
    return { configured, credentialsReady: configured, enabled, webhookReady, message: configured ? (enabled ? 'Conexión preparada.' : 'Polar está desactivado para clientes.') : 'Agrega el access token para activar Polar.' };
  }
  const configured = ship24goPayPalCredentialsReady(keys);
  const enabled = ship24goPayPalIntegrationEnabled(keys);
  const webhookReady = Boolean(keys?.paypalWebhookId);
  return { configured, credentialsReady: configured, enabled, webhookReady, message: configured ? (enabled ? 'Conexión preparada.' : 'PayPal está desactivado para clientes.') : 'Agrega Client ID y Secret para activar PayPal.' };
}
function publicPlansForPayment(rows: any[]) {
  return rows.map((p: any) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    price: Number(p.price || 0),
    currency: p.currency || 'EUR',
    isActive: p.is_active !== 0,
    polarEnabled: p.polar_enabled !== 0,
    paypalEnabled: p.paypal_enabled !== 0,
    polarProductId: p.polar_product_id || '',
    polarPriceId: p.polar_price_id || '',
    polarSyncStatus: p.polar_sync_status || 'pending',
    paypalProductId: p.paypal_product_id || '',
    paypalPlanId: p.paypal_plan_id || '',
    paypalSyncStatus: p.paypal_sync_status || 'pending'
  }));
}

app.get('/api/admin/payment-integrations/:provider', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const provider = cleanPaymentProviderCode(req.params.provider) as 'polar' | 'paypal';
    if (!provider) return res.status(404).json({ error: 'Configuración no disponible.' });
    const keys = await ApiKeysRepo.get();
    const [planRows]: any = await pool.query(`SELECT * FROM plans ORDER BY price ASC, name ASC`);
    let history: any[] = [];
    try {
      const [events]: any = await pool.query(
        `SELECT id, event_type AS eventType, processed_status AS status, created_at AS createdAt
         FROM webhook_events
         WHERE provider_code = ?
         ORDER BY created_at DESC
         LIMIT 40`,
        [provider]
      );
      history = events || [];
    } catch {
      try {
        const [events2]: any = await pool.query(
          `SELECT id, event_type AS eventType, status, created_at AS createdAt
           FROM payment_webhook_events
           WHERE provider = ?
           ORDER BY created_at DESC
           LIMIT 40`,
          [provider]
        );
        history = events2 || [];
      } catch {}
    }
    res.json({
      success: true,
      provider,
      settings: publicPaymentSettingsFromKeys(provider, keys),
      status: publicPaymentStatusFromKeys(provider, keys),
      plans: publicPlansForPayment(planRows || []),
      history
    });
  } catch {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.post('/api/admin/payment-integrations/:provider/settings', authMiddleware, requireSuperAdmin, async (req: any, res) => {
  try {
    const provider = cleanPaymentProviderCode(req.params.provider) as 'polar' | 'paypal';
    if (!provider) return res.status(404).json({ error: 'Configuración no disponible.' });
    const current = await ApiKeysRepo.get();
    const body = req.body || {};
    const next: any = { ...(current || {}) };
    if (provider === 'polar') {
      next.paymentPolarEnabled = body.enabled === false || body.enabled === '0' ? 0 : 1;
      next.polarEnvironment = body.environment || current?.polarEnvironment || 'sandbox';
      next.polarWebhookUrl = body.webhookUrl || current?.polarWebhookUrl || `${appBaseUrl()}/api/webhooks/polar`;
      next.polarWebhookId = body.webhookId !== undefined ? body.webhookId : (current?.polarWebhookId || '');
      if (String(body.apiToken || '').trim()) next.polarApiToken = String(body.apiToken).trim();
      if (String(body.webhookSecret || '').trim()) next.polarWebhookSecret = String(body.webhookSecret).trim();
    } else {
      next.paymentPaypalEnabled = body.enabled === false || body.enabled === '0' ? 0 : 1;
      next.paypalEnvironment = body.environment || current?.paypalEnvironment || 'sandbox';
      next.paypalClientId = body.clientId !== undefined ? body.clientId : (current?.paypalClientId || '');
      if (String(body.clientSecret || '').trim()) next.paypalClientSecret = String(body.clientSecret).trim();
      next.paypalWebhookUrl = body.webhookUrl || current?.paypalWebhookUrl || `${appBaseUrl()}/api/webhooks/paypal`;
      next.paypalWebhookId = body.webhookId !== undefined ? body.webhookId : (current?.paypalWebhookId || '');
      if (String(body.webhookSecret || '').trim()) next.paypalWebhookSecret = String(body.webhookSecret).trim();
    }
    await ApiKeysRepo.update(next);
    const keys = await ApiKeysRepo.get();
    res.json({
      success: true,
      provider,
      settings: publicPaymentSettingsFromKeys(provider, keys),
      status: publicPaymentStatusFromKeys(provider, keys)
    });
  } catch {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

// --- COPILOTO AI OPENAI + ASISTENCIA HUMANA ---
app.post('/api/copilot/message', authMiddleware, handleCopilotMessage);
app.post('/api/ai/chat', authMiddleware, handleCopilotMessage);

// Tasas de Cambio en tiempo real
app.get('/api/currencies', async (req, res) => {
  try {
    const rates = await getFreshRatesInternal();
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=240');
    res.json({ success: true, base: 'EUR', rates, cached: true });
  } catch (err: any) {
    res.status(500).json({ error: 'No se pudieron recuperar las tasas de cambio.' });
  }
});

// --- MARKETPLACE INTEGRATION ---
import { setupMarketplaceRoutes } from './server/marketplace/routes';
import { MarketplaceRepo } from './server/marketplace/repo';
import podRoutes from './server/marketplace/podRoutes';
setupMarketplaceRoutes(app, {
  pool,
  authMiddleware,
  requireSuperAdmin,
  UserRepo,
  generateId,
  walletMutation: applyWalletMutationCommitted,
  paypalCreateOrder: async (options) => {
    return ship24goCreatePayPalCheckoutOrder({ ...options, purpose: 'marketplace_order' });
  }
});
app.use('/api/pod', podRoutes);
app.use(podRoutes);

// --- OMNICHANNEL INTEGRATION ---
import { setupOmnichannelRoutes } from './server/omnichannel/routes';
import { configureOmnichannelWalletMutation } from './server/omnichannel/deepseek_service';
configureOmnichannelWalletMutation(applyWalletMutationCommitted);
setupOmnichannelRoutes(app, { pool, authMiddleware, requireSuperAdmin, UserRepo });

// --- VITE MIDDLEWARE & FALLBACK ---
async function startServer() {
  const PORT = 3000;
  app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    const fp = String(filePath || '');
    if (fp.endsWith('index.html') || fp.endsWith('sw.js') || fp.endsWith('manifest.json') || fp.endsWith('manifest.webmanifest')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Clear-Site-Data', '"cache"');
    } else if (fp.includes('assets')) {
      // hashed assets can cache, but short while we stabilize
      res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    }
  }
}));
    
// SHIP24GO_MEMBERSHIP_PAGE_ROUTE_V1
app.get('/membership', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile('/www/wwwroot/doordrop.lat/public/membership.html');
});

// END SHIP24GO_MEMBERSHIP_PAGE_ROUTE_V1

app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
  });
}

startServer();
