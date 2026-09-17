import crypto from 'crypto';

export type SupportedAgentLanguage = 'es' | 'it' | 'en' | 'fr';

const COUNTRY_LANGUAGE: Record<string, SupportedAgentLanguage> = {
  ES: 'es',
  IT: 'it',
  FR: 'fr',
  GB: 'en',
  UK: 'en',
  US: 'en',
  CA: 'en',
  AU: 'en',
  IE: 'en',
  NZ: 'en',
  DE: 'en',
  AT: 'en',
  CH: 'fr',
  BE: 'fr',
  LU: 'fr'
};

const PHONE_LANGUAGE = [
  ['39', 'it'],
  ['34', 'es'],
  ['33', 'fr'],
  ['44', 'en'],
  ['1', 'en'],
  ['41', 'fr'],
  ['32', 'fr'],
  ['352', 'fr'],
  ['49', 'en'],
  ['43', 'en'],
  ['31', 'en'],
  ['351', 'en']
] as Array<[string, SupportedAgentLanguage]>;

PHONE_LANGUAGE.sort((a, b) => b[0].length - a[0].length);

const SUPPORTED_LANGUAGES = new Set<SupportedAgentLanguage>(['es', 'it', 'en', 'fr']);

export function generateClientCode(seed: unknown): string {
  const source = String(seed || crypto.randomUUID());
  return `DD-${crypto.createHash('sha256').update(source).digest('hex').slice(0, 12).toUpperCase()}`;
}

export function normalizeAgentLanguage(value: unknown, fallback: SupportedAgentLanguage = 'es'): SupportedAgentLanguage {
  const normalized = String(value || '').trim().toLowerCase().slice(0, 2) as SupportedAgentLanguage;
  return SUPPORTED_LANGUAGES.has(normalized) ? normalized : fallback;
}

function normalizePhone(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function phoneMatches(left: unknown, right: unknown): boolean {
  const a = normalizePhone(left);
  const b = normalizePhone(right);
  if (!a || !b) return true;
  return a === b || a.endsWith(b) || b.endsWith(a);
}

export function languageFromContact(phone: unknown, merchantCountry?: unknown, fallback: SupportedAgentLanguage = 'es'): SupportedAgentLanguage {
  const digits = normalizePhone(phone);
  for (const [prefix, language] of PHONE_LANGUAGE) {
    if (digits.startsWith(prefix)) return language;
  }
  const country = String(merchantCountry || '').trim().toUpperCase();
  return COUNTRY_LANGUAGE[country] || normalizeAgentLanguage(fallback, 'es');
}

export function extractCustomerIdentifier(text: unknown): { email: string | null; clientCode: string | null } {
  const value = String(text || '').trim();
  const emailMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const clientCodeMatch = value.match(/\bDD[-\s]?[A-Z0-9]{6,24}\b/i);
  return {
    email: emailMatch ? emailMatch[0].trim().toLowerCase() : null,
    clientCode: clientCodeMatch
      ? clientCodeMatch[0].replace(/\s+/g, '-').toUpperCase()
      : null
  };
}

export function hasSensitiveCustomerRequest(text: unknown): boolean {
  const value = String(text || '').toLowerCase();
  return /\b(estado|seguimiento|tracking|rastre|env[ií]o|pedido|orden|factura|saldo|wallet|reembolso|devoluci[oó]n|shipment|order|invoice|refund|livraison|commande|spedizione|ordine|fattura)\b/i.test(value);
}

export function verificationPrompt(language: SupportedAgentLanguage, invalid = false, human = false): string {
  if (human) {
    const messages: Record<SupportedAgentLanguage, string> = {
      es: 'No he podido verificar la cuenta después de varios intentos. Te paso con una persona del equipo para ayudarte de forma segura.',
      it: 'Non ho potuto verificare l’account dopo diversi tentativi. Ti passo a una persona del team per aiutarti in sicurezza.',
      en: 'I could not verify the account after several attempts. I am transferring you to a team member for secure assistance.',
      fr: 'Je n’ai pas pu vérifier le compte après plusieurs tentatives. Je vous transfère à un membre de l’équipe pour vous aider en toute sécurité.'
    };
    return messages[language];
  }

  const messages: Record<SupportedAgentLanguage, string> = {
    es: invalid
      ? 'No pude verificar esos datos. Revisa tu código de cliente o correo registrado e inténtalo de nuevo. Para una consulta de envío, no compartiré información hasta confirmar tu cuenta.'
      : 'Para consultar un envío, pedido o factura, confirma primero tu cuenta enviando tu código de cliente (DD-...) o el correo registrado. Si solo buscas información general, dime qué necesitas.',
    it: invalid
      ? 'Non ho potuto verificare questi dati. Controlla il codice cliente o l’e-mail registrata e riprova. Non mostrerò informazioni di spedizione finché l’account non sarà confermato.'
      : 'Per consultare una spedizione, un ordine o una fattura, conferma prima l’account inviando il codice cliente (DD-...) o l’e-mail registrata. Per informazioni generali, dimmi pure cosa ti serve.',
    en: invalid
      ? 'I could not verify those details. Check your customer code or registered email and try again. I will not disclose shipment information until the account is confirmed.'
      : 'To check a shipment, order, or invoice, first confirm your account with your customer code (DD-...) or registered email. If you need general information, tell me what you are looking for.',
    fr: invalid
      ? 'Je n’ai pas pu vérifier ces informations. Vérifiez votre code client ou votre e-mail enregistré, puis réessayez. Je ne divulguerai aucune information d’expédition avant la confirmation du compte.'
      : 'Pour consulter une expédition, une commande ou une facture, confirmez d’abord votre compte avec votre code client (DD-...) ou votre e-mail enregistré. Pour une information générale, dites-moi ce dont vous avez besoin.'
  };
  return messages[language];
}

export type InboundIdentityResult = {
  status: 'verified' | 'unverified' | 'needs_human';
  language: SupportedAgentLanguage;
  privateRequest: boolean;
  identifierProvided: boolean;
  shouldBlockAI: boolean;
  shouldHandoff: boolean;
  prompt: string | null;
  verifiedUserId: string | null;
};

function identifierHash(identifier: string): string {
  return crypto.createHash('sha256').update(identifier).digest('hex');
}

async function writeVerificationAudit(pool: any, values: {
  conversationId: number;
  merchantUserId: string;
  contactPhone: string | null;
  channel: string;
  language: SupportedAgentLanguage;
  identifierType: 'email' | 'client_code';
  identifier: string;
  result: 'verified' | 'rejected' | 'phone_mismatch';
  verifiedUserId?: string | null;
}) {
  await pool.query(
    `INSERT INTO omnichannel_contact_verifications
      (conversation_id, merchant_user_id, contact_phone, channel, requested_language, identifier_type, identifier_hash, result, verified_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      values.conversationId,
      values.merchantUserId,
      values.contactPhone || null,
      values.channel,
      values.language,
      values.identifierType,
      identifierHash(values.identifier),
      values.result,
      values.verifiedUserId || null
    ]
  );
}

/**
 * Verifies an external channel contact against DoorDrop's real users table.
 * Only a hash of the submitted identifier is audited; the raw value is never
 * persisted in the verification log. The caller remains responsible for
 * deciding whether a particular AI tool may expose private data.
 */
export async function resolveInboundCustomerIdentity(pool: any, options: {
  conversationId: number;
  merchantUserId: string;
  channel: string;
  contactPhone?: string | null;
  text: string;
}): Promise<InboundIdentityResult> {
  const [merchantRows]: any = await pool.query(
    'SELECT country, language FROM users WHERE id = ? LIMIT 1',
    [options.merchantUserId]
  );
  const merchant = merchantRows[0] || {};
  const language = languageFromContact(options.contactPhone, merchant.country, normalizeAgentLanguage(merchant.language, 'es'));
  const privateRequest = hasSensitiveCustomerRequest(options.text);
  const candidate = extractCustomerIdentifier(options.text);

  const [conversationRows]: any = await pool.query(
    `SELECT identity_status, verification_attempts, verified_customer_user_id
       FROM omnichannel_conversations
      WHERE id = ? AND user_id = ?
      LIMIT 1`,
    [options.conversationId, options.merchantUserId]
  );
  const conversation = conversationRows[0] || {};

  if (conversation.identity_status === 'verified' && conversation.verified_customer_user_id) {
    await pool.query(
      `UPDATE omnichannel_conversations SET detected_language = ? WHERE id = ? AND user_id = ?`,
      [language, options.conversationId, options.merchantUserId]
    );
    return {
      status: 'verified',
      language,
      privateRequest,
      identifierProvided: false,
      shouldBlockAI: false,
      shouldHandoff: false,
      prompt: null,
      verifiedUserId: String(conversation.verified_customer_user_id)
    };
  }

  await pool.query(
    `UPDATE omnichannel_conversations
        SET detected_language = ?, verification_requested_at = CASE WHEN ? = 1 THEN COALESCE(verification_requested_at, UTC_TIMESTAMP()) ELSE verification_requested_at END
      WHERE id = ? AND user_id = ?`,
    [language, privateRequest ? 1 : 0, options.conversationId, options.merchantUserId]
  );

  const submittedIdentifier = candidate.email || candidate.clientCode;
  if (!submittedIdentifier) {
    return {
      status: 'unverified',
      language,
      privateRequest,
      identifierProvided: false,
      shouldBlockAI: privateRequest,
      shouldHandoff: false,
      prompt: privateRequest ? verificationPrompt(language) : null,
      verifiedUserId: null
    };
  }

  const identifierType = candidate.email ? 'email' : 'client_code';
  const [userRows]: any = await pool.query(
    `SELECT id, email, phone, status
       FROM users
      WHERE (email = ? OR client_code = ?)
        AND status <> 'closed'
      LIMIT 1`,
    [candidate.email || '', candidate.clientCode || '']
  );
  const matchingUser = userRows[0] || null;
  const attempts = Math.min(9, Number(conversation.verification_attempts || 0) + 1);

  if (matchingUser && phoneMatches(options.contactPhone, matchingUser.phone)) {
    await pool.query(
      `UPDATE omnichannel_conversations
          SET identity_status = 'verified', verified_customer_user_id = ?, verification_attempts = 0, verified_at = UTC_TIMESTAMP(), detected_language = ?
        WHERE id = ? AND user_id = ?`,
      [String(matchingUser.id), language, options.conversationId, options.merchantUserId]
    );
    await writeVerificationAudit(pool, {
      conversationId: options.conversationId,
      merchantUserId: options.merchantUserId,
      contactPhone: options.contactPhone || null,
      channel: options.channel,
      language,
      identifierType,
      identifier: submittedIdentifier,
      result: 'verified',
      verifiedUserId: String(matchingUser.id)
    });
    return {
      status: 'verified',
      language,
      privateRequest,
      identifierProvided: true,
      shouldBlockAI: false,
      shouldHandoff: false,
      prompt: null,
      verifiedUserId: String(matchingUser.id)
    };
  }

  const phoneMismatch = Boolean(matchingUser && normalizePhone(options.contactPhone) && normalizePhone(matchingUser.phone));
  await pool.query(
    `UPDATE omnichannel_conversations
        SET identity_status = ?, verification_attempts = ?, detected_language = ?
      WHERE id = ? AND user_id = ?`,
    [attempts >= 5 ? 'needs_human' : 'unverified', attempts, language, options.conversationId, options.merchantUserId]
  );
  await writeVerificationAudit(pool, {
    conversationId: options.conversationId,
    merchantUserId: options.merchantUserId,
    contactPhone: options.contactPhone || null,
    channel: options.channel,
    language,
    identifierType,
    identifier: submittedIdentifier,
    result: phoneMismatch ? 'phone_mismatch' : 'rejected'
  });

  const shouldHandoff = attempts >= 5;
  return {
    status: shouldHandoff ? 'needs_human' : 'unverified',
    language,
    privateRequest: true,
    identifierProvided: true,
    shouldBlockAI: true,
    shouldHandoff,
    prompt: verificationPrompt(language, !shouldHandoff, shouldHandoff),
    verifiedUserId: null
  };
}

/**
 * Compatibility schema for existing production installations. The DDL is
 * intentionally limited to fixed identifiers and is safe to run repeatedly.
 */
export async function ensureOmnichannelAgentSchema(pool: any): Promise<void> {
  const [tables]: any = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('users', 'omnichannel_conversations', 'omnichannel_team')`
  );
  const existing = new Set((tables || []).map((row: any) => String(row.table_name)));

  const ensureColumn = async (table: string, column: string, definition: string) => {
    if (!existing.has(table)) return;
    const [rows]: any = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, column]
    );
    if (!rows.length) await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  };

  await ensureColumn('users', 'client_code', 'VARCHAR(32) NULL');
  await ensureColumn('omnichannel_conversations', 'identity_status', "VARCHAR(20) NOT NULL DEFAULT 'unverified'");
  await ensureColumn('omnichannel_conversations', 'verified_customer_user_id', 'VARCHAR(100) NULL');
  await ensureColumn('omnichannel_conversations', 'verification_attempts', 'TINYINT UNSIGNED NOT NULL DEFAULT 0');
  await ensureColumn('omnichannel_conversations', 'verification_requested_at', 'DATETIME NULL');
  await ensureColumn('omnichannel_conversations', 'verified_at', 'DATETIME NULL');
  await ensureColumn('omnichannel_conversations', 'detected_language', 'CHAR(2) NULL');
  await ensureColumn('omnichannel_conversations', 'ticket_id', 'CHAR(36) NULL');
  await ensureColumn('omnichannel_team', 'specialty', 'VARCHAR(80) NULL');
  await ensureColumn('omnichannel_team', 'languages_json', 'TEXT NULL');

  if (existing.has('users')) {
    await pool.query(
      `UPDATE users
          SET client_code = CONCAT('DD-', UPPER(SUBSTRING(MD5(id), 1, 12)))
        WHERE client_code IS NULL OR client_code = ''`
    );
    try {
      const [indexes]: any = await pool.query(
        `SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'uq_users_client_code' LIMIT 1`
      );
      if (!indexes.length) await pool.query('ALTER TABLE users ADD UNIQUE KEY uq_users_client_code (client_code)');
    } catch (error: any) {
      console.warn('[Omnichannel Identity] Client-code unique index warning:', error?.message || 'index not created');
    }
  }

  if (existing.has('omnichannel_conversations')) {
    try {
      const [indexes]: any = await pool.query(
        `SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'omnichannel_conversations' AND index_name = 'idx_omni_identity' LIMIT 1`
      );
      if (!indexes.length) {
        await pool.query(
          'ALTER TABLE omnichannel_conversations ADD INDEX idx_omni_identity (user_id, identity_status, contact_phone)'
        );
      }
    } catch (error: any) {
      console.warn('[Omnichannel Identity] Conversation index warning:', error?.message || 'index not created');
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS omnichannel_contact_verifications (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      merchant_user_id VARCHAR(100) NOT NULL,
      contact_phone VARCHAR(80) NULL,
      channel VARCHAR(40) NOT NULL,
      requested_language CHAR(2) NOT NULL DEFAULT 'es',
      identifier_type VARCHAR(20) NOT NULL,
      identifier_hash CHAR(64) NOT NULL,
      result VARCHAR(20) NOT NULL,
      verified_user_id VARCHAR(100) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_omni_verification_conversation (conversation_id, created_at),
      INDEX idx_omni_verification_merchant (merchant_user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}
