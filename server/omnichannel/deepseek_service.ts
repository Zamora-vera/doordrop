import https from 'https';
import { pool } from '../db/connection.js';
import { handleAIToolCall } from './ai_sales_tools.js';
import { getUserOmnichannelSubscription, hasActiveOmnichannelSubscription } from './entitlements.js';
import { runAgentTurn } from './agent_runtime.js';
import { getOmnichannelReadiness } from './readiness.js';

const DEFAULT_DEEPSEEK_API_URL = 'https://api.deepseek.com';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const ALLOWED_AI_API_HOSTS = new Set(['api.deepseek.com', 'api.groq.com', 'api.openai.com']);
let cachedDeepseekKey = process.env.DEEPSEEK_API_KEY || '';
let cachedDeepseekApiUrl = DEFAULT_DEEPSEEK_API_URL;
let cachedDeepseekModel = DEFAULT_DEEPSEEK_MODEL;
const AI_STANDARD_MARGIN_PERCENT = 10.0;
const AI_PEAK_PROVIDER_ADJUSTMENT_PERCENT = 15.0;
let cachedMarginPercent = AI_STANDARD_MARGIN_PERCENT; // DoorDrop margin in the normal window

export function normalizeAiApiUrl(value: unknown): string | null {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'https:' || !ALLOWED_AI_API_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function normalizeAgentCurrency(value: any): string {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

function normalizeAgentCountry(value: any): string {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

type OmnichannelWalletMutation = (options: {
  userId: string;
  type: 'credit' | 'debit';
  amount: number;
  currency: string;
  description: string;
  referenceType: string;
  referenceId: string;
  minimumBalance?: number;
}) => Promise<any>;

let omnichannelWalletMutation: OmnichannelWalletMutation | null = null;

export function configureOmnichannelWalletMutation(mutation: OmnichannelWalletMutation) {
  omnichannelWalletMutation = mutation;
}

export async function getDeepSeekConfig() {
  try {
    const [rows]: any = await pool.query(
      "SELECT setting_key, setting_value FROM admin_settings WHERE setting_key IN ('deepseek_api_key', 'deepseek_api_url', 'deepseek_model', 'omnichannel_ai_margin_percent')"
    );
    for (const r of rows) {
      if (r.setting_key === 'deepseek_api_key' && r.setting_value) cachedDeepseekKey = r.setting_value;
      if (r.setting_key === 'deepseek_api_url' && r.setting_value) {
        const configuredUrl = normalizeAiApiUrl(r.setting_value);
        if (configuredUrl) {
          cachedDeepseekApiUrl = configuredUrl;
        } else {
          console.warn('[DeepSeek Config] Ignoring invalid API URL.');
        }
      }
      if (r.setting_key === 'deepseek_model' && r.setting_value) {
        cachedDeepseekModel = String(r.setting_value).trim().slice(0, 120) || DEFAULT_DEEPSEEK_MODEL;
      }
      if (r.setting_key === 'omnichannel_ai_margin_percent' && r.setting_value) cachedMarginPercent = Number(r.setting_value) || AI_STANDARD_MARGIN_PERCENT;
    }
  } catch (e) {
    console.error('[DeepSeek Config] Error loading settings:', e);
  }
  return {
    apiKey: cachedDeepseekKey,
    apiUrl: cachedDeepseekApiUrl,
    model: cachedDeepseekModel,
    marginPercent: cachedMarginPercent
  };
}

/**
 * Determine if current local time in merchant's country is a high-demand AI window (18:00 - 22:00).
 */
export function isPeakHour(countryCode: string = ''): boolean {
  const now = new Date();
  let timeZone = '';
  const c = normalizeAgentCountry(countryCode);
  if (c === 'ES') timeZone = 'Europe/Madrid';
  else if (c === 'DE' || c === 'FR' || c === 'IT' || c === 'NL' || c === 'BE') timeZone = 'Europe/Rome';
  else if (c === 'GB' || c === 'UK' || c === 'PT') timeZone = 'Europe/London';
  else if (['US', 'CA'].includes(c)) timeZone = 'America/New_York';
  else if (['MX', 'CO', 'PE'].includes(c)) timeZone = 'America/Bogota';

  // Unknown countries must not silently inherit an Italian timezone. The
  // surcharge is therefore inactive until a supported timezone is configured.
  if (!timeZone) return false;

  try {
    const localHour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone }).format(now));
    return localHour >= 18 && localHour < 22;
  } catch {
    const fallbackHour = now.getUTCHours() + 1;
    return fallbackHour >= 18 && fallbackHour < 22;
  }
}

/**
 * Execute raw completion or tool-call with DeepSeek
 */
export async function callDeepSeekChat(
  messages: Array<any>,
  tools?: Array<any>,
  options: { maxTokens?: number; temperature?: number; responseFormat?: any } = {}
) {
  const { apiKey, apiUrl, model } = await getDeepSeekConfig();
  if (!apiKey) throw new Error('DeepSeek no está configurado para este entorno.');
  const requestBody: any = {
    model,
    messages,
    max_tokens: options.maxTokens || 700,
    temperature: options.temperature ?? 0.6
  };

  if (tools && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = 'auto';
  }

  if (options.responseFormat) {
    requestBody.response_format = options.responseFormat;
  }

  const payload = JSON.stringify(requestBody);

  return new Promise<{ message: any; usage: any }>((resolve, reject) => {
    const endpoint = new URL(`${apiUrl.replace(/\/$/, '')}/chat/completions`);
    const req = https.request(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 35000
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const status = Number(res.statusCode || 500);
          if (status >= 200 && status < 300 && parsed.choices && parsed.choices[0]?.message) {
            resolve({
              message: parsed.choices[0].message,
              usage: parsed.usage || {}
            });
          } else {
            const providerMessage = String(parsed.error?.message || 'Respuesta no válida del proveedor').slice(0, 300);
            reject(new Error(`DeepSeek HTTP ${status}: ${providerMessage}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('DeepSeek API timeout'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Bill the user's balance for AI tokens with a transparent high-demand rule.
 * Normal window: DoorDrop applies the configured standard margin (10% by default).
 * High-demand window: DoorDrop applies no commercial margin and passes through only
 * the configured 15% AI-demand adjustment. Shipping quotes are not changed here.
 */
export async function billUserForAiUsage(userId: string, totalTokens: number, countryCode: string = '') {
  if (!totalTokens || totalTokens <= 0) return;
  if (!omnichannelWalletMutation) {
    console.error('[AI Billing] Wallet mutation service is not configured; charge skipped.');
    return;
  }
  const { marginPercent } = await getDeepSeekConfig();

  const peak = isPeakHour(countryCode);

  // Base cost estimate: 1,000 tokens ≈ $0.0003
  const baseCostUSD = (totalTokens / 1000) * 0.0003;
  const peakProviderAdjustmentPercent = peak ? AI_PEAK_PROVIDER_ADJUSTMENT_PERCENT : 0;
  const providerCostUSD = baseCostUSD * (1 + (peakProviderAdjustmentPercent / 100));
  const doorDropMarginPercent = peak ? 0 : Math.max(0, marginPercent);
  const finalCost = providerCostUSD * (1 + (doorDropMarginPercent / 100));
  // Wallet balances and wallet_transactions use cents as their accounting precision.
  const roundedCost = Number(finalCost.toFixed(2));

  if (roundedCost <= 0) return;

  try {
    const mutation = await omnichannelWalletMutation({
      userId,
      type: 'debit',
      amount: roundedCost,
      currency: 'USD',
      description: `Uso agente IA (${totalTokens} tokens${peak ? ', alta demanda' : ''})`,
      referenceType: 'omnichannel_ai_usage',
      referenceId: `ai:${userId}:${Date.now()}`,
      minimumBalance: -1.00
    });
    console.log(`[AI Billing] User ${userId} billed ${mutation.walletAmount} ${mutation.walletCurrency} (Tokens: ${totalTokens}, DoorDrop margin: +${doorDropMarginPercent}%, Demand adjustment: +${peakProviderAdjustmentPercent}% ${peak ? '[HIGH DEMAND]' : '[STANDARD]'})`);
  } catch (err: any) {
    console.error(`[AI Billing] Error deducting balance for user ${userId}:`, err.code || err.message);
  }
}

/**
 * Build schema of available autonomous sales tools based on merchant's active toggles
 */
function buildToolsForMerchant(settings: any) {
  const tools: any[] = [];

  // 1. Search products
  if (settings.can_search_products !== 0) {
    tools.push({
      type: 'function',
      function: {
        name: 'search_products',
        description: 'Busca productos reales y disponibles del catálogo de este negocio, con precio, moneda, foto y stock verificados.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Nombre, código, categoría o palabra clave indicada por el cliente' }
          },
          required: ['query']
        }
      }
    });

    tools.push({
      type: 'function',
      function: {
        name: 'get_product_recommendation',
        description: 'Sugiere hasta tres productos reales del catálogo según categoría, preferencias, presupuesto y disponibilidad del cliente. Nunca inventes productos, precios o stock.',
        parameters: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Categoría o tipo de producto buscado' },
            customer_requirements: { type: 'string', description: 'Preferencias, talla, estilo, uso o presupuesto indicados por el cliente' },
            max_price: { type: 'number', description: 'Precio máximo si el cliente lo indicó' }
          },
          required: ['customer_requirements']
        }
      }
    });
  }

  tools.push({
    type: 'function',
    function: {
      name: 'get_store_info',
      description: 'Consulta información real y actual del negocio, políticas, contacto, moneda, catálogo y condiciones configuradas por el vendedor.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Tema que pregunta el cliente: contacto, envíos, devoluciones, pagos, horarios o información general' }
        }
      }
    }
  });

  // 2. Send product photos
  if (settings.can_send_photos !== 0) {
    tools.push({
      type: 'function',
      function: {
        name: 'send_product_photos',
        description: 'Envía a la conversación fotos oficiales que existan en el catálogo real del negocio.',
        parameters: {
          type: 'object',
          properties: {
            product_name: { type: 'string', description: 'Nome o codice del prodotto di cui mostrare le foto' }
          },
          required: ['product_name']
        }
      }
    });
  }

  // 3. Quote shipping
  if (settings.can_quote_shipping !== 0) {
    tools.push({
      type: 'function',
      function: {
        name: 'quote_shipping',
        description: 'Consulta las tarifas y tiempos devueltos en vivo por la API multi-transportista para el origen configurado del negocio y el destino del cliente. No calcula precios propios.',
        parameters: {
          type: 'object',
          properties: {
            from_country: { type: 'string', description: 'Código ISO-3166 de dos letras del origen, solo si el negocio lo indicó o la API lo exige' },
            from_zip: { type: 'string', description: 'Código postal real de recogida, solo si el negocio lo indicó' },
            from_city: { type: 'string', description: 'Ciudad real de recogida, solo si está configurada' },
            to_country: { type: 'string', description: 'Código ISO-3166 de dos letras del destino' },
            zip_code: { type: 'string', description: 'Código postal real de destino' },
            city: { type: 'string', description: 'Ciudad real de destino' },
            weight_kg: { type: 'number', description: 'Peso real del paquete en kilogramos' },
            length_cm: { type: 'number', description: 'Largo real en centímetros, si el cliente lo proporcionó' },
            width_cm: { type: 'number', description: 'Ancho real en centímetros, si el cliente lo proporcionó' },
            height_cm: { type: 'number', description: 'Alto real en centímetros, si el cliente lo proporcionó' }
          },
          required: ['to_country', 'zip_code']
        }
      }
    });
  }

  // 4. Create order checkout
  if (settings.can_create_orders !== 0) {
    tools.push({
      type: 'function',
      function: {
        name: 'create_order_checkout',
        description: 'Conclude formalmente la vendita: crea l\'ordine nel sistema DoorDrop e genera il link di pagamento sicuro per il cliente.',
        parameters: {
          type: 'object',
          properties: {
            product_name: { type: 'string', description: 'Nome esatto o parziale del prodotto acquistato' },
            quantity: { type: 'number', description: 'Quantità di articoli da ordinare' },
            buyer_name: { type: 'string', description: 'Nome e cognome completo del cliente' },
            buyer_email: { type: 'string', description: 'Email del cliente per il checkout e le notifiche dell\'ordine' },
            buyer_phone: { type: 'string', description: 'Numero di telefono del cliente' },
            buyer_address: { type: 'string', description: 'Indirizzo completo con via e numero civico' },
            buyer_zip: { type: 'string', description: 'CAP / Codice postale' },
            buyer_city: { type: 'string', description: 'Città' },
            buyer_country: { type: 'string', description: 'Código ISO-3166 de dos letras del país real del comprador' }
          },
          required: ['product_name', 'buyer_name', 'buyer_email', 'buyer_address', 'buyer_zip', 'buyer_city', 'buyer_country']
        }
      }
    });
  }

  // 5. Lookup or generate tracking
  if (settings.can_generate_tracking !== 0 || settings.can_lookup_tracking !== 0) {
    tools.push({
      type: 'function',
      function: {
        name: 'lookup_or_generate_tracking',
        description: 'Verifica lo stato di spedizione di un ordine esistente oppure genera il codice di tracciamento DoorDrop.',
        parameters: {
          type: 'object',
          properties: {
            order_number: { type: 'string', description: 'Numero ordine o codice tracking' }
          },
          required: ['order_number']
        }
      }
    });
  }

  // 6. Verify business rules
  tools.push({
    type: 'function',
    function: {
      name: 'verify_business_rules',
      description: 'Consulta le condizioni contrattuali del negozio: soglia spedizione gratuita, ordine minimo, politiche di reso e garanzie.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  });

  // 7. Human handoff
  if (settings.can_handoff_human !== 0) {
    tools.push({
      type: 'function',
      function: {
        name: 'handoff_to_human',
        description: 'Allerta il team umano del negozio e trasferisce la chat quando il cliente lo richiede esplicitamente.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Motivo del passaggio all\'operatore umano' },
            specialty: { type: 'string', description: 'Especialidad solicitada, por ejemplo envíos, ventas o facturación' },
            language: { type: 'string', description: 'Idioma de atención: es, it, en o fr' }
          }
        }
      }
    });
  }

  return tools;
}

const CUSTOMER_MEMORY_MESSAGE_LIMIT = 24;
const CUSTOMER_MEMORY_TEXT_LIMIT = 1200;

function hasStableContactId(value: unknown): boolean {
  const normalized = String(value || '').trim();
  return Boolean(normalized) && !/^contact_\d+$/.test(normalized);
}

/**
 * Load bounded, tenant-scoped memory for this contact. The existing durable
 * conversation/message tables are the source of truth; no synthetic profile
 * or demo memory is created. When the channel supplies a stable contact id,
 * previous conversations for that same contact are included as well.
 */
async function loadCustomerConversationMemory(
  userId: string,
  conversationId: number | string
): Promise<any[]> {
  const localConversationId = Number(conversationId);
  if (!Number.isFinite(localConversationId) || localConversationId <= 0) return [];

  const [conversationRows]: any = await pool.query(
    `SELECT platform, contact_id, contact_phone
       FROM omnichannel_conversations
      WHERE id = ? AND user_id = ?
      LIMIT 1`,
    [localConversationId, userId]
  );
  const conversation = conversationRows[0];
  if (!conversation) return [];

  const identityClauses = ['c.id = ?'];
  const identityParams: any[] = [localConversationId];
  const platform = String(conversation.platform || '').trim();
  const contactId = String(conversation.contact_id || '').trim();
  const contactPhone = String(conversation.contact_phone || '').trim();

  if (platform && hasStableContactId(contactId)) {
    identityClauses.push('(c.platform = ? AND c.contact_id = ?)');
    identityParams.push(platform, contactId);
  }
  if (platform && contactPhone) {
    identityClauses.push('(c.platform = ? AND c.contact_phone = ?)');
    identityParams.push(platform, contactPhone);
  }

  const [rows]: any = await pool.query(
    `SELECT m.direction, m.sender_name, m.text_content, m.conversation_id
       FROM omnichannel_messages m
       JOIN omnichannel_conversations c ON c.id = m.conversation_id
      WHERE c.user_id = ?
        AND (${identityClauses.join(' OR ')})
      ORDER BY m.id DESC
      LIMIT ${CUSTOMER_MEMORY_MESSAGE_LIMIT}`,
    [userId, ...identityParams]
  );

  return rows.reverse();
}

/**
 * Generate Autonomous Conversational AI Employee Reply with Full Conversation Memory
 * Enforces:
 * 1. Credit Limit: Balance cannot go below -1.00 USD/EUR. If < -1.00, AI stops until recharge.
 * 2. Bounded multi-turn memory with up to 24 recent messages for the same contact.
 * 3. Strict language matching.
 * 4. Human personality & brevity guidelines.
 */
export async function generateAIEmployeeReply(
  userId: string,
  incomingText: string,
  contactName?: string,
  conversationId?: number | string
): Promise<{ text: string; mediaUrl?: string | null; blockedCredit?: boolean } | string | null> {
  try {
    // 1. Subscription & credit limit check. Access is granted only by Polar.
    const subscription = await getUserOmnichannelSubscription(userId);
    if (!hasActiveOmnichannelSubscription(subscription) || !subscription.ai_enabled) {
      return null;
    }
    const readiness = await getOmnichannelReadiness(userId);
    if (!readiness.ready) {
      console.warn(`[AI Sales Agent] User ${userId} blocked by readiness: ${readiness.blockers.map(item => item.code).join(',')}`);
      return null;
    }

    const [userRows]: any = await pool.query(
      "SELECT balance, name, country, currency, business_type FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    const balance = Number(userRows[0]?.balance || 0);
    const countryCode = normalizeAgentCountry(userRows[0]?.country);
    const merchantCurrency = normalizeAgentCurrency(userRows[0]?.currency);

    // CREDIT LIMIT: Block AI if balance is below -1.00 USD/EUR
    if (balance < -1.00) {
      console.log(`[AI Sales Agent] User ${userId} BLOCKED: balance is ${balance} (credit limit is -1.00)`);
      return {
        text: 'Il servizio di assistenza AI è temporaneamente in pausa per aggiornamento del saldo. Ricarica il tuo wallet per riattivare le risposte automatiche.',
        blockedCredit: true
      };
    }

    // 2. Load Merchant AI Configuration
    const [aiRows]: any = await pool.query(
      "SELECT * FROM omnichannel_ai_settings WHERE user_id = ? LIMIT 1",
      [userId]
    );
    const settings = aiRows[0] || {};
    const agentName = settings.agent_name || 'Asistente de ventas del negocio';
    const language = String(settings.language || 'auto').trim() || 'auto';
    const tone = settings.tone || 'friendly_professional';
    const memoryEnabled = settings.auto_learn_conversations !== 0;
    const businessInfo = settings.business_info || 'El negocio aún no ha configurado una descripción comercial.';
    const personalityRules = settings.personality_instructions || 'Sé cordial, claro, breve y útil. Haz preguntas solo cuando sean necesarias para vender o atender.';
    const salesContract = settings.sales_contract_text || 'No hay condiciones comerciales configuradas. No inventes plazos, devoluciones, garantías ni medios de pago.';
    const freeShippingValue = settings.free_shipping_threshold === null || settings.free_shipping_threshold === undefined
      ? null
      : Number(settings.free_shipping_threshold);
    const minOrderValue = settings.min_order_amount === null || settings.min_order_amount === undefined
      ? null
      : Number(settings.min_order_amount);
    const commercialCurrency = merchantCurrency || 'moneda no configurada';
    const freeShippingRule = Number.isFinite(freeShippingValue) && freeShippingValue > 0
      ? `Envío gratuito desde ${freeShippingValue.toFixed(2)} ${commercialCurrency}.`
      : 'No hay umbral de envío gratuito configurado.';
    const minOrderRule = Number.isFinite(minOrderValue) && minOrderValue > 0
      ? `Pedido mínimo: ${minOrderValue.toFixed(2)} ${commercialCurrency}.`
      : 'No hay pedido mínimo configurado.';

    let faqs: Array<{ q: string; a: string }> = [];
    try { faqs = JSON.parse(settings.faqs_json || '[]'); } catch {}

    const faqsText = faqs.length > 0
      ? '\n[FAQ reales del negocio]:\n' + faqs.map(f => `• P: ${f.q} -> R: ${f.a}`).join('\n')
      : '';

    // Tone instructions
    let toneDescription = 'amable, empático, claro y profesional';
    if (tone === 'sales_oriented') toneDescription = 'dinámico, proactivo y orientado a cerrar ventas sin presionar';
    if (tone === 'casual') toneDescription = 'directo, cercano, sencillo y accesible';
    if (tone === 'luxury') toneDescription = 'elegante, refinado, atento y exclusivo';

    let identityStatus = 'unverified';
    let identityLanguage = language;
    if (conversationId) {
      try {
        const [identityRows]: any = await pool.query(
          `SELECT identity_status, verified_customer_user_id, detected_language
             FROM omnichannel_conversations
            WHERE id = ? AND user_id = ?
            LIMIT 1`,
          [conversationId, userId]
        );
        const identity = identityRows[0] || {};
        identityStatus = String(identity.identity_status || 'unverified');
        identityLanguage = String(identity.detected_language || language || 'auto').slice(0, 10);
      } catch (identityError: any) {
        console.warn('[AI Sales Agent] Identity context unavailable:', identityError?.message || 'unknown error');
      }
    }

    // 3. Global, tenant-aware system prompt. The configured language is only
    // a fallback; the customer's current language is authoritative.
    const systemPrompt = `Eres ${agentName}, el agente autónomo de ventas y asistencia de este negocio en DoorDrop.
Tu objetivo es ayudar a cada cliente a descubrir productos reales, resolver dudas y completar compras de forma clara, breve y segura.

Negocio y contexto: país ${countryCode || 'no configurado'}, moneda comercial ${commercialCurrency}, tipo de negocio ${userRows[0]?.business_type || 'no configurado'}.
Tono: ${toneDescription}.
Instrucciones del negocio: ${personalityRules}
Idiomas de atención admitidos: español, italiano, inglés y francés. Idioma configurado como respaldo: ${language}. Detecta el idioma del último mensaje del cliente y responde siempre en el mismo idioma cuando sea uno de esos cuatro. Si recibes otro idioma, responde brevemente en ${language} e indica que la atención disponible es en español, italiano, inglés o francés. No cambies de idioma sin que el cliente lo pida.

Cliente: ${contactName || 'cliente'}.
Estado de verificación: ${identityStatus}. Idioma detectado por canal: ${identityLanguage}.

Información real del negocio:
${businessInfo}
${faqsText}

Reglas comerciales reales:
- ${freeShippingRule}
- ${minOrderRule}
- Condiciones y devoluciones: ${salesContract}

Reglas obligatorias de operación:
1. Usa la memoria disponible de esta conversación y del mismo cliente/canal: reutiliza nombre, preferencias, producto elegido y datos ya confirmados; no repitas preguntas. Si el cliente responde con un número o una confirmación breve, relaciónalo con la lista que acabas de presentar.
2. Usa solo información real devuelta por las herramientas y la configuración de este negocio. Nunca inventes productos, precios, stock, moneda, plazos, políticas, garantías, pagos, pedidos, direcciones, transportistas o estados.
3. Para productos usa get_product_recommendation o search_products. Presenta como máximo tres opciones numeradas y conserva su moneda real.
4. Para fotos usa send_product_photos solo cuando existan imágenes reales del producto.
5. Para envíos solicita país, código postal, ciudad y peso real si faltan; después usa quote_shipping. No calcules tarifas mentalmente ni uses precios por defecto. Si la API no devuelve ofertas, dilo con claridad.
6. Antes de un checkout, muestra producto, cantidad, transporte, moneda y total verificados. Usa create_order_checkout únicamente después de una confirmación explícita y con todos los datos reales del comprador.
7. Para seguimiento usa lookup_or_generate_tracking solo después de que el estado de verificación sea verified. Si el cliente pide información de cuenta, envío, pedido o factura y no está verificado, solicita su correo registrado o código de cliente DD-... y no reveles datos.
8. Para hablar con una persona usa handoff_to_human. Incluye el motivo y, si se conoce, la especialidad o el idioma solicitados.
9. Responde en 2-4 frases cortas, máximo aproximadamente 600 caracteres. Haz como máximo una pregunta o solicitud de datos por mensaje.
10. Si falta configuración real del negocio, informa qué debe completar el negocio; no rellenes el vacío con una suposición comercial.`;

    const tools = buildToolsForMerchant(settings);

    // 4. Load Conversation History from Database
    let historyMessages: any[] = [];
    if (memoryEnabled && conversationId) {
      const histRows = await loadCustomerConversationMemory(userId, conversationId);
      for (const m of histRows) {
        const text = String(m.text_content || '').trim().slice(0, CUSTOMER_MEMORY_TEXT_LIMIT);
        if (!text) continue;
        if (text === incomingText.trim() && m.direction === 'inbound') {
          continue;
        }
        if (m.direction === 'inbound') {
          historyMessages.push({ role: 'user', content: text });
        } else {
          historyMessages.push({ role: 'assistant', content: text });
        }
      }
    }

    let messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...(memoryEnabled && historyMessages.length > 0
        ? [{ role: 'system', content: 'Memoria del cliente disponible: reutiliza los datos ya confirmados y no repitas preguntas innecesarias.' }]
        : []),
      ...historyMessages,
      { role: 'user', content: incomingText }
    ];

    let photoAttachmentUrl: string | null = null;

    // 5. Bounded tool-calling runtime adapted to DoorDrop's real tenant data.
    const agentRun = await runAgentTurn({
      messages,
      tools,
      maxLoops: 4,
      executeTool: async (fnName, fnArgs) => {
        console.log(`[AI Sales Agent] Executing tool: ${fnName}`);
        const toolResult = await handleAIToolCall(fnName, fnArgs, userId, {
          conversationId,
          language: identityLanguage
        });
        if (fnName === 'send_product_photos' && (toolResult as any)?.media_attachment_url) {
          photoAttachmentUrl = (toolResult as any).media_attachment_url;
        }
        return toolResult;
      },
      callChat: (agentMessages, agentTools) => callDeepSeekChat(agentMessages, agentTools, { temperature: 0.6 })
    });

    // Bill user balance with Peak Hours dynamic pricing
    await billUserForAiUsage(userId, agentRun.totalTokens, countryCode);

    const replyContent = agentRun.message?.content || 'Come posso aiutarti?';
    return photoAttachmentUrl ? { text: replyContent, mediaUrl: photoAttachmentUrl } : replyContent;
  } catch (err: any) {
    console.error('[AI Sales Agent] Error:', err.message);
    return null;
  }
}

/**
 * Automatically generate complete store AI setup using catalog and merchant profile
 */
export async function autoGenerateStoreAISettings(userId: string) {
  // 1. Fetch store info and top catalog items
  const [userRows]: any = await pool.query(
    "SELECT id, name, email, country, currency, business_type FROM users WHERE id = ? LIMIT 1",
    [userId]
  );
  const user = userRows[0] || {};

  const [prods]: any = await pool.query(
    `SELECT title, price_minor, currency, quantity
     FROM marketplace_listings
     WHERE seller_id = ? AND status = 'active'
     LIMIT 8`,
    [userId]
  );

  const [existingRows]: any = await pool.query(
    `SELECT sales_contract_text, free_shipping_threshold, min_order_amount, faqs_json
       FROM omnichannel_ai_settings
      WHERE user_id = ?
      LIMIT 1`,
    [userId]
  );
  const existingSettings = existingRows[0] || null;

  const userCurrency = normalizeAgentCurrency(user.currency) || 'moneda no configurada';
  const sampleCatalog = prods.map((p: any) => {
    const productCurrency = normalizeAgentCurrency(p.currency) || userCurrency;
    return `${p.title} (${(Number(p.price_minor || 0) / 100).toFixed(2)} ${productCurrency}, stock ${Number(p.quantity || 0)})`;
  }).join(', ');

  const prompt = `Eres un especialista en ventas conversacionales omnicanal.
Analiza únicamente los datos reales siguientes y prepara la configuración de un agente para este negocio:
- Nombre del negocio o titular: ${user.name || 'No configurado'}
- País del negocio: ${user.country || 'No configurado'}
- Moneda principal: ${userCurrency}
- Tipo de negocio: ${user.business_type || 'No configurado'}
- Productos activos observados en el catálogo: ${sampleCatalog || 'Catálogo vacío; no recomendar productos hasta que existan artículos activos.'}

Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin markdown) con estos campos.
No inventes políticas, plazos, garantías, medios de pago, características, materiales, disponibilidad ni datos de contacto. Si un dato no está en la entrada, déjalo vacío o usa una lista vacía:
{
  "agent_name": "Nombre neutral y profesional del agente para este negocio",
  "tone": "uno tra 'friendly_professional', 'sales_oriented', 'casual', 'luxury'",
  "language": "auto",
  "business_info": "Descripción comercial basada solamente en el nombre, tipo de negocio y productos reales proporcionados.",
  "personality_instructions": "Sé claro, breve, empático y orientado a ayudar. Pregunta por las preferencias del cliente y recomienda solo productos activos.",
  "sales_contract_text": "",
  "free_shipping_threshold": 0.00,
  "min_order_amount": 0.00,
  "response_delay_seconds": 3,
  "faqs": []
}`;

  const completion = await callDeepSeekChat(
    [{ role: 'user', content: prompt }],
    undefined,
    { temperature: 0.7, responseFormat: { type: 'json_object' } }
  );

  let resultJson: any = {};
  try {
    resultJson = JSON.parse(completion.message?.content || '{}');
  } catch {
    const raw = completion.message?.content || '{}';
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      resultJson = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    }
  }

  // The model may write persuasive copy, but it is never allowed to create
  // commercial facts. Those fields stay neutral until the merchant configures
  // them explicitly in the panel.
  resultJson.language = 'auto';
  resultJson.sales_contract_text = existingSettings?.sales_contract_text || '';
  resultJson.free_shipping_threshold = existingSettings?.free_shipping_threshold === null || existingSettings?.free_shipping_threshold === undefined
    ? 0
    : Number(existingSettings.free_shipping_threshold);
  resultJson.min_order_amount = existingSettings?.min_order_amount === null || existingSettings?.min_order_amount === undefined
    ? 0
    : Number(existingSettings.min_order_amount);
  if (existingSettings?.faqs_json) {
    try {
      const existingFaqs = JSON.parse(existingSettings.faqs_json);
      if (Array.isArray(existingFaqs)) resultJson.faqs = existingFaqs;
    } catch {}
  }
  resultJson.faqs = Array.isArray(resultJson.faqs) ? resultJson.faqs : [];

  return resultJson;
}
