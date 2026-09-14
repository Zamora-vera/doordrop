import https from 'https';
import { pool } from '../db/connection.js';
import { handleAIToolCall } from './ai_sales_tools.js';
import { getUserOmnichannelSubscription, hasActiveOmnichannelSubscription } from './entitlements.js';

let cachedDeepseekKey = process.env.DEEPSEEK_API_KEY || '';
let cachedMarginPercent = 10.0; // Standard resale margin

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
      "SELECT setting_key, setting_value FROM admin_settings WHERE setting_key IN ('deepseek_api_key', 'omnichannel_ai_margin_percent')"
    );
    for (const r of rows) {
      if (r.setting_key === 'deepseek_api_key' && r.setting_value) cachedDeepseekKey = r.setting_value;
      if (r.setting_key === 'omnichannel_ai_margin_percent' && r.setting_value) cachedMarginPercent = Number(r.setting_value) || 10.0;
    }
  } catch (e) {
    console.error('[DeepSeek Config] Error loading settings:', e);
  }
  return {
    apiKey: cachedDeepseekKey,
    marginPercent: cachedMarginPercent
  };
}

/**
 * Determine if current local time in merchant's country is Peak Hour (18:00 - 22:00)
 */
export function isPeakHour(countryCode: string = 'IT'): boolean {
  const now = new Date();
  let timeZone = 'Europe/Rome';
  const c = countryCode.toUpperCase();
  if (c === 'ES') timeZone = 'Europe/Madrid';
  else if (c === 'DE' || c === 'FR' || c === 'IT' || c === 'NL' || c === 'BE') timeZone = 'Europe/Rome';
  else if (c === 'GB' || c === 'UK' || c === 'PT') timeZone = 'Europe/London';
  else if (['US', 'CA'].includes(c)) timeZone = 'America/New_York';
  else if (['MX', 'CO', 'PE'].includes(c)) timeZone = 'America/Bogota';

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
  const { apiKey } = await getDeepSeekConfig();
  const requestBody: any = {
    model: 'deepseek-chat',
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
    const req = https.request('https://api.deepseek.com/chat/completions', {
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
          if (parsed.choices && parsed.choices[0]?.message) {
            resolve({
              message: parsed.choices[0].message,
              usage: parsed.usage || {}
            });
          } else {
            reject(new Error(parsed.error?.message || `DeepSeek error: ${body}`));
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
 * Bill user's balance for AI tokens with dynamic Peak Hours surcharge
 * Rule: Standard is marginPercent (10%). During peak hours (18:00 - 22:00), surcharge is +15% (total 25%).
 */
export async function billUserForAiUsage(userId: string, totalTokens: number, countryCode: string = 'IT') {
  if (!totalTokens || totalTokens <= 0) return;
  if (!omnichannelWalletMutation) {
    console.error('[AI Billing] Wallet mutation service is not configured; charge skipped.');
    return;
  }
  const { marginPercent } = await getDeepSeekConfig();

  const peak = isPeakHour(countryCode);
  const effectiveMargin = peak ? marginPercent + 15.0 : marginPercent;

  // Base cost estimate: 1,000 tokens ≈ $0.0003
  const baseCostUSD = (totalTokens / 1000) * 0.0003;
  const finalCost = baseCostUSD * (1 + (effectiveMargin / 100));
  // Wallet balances and wallet_transactions use cents as their accounting precision.
  const roundedCost = Number(finalCost.toFixed(2));

  if (roundedCost <= 0) return;

  try {
    const mutation = await omnichannelWalletMutation({
      userId,
      type: 'debit',
      amount: roundedCost,
      currency: 'USD',
      description: `Uso agente IA (${totalTokens} tokens${peak ? ', hora punta' : ''})`,
      referenceType: 'omnichannel_ai_usage',
      referenceId: `ai:${userId}:${Date.now()}`,
      minimumBalance: -1.00
    });
    console.log(`[AI Billing] User ${userId} billed ${mutation.walletAmount} ${mutation.walletCurrency} (Tokens: ${totalTokens}, Margin: +${effectiveMargin}% ${peak ? '[PEAK HOUR]' : '[STANDARD]'})`);
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
        description: 'Cerca articoli e vestiti nel catalogo del negozio con prezzo, foto, disponibilità e taglie.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Nome del prodotto, categoria o parola chiave (es. "reggiseno", "abito", "scarpe")' }
          },
          required: ['query']
        }
      }
    });
  }

  // 2. Send product photos
  if (settings.can_send_photos !== 0) {
    tools.push({
      type: 'function',
      function: {
        name: 'send_product_photos',
        description: 'Invia le foto ufficiali ad alta risoluzione di un articolo della collezione direttamente nella chat al cliente.',
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
        description: 'Calcola le tariffe reali e i tempi di consegna DoorDrop in base al CAP / codice postale e città del cliente.',
        parameters: {
          type: 'object',
          properties: {
            to_country: { type: 'string', description: 'Codice paese ISO 2 lettere (default "IT", o "ES", "FR", "DE")' },
            zip_code: { type: 'string', description: 'CAP / Codice postale di destinazione' },
            city: { type: 'string', description: 'Città di destinazione' },
            weight_kg: { type: 'number', description: 'Peso stimato in kg (default 0.5)' }
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
            buyer_country: { type: 'string', description: 'Paese (default "IT")' }
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
            reason: { type: 'string', description: 'Motivo del passaggio all\'operatore umano' }
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

    const [userRows]: any = await pool.query(
      "SELECT balance, name, country FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    const balance = Number(userRows[0]?.balance || 0);
    const countryCode = userRows[0]?.country || 'IT';

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
    const agentName = settings.agent_name || 'DoorDrop Sales Consultant';
    const language = settings.language || 'it';
    const tone = settings.tone || 'friendly_professional';
    const memoryEnabled = settings.auto_learn_conversations !== 0;
    const businessInfo = settings.business_info || 'Boutique di moda con spedizioni rapide e tracciate DoorDrop.';
    const personalityRules = settings.personality_instructions || 'Sii cordiale, conciso, umano e proattivo nel consigliare articoli e chiudere vendite.';
    const salesContract = settings.sales_contract_text || 'Spedizioni espresse 24/48h. Resi gratuiti entro 14 giorni.';
    const freeShipping = Number(settings.free_shipping_threshold || 50.0);
    const minOrder = Number(settings.min_order_amount || 0.0);

    let faqs: Array<{ q: string; a: string }> = [];
    try { faqs = JSON.parse(settings.faqs_json || '[]'); } catch {}

    const faqsText = faqs.length > 0
      ? '\n[FAQ del Negozio]:\n' + faqs.map(f => `• D: ${f.q} -> R: ${f.a}`).join('\n')
      : '';

    // Tone instructions
    let toneDescription = 'amichevole, empatico, caloroso e altamente professionale';
    if (tone === 'sales_oriented') toneDescription = 'dinamico, proattivo, orientato a chiudere la vendita con entusiasmo';
    if (tone === 'casual') toneDescription = 'giovane, diretto, colloquiale e molto accessibile';
    if (tone === 'luxury') toneDescription = 'elegante, raffinato, premuroso ed esclusivo';

    // 3. Conversational System Prompt with Strict Multilingual Adaptation & Memory Rules
    const systemPrompt = `Sei ${agentName}, il consulente di vendita dedicato e autonomo di questo negozio su DoorDrop.
Il tuo obiettivo è offrire un'esperienza di acquisto conversazionale eccezionale, calorosa e fluida, guidando il cliente dalla scoperta del prodotto fino alla conclusione dell'ordine.

Tono di voce: ${toneDescription}.
Istruzioni di comportamento personalizzate: ${personalityRules}.

IMPORTANTE LINGUA:
- Devi rispondere SEMPRE E OBBLIGATORIAMENTE nella stessa lingua in cui ti parla il cliente.
- Se il cliente scrive in Spagnolo (es. "ropa", "que tienen", "muestrame algo", "si", "14"), rispondi SEMPRE in Spagnolo.
- Se il cliente scrive in Italiano, rispondi in Italiano.
- Se scrive in Inglese, rispondi in Inglese.
- Non cambiare lingua a metà conversazione!

Cliente: ${contactName || 'Gentile cliente'}.

Informazioni sul negozio:
${businessInfo}
${faqsText}

Regole commerciali e contrattuali del negozio:
- Spedizione Gratuita: a partire da ordini superiori a €${freeShipping.toFixed(2)} EUR!
- Ordine Minimo: ${minOrder > 0 ? `€${minOrder.toFixed(2)} EUR` : 'Nessun minimo richiesto'}.
- Condizioni e Resi: ${salesContract}

Istruzioni comportamentali e conversazionali fondamentali:
1. MEMORIA CONVERSAZIONALE RIGOROSA: ${memoryEnabled ? 'Usa la cronologia disponibile della conversazione e, se esiste, la memoria recente dello stesso cliente nello stesso canale.' : 'La memoria conversazionale è disattivata: usa solo il messaggio attuale e le informazioni del negozio.'} Se hai presentato un elenco di articoli e il cliente risponde con un numero (es. "14", "1", "2"), con "sì", "inviami foto", o con "lo quiero", "prendo questo", capisci immediatamente a quale prodotto della lista si riferisce e procedi (invia le foto di quel prodotto o chiedi i dati per la spedizione). NON chiedere mai "a cosa ti riferisci?" se era già nel contesto!
2. Sii SEMPRE CONVERSAZIONALE, naturale ed empatico. Non rispondere MAI come un robot o con elenchi rigidi privi di calore.
3. Quando il cliente chiede informazioni su capi o prodotti, usa lo strumento "search_products" per trovare gli articoli disponibili e consigliali con entusiasmo.
4. Se il cliente chiede di vedere il prodotto o foto (o se ha risposto "sì" / "14" dopo che gli hai offerto le foto), invoca SEMPRE "send_product_photos".
5. Se il cliente chiede quanto costa la spedizione o dove si spedisce, chiedi gentilmente il suo CAP / Città e calcola la tariffa con "quote_shipping". Ricorda sempre al cliente la soglia di spedizione gratuita (€${freeShipping}) per incoraggiare acquisti aggiuntivi!
6. Quando il cliente manifesta l'intenzione di acquistare, raccogli i dati mancanti e mostra prima il prodotto e il totale. Chiama "create_order_checkout" solo dopo una conferma esplicita del cliente (es. "confirmo", "puedes crear el pedido", "confermo l'ordine") e solo con dati completi e verificati.
7. Se il cliente chiede dov'è il suo pacco o un tracking, usa "lookup_or_generate_tracking".
8. Se il cliente chiede espressamente di parlare con una persona reale, invoca "handoff_to_human".
9. Mantieni le risposte snelle, calorose ed efficaci: 2-4 frasi brevi e massimo circa 600 caratteri. Fai al massimo una domanda o richiesta di dati per messaggio.
10. FORMATO ORDINATO: se proponi prodotti, mostra massimo 3 opzioni numerate, una per riga, con nome, prezzo e disponibilità solo se verificati. Evita tabelle, paragrafi lunghi, saluti ripetuti e spiegazioni tecniche.
11. DATI VERIFICATI: non inventare stock, prezzi, tempi, políticas, pagos, pedidos, direcciones ni estados. Se manca un dato reale, dilo brevemente y pide solo ese dato.
12. CONTINUITÀ: se la memoria contiene un dato ya confirmado por el cliente, reutilízalo y no vuelvas a preguntarlo. Si faltan varios datos, solicita únicamente el siguiente dato necesario.`;

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

    let totalTokensUsed = 0;
    let photoAttachmentUrl: string | null = null;

    // 5. Multi-turn tool execution loop (up to 3 turns)
    let currentCall = await callDeepSeekChat(messages, tools, { temperature: 0.6 });
    let loopCount = 0;
    const maxLoops = 3;

    while (currentCall.message?.tool_calls && currentCall.message.tool_calls.length > 0 && loopCount < maxLoops) {
      loopCount++;
      if (currentCall.usage?.total_tokens) totalTokensUsed += currentCall.usage.total_tokens;

      messages.push(currentCall.message);

      for (const tc of currentCall.message.tool_calls) {
        const fnName = tc.function?.name;
        let fnArgs: any = {};
        try { fnArgs = JSON.parse(tc.function?.arguments || '{}'); } catch {}

        console.log(`[AI Sales Agent] Loop #${loopCount} Executing: ${fnName}`);
        const toolResult = await handleAIToolCall(fnName, fnArgs, userId);

        if (fnName === 'send_product_photos' && toolResult.media_attachment_url) {
          photoAttachmentUrl = toolResult.media_attachment_url;
        }

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult)
        });
      }

      // Next call: allow tools if loops < maxLoops, else complete
      currentCall = await callDeepSeekChat(
        messages,
        loopCount < maxLoops ? tools : undefined,
        { temperature: 0.6 }
      );
    }

    if (currentCall.usage?.total_tokens) totalTokensUsed += currentCall.usage.total_tokens;

    // Bill user balance with Peak Hours dynamic pricing
    await billUserForAiUsage(userId, totalTokensUsed, countryCode);

    const replyContent = currentCall.message?.content || 'Come posso aiutarti?';
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
    "SELECT id, name, email, country FROM users WHERE id = ? LIMIT 1",
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

  const sampleCatalog = prods.map((p: any) => `${p.title} (€${(p.price_minor / 100).toFixed(2)})`).join(', ');

  const prompt = `Sei un esperto consulente di e-commerce e direct sales omnicanale.
Analizza queste informazioni del negozio:
- Nome/Titolare: ${user.name || 'Boutique Online'}
- Paese: ${user.country || 'IT'}
- Alcuni prodotti a catalogo: ${sampleCatalog || 'Capi di abbigliamento, intimo e accessori'}

Genera una configurazione completa, persuasiva e altamente professionale per l'assistente vendite virtuale (AI Sales Employee).
Restituisci ESCLUSIVAMENTE un oggetto JSON valido (senza testo markdown attorno) con questi campi:
{
  "agent_name": "Nome descrittivo del ruolo del venditore (es. Assistente AI del negozio)",
  "tone": "uno tra 'friendly_professional', 'sales_oriented', 'casual', 'luxury'",
  "language": "${user.country === 'ES' ? 'es' : user.country === 'DE' ? 'de' : 'it'}",
  "business_info": "Descrizione accattivante del negozio, qualità dei materiali, stile e attenzione al cliente (circa 3-4 frasi).",
  "personality_instructions": "Istruzioni su come comportarsi con i clienti: empatia, porre domande aperte su taglie e preferenze, proporre abbinamenti, invitare all'acquisto con eleganza senza essere invadenti.",
  "sales_contract_text": "Termini e condizioni del venditore: Spedizioni espresse 24/48h tracciate con corriere DoorDrop. Spedizione gratuita per ordini superiori a 50€. Reso e sostituzione taglia garantiti entro 14 giorni.",
  "free_shipping_threshold": 50.00,
  "min_order_amount": 0.00,
  "response_delay_seconds": 3,
  "faqs": [
    { "q": "Quali sono i tempi di consegna?", "a": "Spediamo entro 24 ore dalla conferma e consegniamo in 24/48 ore lavorative con corriere espresso tracciato DoorDrop." },
    { "q": "Posso pagare alla consegna o online?", "a": "Puoi pagare comodamente e in totale sicurezza online con carta o bonifico istantaneo tramite il link protetto DoorDrop." },
    { "q": "Come funziona per i resi o cambio taglia?", "a": "Garantiamo il reso e il cambio taglia entro 14 giorni dalla ricezione del pacco." },
    { "q": "Come posso tracciare la spedizione?", "a": "Appena spedito ti invieremo il codice di tracking DoorDrop per seguire il tuo pacco in tempo reale." },
    { "q": "I prodotti sono originali e di qualità?", "a": "Assolutamente sì, tutti i nostri articoli sono autentici e realizzati con materiali selezionati di alta qualità." }
  ]
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

  return resultJson;
}
