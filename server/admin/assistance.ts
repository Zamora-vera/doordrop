import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { pool } from '../db/connection';
import {
  AdminSettingsRepo,
  ProviderRepo,
  ShipmentRepo,
  TicketRepo,
  UserRepo,
  generateId
} from '../db/repos';
import {
  extractCustomerIdentifier,
  generateClientCode,
  languageFromContact,
  normalizeAgentLanguage,
  verificationPrompt,
  hasSensitiveCustomerRequest
} from '../omnichannel/identity';

/**
 * Internal assistance is deliberately a different bounded context from the
 * customer-facing Omnichannel product.  It has its own settings, provider
 * profiles, conversations, messages and knowledge records.  The only shared
 * surface is read-only business context and the existing ticket system when
 * a verified customer is handed to a human.
 */

const ASSISTANCE_WEBHOOK_URL = 'https://doordrop.lat/api/webhooks/assistance-zernio';
const DEFAULT_ZERNIO_URL = 'https://zernio.com/api/v1';
const ALLOWED_AI_HOSTS = new Set(['api.deepseek.com', 'api.groq.com', 'api.openai.com']);
const ALLOWED_ZERNIO_HOSTS = new Set(['zernio.com', 'www.zernio.com']);
const ASSISTANCE_PLATFORMS = ['whatsapp', 'instagram', 'facebook', 'telegram', 'email', 'web_chat'] as const;
type AssistancePlatform = typeof ASSISTANCE_PLATFORMS[number];
type AssistanceLanguage = 'es' | 'it' | 'en' | 'fr';

let schemaPromise: Promise<void> | null = null;

export async function ensureAdminAssistanceSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS admin_assistance_settings (
        setting_key VARCHAR(80) PRIMARY KEY,
        setting_value TEXT NULL,
        is_secret TINYINT(1) NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

      await pool.query(`CREATE TABLE IF NOT EXISTS admin_assistance_channels (
        id CHAR(36) PRIMARY KEY,
        platform VARCHAR(32) NOT NULL,
        provider_profile_id VARCHAR(191) NULL,
        provider_account_id VARCHAR(191) NULL,
        display_name VARCHAR(191) NOT NULL,
        username VARCHAR(191) NULL,
        phone_number VARCHAR(80) NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        metadata_json JSON NULL,
        connected_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_assistance_profile (provider_profile_id),
        UNIQUE KEY uq_assistance_account (provider_account_id),
        INDEX idx_assistance_channel_platform_status (platform, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

      await pool.query(`CREATE TABLE IF NOT EXISTS admin_assistance_conversations (
        id CHAR(36) PRIMARY KEY,
        channel_id CHAR(36) NULL,
        provider_conversation_id VARCHAR(255) NULL,
        platform VARCHAR(32) NOT NULL DEFAULT 'internal',
        contact_id VARCHAR(191) NULL,
        contact_name VARCHAR(191) NULL,
        contact_phone VARCHAR(80) NULL,
        contact_email VARCHAR(191) NULL,
        detected_language CHAR(2) NOT NULL DEFAULT 'es',
        identity_status VARCHAR(24) NOT NULL DEFAULT 'unverified',
        verified_customer_user_id CHAR(36) NULL,
        verification_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
        ticket_id CHAR(36) NULL,
        ai_active TINYINT(1) NOT NULL DEFAULT 1,
        status VARCHAR(24) NOT NULL DEFAULT 'open',
        last_message TEXT NULL,
        last_message_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_assistance_conversation (channel_id, provider_conversation_id),
        INDEX idx_assistance_conversation_status (status, last_message_at),
        INDEX idx_assistance_conversation_identity (identity_status, contact_phone),
        INDEX idx_assistance_conversation_customer (verified_customer_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

      await pool.query(`CREATE TABLE IF NOT EXISTS admin_assistance_messages (
        id CHAR(36) PRIMARY KEY,
        conversation_id CHAR(36) NOT NULL,
        provider_message_id VARCHAR(255) NULL,
        direction VARCHAR(16) NOT NULL,
        sender_type VARCHAR(32) NOT NULL,
        sender_name VARCHAR(191) NULL,
        text_content TEXT NOT NULL,
        media_type VARCHAR(40) NULL,
        media_url VARCHAR(1024) NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'received',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_assistance_provider_message (provider_message_id),
        INDEX idx_assistance_message_conversation (conversation_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

      await pool.query(`CREATE TABLE IF NOT EXISTS admin_assistance_webhook_events (
        event_id VARCHAR(191) PRIMARY KEY,
        event_type VARCHAR(120) NULL,
        payload_json JSON NULL,
        processed TINYINT(1) NOT NULL DEFAULT 0,
        error_message VARCHAR(1000) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME NULL,
        INDEX idx_assistance_webhook_status (processed, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

      await pool.query(`CREATE TABLE IF NOT EXISTS admin_assistance_verification_events (
        id CHAR(36) PRIMARY KEY,
        conversation_id CHAR(36) NOT NULL,
        identifier_hash CHAR(64) NOT NULL,
        method VARCHAR(24) NOT NULL,
        result VARCHAR(24) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_assistance_verification_conversation (conversation_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

      await pool.query(`CREATE TABLE IF NOT EXISTS admin_assistance_knowledge (
        id CHAR(36) PRIMARY KEY,
        title VARCHAR(191) NOT NULL,
        content TEXT NOT NULL,
        language CHAR(2) NOT NULL DEFAULT 'es',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_assistance_knowledge_active_language (is_active, language)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

      const defaults: Array<[string, string, number]> = [
        ['zernio_api_url', DEFAULT_ZERNIO_URL, 0],
        ['zernio_api_key', '', 1],
        ['zernio_webhook_secret', '', 1],
        ['ai_enabled', '1', 0],
        ['default_language', 'es', 0]
      ];
      for (const [key, value, secret] of defaults) {
        await pool.query(
          `INSERT IGNORE INTO admin_assistance_settings (setting_key, setting_value, is_secret) VALUES (?, ?, ?)`,
          [key, value, secret]
        );
      }
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

function normalizePlatform(value: unknown): AssistancePlatform {
  const normalized = String(value || '').trim().toLowerCase();
  return (ASSISTANCE_PLATFORMS as readonly string[]).includes(normalized)
    ? normalized as AssistancePlatform
    : 'web_chat';
}

function normalizeLanguage(value: unknown, fallback: AssistanceLanguage = 'es'): AssistanceLanguage {
  const normalized = normalizeAgentLanguage(value, fallback);
  return normalized as AssistanceLanguage;
}

function normalizeAiUrl(value: unknown): string | null {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'https:' || !ALLOWED_AI_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function normalizeZernioUrl(value: unknown): string | null {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'https:' || !ALLOWED_ZERNIO_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

async function getSettings(): Promise<Record<string, string>> {
  await ensureAdminAssistanceSchema();
  const [rows]: any = await pool.query('SELECT setting_key, setting_value FROM admin_assistance_settings');
  const settings: Record<string, string> = {};
  for (const row of rows || []) settings[String(row.setting_key)] = String(row.setting_value || '');
  if (!settings.zernio_api_key && process.env.ASSISTANCE_ZERNIO_API_KEY) settings.zernio_api_key = String(process.env.ASSISTANCE_ZERNIO_API_KEY);
  return settings;
}

/**
 * The internal assistant consumes the already configured global AI provider.
 * Zernio remains intentionally separate and is read only from the internal
 * assistance settings above. Never persist or fall back to a second AI key.
 */
async function getGlobalAiSettings(): Promise<{ provider: 'groq' | 'openai'; apiKey: string; baseUrl: string; model: string; enabled: boolean }> {
  const globalSettings = await AdminSettingsRepo.get().catch(() => ({} as any));
  const stored = globalSettings?.ai || {};
  const requestedProvider = String(stored.provider || '').trim().toLowerCase();
  const provider: 'groq' | 'openai' = requestedProvider === 'groq' || requestedProvider === 'openai'
    ? requestedProvider
    : (stored.groqApiKey || process.env.GROQ_API_KEY ? 'groq' : 'openai');
  const apiKey = String(provider === 'groq'
    ? (stored.groqApiKey || process.env.GROQ_API_KEY || '')
    : (stored.openaiApiKey || process.env.OPENAI_API_KEY || '')).trim();
  const model = String(stored.model || (provider === 'groq'
    ? (process.env.GROQ_MODEL || 'openai/gpt-oss-20b')
    : (process.env.OPENAI_MODEL || 'gpt-5.4-mini'))).trim().slice(0, 120);
  const baseUrl = provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
  return { provider, apiKey, baseUrl, model, enabled: stored.enabled !== false };
}

async function saveSetting(key: string, value: string, isSecret = false): Promise<void> {
  await pool.query(
    `INSERT INTO admin_assistance_settings (setting_key, setting_value, is_secret)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), is_secret = VALUES(is_secret), updated_at = CURRENT_TIMESTAMP`,
    [key, value, isSecret ? 1 : 0]
  );
}

async function callAssistanceZernio(endpoint: string, options: { method?: string; body?: any; queryParams?: Record<string, unknown> } = {}) {
  const settings = await getSettings();
  const apiKey = String(settings.zernio_api_key || '').trim();
  if (!apiKey) throw new Error('El proveedor de canales internos todavía no tiene una clave propia.');
  const baseUrl = normalizeZernioUrl(settings.zernio_api_url || DEFAULT_ZERNIO_URL);
  if (!baseUrl) throw new Error('La URL del proveedor de canales internos no es válida.');

  const url = new URL(endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`);
  for (const [key, value] of Object.entries(options.queryParams || {})) {
    if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { text: raw.slice(0, 1000) }; }
  return { status: response.status, data };
}

function verifyAssistanceWebhookSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const supplied = String(signatureHeader || '').trim().replace(/^sha256=/i, '').trim();
  if (!supplied || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  try {
    const left = Buffer.from(supplied, 'hex');
    const right = Buffer.from(expected, 'hex');
    return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function firstString(values: unknown[], max = 255): string | null {
  for (const value of values) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const result = String(value).trim();
    if (result) return result.slice(0, max);
  }
  return null;
}

type NormalizedAssistanceInbound = {
  conversationId: string | null;
  messageId: string;
  accountId: string | null;
  profileId: string | null;
  platform: AssistancePlatform;
  contactId: string | null;
  contactName: string;
  contactPhone: string | null;
  text: string;
  mediaType: string | null;
  mediaUrl: string | null;
};

function normalizeInbound(payload: any, eventId: string): NormalizedAssistanceInbound {
  const data = payload && typeof payload.data === 'object' ? payload.data : null;
  const message = data?.message || payload?.message || data || payload || {};
  const conversation = payload?.conversation || data?.conversation || message?.conversation || {};
  const sender = message?.sender || message?.from || {};
  const attachment = Array.isArray(message?.attachments)
    ? message.attachments.find((item: any) => item && typeof item === 'object')
    : (message?.attachment || null);
  return {
    conversationId: firstString([
      message?.conversationId, message?.conversation_id, message?.conversation?._id,
      message?.conversation?.id, conversation?._id, conversation?.id,
      conversation?.platformConversationId
    ]),
    messageId: firstString([message?._id, message?.id, payload?.messageId, eventId]) || eventId,
    accountId: firstString([payload?.accountId, data?.accountId, message?.accountId, payload?.account?._id, payload?.account?.id]),
    profileId: firstString([payload?.profileId, data?.profileId, message?.profileId, payload?.profile?._id, payload?.profile?.id]),
    platform: normalizePlatform(firstString([payload?.platform, data?.platform, message?.platform, sender?.platform])),
    contactId: firstString([sender?.id, sender?._id, message?.contactId, message?.from?.id]),
    contactName: firstString([sender?.name, sender?.displayName, message?.from?.name, payload?.contactName], 191) || 'Contacto',
    contactPhone: firstString([sender?.phone, sender?.phoneNumber, message?.from?.phone, message?.contactPhone], 80),
    text: firstString([message?.text, message?.message, message?.body, payload?.text], 12000) || '',
    mediaType: firstString([attachment?.type, attachment?.mediaType], 40),
    mediaUrl: firstString([attachment?.url, attachment?.mediaUrl], 1024)
  };
}

async function findInternalChannel(accountId: string | null, profileId: string | null): Promise<any | null> {
  if (!accountId && !profileId) return null;
  const [rows]: any = await pool.query(
    `SELECT * FROM admin_assistance_channels
      WHERE (? IS NOT NULL AND provider_account_id = ?)
         OR (? IS NOT NULL AND provider_profile_id = ?)
      ORDER BY updated_at DESC LIMIT 1`,
    [accountId, accountId, profileId, profileId]
  );
  return rows?.[0] || null;
}

async function findOrCreateConversation(channel: any, inbound: NormalizedAssistanceInbound): Promise<any> {
  const [existing]: any = await pool.query(
    `SELECT * FROM admin_assistance_conversations
      WHERE channel_id = ? AND provider_conversation_id = ? LIMIT 1`,
    [channel.id, inbound.conversationId]
  );
  if (existing?.[0]) return existing[0];

  const language = languageFromContact(inbound.contactPhone, undefined, 'es') as AssistanceLanguage;
  const id = generateId('aac_');
  await pool.query(
    `INSERT INTO admin_assistance_conversations
      (id, channel_id, provider_conversation_id, platform, contact_id, contact_name, contact_phone, detected_language, status, ai_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 1)`,
    [id, channel.id, inbound.conversationId, inbound.platform, inbound.contactId, inbound.contactName, inbound.contactPhone, language]
  );
  const [created]: any = await pool.query('SELECT * FROM admin_assistance_conversations WHERE id = ?', [id]);
  return created[0];
}

async function saveAssistanceMessage(conversationId: string, message: Partial<NormalizedAssistanceInbound> & { direction: string; senderType: string; senderName?: string | null; status?: string }) {
  const providerMessageId = String(message.messageId || '').trim() || null;
  if (providerMessageId) {
    const [duplicate]: any = await pool.query('SELECT id FROM admin_assistance_messages WHERE provider_message_id = ? LIMIT 1', [providerMessageId]);
    if (duplicate?.length) return false;
  }
  await pool.query(
    `INSERT INTO admin_assistance_messages
      (id, conversation_id, provider_message_id, direction, sender_type, sender_name, text_content, media_type, media_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId('aam_'), conversationId, providerMessageId, message.direction, message.senderType,
      message.senderName || null, String(message.text || '').slice(0, 12000), message.mediaType || null,
      message.mediaUrl || null, message.status || 'received'
    ]
  );
  await pool.query(
    `UPDATE admin_assistance_conversations SET last_message = ?, last_message_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [String(message.text || '').slice(0, 12000), conversationId]
  );
  return true;
}

async function resolveContactIdentity(conversation: any, text: string): Promise<any> {
  const identifiers = extractCustomerIdentifier(text);
  if (!identifiers.email && !identifiers.clientCode) return { verified: Boolean(conversation.verified_customer_user_id), user: null };
  const lookup = identifiers.email || identifiers.clientCode;
  const [rows]: any = await pool.query(
    `SELECT id, name, email, phone, country, language, client_code, status
       FROM users
      WHERE role = 'customer' AND ((email = ? AND ? IS NOT NULL) OR (client_code = ? AND ? IS NOT NULL))
      LIMIT 1`,
    [lookup, identifiers.email, lookup, identifiers.clientCode]
  );
  const user = rows?.[0] || null;
  const identifierValue = String(lookup || '').toLowerCase();
  const identifierHash = crypto.createHash('sha256').update(identifierValue).digest('hex');
  if (user && String(user.status || 'active') !== 'closed') {
    const language = languageFromContact(conversation.contact_phone, user.country, normalizeLanguage(user.language, 'es')) as AssistanceLanguage;
    await pool.query(
      `UPDATE admin_assistance_conversations
          SET verified_customer_user_id = ?, identity_status = 'verified', detected_language = ?, contact_email = COALESCE(contact_email, ?), verification_attempts = 0, updated_at = NOW()
        WHERE id = ?`,
      [user.id, language, user.email, conversation.id]
    );
    await pool.query(
      `INSERT INTO admin_assistance_verification_events (id, conversation_id, identifier_hash, method, result) VALUES (?, ?, ?, ?, 'verified')`,
      [generateId('aav_'), conversation.id, identifierHash, identifiers.email ? 'email' : 'client_code']
    );
    return { verified: true, user };
  }

  const attempts = Math.min(255, Number(conversation.verification_attempts || 0) + 1);
  await pool.query(
    `UPDATE admin_assistance_conversations SET verification_attempts = ?, identity_status = 'unverified', updated_at = NOW() WHERE id = ?`,
    [attempts, conversation.id]
  );
  await pool.query(
    `INSERT INTO admin_assistance_verification_events (id, conversation_id, identifier_hash, method, result) VALUES (?, ?, ?, ?, 'rejected')`,
    [generateId('aav_'), conversation.id, identifierHash, identifiers.email ? 'email' : 'client_code']
  );
  return { verified: false, user: null, shouldHandoff: attempts >= 5 };
}

async function buildInternalContext(customerUserId?: string | null, includeOperationalData = false): Promise<any> {
  const [users, shipments, tickets, stores, providers, plans]: any[] = await Promise.all([
    UserRepo.getAll().catch(() => []),
    ShipmentRepo.getAll().catch(() => []),
    TicketRepo.getAll().catch(() => []),
    (async () => { const [rows]: any = await pool.query('SELECT * FROM stores ORDER BY created_at DESC LIMIT 50').catch(() => [[]]); return rows; })(),
    ProviderRepo.getAll().catch(() => []),
    (async () => { const [rows]: any = await pool.query('SELECT id, code, name, price, currency, is_active FROM plans ORDER BY price ASC LIMIT 50').catch(() => [[]]); return rows; })()
  ]);
  const filteredShipments = customerUserId
    ? shipments.filter((item: any) => String(item.user_id) === String(customerUserId))
    : includeOperationalData ? shipments : [];
  const filteredTickets = customerUserId
    ? tickets.filter((item: any) => String(item.user_id) === String(customerUserId))
    : includeOperationalData ? tickets : [];
  return {
    scope: customerUserId ? 'verified_customer_support' : 'super_admin_operations',
    totals: {
      customers: users.filter((item: any) => item.role === 'customer').length,
      shipments: shipments.length,
      stores: stores.length,
      tickets: tickets.length,
      openTickets: tickets.filter((item: any) => ['open', 'pending'].includes(String(item.status))).length
    },
    customer: customerUserId ? (() => {
      const user = users.find((item: any) => String(item.id) === String(customerUserId));
      return user ? { name: user.name, email: user.email, country: user.country, language: user.language, currency: user.currency } : null;
    })() : null,
    shipments: filteredShipments.slice(0, 20).map((item: any) => ({ id: item.id, tracking: item.tracking_code, status: item.status_label || item.status, createdAt: item.created_at })),
    tickets: filteredTickets.slice(0, 20).map((item: any) => ({ id: item.id, subject: item.subject, category: item.category, status: item.status, createdAt: item.created_at })),
    stores: includeOperationalData || customerUserId ? stores.slice(0, 20).map((item: any) => ({ id: item.id, platform: item.platform, name: item.store_name, status: item.status })) : [],
    providers: includeOperationalData ? providers.slice(0, 30).map((item: any) => ({ code: item.code, name: item.name, active: Boolean(item.is_active), connected: Boolean(item.is_connected) })) : [],
    plans: includeOperationalData ? plans.slice(0, 30).map((item: any) => ({ code: item.code, name: item.name, price: item.price, currency: item.currency, active: Boolean(item.is_active) })) : []
  };
}

function assistanceSystemPrompt(language: AssistanceLanguage): string {
  const names: Record<AssistanceLanguage, string> = { es: 'Spanish', it: 'Italian', en: 'English', fr: 'French' };
  return `You are DoorDrop's internal AI support operator. Respond in ${names[language]}. You support the DoorDrop team, not the public Omnichannel resale product. Use only the business context provided by the backend. Never invent shipment states, balances, invoices, tickets or provider results. Never reveal API keys, passwords, webhook secrets, raw payloads, SQL, database structure, internal margins or credentials. Keep the answer organized and short: maximum 4 bullets or 120 words. If a customer is not verified, ask for the registered email or DoorDrop client code before discussing private shipment, billing or account data. If a human decision is needed, recommend creating or updating a ticket.`;
}

function parseChatCompletion(data: any): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((part: any) => typeof part === 'string' ? part : String(part?.text || part?.content || '')).join('\n').trim();
  return '';
}

async function callAssistanceAI(messages: Array<{ role: string; content: string }>, language: AssistanceLanguage): Promise<{ text: string; model: string }> {
  const settings = await getSettings();
  const globalAi = await getGlobalAiSettings();
  if (String(settings.ai_enabled || '1') !== '1' || !globalAi.enabled) throw new Error('El agente interno está desactivado en la configuración global.');
  if (!globalAi.apiKey) throw new Error('Configura la clave AI global en Super Admin.');
  const baseUrl = normalizeAiUrl(globalAi.baseUrl);
  if (!baseUrl) throw new Error('La URL global del agente no está permitida.');
  const model = globalAi.model;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${globalAi.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: 700, temperature: 0.2 }),
    signal: AbortSignal.timeout(35000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Proveedor de IA interno HTTP ${response.status}`);
  const text = parseChatCompletion(data).slice(0, 1800);
  if (!text) throw new Error('El agente interno no devolvió una respuesta.');
  return { text, model };
}

async function processInboundWithAI(conversationId: string, inbound: NormalizedAssistanceInbound): Promise<void> {
  try {
    const [conversationRows]: any = await pool.query('SELECT * FROM admin_assistance_conversations WHERE id = ? LIMIT 1', [conversationId]);
    const conversation = conversationRows?.[0];
    if (!conversation || Number(conversation.ai_active) !== 1 || String(conversation.status) === 'closed') return;
    const language = normalizeLanguage(conversation.detected_language, 'es');
    const identity = await resolveContactIdentity(conversation, inbound.text);
    if (identity.shouldHandoff) {
      await pool.query(`UPDATE admin_assistance_conversations SET ai_active = 0, status = 'needs_human', updated_at = NOW() WHERE id = ?`, [conversationId]);
      return;
    }
    const verifiedUserId = identity.verified ? identity.user.id : conversation.verified_customer_user_id;
    const [messages]: any = await pool.query(
      `SELECT direction, sender_type, text_content FROM admin_assistance_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 12`,
      [conversationId]
    );
    const history = (messages || []).reverse().map((item: any) => ({ role: item.direction === 'inbound' ? 'user' : 'assistant', content: String(item.text_content || '').slice(0, 1500) }));
    const context = await buildInternalContext(verifiedUserId);
    const knowledgeRows: any = await pool.query(
      `SELECT title, content, language FROM admin_assistance_knowledge WHERE is_active = 1 AND language IN (?, 'es') ORDER BY updated_at DESC LIMIT 10`,
      [language]
    ).then((result: any) => result[0]).catch(() => []);
    const knowledge = (knowledgeRows || []).map((item: any) => `${item.title}: ${item.content}`).join('\n');
    const prompt = [
      `Incoming customer message: ${inbound.text}`,
      `Customer verified: ${verifiedUserId ? 'yes' : 'no'}`,
      `DoorDrop context:\n${JSON.stringify(context).slice(0, 22000)}`,
      knowledge ? `Internal knowledge:\n${knowledge.slice(0, 7000)}` : '',
      'Reply to the customer. Do not mention internal configuration or upstream providers.'
    ].filter(Boolean).join('\n\n');
    const result = verifiedUserId || !hasSensitiveCustomerRequest(inbound.text)
      ? await callAssistanceAI([{ role: 'system', content: assistanceSystemPrompt(language) }, ...history.slice(-8), { role: 'user', content: prompt }], language)
      : { text: verificationPrompt(language), model: 'identity-gate' };

    const channel = await findInternalChannel(inbound.accountId, inbound.profileId);
    if (!channel || !inbound.conversationId) return;
    const providerPayload: any = { message: result.text };
    if (channel.provider_account_id) providerPayload.accountId = channel.provider_account_id;
    const sent = await callAssistanceZernio(`/inbox/conversations/${encodeURIComponent(inbound.conversationId)}/messages`, { method: 'POST', body: providerPayload });
    if (sent.status < 200 || sent.status >= 300) throw new Error('El proveedor rechazó la respuesta del centro de asistencia.');
    await saveAssistanceMessage(conversationId, {
      messageId: firstString([sent.data?.messageId, sent.data?._id]) || undefined,
      direction: 'outbound', senderType: 'ai', senderName: 'DoorDrop Asistencia AI', text: result.text, status: 'delivered'
    });
  } catch (error: any) {
    console.error('[Admin Assistance] Inbound AI error:', error?.message || error);
  }
}

async function createAssistanceTicket(conversation: any, adminUserId: string): Promise<any> {
  if (!conversation.verified_customer_user_id) return null;
  if (conversation.ticket_id) return TicketRepo.getById(conversation.ticket_id);
  const [messageRows]: any = await pool.query(
    `SELECT text_content FROM admin_assistance_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 8`,
    [conversation.id]
  );
  const language = normalizeLanguage(conversation.detected_language, 'es');
  const subject = `DoorDrop · Asistencia ${String(conversation.contact_name || 'cliente').slice(0, 80)}`;
  const description = [
    `Canal interno: ${conversation.platform}`,
    `Contacto: ${String(conversation.contact_name || '').slice(0, 191)}`,
    `Idioma detectado: ${language}`,
    'La conversación fue transferida desde el Centro de Asistencia AI.',
    'Últimos mensajes:',
    ...(messageRows || []).reverse().map((item: any) => String(item.text_content || '').slice(0, 900))
  ].join('\n').slice(0, 12000);
  const ticketId = generateId('tkt_');
  await TicketRepo.create({
    id: ticketId,
    user_id: conversation.verified_customer_user_id,
    subject,
    category: 'admin_assistance_handoff',
    description,
    tracking_code: '',
    status: 'open'
  });
  await TicketRepo.addReply({
    id: generateId('rep_'),
    ticket_id: ticketId,
    sender_user_id: adminUserId,
    sender_role: 'super_admin',
    message: 'La conversación fue transferida al equipo humano desde el Centro de Asistencia AI.'
  });
  await pool.query(
    `UPDATE admin_assistance_conversations SET ticket_id = ?, ai_active = 0, status = 'needs_human', updated_at = NOW() WHERE id = ?`,
    [ticketId, conversation.id]
  );
  return TicketRepo.getById(ticketId);
}

async function getOrCreateInternalChatConversation(language: AssistanceLanguage, conversationId?: string): Promise<any> {
  const safeId = String(conversationId || '').trim();
  if (safeId) {
    const [rows]: any = await pool.query(`SELECT * FROM admin_assistance_conversations WHERE id = ? AND platform = 'internal' LIMIT 1`, [safeId]);
    if (rows?.[0]) return rows[0];
  }
  const id = generateId('aac_');
  await pool.query(
    `INSERT INTO admin_assistance_conversations (id, platform, contact_name, detected_language, identity_status, ai_active, status)
     VALUES (?, 'internal', 'Equipo DoorDrop', ?, 'verified', 1, 'open')`,
    [id, language]
  );
  const [created]: any = await pool.query('SELECT * FROM admin_assistance_conversations WHERE id = ?', [id]);
  return created[0];
}

function publicChannel(channel: any) {
  return {
    id: channel.id,
    platform: channel.platform,
    displayName: channel.display_name,
    username: channel.username,
    phoneNumber: channel.phone_number,
    status: channel.status,
    providerProfileId: channel.provider_profile_id ? 'configured' : null,
    providerAccountId: channel.provider_account_id ? 'connected' : null,
    connectedAt: channel.connected_at,
    updatedAt: channel.updated_at
  };
}

function parsePermissions(value: unknown): any[] {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setupAdminAssistanceRoutes(app: any, deps: { authMiddleware: any; requireSuperAdmin: any }) {
  const router = Router();
  router.use(async (_req: Request, res: Response, next: any) => {
    try { await ensureAdminAssistanceSchema(); next(); }
    catch (error: any) { console.error('[Admin Assistance] Schema unavailable:', error?.message || error); res.status(503).json({ error: 'El Centro de Asistencia está temporalmente no disponible.' }); }
  });
  router.use(deps.authMiddleware, deps.requireSuperAdmin);

  router.get('/overview', async (_req: any, res: Response) => {
    try {
      const [[channels], [activeChannels], [conversations], [openConversations], [tickets], [knowledge]]: any = await Promise.all([
        pool.query('SELECT COUNT(*) AS count FROM admin_assistance_channels'),
        pool.query(`SELECT COUNT(*) AS count FROM admin_assistance_channels WHERE status IN ('connected','active','online')`),
        pool.query('SELECT COUNT(*) AS count FROM admin_assistance_conversations'),
        pool.query(`SELECT COUNT(*) AS count FROM admin_assistance_conversations WHERE status <> 'closed'`),
        pool.query(`SELECT COUNT(*) AS count FROM tickets WHERE status IN ('open','pending')`),
        pool.query('SELECT COUNT(*) AS count FROM admin_assistance_knowledge WHERE is_active = 1')
      ]);
      const settings = await getSettings();
      const globalAi = await getGlobalAiSettings();
      res.json({
        success: true,
        overview: {
          channels: Number(channels?.[0]?.count || 0),
          activeChannels: Number(activeChannels?.[0]?.count || 0),
          conversations: Number(conversations?.[0]?.count || 0),
          openConversations: Number(openConversations?.[0]?.count || 0),
          openTickets: Number(tickets?.[0]?.count || 0),
          knowledgeItems: Number(knowledge?.[0]?.count || 0),
          aiConfigured: Boolean(globalAi.apiKey && globalAi.enabled),
          channelsConfigured: Boolean(String(settings.zernio_api_key || '').trim()),
          webhookConfigured: Boolean(String(settings.zernio_webhook_secret || '').trim())
        }
      });
    } catch (error: any) { console.error('[Admin Assistance] Overview error:', error?.message || error); res.status(500).json({ error: 'No se pudo cargar el Centro de Asistencia.' }); }
  });

  router.get('/settings', async (_req: any, res: Response) => {
    const settings = await getSettings();
    const globalAi = await getGlobalAiSettings();
    res.json({
      success: true,
      settings: {
        zernio_api_url: settings.zernio_api_url || DEFAULT_ZERNIO_URL,
        zernio_api_key: '',
        zernio_api_configured: Boolean(settings.zernio_api_key),
        zernio_webhook_configured: Boolean(settings.zernio_webhook_secret),
        ai_api_url: globalAi.baseUrl,
        ai_api_key: '',
        ai_api_configured: Boolean(globalAi.apiKey),
        ai_provider: globalAi.provider,
        ai_source: 'global',
        ai_global_enabled: globalAi.enabled,
        ai_model: globalAi.model,
        ai_enabled: String(settings.ai_enabled || '1') === '1',
        default_language: normalizeLanguage(settings.default_language, 'es')
      }
    });
  });

  router.post('/settings', async (req: any, res: Response) => {
    try {
      const body = req.body || {};
      if (typeof body.ai_api_key === 'string' && body.ai_api_key.trim()) return res.status(400).json({ error: 'La clave AI se administra únicamente en la configuración global de Super Admin.' });
      if (body.zernio_api_url !== undefined) {
        const url = normalizeZernioUrl(body.zernio_api_url);
        if (!url) return res.status(400).json({ error: 'La URL del proveedor de canales no es válida.' });
        await saveSetting('zernio_api_url', url);
      }
      if (typeof body.zernio_api_key === 'string' && body.zernio_api_key.trim()) await saveSetting('zernio_api_key', body.zernio_api_key.trim(), true);
      if (typeof body.zernio_webhook_secret === 'string' && body.zernio_webhook_secret.trim()) await saveSetting('zernio_webhook_secret', body.zernio_webhook_secret.trim(), true);
      if (body.ai_enabled !== undefined) await saveSetting('ai_enabled', body.ai_enabled ? '1' : '0');
      if (body.default_language !== undefined) await saveSetting('default_language', normalizeLanguage(body.default_language, 'es'));
      res.json({ success: true, message: 'Configuración interna guardada. La IA usa la configuración global y Zernio conserva su clave interna separada.' });
    } catch (error: any) { console.error('[Admin Assistance] Settings error:', error?.message || error); res.status(500).json({ error: 'No se pudo guardar la configuración interna.' }); }
  });

  router.get('/channels', async (_req: any, res: Response) => {
    const [rows]: any = await pool.query('SELECT * FROM admin_assistance_channels ORDER BY platform ASC, updated_at DESC');
    res.json({ success: true, channels: (rows || []).map(publicChannel), supported: ASSISTANCE_PLATFORMS });
  });

  router.post('/channels/:platform/connect-url', async (req: any, res: Response) => {
    try {
      const platform = normalizePlatform(req.params.platform);
      if (platform !== 'whatsapp') return res.status(409).json({ error: 'La conexión oficial disponible ahora para el Centro de Asistencia es WhatsApp. Instagram, Facebook, Telegram, email y Web Chat tienen su registro separado preparado.' });
      const settings = await getSettings();
      if (!settings.zernio_api_key) return res.status(409).json({ error: 'Configura primero la clave propia de canales internos.' });
      const [existing]: any = await pool.query(`SELECT * FROM admin_assistance_channels WHERE platform = 'whatsapp' ORDER BY updated_at DESC LIMIT 1`);
      let channel = existing?.[0];
      let profileId = channel?.provider_profile_id;
      if (!profileId) {
        const profileResponse = await callAssistanceZernio('/profiles', { method: 'POST', body: { name: 'DoorDrop Centro de Asistencia · WhatsApp' } });
        profileId = profileResponse.data?.profile?._id || profileResponse.data?.profile?.id || profileResponse.data?._id || profileResponse.data?.id;
        if (!profileId) return res.status(502).json({ error: 'El proveedor no devolvió un perfil interno válido.' });
        const channelId = channel?.id || generateId('aac_');
        await pool.query(
          `INSERT INTO admin_assistance_channels (id, platform, provider_profile_id, display_name, status)
           VALUES (?, 'whatsapp', ?, 'WhatsApp corporativo DoorDrop', 'pending')
           ON DUPLICATE KEY UPDATE provider_profile_id = VALUES(provider_profile_id), updated_at = NOW()`,
          [channelId, profileId]
        );
      }
      const language = normalizeLanguage(req.body?.language || settings.default_language, 'es');
      const redirectUrl = `${process.env.APP_URL || 'https://doordrop.lat'}/admin/assistance?connected=whatsapp`;
      const response = await callAssistanceZernio('/connect/whatsapp', {
        queryParams: {
          profileId,
          redirect_url: redirectUrl,
          onboarding: 'business_app',
          signup: 'hosted',
          brandName: 'DoorDrop Centro de Asistencia',
          primaryColor: '#2563EB',
          language: language === 'es' ? 'es' : 'en'
        }
      });
      if (response.status < 200 || response.status >= 300) return res.status(502).json({ error: 'El proveedor no pudo iniciar el QR corporativo.' });
      const authUrl = response.data?.url || response.data?.authUrl || response.data?.redirectUrl;
      if (!authUrl) return res.status(502).json({ error: 'El proveedor no devolvió el enlace del QR corporativo.' });
      res.json({ success: true, platform, profileId, authUrl });
    } catch (error: any) { console.error('[Admin Assistance] Connect channel error:', error?.message || error); res.status(502).json({ error: 'No se pudo iniciar la conexión del canal corporativo.' }); }
  });

  router.post('/ensure-webhook', async (_req: any, res: Response) => {
    try {
      const settings = await getSettings();
      if (!settings.zernio_api_key) return res.status(409).json({ error: 'Configura primero la clave propia de canales internos.' });
      let secret = String(settings.zernio_webhook_secret || '').trim();
      if (!secret) { secret = crypto.randomBytes(32).toString('hex'); await saveSetting('zernio_webhook_secret', secret, true); }
      const body = {
        name: 'DoorDrop Centro de Asistencia',
        url: ASSISTANCE_WEBHOOK_URL,
        secret,
        events: ['message.received', 'message.sent', 'message.delivered', 'message.read', 'message.failed', 'conversation.started', 'account.connected', 'account.disconnected', 'whatsapp.number.action_required'],
        isActive: true
      };
      const listing = await callAssistanceZernio('/webhooks/settings');
      const remote = Array.isArray(listing.data?.webhooks) ? listing.data.webhooks : Array.isArray(listing.data?.settings) ? listing.data.settings : Array.isArray(listing.data) ? listing.data : [];
      const existing = remote.find((item: any) => String(item?.url || '').trim() === ASSISTANCE_WEBHOOK_URL);
      const response = existing
        ? await callAssistanceZernio('/webhooks/settings', { method: 'PUT', body: { _id: existing._id || existing.id, ...body } })
        : await callAssistanceZernio('/webhooks/settings', { method: 'POST', body });
      if (response.status < 200 || response.status >= 300) return res.status(502).json({ error: 'El proveedor no pudo activar el webhook interno.' });
      res.json({ success: true, created: !existing, eventCount: body.events.length, url: ASSISTANCE_WEBHOOK_URL });
    } catch (error: any) { console.error('[Admin Assistance] Webhook error:', error?.message || error); res.status(502).json({ error: 'No se pudo crear o reactivar el webhook interno.' }); }
  });

  router.get('/conversations', async (_req: any, res: Response) => {
    const [rows]: any = await pool.query(
      `SELECT c.*, ch.display_name AS channel_name, ch.phone_number AS channel_phone
         FROM admin_assistance_conversations c
         LEFT JOIN admin_assistance_channels ch ON ch.id = c.channel_id
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT 100`
    );
    res.json({ success: true, conversations: rows || [] });
  });

  router.get('/conversations/:id/messages', async (req: any, res: Response) => {
    const [conversations]: any = await pool.query('SELECT * FROM admin_assistance_conversations WHERE id = ? LIMIT 1', [req.params.id]);
    if (!conversations?.[0]) return res.status(404).json({ error: 'Conversación no encontrada.' });
    const [messages]: any = await pool.query('SELECT * FROM admin_assistance_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 300', [req.params.id]);
    res.json({ success: true, conversation: conversations[0], messages: messages || [] });
  });

  router.post('/conversations/:id/messages', async (req: any, res: Response) => {
    try {
      const text = String(req.body?.message || '').trim().slice(0, 12000);
      if (!text) return res.status(400).json({ error: 'Escribe un mensaje.' });
      const [rows]: any = await pool.query(
        `SELECT c.*, ch.provider_account_id, ch.status AS channel_status
           FROM admin_assistance_conversations c
           LEFT JOIN admin_assistance_channels ch ON ch.id = c.channel_id
          WHERE c.id = ? LIMIT 1`,
        [req.params.id]
      );
      const conversation = rows?.[0];
      if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada.' });
      if (conversation.platform !== 'internal') {
        if (!conversation.provider_conversation_id || !conversation.channel_id) return res.status(409).json({ error: 'La conversación todavía no tiene un canal corporativo asociado.' });
        const payload: any = { message: text };
        if (conversation.provider_account_id) payload.accountId = conversation.provider_account_id;
        const response = await callAssistanceZernio(`/inbox/conversations/${encodeURIComponent(conversation.provider_conversation_id)}/messages`, { method: 'POST', body: payload });
        if (response.status < 200 || response.status >= 300) return res.status(502).json({ error: 'El proveedor no aceptó el mensaje.' });
      }
      await saveAssistanceMessage(req.params.id, { messageId: undefined, direction: 'outbound', senderType: 'human', senderName: req.user.name || 'Equipo DoorDrop', text, status: 'sent' });
      res.json({ success: true });
    } catch (error: any) { console.error('[Admin Assistance] Send message error:', error?.message || error); res.status(500).json({ error: 'No se pudo enviar el mensaje.' }); }
  });

  router.post('/chat', async (req: any, res: Response) => {
    try {
      const text = String(req.body?.message || '').trim().slice(0, 12000);
      if (!text) return res.status(400).json({ error: 'Escribe una consulta.' });
      const language = normalizeLanguage(req.body?.language || 'es', 'es');
      const conversation = await getOrCreateInternalChatConversation(language, req.body?.conversationId);
      await saveAssistanceMessage(conversation.id, { messageId: undefined, direction: 'inbound', senderType: 'super_admin', senderName: req.user.name || 'Super Admin', text, status: 'received' });
      const [history]: any = await pool.query(`SELECT direction, text_content FROM admin_assistance_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10`, [conversation.id]);
      const context = await buildInternalContext(null, true);
      const prompt = `Internal operator request: ${text}\nDoorDrop ecosystem context:\n${JSON.stringify(context).slice(0, 24000)}\nAnswer with an actionable, concise internal response.`;
      const result = await callAssistanceAI([
        { role: 'system', content: assistanceSystemPrompt(language) },
        ...(history || []).reverse().map((item: any) => ({ role: item.direction === 'inbound' ? 'user' : 'assistant', content: String(item.text_content || '').slice(0, 1600) })),
        { role: 'user', content: prompt }
      ], language);
      await saveAssistanceMessage(conversation.id, { messageId: undefined, direction: 'outbound', senderType: 'ai', senderName: `DoorDrop AI · ${result.model}`, text: result.text, status: 'generated' });
      res.json({ success: true, conversationId: conversation.id, response: result.text, model: result.model });
    } catch (error: any) { console.error('[Admin Assistance] Chat error:', error?.message || error); res.status(409).json({ error: error?.message || 'El agente interno no pudo responder.' }); }
  });

  router.post('/conversations/:id/identify', async (req: any, res: Response) => {
    const [rows]: any = await pool.query('SELECT * FROM admin_assistance_conversations WHERE id = ? LIMIT 1', [req.params.id]);
    const conversation = rows?.[0];
    if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada.' });
    const value = String(req.body?.identifier || '').trim();
    if (!value) return res.status(400).json({ error: 'Introduce el correo o código de cliente.' });
    const result = await resolveContactIdentity(conversation, value);
    if (!result.verified) return res.status(404).json({ error: 'No se encontró un cliente coincidente.' });
    res.json({ success: true, customer: { id: result.user.id, name: result.user.name, email: result.user.email, clientCode: result.user.client_code } });
  });

  router.post('/conversations/:id/handoff', async (req: any, res: Response) => {
    const [rows]: any = await pool.query('SELECT * FROM admin_assistance_conversations WHERE id = ? LIMIT 1', [req.params.id]);
    const conversation = rows?.[0];
    if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada.' });
    if (!conversation.verified_customer_user_id) return res.status(409).json({ error: 'Verifica primero el correo o código de cliente para crear un ticket vinculado.' });
    const ticket = await createAssistanceTicket(conversation, req.user.id);
    res.json({ success: true, ticket: ticket ? { id: ticket.id, subject: ticket.subject, status: ticket.status } : null });
  });

  router.get('/customers', async (_req: any, res: Response) => {
    const [rows]: any = await pool.query(
      `SELECT c.id AS conversation_id, c.platform, c.contact_name, c.contact_phone, c.detected_language, c.identity_status, c.ticket_id, c.updated_at,
              u.id AS user_id, u.name, u.email, u.client_code, u.country
         FROM admin_assistance_conversations c
         INNER JOIN users u ON u.id = c.verified_customer_user_id
        ORDER BY c.updated_at DESC LIMIT 100`
    );
    res.json({ success: true, customers: rows || [] });
  });

  router.get('/tickets', async (_req: any, res: Response) => {
    const [rows]: any = await pool.query(
      `SELECT t.id, t.subject, t.category, t.description, t.status, t.created_at, t.updated_at, u.name AS customer_name, u.email AS customer_email
         FROM tickets t LEFT JOIN users u ON u.id = t.user_id
        ORDER BY t.created_at DESC`
    );
    res.json({ success: true, tickets: rows || [] });
  });

  router.get('/team', async (_req: any, res: Response) => {
    const [rows]: any = await pool.query(
      `SELECT s.id AS staff_id, s.title, s.permissions_json, s.last_login_at, u.id AS user_id, u.name, u.email, u.phone, u.status
         FROM admin_staff s INNER JOIN users u ON u.id = s.user_id
        WHERE u.role = 'support'
        ORDER BY CASE WHEN u.status = 'active' THEN 0 ELSE 1 END, u.name ASC`
    );
    res.json({ success: true, team: (rows || []).map((row: any) => ({ id: row.staff_id, userId: row.user_id, name: row.name, email: row.email, phone: row.phone, title: row.title, status: row.status, lastLoginAt: row.last_login_at, permissions: parsePermissions(row.permissions_json) })) });
  });

  router.get('/knowledge', async (_req: any, res: Response) => {
    const [rows]: any = await pool.query(`SELECT id, title, content, language, is_active, created_at, updated_at FROM admin_assistance_knowledge ORDER BY updated_at DESC LIMIT 100`);
    res.json({ success: true, knowledge: rows || [] });
  });

  router.post('/knowledge', async (req: any, res: Response) => {
    const title = String(req.body?.title || '').trim().slice(0, 191);
    const content = String(req.body?.content || '').trim().slice(0, 12000);
    if (!title || !content) return res.status(400).json({ error: 'El título y el contenido son obligatorios.' });
    const language = normalizeLanguage(req.body?.language || 'es', 'es');
    const id = generateId('aak_');
    await pool.query(`INSERT INTO admin_assistance_knowledge (id, title, content, language, is_active) VALUES (?, ?, ?, ?, 1)`, [id, title, content, language]);
    res.status(201).json({ success: true, id });
  });

  router.put('/knowledge/:id', async (req: any, res: Response) => {
    const title = String(req.body?.title || '').trim().slice(0, 191);
    const content = String(req.body?.content || '').trim().slice(0, 12000);
    const language = normalizeLanguage(req.body?.language || 'es', 'es');
    await pool.query(`UPDATE admin_assistance_knowledge SET title = ?, content = ?, language = ?, is_active = ? WHERE id = ?`, [title, content, language, req.body?.is_active === false ? 0 : 1, req.params.id]);
    res.json({ success: true });
  });

  app.post('/api/webhooks/assistance-zernio', async (req: any, res: Response) => {
    try {
      await ensureAdminAssistanceSchema();
      const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
      const settings = await getSettings();
      const signature = String(req.get('X-Zernio-Signature') || req.get('X-Webhook-Signature') || req.get('X-Signature') || '');
      if (!settings.zernio_webhook_secret || !verifyAssistanceWebhookSignature(rawBody, signature, settings.zernio_webhook_secret)) return res.status(401).json({ status: 'invalid_signature' });
      const payload = req.body || {};
      const eventType = String(payload.event || payload.type || 'unknown').slice(0, 120);
      const eventId = String(req.headers['x-zernio-event-id'] || req.headers['x-webhook-id'] || payload.id || payload.eventId || payload.messageId || `aev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`).slice(0, 191);
      const [duplicate]: any = await pool.query('SELECT processed FROM admin_assistance_webhook_events WHERE event_id = ? LIMIT 1', [eventId]);
      if (duplicate?.[0]?.processed) return res.status(200).json({ status: 'duplicate_ignored' });
      await pool.query(
        `INSERT INTO admin_assistance_webhook_events (event_id, event_type, payload_json, processed) VALUES (?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE event_type = VALUES(event_type), payload_json = VALUES(payload_json), error_message = NULL`,
        [eventId, eventType, JSON.stringify(payload)]
      );
      if (eventType === 'message.received') {
        const inbound = normalizeInbound(payload, eventId);
        const channel = await findInternalChannel(inbound.accountId, inbound.profileId);
        if (!channel || !inbound.conversationId) {
          await pool.query(`UPDATE admin_assistance_webhook_events SET processed = 1, processed_at = NOW() WHERE event_id = ?`, [eventId]);
          return res.status(202).json({ status: 'unmatched_internal_channel_ignored' });
        }
        const conversation = await findOrCreateConversation(channel, inbound);
        const inserted = await saveAssistanceMessage(conversation.id, { ...inbound, direction: 'inbound', senderType: 'customer', senderName: inbound.contactName, status: 'received' });
        if (inserted) void processInboundWithAI(conversation.id, inbound);
      } else if (eventType === 'account.connected') {
        const data = payload.data || payload.account || payload;
        const profileId = firstString([payload.profileId, data?.profileId]);
        const accountId = firstString([payload.accountId, data?.accountId, data?._id, data?.id]);
        const channel = await findInternalChannel(accountId, profileId);
        if (channel) {
          await pool.query(`UPDATE admin_assistance_channels SET provider_account_id = COALESCE(?, provider_account_id), status = 'connected', username = COALESCE(?, username), phone_number = COALESCE(?, phone_number), connected_at = COALESCE(connected_at, NOW()), updated_at = NOW() WHERE id = ?`, [accountId, data?.username || data?.name || null, data?.phone || null, channel.id]);
        }
      }
      await pool.query(`UPDATE admin_assistance_webhook_events SET processed = 1, processed_at = NOW(), error_message = NULL WHERE event_id = ?`, [eventId]);
      return res.status(200).json({ status: 'ok', eventId });
    } catch (error: any) {
      console.error('[Admin Assistance Webhook] Processing error:', error?.message || error);
      try { await pool.query(`UPDATE admin_assistance_webhook_events SET processed = 0, error_message = ? WHERE event_id = ?`, [String(error?.message || 'processing_error').slice(0, 1000), String(req.headers['x-zernio-event-id'] || req.body?.id || '')]); } catch {}
      return res.status(500).json({ status: 'retry' });
    }
  });

  app.use('/api/admin/assistance', router);
  console.log('[Admin Assistance] Internal Center routes mounted on /api/admin/assistance and /api/webhooks/assistance-zernio');
}
