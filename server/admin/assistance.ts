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
import {
  getInternalWhatsappStatus,
  hasPersistedInternalWhatsappSession,
  logoutInternalWhatsapp,
  sendInternalWhatsappMessage,
  setInternalWhatsappMessageHandler,
  setInternalWhatsappStatusHandler,
  startInternalWhatsapp
} from './whatsappWebService';

/**
 * Internal assistance is deliberately a different bounded context from the
 * customer-facing Omnichannel product.  It has its own settings, provider
 * profiles, conversations, messages and knowledge records.  The only shared
 * surface is read-only business context and the existing ticket system when
 * a verified customer is handed to a human.
 */

const ALLOWED_AI_HOSTS = new Set(['api.deepseek.com', 'api.groq.com', 'api.openai.com']);
const ASSISTANCE_PLATFORMS = ['whatsapp', 'instagram', 'facebook', 'telegram', 'email', 'web_chat'] as const;
type AssistancePlatform = typeof ASSISTANCE_PLATFORMS[number];
type AssistanceLanguage = 'es' | 'it' | 'en' | 'fr';
const INTERNAL_WHATSAPP_ACCOUNT_ID = 'whatsapp-web:doordrop-internal';

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

async function getSettings(): Promise<Record<string, string>> {
  await ensureAdminAssistanceSchema();
  const [rows]: any = await pool.query('SELECT setting_key, setting_value FROM admin_assistance_settings');
  const settings: Record<string, string> = {};
  for (const row of rows || []) settings[String(row.setting_key)] = String(row.setting_value || '');
  return settings;
}

/**
 * The internal assistant consumes the already configured global AI provider.
 * Channel transport is deliberately separate: the internal WhatsApp session
 * is local WhatsApp Web, while Zernio remains exclusively in public
 * Omnichannel routes.
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

async function upsertInternalWhatsappChannel(statusSnapshot = getInternalWhatsappStatus()): Promise<any> {
  const status = statusSnapshot.status === 'ready' ? 'connected' : statusSnapshot.status === 'disconnected' || statusSnapshot.status === 'error' || statusSnapshot.status === 'auth_failure' ? 'disconnected' : 'pending';
  const channelId = generateId('aac_');
  await pool.query(
    `INSERT INTO admin_assistance_channels
      (id, platform, provider_account_id, display_name, phone_number, status, connected_at)
     VALUES (?, 'whatsapp', ?, 'WhatsApp Web · Asistencia DoorDrop', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       phone_number = COALESCE(VALUES(phone_number), phone_number),
       status = VALUES(status),
       connected_at = CASE WHEN VALUES(status) = 'connected' THEN COALESCE(connected_at, VALUES(connected_at)) ELSE connected_at END,
       updated_at = NOW()`,
    [channelId, INTERNAL_WHATSAPP_ACCOUNT_ID, statusSnapshot.phoneNumber, status, status === 'connected' ? new Date() : null]
  );
  const [rows]: any = await pool.query('SELECT * FROM admin_assistance_channels WHERE provider_account_id = ? LIMIT 1', [INTERNAL_WHATSAPP_ACCOUNT_ID]);
  return rows?.[0] || null;
}

async function handleInternalWhatsappMessage(message: any): Promise<void> {
  if (!message || message.fromMe || message.isStatus) return;
  const conversationId = String(message.from || '').trim();
  if (!conversationId || conversationId.endsWith('@g.us') || conversationId.endsWith('@broadcast')) return;

  const contact = await Promise.resolve(message.getContact?.()).catch(() => null);
  const contactName = firstString([contact?.name, contact?.pushname, contact?.shortName], 191) || 'Contacto WhatsApp';
  const contactPhone = firstString([contact?.number, conversationId.split('@')[0]], 80);
  const inbound: NormalizedAssistanceInbound = {
    conversationId,
    messageId: firstString([message.id?._serialized, message.id?.id, `${conversationId}:${message.timestamp || Date.now()}`]) || conversationId,
    accountId: INTERNAL_WHATSAPP_ACCOUNT_ID,
    profileId: null,
    platform: 'whatsapp',
    contactId: conversationId,
    contactName,
    contactPhone,
    text: String(message.body || '').trim().slice(0, 12000) || '[Mensaje multimedia recibido]',
    mediaType: message.hasMedia ? firstString([message.type], 40) : null,
    mediaUrl: null
  };
  const channel = await upsertInternalWhatsappChannel();
  if (!channel) return;
  const conversation = await findOrCreateConversation(channel, inbound);
  const inserted = await saveAssistanceMessage(conversation.id, { ...inbound, direction: 'inbound', senderType: 'customer', senderName: inbound.contactName, status: 'received' });
  if (inserted) void processInboundWithAI(conversation.id, inbound);
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
    if (!channel || channel.provider_account_id !== INTERNAL_WHATSAPP_ACCOUNT_ID || !inbound.conversationId) return;
    const sent = await sendInternalWhatsappMessage(inbound.conversationId, result.text);
    await saveAssistanceMessage(conversationId, {
      messageId: firstString([sent?.id?._serialized, sent?.id?.id]) || undefined,
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
      const globalAi = await getGlobalAiSettings();
      const whatsapp = getInternalWhatsappStatus();
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
          channelsConfigured: whatsapp.enabled,
          whatsappWebStatus: whatsapp.status,
          webhookConfigured: false
        }
      });
    } catch (error: any) { console.error('[Admin Assistance] Overview error:', error?.message || error); res.status(500).json({ error: 'No se pudo cargar el Centro de Asistencia.' }); }
  });

  router.get('/settings', async (_req: any, res: Response) => {
    const settings = await getSettings();
    const globalAi = await getGlobalAiSettings();
    const whatsapp = getInternalWhatsappStatus();
    res.json({
      success: true,
      settings: {
        whatsapp_web_enabled: whatsapp.enabled,
        whatsapp_web_status: whatsapp.status,
        whatsapp_web_session_configured: whatsapp.sessionConfigured,
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
      if (body.zernio_api_url !== undefined || body.zernio_api_key !== undefined || body.zernio_webhook_secret !== undefined) return res.status(400).json({ error: 'Zernio pertenece únicamente al Omnicanal público. Los canales internos usan WhatsApp Web con QR y sesión privada.' });
      if (body.ai_enabled !== undefined) await saveSetting('ai_enabled', body.ai_enabled ? '1' : '0');
      if (body.default_language !== undefined) await saveSetting('default_language', normalizeLanguage(body.default_language, 'es'));
      res.json({ success: true, message: 'Configuración interna guardada. WhatsApp usa una sesión Web privada y la IA usa la configuración global.' });
    } catch (error: any) { console.error('[Admin Assistance] Settings error:', error?.message || error); res.status(500).json({ error: 'No se pudo guardar la configuración interna.' }); }
  });

  router.get('/channels', async (_req: any, res: Response) => {
    const [rows]: any = await pool.query('SELECT * FROM admin_assistance_channels ORDER BY platform ASC, updated_at DESC');
    const whatsapp = getInternalWhatsappStatus();
    const internalChannel = await upsertInternalWhatsappChannel(whatsapp);
    const visible = (rows || []).filter((row: any) => row.provider_account_id === INTERNAL_WHATSAPP_ACCOUNT_ID || row.platform !== 'whatsapp');
    if (internalChannel && !visible.some((row: any) => row.id === internalChannel.id)) visible.unshift(internalChannel);
    res.json({ success: true, channels: visible.map(publicChannel), whatsapp, supported: ASSISTANCE_PLATFORMS });
  });

  router.get('/channels/whatsapp/status', async (_req: any, res: Response) => {
    const whatsapp = getInternalWhatsappStatus();
    const channel = await upsertInternalWhatsappChannel(whatsapp);
    res.json({ success: true, whatsapp, channel: channel ? publicChannel(channel) : null });
  });

  router.post('/channels/:platform/connect-url', async (req: any, res: Response) => {
    try {
      const platform = normalizePlatform(req.params.platform);
      if (platform !== 'whatsapp') return res.status(409).json({ error: 'La conexión oficial disponible ahora para el Centro de Asistencia es WhatsApp. Instagram, Facebook, Telegram, email y Web Chat tienen su registro separado preparado.' });
      const whatsapp = await startInternalWhatsapp();
      const channel = await upsertInternalWhatsappChannel(whatsapp);
      res.json({ success: true, platform, mode: 'whatsapp_web', whatsapp, channel: channel ? publicChannel(channel) : null });
    } catch (error: any) { console.error('[Admin Assistance] Connect channel error:', error?.message || error); res.status(502).json({ error: 'No se pudo iniciar la conexión del canal corporativo.' }); }
  });

  router.post('/channels/whatsapp/logout', async (_req: any, res: Response) => {
    try {
      const whatsapp = await logoutInternalWhatsapp();
      const channel = await upsertInternalWhatsappChannel(whatsapp);
      res.json({ success: true, whatsapp, channel: channel ? publicChannel(channel) : null });
    } catch (error: any) { console.error('[Admin Assistance] WhatsApp logout error:', error?.message || error); res.status(500).json({ error: 'No se pudo desconectar WhatsApp interno.' }); }
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
        if (conversation.provider_account_id !== INTERNAL_WHATSAPP_ACCOUNT_ID) return res.status(409).json({ error: 'Esta conversación no pertenece al canal WhatsApp Web interno.' });
        const sent = await sendInternalWhatsappMessage(conversation.provider_conversation_id, text);
        await saveAssistanceMessage(req.params.id, { messageId: firstString([sent?.id?._serialized, sent?.id?.id]) || undefined, direction: 'outbound', senderType: 'human', senderName: req.user.name || 'Equipo DoorDrop', text, status: 'sent' });
        return res.json({ success: true });
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

  app.use('/api/admin/assistance', router);
  setInternalWhatsappMessageHandler(handleInternalWhatsappMessage);
  setInternalWhatsappStatusHandler(async (status) => { await upsertInternalWhatsappChannel(status); });
  if (process.env.WHATSAPP_INTERNAL_AUTOSTART !== 'false') {
    void hasPersistedInternalWhatsappSession().then((exists) => {
      if (exists) void startInternalWhatsapp().catch((error) => console.error('[Admin Assistance] WhatsApp auto-start error:', error?.message || error));
    });
  }
  console.log('[Admin Assistance] Internal Center routes mounted on /api/admin/assistance with isolated WhatsApp Web QR');
}
