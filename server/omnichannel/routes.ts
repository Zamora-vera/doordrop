import { generateAIEmployeeReply, autoGenerateStoreAISettings, isPeakHour } from './deepseek_service';
import { Router, Request, Response } from 'express';
import https from 'https';
import crypto from 'crypto';
import { handleAIToolCall } from './ai_sales_tools';
import { sendNotificationEvent } from '../services/emailService';
import { verifyZernioWebhookSignature } from './service';
import {
  getUserOmnichannelSubscription,
  hasActiveOmnichannelSubscription,
  parseCatalogJson
} from './entitlements';
import { getOmnichannelReadiness } from './readiness';

type NormalizedInboundMessage = {
  conversationId: string | null;
  messageId: string;
  accountId: string | null;
  profileId: string | null;
  platform: string;
  contactId: string | null;
  contactName: string;
  contactAvatar: string | null;
  contactPhone: string | null;
  text: string;
  mediaType: string | null;
  mediaUrl: string | null;
};

function firstWebhookString(values: unknown[], maxLength = 255): string | null {
  for (const value of values) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const normalized = String(value).trim();
    if (normalized) return normalized.slice(0, maxLength);
  }
  return null;
}

function normalizeInboundMessage(payload: any, eventId: string): NormalizedInboundMessage {
  const data = payload && typeof payload.data === 'object' ? payload.data : null;
  const message = data?.message || payload?.message || data || payload || {};
  const conversation = payload?.conversation || data?.conversation || message?.conversation || {};
  const account = payload?.account || data?.account || message?.account || {};
  const sender = message?.sender || {};
  const from = message?.from || {};
  const attachment = Array.isArray(message?.attachments)
    ? message.attachments.find((item: any) => item && typeof item === 'object')
    : (message?.attachment || null);

  const conversationId = firstWebhookString([
    message?.conversationId,
    message?.conversation_id,
    message?.conversation?._id,
    message?.conversation?.id,
    conversation?._id,
    conversation?.id,
    conversation?.platformConversationId
  ], 255);
  const messageId = firstWebhookString([
    message?._id,
    message?.id,
    message?.platformMessageId,
    payload?.messageId,
    eventId
  ], 150) || eventId;
  const accountId = firstWebhookString([
    account?.id,
    account?.accountId,
    message?.accountId,
    payload?.accountId
  ], 100);
  const profileId = firstWebhookString([
    payload?.profileId,
    data?.profileId,
    message?.profileId,
    account?.profileId,
    conversation?.profileId
  ], 150);
  const contactId = firstWebhookString([
    message?.senderId,
    message?.contactId,
    sender?.contactId,
    conversation?.contactId,
    conversation?.participantId,
    from?.contactId,
    from?.id,
    sender?.id
  ], 150);
  const contactName = firstWebhookString([
    message?.senderName,
    sender?.name,
    conversation?.participantName,
    conversation?.contactName,
    from?.name
  ], 150) || 'Cliente';
  const contactAvatar = firstWebhookString([
    sender?.picture,
    sender?.avatar,
    sender?.profilePicture,
    conversation?.participantPicture,
    conversation?.contactAvatar
  ], 2000);
  const contactPhone = firstWebhookString([
    sender?.phone,
    sender?.phoneNumber,
    message?.phone,
    conversation?.phone,
    conversation?.participantPhone
  ], 50);
  const text = firstWebhookString([
    message?.text,
    message?.body,
    message?.content,
    message?.message
  ], 100000) || '';
  const mediaUrl = firstWebhookString([
    message?.mediaUrl,
    message?.media_url,
    attachment?.url,
    attachment?.downloadUrl,
    attachment?.mediaUrl
  ], 4000);
  const mediaType = firstWebhookString([
    message?.mediaType,
    message?.media_type,
    attachment?.type,
    attachment?.mimeType
  ], 50);

  return {
    conversationId,
    messageId,
    accountId,
    profileId,
    platform: firstWebhookString([
      message?.platform,
      conversation?.platform,
      payload?.platform,
      account?.platform
    ], 50) || 'whatsapp',
    contactId,
    contactName,
    contactAvatar,
    contactPhone,
    text,
    mediaType,
    mediaUrl
  };
}

async function persistInboundMessage(pool: any, userId: string, eventId: string, message: NormalizedInboundMessage, aiReady: boolean) {
  if (!message.conversationId) {
    throw new Error('El webhook no contiene un identificador de conversación.');
  }

  const connection = await pool.getConnection();
  const lastMessage = message.text || (message.mediaUrl ? '[Archivo adjunto]' : '');

  try {
    await connection.beginTransaction();

    const [existingMessageRows]: any = await connection.query(
      'SELECT id, conversation_id FROM omnichannel_messages WHERE zernio_message_id = ? LIMIT 1',
      [message.messageId]
    );
    if (existingMessageRows.length > 0) {
      await connection.commit();
      return {
        localConversationId: Number(existingMessageRows[0].conversation_id),
        aiActive: false,
        duplicate: true
      };
    }

    const [conversationRows]: any = await connection.query(
      'SELECT id, ai_active FROM omnichannel_conversations WHERE user_id = ? AND zernio_conversation_id = ? LIMIT 1 FOR UPDATE',
      [userId, message.conversationId]
    );

    let localConversationId = conversationRows[0]?.id || null;
    const aiActive = conversationRows.length > 0
      ? Number(conversationRows[0].ai_active) === 1 && aiReady
      : aiReady;
    const isNewConversation = !localConversationId;

    if (isNewConversation) {
      const [insertedConversation]: any = await connection.query(
        `INSERT INTO omnichannel_conversations
          (user_id, platform, account_id, zernio_conversation_id, contact_id, contact_name, contact_avatar, contact_phone, last_message, last_message_at, unread_count, ai_active, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1, ?, 'open')`,
        [
          userId,
          message.platform,
          message.accountId,
          message.conversationId,
          message.contactId,
          message.contactName,
          message.contactAvatar,
          message.contactPhone,
          lastMessage,
          aiReady ? 1 : 0
        ]
      );
      localConversationId = insertedConversation.insertId;
    }

    if (!isNewConversation) {
      await connection.query(
        `UPDATE omnichannel_conversations
            SET platform = COALESCE(NULLIF(platform, ''), ?),
                account_id = COALESCE(account_id, ?),
                contact_id = COALESCE(contact_id, ?),
                contact_name = COALESCE(NULLIF(contact_name, ''), ?),
                contact_avatar = COALESCE(contact_avatar, ?),
                contact_phone = COALESCE(contact_phone, ?),
                ai_active = CASE WHEN ? = 1 THEN ai_active ELSE 0 END,
                last_message = ?,
                last_message_at = NOW(),
                unread_count = unread_count + 1
          WHERE id = ? AND user_id = ?`,
        [
          message.platform,
          message.accountId,
          message.contactId,
          message.contactName,
          message.contactAvatar,
          message.contactPhone,
          aiReady ? 1 : 0,
          lastMessage,
          localConversationId,
          userId
        ]
      );
    }

    await connection.query(
      `INSERT INTO omnichannel_messages
        (conversation_id, zernio_message_id, direction, sender_type, sender_name, text_content, media_type, media_url, status)
       VALUES (?, ?, 'inbound', 'contact', ?, ?, ?, ?, 'delivered')`,
      [
        localConversationId,
        message.messageId,
        message.contactName,
        message.text,
        message.mediaType,
        message.mediaUrl
      ]
    );

    await connection.commit();
    return { localConversationId: Number(localConversationId), aiActive, duplicate: false };
  } catch (error) {
    try { await connection.rollback(); } catch { /* The connection may already be closed. */ }
    throw error;
  } finally {
    connection.release();
  }
}

export function setupOmnichannelRoutes(app: any, options: {
  pool: any;
  authMiddleware: any;
  requireSuperAdmin: any;
  UserRepo?: any;
}) {
  const router = Router();
  const adminRouter = Router();
  const { pool, authMiddleware, requireSuperAdmin, UserRepo } = options;

  let cachedApiKey = '';
  let cachedWebhookSecret = '';
  let cachedApiUrl = 'https://zernio.com/api/v1';

  async function getZernioSettings() {
    try {
      const [rows]: any = await pool.query(
        "SELECT setting_key, setting_value FROM admin_settings WHERE setting_key IN ('zernio_api_key', 'zernio_webhook_secret', 'zernio_api_url', 'omnichannel_extra_channel_usd', 'omnichannel_default_currency')"
      );
      for (const r of rows) {
        if (r.setting_key === 'zernio_api_key' && r.setting_value) cachedApiKey = r.setting_value;
        if (r.setting_key === 'zernio_webhook_secret' && r.setting_value) cachedWebhookSecret = r.setting_value;
        if (r.setting_key === 'zernio_api_url' && r.setting_value) cachedApiUrl = r.setting_value;
      }
    } catch (err) {
      console.error('[Omnichannel] Error loading settings from admin_settings:', err);
    }
    return {
      apiKey: cachedApiKey,
      webhookSecret: cachedWebhookSecret,
      apiUrl: cachedApiUrl
    };
  }

  async function callZernio(endpoint: string, opts: { method?: string; body?: any; profileId?: string; queryParams?: Record<string, any> } = {}) {
    const { apiKey, apiUrl } = await getZernioSettings();
    const method = opts.method || 'GET';
    let fullUrl = endpoint.startsWith('http') ? endpoint : `${apiUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    if (opts.queryParams) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.queryParams)) {
        if (v !== undefined && v !== null) sp.append(k, String(v));
      }
      const qStr = sp.toString();
      if (qStr) fullUrl += (fullUrl.includes('?') ? '&' : '?') + qStr;
    }

    const parsedUrl = new URL(fullUrl);
    const data = opts.body ? JSON.stringify(opts.body) : null;

    return new Promise<{ status: number; data: any }>((resolve, reject) => {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      };
      if (opts.profileId) headers['X-Profile-Id'] = opts.profileId;
      if (data) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = String(Buffer.byteLength(data));
      }

      const req = https.request(parsedUrl, { method, headers, timeout: 20000 }, (res) => {
        let resBody = '';
        res.on('data', chunk => resBody += chunk);
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(resBody);
          } catch {
            parsed = { text: resBody };
          }
          resolve({ status: res.statusCode || 500, data: parsed });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Zernio API request timeout'));
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  async function getOrCreateUserProfile(userId: string, userName?: string): Promise<string> {
    const [existing]: any = await pool.query(
      "SELECT zernio_profile_id FROM omnichannel_profiles WHERE user_id = ? LIMIT 1",
      [userId]
    );
    if (existing.length > 0 && existing[0].zernio_profile_id) {
      return existing[0].zernio_profile_id;
    }

    const profileName = `DoorDrop User #${userId}${userName ? ' - ' + userName : ''}`;
    const resp = await callZernio('/profiles', {
      method: 'POST',
      body: { name: profileName }
    });

    const zernioProfileId = resp.data?.profile?._id || resp.data?._id || resp.data?.id;
    if (!zernioProfileId) {
      throw new Error(`Error en Zernio: ${JSON.stringify(resp.data)}`);
    }

    await pool.query(
      `INSERT INTO omnichannel_profiles (user_id, zernio_profile_id, profile_name, is_active)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE zernio_profile_id = VALUES(zernio_profile_id), updated_at = CURRENT_TIMESTAMP`,
      [userId, zernioProfileId, profileName]
    );

    return zernioProfileId;
  }

  async function requireActiveSubscription(req: any, res: Response, next: any) {
    try {
      const userId = String(req.user?.id || req.user?.userId || '');
      const subscription = await getUserOmnichannelSubscription(userId);
      // Super Admin client preview must be able to inspect the client's real
      // inbox even when that client does not have a paid entitlement. This
      // does not grant the customer access: the signed impersonation claims
      // are only issued by the protected Super Admin impersonation flow.
      if (req.user?.adminImpersonation && req.user?.adminUserId) {
        req.omnichannelSubscription = subscription;
        req.omnichannelAdminPreview = true;
        return next();
      }
      if (!hasActiveOmnichannelSubscription(subscription)) {
        return res.status(402).json({
          error: 'Necesitas una suscripción Omnicanal activa para usar esta función.',
          code: 'OMNICHANNEL_SUBSCRIPTION_REQUIRED',
          subscription_status: subscription.status
        });
      }
      req.omnichannelSubscription = subscription;
      next();
    } catch (err: any) {
      console.error('[Omnichannel] Entitlement check error:', err?.message || err);
      return res.status(503).json({ error: 'No se pudo validar la suscripción Omnicanal.' });
    }
  }

  async function ensureAIReady(userId: string, res: Response): Promise<boolean> {
    const readiness = await getOmnichannelReadiness(userId);
    if (!readiness.ready) {
      res.status(409).json({
        error: 'El agente AI no puede activarse porque faltan requisitos reales de operación.',
        code: 'AI_NOT_READY',
        readiness
      });
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // 1. Central Webhook (/api/webhooks/zernio)
  // ---------------------------------------------------------------------------
  app.post('/api/webhooks/zernio', async (req: Request, res: Response) => {
    const payload = req.body || {};
    const rawBody = Buffer.isBuffer((req as any).rawBody)
      ? (req as any).rawBody.toString('utf8')
      : JSON.stringify(payload);
    const signature = String(
      req.get('X-Zernio-Signature') ||
      req.get('X-Webhook-Signature') ||
      req.get('X-Signature') ||
      ''
    );
    const { webhookSecret } = await getZernioSettings();
    if (!webhookSecret || !verifyZernioWebhookSignature(rawBody, signature, webhookSecret)) {
      console.warn('[Omnichannel Webhook] Rejected: missing or invalid signature.');
      return res.status(401).json({ status: 'invalid_signature' });
    }
    const eventType = payload.event || payload.type;
    const eventId = String(
      req.headers['x-zernio-event-id']
      || req.headers['x-webhook-id']
      || payload.id
      || payload.eventId
      || payload.messageId
      || `ev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    ).trim().slice(0, 150);
    const suppressAutoReply = String(req.headers['x-zernio-replay'] || '') === '1';

    try {
      const [dup]: any = await pool.query(
        "SELECT id, processed FROM omnichannel_webhook_events WHERE event_id = ? LIMIT 1",
        [eventId]
      );
      if (dup.length > 0 && Number(dup[0].processed) === 1) {
        return res.status(200).json({ status: 'duplicate_ignored' });
      }

      if (dup.length > 0) {
        await pool.query(
          "UPDATE omnichannel_webhook_events SET event_type = ?, payload_json = ?, processed = 0, error_message = NULL WHERE event_id = ?",
          [eventType || 'unknown', JSON.stringify(payload), eventId]
        );
      } else {
        await pool.query(
          "INSERT INTO omnichannel_webhook_events (event_id, event_type, payload_json, processed, error_message) VALUES (?, ?, ?, 0, NULL)",
          [eventId, eventType || 'unknown', JSON.stringify(payload)]
        );
      }
    } catch (err: any) {
      console.warn('[Omnichannel Webhook] Log warning:', err.message);
    }

    console.log(`[Omnichannel Webhook] Received ${eventType} event ID: ${eventId}`);

    try {
      switch (eventType) {
        case 'message.received': {
          const inbound = normalizeInboundMessage(payload, eventId);

          let userId = '';
          const zAccountId = inbound.accountId;
          
          if (zAccountId) {
            const [accs]: any = await pool.query(
              "SELECT user_id FROM omnichannel_accounts WHERE zernio_account_id = ? LIMIT 1",
              [zAccountId]
            );
            if (accs.length > 0) userId = String(accs[0].user_id || '');
          } else if (inbound.profileId) {
            const [prof]: any = await pool.query(
              "SELECT user_id FROM omnichannel_profiles WHERE zernio_profile_id = ? LIMIT 1",
              [inbound.profileId]
            );
            if (prof.length > 0) userId = String(prof[0].user_id || '');
          }

          if (!userId || !inbound.conversationId) {
            console.warn('[Omnichannel Webhook] Evento ignorado: cuenta/perfil o conversación no reconocidos.');
            return res.status(202).json({ status: 'unmatched_account_ignored' });
          }

          const readiness = await getOmnichannelReadiness(userId);
          if (!readiness.ready) {
            console.warn(`[Omnichannel Webhook] AI bloqueada para ${userId}: ${readiness.blockers.map(item => item.code).join(',')}`);
          }
          const persisted = await persistInboundMessage(pool, userId, eventId, inbound, readiness.ready);
          const localConvId = persisted.localConversationId;
          const aiActive = persisted.aiActive;
          if (persisted.duplicate) break;

          // DeepSeek AI Auto-Responder with custom response delay
          if (aiActive && inbound.text && !suppressAutoReply) {
            let delayMs = 3000;
            try {
              const [dRows]: any = await pool.query(
                "SELECT response_delay_seconds FROM omnichannel_ai_settings WHERE user_id = ? LIMIT 1",
                [userId]
              );
              if (dRows.length > 0 && dRows[0].response_delay_seconds !== null) {
                delayMs = Math.max(1000, Math.min(15000, Number(dRows[0].response_delay_seconds) * 1000));
              }
            } catch (e) {
              delayMs = 3000;
            }

            setTimeout(async () => {
              try {
                const aiResult = await generateAIEmployeeReply(userId, inbound.text, inbound.contactName, localConvId);
                if (aiResult) {
                  const replyText = typeof aiResult === 'object' ? aiResult.text : String(aiResult);
                  const photoUrl = typeof aiResult === 'object' ? aiResult.mediaUrl : null;
                  console.log(`[AI Sales Auto-Responder] Replying to conversation #${localConvId} (${inbound.platform}) | Photo: ${photoUrl ? 'yes' : 'none'}`);

                  let targetAccId = inbound.accountId;
                  if (!targetAccId) {
                    const [accRows]: any = await pool.query(
                      "SELECT zernio_account_id FROM omnichannel_accounts WHERE user_id = ? AND platform = ? LIMIT 1",
                      [userId, inbound.platform]
                    );
                    if (accRows.length > 0) targetAccId = accRows[0].zernio_account_id;
                  }

                  // Send to Zernio
                  const zPayload: any = { message: replyText };
                  if (targetAccId) zPayload.accountId = targetAccId;
                  if (photoUrl) { zPayload.attachmentUrl = photoUrl; zPayload.attachmentType = "image"; }
                  
                  const zRes = await callZernio(`/inbox/conversations/${encodeURIComponent(inbound.conversationId as string)}/messages`, {
                    method: 'POST',
                    body: zPayload
                  });

                  const zMsgId = zRes.data?.messageId || zRes.data?._id || null;

                  await pool.query(
                    `INSERT INTO omnichannel_messages 
                      (conversation_id, zernio_message_id, direction, sender_type, sender_name, text_content, status)
                     VALUES (?, ?, 'outbound', 'agent', 'DoorDrop AI Sales', ?, 'delivered')`,
                    [localConvId, zMsgId, replyText]
                  );

                  await pool.query(
                    "UPDATE omnichannel_conversations SET last_message = ?, last_message_at = NOW() WHERE id = ?",
                    [replyText, localConvId]
                  );
                }
              } catch (aiErr) {
                console.error('[AI Auto-Responder] Error:', aiErr);
              }
            }, delayMs);
          }
          break;
        }

        case 'comment.received': {
          const comment = payload.data || payload.comment || payload;
          const profileId = payload.profileId || comment.profileId;
          let userId = '';
          if (profileId) {
            const [prof]: any = await pool.query(
              "SELECT user_id FROM omnichannel_profiles WHERE zernio_profile_id = ? LIMIT 1",
              [profileId]
            );
            if (prof.length > 0) userId = prof[0].user_id;
          }
          if (!userId) {
            console.warn('[Omnichannel Webhook] Comentario ignorado: perfil no reconocido.');
            break;
          }

          const zPostId = comment.postId || comment.post_id || null;
          const zCommentId = comment.commentId || comment._id || comment.id || eventId;
          const authorName = comment.authorName || comment.from?.name || 'Usuario';
          const commentText = comment.text || comment.message || '';
          const platform = payload.platform || comment.platform || 'instagram';

          await pool.query(
            `INSERT INTO omnichannel_comments 
              (user_id, platform, zernio_post_id, zernio_comment_id, author_name, comment_text, reply_status)
             VALUES (?, ?, ?, ?, ?, ?, 'pending')
             ON DUPLICATE KEY UPDATE comment_text = VALUES(comment_text)`,
            [userId, platform, zPostId, zCommentId, authorName, commentText]
          );

          const [rules]: any = await pool.query(
            "SELECT * FROM omnichannel_comment_rules WHERE user_id = ? AND is_active = 1",
            [userId]
          );

          for (const rule of rules) {
            let matched = false;
            try {
              const keywords: string[] = JSON.parse(rule.keywords_json || '[]');
              matched = keywords.some(k => commentText.toLowerCase().includes(k.toLowerCase().trim()));
            } catch {
              matched = false;
            }

            if (matched && rule.public_reply_text && zPostId && zCommentId) {
              try {
                await callZernio(`/inbox/comments/${encodeURIComponent(zPostId)}/${encodeURIComponent(zCommentId)}`, {
                  method: 'POST',
                  body: { message: rule.public_reply_text }
                });
                await pool.query(
                  "UPDATE omnichannel_comments SET reply_status = 'replied', reply_text = ? WHERE zernio_comment_id = ?",
                  [rule.public_reply_text, zCommentId]
                );
              } catch (e: any) {
                console.warn('[Omnichannel Webhook] Auto comment reply error:', e.message);
              }
              break;
            }
          }
          break;
        }

        case 'account.connected': {
          const acc = payload.data || payload.account || payload;
          const profileId = payload.profileId || acc.profileId;
          let userId = '';
          if (profileId) {
            const [prof]: any = await pool.query(
              "SELECT user_id FROM omnichannel_profiles WHERE zernio_profile_id = ? LIMIT 1",
              [profileId]
            );
            if (prof.length > 0) userId = prof[0].user_id;
          }
          if (!userId) {
            console.warn('[Omnichannel Webhook] Cuenta ignorada: perfil no reconocido.');
            break;
          }

          const zAccId = acc.accountId || acc._id || acc.id;
          if (zAccId) {
            await pool.query(
              `INSERT INTO omnichannel_accounts 
                (user_id, zernio_account_id, platform, account_name, username, phone_number, status)
               VALUES (?, ?, ?, ?, ?, ?, 'connected')
               ON DUPLICATE KEY UPDATE status = 'connected', updated_at = CURRENT_TIMESTAMP`,
              [userId, zAccId, acc.platform || 'whatsapp', acc.name || null, acc.username || null, acc.phone || null]
            );
          }
          break;
        }
      }

      await pool.query(
        "UPDATE omnichannel_webhook_events SET processed = 1, error_message = NULL WHERE event_id = ?",
        [eventId]
      );
      return res.status(200).json({ status: 'ok', eventId });
    } catch (err: any) {
      console.error('[Omnichannel Webhook] Processing error:', err?.message || err);
      try {
        await pool.query(
          "UPDATE omnichannel_webhook_events SET processed = 0, error_message = ? WHERE event_id = ?",
          [String(err?.message || 'Error interno de procesamiento').slice(0, 1000), eventId]
        );
      } catch (logErr: any) {
        console.warn('[Omnichannel Webhook] Error status update warning:', logErr?.message || logErr);
      }
      return res.status(500).json({ status: 'retry', eventId });
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Client API Routes (/api/omnichannel/*)
  // ---------------------------------------------------------------------------
  router.get('/dashboard', authMiddleware, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const subscription = await getUserOmnichannelSubscription(userId);
      const aiReadiness = await getOmnichannelReadiness(userId);

      const [accounts]: any = await pool.query(
        "SELECT id, platform, account_name, username, phone_number, status, avatar_url, updated_at FROM omnichannel_accounts WHERE user_id = ? ORDER BY id DESC",
        [userId]
      );

      const [convStats]: any = await pool.query(
        `SELECT 
           COUNT(*) AS total_conversations,
           COALESCE(SUM(unread_count), 0) AS total_unread,
           COALESCE(SUM(CASE WHEN ai_active = 1 THEN 1 ELSE 0 END), 0) AS ai_active_count
         FROM omnichannel_conversations 
         WHERE user_id = ?`,
        [userId]
      );

      const [msgStats]: any = await pool.query(
        `SELECT 
           COUNT(*) AS total_messages,
           COALESCE(SUM(CASE WHEN m.direction = 'inbound' THEN 1 ELSE 0 END), 0) AS inbound_messages,
           COALESCE(SUM(CASE WHEN m.direction = 'outbound' THEN 1 ELSE 0 END), 0) AS outbound_messages
         FROM omnichannel_messages m
         JOIN omnichannel_conversations c ON m.conversation_id = c.id
         WHERE c.user_id = ?`,
        [userId]
      );

      const [commentStats]: any = await pool.query(
        "SELECT COUNT(*) AS total_comments, COALESCE(SUM(CASE WHEN reply_status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_replies FROM omnichannel_comments WHERE user_id = ?",
        [userId]
      );

      const [aiSettings]: any = await pool.query(
        "SELECT agent_name, tone, language, can_lookup_orders, can_lookup_tracking, can_quote_shipping, can_search_products, updated_at FROM omnichannel_ai_settings WHERE user_id = ? LIMIT 1",
        [userId]
      );

      const [userRows]: any = await pool.query(
        "SELECT balance, currency, country FROM users WHERE id = ? LIMIT 1",
        [userId]
      );
      const userBalance = Number(userRows[0]?.balance || 0);
      const userCountry = String(userRows[0]?.country || '').toUpperCase();
      const peakActive = isPeakHour(userCountry);
      const isCreditBlocked = userBalance < -1.00;

      res.json({
        success: true,
        subscription,
        accounts,
        metrics: {
          total_channels: accounts.length,
          channels_limit: subscription.channels_limit + (subscription.extra_channels_count || 0),
          conversations: convStats[0] || { total_conversations: 0, total_unread: 0, ai_active_count: 0 },
          messages: msgStats[0] || { total_messages: 0, inbound_messages: 0, outbound_messages: 0 },
          comments: commentStats[0] || { total_comments: 0, pending_replies: 0 },
          ai_employee: aiSettings[0] || null,
          ai_readiness: aiReadiness,
          wallet: {
            balance: userBalance,
            currency: userRows[0]?.currency || null,
            is_blocked: isCreditBlocked,
            limit: -1.00
          },
          peak_hours: {
            is_active: peakActive,
            country: userCountry,
            window: '18:00-22:00',
            shipping_price_unchanged: true,
            notice_code: peakActive ? 'ai_high_demand' : null
          }
        }
      });
    } catch (err: any) {
      console.error('[Omnichannel] Dashboard error:', err);
      res.status(500).json({ error: 'Error al obtener datos del panel Omnicanal.' });
    }
  });

  router.get('/readiness', authMiddleware, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      res.json({ success: true, readiness: await getOmnichannelReadiness(userId) });
    } catch (err: any) {
      console.error('[Omnichannel] Readiness error:', err?.message || err);
      res.status(503).json({ error: 'No se pudo validar la preparación del agente AI.' });
    }
  });

  router.get('/channels', authMiddleware, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const subscription = await getUserOmnichannelSubscription(userId);
      const [accounts]: any = await pool.query(
        "SELECT * FROM omnichannel_accounts WHERE user_id = ? ORDER BY created_at DESC",
        [userId]
      );

      res.json({
        success: true,
        subscription,
        max_channels: subscription.channels_limit + (subscription.extra_channels_count || 0),
        connected_channels: accounts.length,
        accounts
      });
    } catch (err: any) {
      console.error('[Omnichannel] Get channels error:', err);
      res.status(500).json({ error: 'Error al listar canales.' });
    }
  });

  router.post('/channels/connect-url', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const { platform } = req.body;
      if (!platform) return res.status(400).json({ error: 'Plataforma requerida.' });

      const subscription = await getUserOmnichannelSubscription(userId);
      const [accountsCount]: any = await pool.query(
        "SELECT COUNT(*) as count FROM omnichannel_accounts WHERE user_id = ?",
        [userId]
      );

      const maxChannels = subscription.channels_limit + (subscription.extra_channels_count || 0);
      if (accountsCount[0].count >= maxChannels) {
        return res.status(400).json({
          error: `Has alcanzado el límite de ${maxChannels} canal(es) de tu plan. Agrega un canal adicional o mejora tu plan.`
        });
      }

      const profileId = await getOrCreateUserProfile(userId);
      const redirectUrl = `https://doordrop.lat/panel/omnichannel?tab=channels&connected=${platform}`;
      const zernioResp = await callZernio(`/connect/${encodeURIComponent(platform)}`, {
        method: 'GET',
        queryParams: { profileId, redirectUrl }
      });

      if (zernioResp.status >= 400) {
        return res.status(400).json({
          error: zernioResp.data?.error || 'No se pudo generar el enlace de conexión para este canal.'
        });
      }

      const authUrl = zernioResp.data?.url || zernioResp.data?.authUrl || zernioResp.data?.redirectUrl;
      res.json({ success: true, platform, authUrl, profileId });
    } catch (err: any) {
      console.error('[Omnichannel] Connect URL error:', err);
      res.status(500).json({ error: 'Error al conectar el canal.' });
    }
  });

  router.delete('/channels/:accountId', authMiddleware, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const { accountId } = req.params;

      const [rows]: any = await pool.query(
        "SELECT * FROM omnichannel_accounts WHERE id = ? AND user_id = ? LIMIT 1",
        [accountId, userId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Canal no encontrado.' });

      const account = rows[0];
      try {
        await callZernio(`/accounts/${encodeURIComponent(account.zernio_account_id)}`, { method: 'DELETE' });
      } catch (e: any) {
        console.warn('[Omnichannel] Remote disconnect warning:', e.message);
      }

      await pool.query("DELETE FROM omnichannel_accounts WHERE id = ?", [account.id]);
      res.json({ success: true, message: 'Canal desconectado exitosamente.' });
    } catch (err: any) {
      console.error('[Omnichannel] Disconnect error:', err);
      res.status(500).json({ error: 'Error al desconectar canal.' });
    }
  });

  router.post('/conversations', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      if (!await ensureAIReady(userId, res)) return;
      const { contact_name, contact_phone, platform, initial_message } = req.body;
      const cleanPlatform = ['whatsapp', 'instagram', 'messenger', 'telegram', 'web'].includes(platform) ? platform : 'whatsapp';
      const cleanName = (contact_name || 'Cliente').trim();
      const cleanPhone = (contact_phone || '').trim();

      const [insertRes]: any = await pool.query(
        `INSERT INTO omnichannel_conversations 
         (user_id, platform, contact_id, contact_name, contact_phone, last_message, last_message_at, unread_count, ai_active, assigned_agent_id, assigned_agent_name, assigned_agent_type, status)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), 0, 1, NULL, NULL, 'ai', 'open')`,
        [userId, cleanPlatform, cleanPhone || ('contact_' + Date.now()), cleanName, cleanPhone, initial_message || 'Conversación iniciada']
      );

      const convId = insertRes.insertId;

      if (initial_message && initial_message.trim()) {
        await pool.query(
          `INSERT INTO omnichannel_messages
           (conversation_id, sender_type, sender_name, text_content, direction, status)
           VALUES (?, 'customer', ?, ?, 'inbound', 'delivered')`,
          [convId, cleanName, initial_message.trim()]
        );
      }

      const [created]: any = await pool.query("SELECT * FROM omnichannel_conversations WHERE id = ?", [convId]);
      res.json({ success: true, conversation: created[0] });
    } catch (err: any) {
      console.error('[Omnichannel] Create conversation error:', err);
      res.status(500).json({ error: 'Error al crear la conversación.' });
    }
  });

  router.get('/conversations', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const { channel, status, search } = req.query;

      let query = "SELECT * FROM omnichannel_conversations WHERE user_id = ?";
      const params: any[] = [userId];

      if (channel && channel !== 'all') {
        query += " AND platform = ?";
        params.push(channel);
      }
      if (status && status !== 'all') {
        query += " AND status = ?";
        params.push(status);
      }
      if (search) {
        query += " AND (contact_name LIKE ? OR contact_phone LIKE ? OR last_message LIKE ?)";
        const s = `%${search}%`;
        params.push(s, s, s);
      }

      query += " ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 100";
      const [rows]: any = await pool.query(query, params);
      res.json({ success: true, conversations: rows });
    } catch (err: any) {
      console.error('[Omnichannel] Get conversations error:', err);
      res.status(500).json({ error: 'Error al listar conversaciones.' });
    }
  });

  router.get('/conversations/:id/messages', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const convId = Number(req.params.id);

      const [convs]: any = await pool.query(
        "SELECT * FROM omnichannel_conversations WHERE id = ? AND user_id = ? LIMIT 1",
        [convId, userId]
      );
      if (convs.length === 0) return res.status(404).json({ error: 'Conversación no encontrada.' });

      const [messages]: any = await pool.query(
        "SELECT * FROM omnichannel_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 200",
        [convId]
      );

      await pool.query("UPDATE omnichannel_conversations SET unread_count = 0 WHERE id = ?", [convId]);
      res.json({ success: true, conversation: convs[0], messages });
    } catch (err: any) {
      console.error('[Omnichannel] Get messages error:', err);
      res.status(500).json({ error: 'Error al recuperar mensajes.' });
    }
  });

  router.post('/conversations/:id/messages', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const convId = Number(req.params.id);
      const { text, media_url, media_type } = req.body;

      if (!text && !media_url) return res.status(400).json({ error: 'Mensaje vacío.' });

      const [convs]: any = await pool.query(
        "SELECT * FROM omnichannel_conversations WHERE id = ? AND user_id = ? LIMIT 1",
        [convId, userId]
      );
      if (convs.length === 0) return res.status(404).json({ error: 'Conversación no encontrada.' });
      const conv = convs[0];

      let zernioMsgId = null;
      try {
        let targetAccountId = conv.account_id;
        if (!targetAccountId) {
          const [accRows]: any = await pool.query(
            "SELECT zernio_account_id FROM omnichannel_accounts WHERE user_id = ? AND platform = ? LIMIT 1",
            [userId, conv.platform]
          );
          if (accRows.length > 0) targetAccountId = accRows[0].zernio_account_id;
        }

        const zernioPayload: any = { message: text || '' };
        if (targetAccountId) zernioPayload.accountId = targetAccountId;
        if (media_url) {
          zernioPayload.attachmentUrl = media_url; zernioPayload.attachmentType = media_type || 'image';
        }
        const zRes = await callZernio(`/inbox/conversations/${encodeURIComponent(conv.zernio_conversation_id)}/messages`, {
          method: 'POST',
          body: zernioPayload
        });
        if (zRes.status < 300) {
          zernioMsgId = zRes.data?.messageId || zRes.data?._id || zRes.data?.id;
        }
      } catch (apiErr: any) {
        console.warn('[Omnichannel] Zernio send fallback warning:', apiErr.message);
      }

      const [insertRes]: any = await pool.query(
        `INSERT INTO omnichannel_messages (conversation_id, zernio_message_id, direction, sender_type, sender_name, text_content, media_type, media_url, status)
         VALUES (?, ?, 'outbound', 'agent', 'Agente Humano', ?, ?, ?, 'delivered')`,
        [convId, zernioMsgId, text || '', media_type || null, media_url || null]
      );

      await pool.query(
        "UPDATE omnichannel_conversations SET last_message = ?, last_message_at = NOW() WHERE id = ?",
        [text || '[Archivo adjunto]', convId]
      );

      const customer = UserRepo ? await UserRepo.getById(userId).catch(() => null) : null;
      const customerEmail = String(customer?.email || '').trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
        await sendNotificationEvent({
          eventCode: 'ticket_reply_customer',
          entityType: 'omnichannel_message',
          entityId: String(insertRes.insertId),
          audience: 'customer',
          userId,
          toEmail: customerEmail,
          recipientName: customer?.name || conv.contact_name,
          language: customer?.language || 'es',
          variables: {
            userName: customer?.name || customerEmail,
            ticketId: `CONV-${convId}`,
            ticketUrl: `${process.env.APP_URL || 'https://doordrop.lat'}/panel/omnichannel`,
            agentName: 'Agente Humano',
            replyPreview: String(text || '[Archivo adjunto]').replace(/\s+/g, ' ').trim().slice(0, 1200)
          }
        }).catch(() => undefined);
      }

      res.json({
        success: true,
        message_id: insertRes.insertId,
        text_content: text,
        media_url,
        zernio_message_id: zernioMsgId
      });
    } catch (err: any) {
      console.error('[Omnichannel] Send message error:', err);
      res.status(500).json({ error: 'Error al enviar mensaje.' });
    }
  });

  router.post('/conversations/:id/toggle-ai', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const convId = Number(req.params.id);
      const { ai_active } = req.body;

      if (ai_active && !await ensureAIReady(userId, res)) return;

      const [updateResult]: any = await pool.query(
        "UPDATE omnichannel_conversations SET ai_active = ? WHERE id = ? AND user_id = ?",
        [ai_active ? 1 : 0, convId, userId]
      );
      if (!updateResult?.affectedRows) return res.status(404).json({ error: 'Conversación no encontrada.' });
      res.json({ success: true, ai_active: !!ai_active });
    } catch (err: any) {
      console.error('[Omnichannel] Toggle AI error:', err);
      res.status(500).json({ error: 'Error al cambiar estado de AI.' });
    }
  });

  
  // ---------------------------------------------------------------------------
  // Team Management & Agent Transfer Endpoints
  // ---------------------------------------------------------------------------
  router.get('/team', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const [members]: any = await pool.query(
        "SELECT * FROM omnichannel_team WHERE user_id = ? AND is_active = 1 ORDER BY type ASC, created_at ASC",
        [userId]
      );
      res.json({ success: true, team: members });
    } catch (err: any) {
      console.error('[Omnichannel Team] Get team error:', err);
      res.status(500).json({ error: 'Error al listar miembros del equipo.' });
    }
  });

  router.post('/team', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const { name, role, email, phone, type, status } = req.body;
      if (!name) return res.status(400).json({ error: 'El nombre es requerido.' });

      const memberId = 'agent-' + (type === 'ai' ? 'ai' : 'hum') + '-' + Date.now();
      const initials = name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase() || 'OP';
      const gradients = [
        'from-amber-500 to-orange-600',
        'from-emerald-500 to-teal-600',
        'from-blue-600 to-indigo-600',
        'from-purple-600 to-indigo-600',
        'from-rose-500 to-pink-600'
      ];
      const avatarGradient = gradients[Math.floor(Math.random() * gradients.length)];

      await pool.query(
        `INSERT INTO omnichannel_team (user_id, member_id, name, role, type, email, phone, initials, avatar_gradient, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, memberId, name, role || 'Agente de Soporte', type || 'human', email || null, phone || null, initials, avatarGradient, status || 'online']
      );

      res.json({ success: true, message: 'Miembro del equipo agregado con éxito.' });
    } catch (err: any) {
      console.error('[Omnichannel Team] Add member error:', err);
      res.status(500).json({ error: 'Error al agregar miembro del equipo.' });
    }
  });

  router.put('/team/:id', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const memberId = req.params.id;
      const { name, role, email, phone, status, is_active } = req.body;

      await pool.query(
        `UPDATE omnichannel_team SET
           name = COALESCE(?, name),
           role = COALESCE(?, role),
           email = COALESCE(?, email),
           phone = COALESCE(?, phone),
           status = COALESCE(?, status),
           is_active = COALESCE(?, is_active),
           updated_at = NOW()
         WHERE (id = ? OR member_id = ?) AND user_id = ?`,
        [name, role, email, phone, status, is_active, memberId, memberId, userId]
      );

      res.json({ success: true, message: 'Miembro actualizado.' });
    } catch (err: any) {
      console.error('[Omnichannel Team] Update member error:', err);
      res.status(500).json({ error: 'Error al actualizar miembro.' });
    }
  });

  router.delete('/team/:id', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const memberId = req.params.id;
      await pool.query(
        "UPDATE omnichannel_team SET is_active = 0 WHERE (id = ? OR member_id = ?) AND user_id = ?",
        [memberId, memberId, userId]
      );
      res.json({ success: true, message: 'Miembro desactivado.' });
    } catch (err: any) {
      console.error('[Omnichannel Team] Delete member error:', err);
      res.status(500).json({ error: 'Error al desactivar miembro.' });
    }
  });

  // Transfer conversation to an agent (AI or human team member)
  router.post('/conversations/:id/transfer', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const convId = Number(req.params.id);
      const { target_agent_id, target_agent_name, target_agent_type } = req.body;

      if (!target_agent_id) return res.status(400).json({ error: 'ID de agente requerido.' });

      const isAi = target_agent_type === 'ai' || target_agent_id.includes('-ai-');
      const agentName = target_agent_name || (isAi ? 'Agente AI' : 'Equipo Humano');

      const [conversationRows]: any = await pool.query(
        "SELECT * FROM omnichannel_conversations WHERE id = ? AND user_id = ? LIMIT 1",
        [convId, userId]
      );
      if (!conversationRows.length) return res.status(404).json({ error: 'Conversación no encontrada.' });
      const conversation = conversationRows[0];

      if (isAi && !await ensureAIReady(userId, res)) return;

      await pool.query(
        `UPDATE omnichannel_conversations 
         SET assigned_agent_id = ?,
             assigned_agent_name = ?,
             assigned_agent_type = ?,
             ai_active = ?
         WHERE id = ? AND user_id = ?`,
        [target_agent_id, agentName, isAi ? 'ai' : 'human', isAi ? 1 : 0, convId, userId]
      );

      // Record system transfer message in chat
      const alertText = isAi
        ? '🤖 Agente AI activado: El sistema automatizado de DoorDrop retoma la atención de esta conversación.'
        : `🔔 Conversación transferida con éxito a: ${agentName}. Un operador humano está a cargo.`;

      await pool.query(
        `INSERT INTO omnichannel_messages 
          (conversation_id, direction, sender_type, sender_name, text_content, status)
         VALUES (?, 'outbound', 'system', 'Sistema DoorDrop', ?, 'read')`,
        [convId, alertText]
      );

      const customer = UserRepo ? await UserRepo.getById(userId).catch(() => null) : null;
      const customerEmail = String(customer?.email || '').trim().toLowerCase();
      const ticketUrl = `${process.env.APP_URL || 'https://doordrop.lat'}/panel/omnichannel`;
      const eventId = `conversation-${convId}-${isAi ? 'ai' : 'human'}-${Date.now()}`;
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
        await sendNotificationEvent({
          eventCode: isAi ? 'omnichannel_handoff_customer' : 'omnichannel_handoff_customer',
          entityType: 'omnichannel_conversation',
          entityId: eventId,
          audience: 'customer',
          userId,
          toEmail: customerEmail,
          recipientName: customer?.name || conversation.contact_name,
          language: customer?.language || 'es',
          variables: {
            userName: customer?.name || customerEmail,
            ticketId: `CONV-${convId}`,
            ticketUrl,
            summary: String(conversation.last_message || conversation.contact_name || '').slice(0, 1200),
            statusLabel: isAi ? 'Asistencia AI activa' : `Asignada a ${agentName}`
          }
        }).catch(() => undefined);
      }

      if (!isAi) {
        const [agentRows]: any = await pool.query(
          "SELECT email FROM omnichannel_team WHERE user_id = ? AND is_active = 1 AND (member_id = ? OR id = ?) LIMIT 1",
          [userId, target_agent_id, target_agent_id]
        );
        const internalEmail = String(agentRows[0]?.email || '').trim().toLowerCase();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(internalEmail)) {
          await sendNotificationEvent({
            eventCode: 'omnichannel_handoff_internal',
            entityType: 'omnichannel_conversation',
            entityId: eventId,
            audience: 'internal',
            toEmail: internalEmail,
            recipientName: agentName,
            language: 'es',
            variables: {
              customerName: customer?.name || conversation.contact_name || 'Cliente',
              customerEmail: customerEmail || 'No disponible',
              ticketId: `CONV-${convId}`,
              ticketUrl,
              channel: conversation.platform || 'omnichannel',
              reason: 'Transferencia solicitada desde el panel',
              summary: String(conversation.last_message || conversation.contact_name || '').slice(0, 1200)
            }
          }).catch(() => undefined);
        }
      }

      res.json({
        success: true,
        assigned_agent_id: target_agent_id,
        assigned_agent_name: agentName,
        assigned_agent_type: isAi ? 'ai' : 'human',
        ai_active: isAi
      });
    } catch (err: any) {
      console.error('[Omnichannel Transfer] Transfer error:', err);
      res.status(500).json({ error: 'Error al transferir conversación.' });
    }
  });

  router.get('/comments', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const [comments]: any = await pool.query(
        "SELECT * FROM omnichannel_comments WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
        [userId]
      );
      const [rules]: any = await pool.query(
        "SELECT * FROM omnichannel_comment_rules WHERE user_id = ? ORDER BY id DESC",
        [userId]
      );
      res.json({ success: true, comments, automation_rules: rules });
    } catch (err: any) {
      console.error('[Omnichannel] Get comments error:', err);
      res.status(500).json({ error: 'Error al listar comentarios.' });
    }
  });

  router.post('/comments/:id/reply', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const commentId = Number(req.params.id);
      const { reply_text } = req.body;
      if (!reply_text) return res.status(400).json({ error: 'Texto de respuesta requerido.' });

      const [rows]: any = await pool.query(
        "SELECT * FROM omnichannel_comments WHERE id = ? AND user_id = ? LIMIT 1",
        [commentId, userId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Comentario no encontrado.' });
      const comment = rows[0];

      if (comment.zernio_post_id && comment.zernio_comment_id) {
        try {
          await callZernio(`/inbox/comments/${encodeURIComponent(comment.zernio_post_id)}/${encodeURIComponent(comment.zernio_comment_id)}`, {
            method: 'POST',
            body: { message: reply_text }
          });
        } catch (err: any) {
          console.warn('[Omnichannel] Remote comment reply warning:', err.message);
        }
      }

      await pool.query(
        "UPDATE omnichannel_comments SET reply_status = 'replied', reply_text = ? WHERE id = ?",
        [reply_text, commentId]
      );
      res.json({ success: true, message: 'Respuesta publicada exitosamente.' });
    } catch (err: any) {
      console.error('[Omnichannel] Reply comment error:', err);
      res.status(500).json({ error: 'Error al responder comentario.' });
    }
  });

  router.post('/comments/rules', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const { name, platform, keywords, public_reply_text, dm_reply_text } = req.body;
      if (!name || !keywords) return res.status(400).json({ error: 'Nombre y palabras clave requeridas.' });

      const [resInsert]: any = await pool.query(
        `INSERT INTO omnichannel_comment_rules (user_id, name, platform, keywords_json, public_reply_text, dm_reply_text, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [
          userId,
          name,
          platform || 'all',
          JSON.stringify(Array.isArray(keywords) ? keywords : [keywords]),
          public_reply_text || null,
          dm_reply_text || null
        ]
      );
      res.json({ success: true, id: resInsert.insertId });
    } catch (err: any) {
      console.error('[Omnichannel] Add comment rule error:', err);
      res.status(500).json({ error: 'Error al crear regla de automatización.' });
    }
  });

  
  // AI Autofill: Generate entire employee setup based on catalog and merchant profile
  router.post('/ai-employee/autofill', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      console.log('[AI Autofill] Triggered for user:', userId);
      const generated = await autoGenerateStoreAISettings(userId);
      res.json({ success: true, ai_settings: generated });
    } catch (err: any) {
      console.error('[Omnichannel] AI Autofill error:', err);
      res.status(500).json({ error: 'Error al autocompletar configuración con IA.' });
    }
  });

  router.get('/ai-employee', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const [rows]: any = await pool.query(
        "SELECT * FROM omnichannel_ai_settings WHERE user_id = ? LIMIT 1",
        [userId]
      );

      let settings = rows[0];
      if (!settings) {
        const [profileRows]: any = await pool.query(
          "SELECT name, country, currency, business_type FROM users WHERE id = ? LIMIT 1",
          [userId]
        );
        const profile = profileRows[0] || {};
        const defaultSettings = {
          user_id: userId,
          agent_name: 'Asistente de ventas del negocio',
          tone: 'friendly_professional',
          language: 'auto',
          system_prompt: 'Responde en el idioma del cliente y utiliza únicamente el catálogo, las políticas, la moneda y los datos reales configurados por este negocio.',
          business_info: '',
          faqs_json: JSON.stringify([]),
          website_url: '',
          can_lookup_orders: 1,
          can_lookup_tracking: 1,
          can_quote_shipping: 1,
          can_search_products: 1,
          can_handoff_human: 1,
          merchant_country: profile.country || null,
          merchant_currency: profile.currency || null,
          business_type: profile.business_type || null
        };

        const [insertRes]: any = await pool.query(
          `INSERT INTO omnichannel_ai_settings 
            (user_id, agent_name, tone, language, system_prompt, business_info, faqs_json, website_url, can_lookup_orders, can_lookup_tracking, can_quote_shipping, can_search_products, can_handoff_human)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            defaultSettings.user_id, defaultSettings.agent_name, defaultSettings.tone, defaultSettings.language,
            defaultSettings.system_prompt, defaultSettings.business_info, defaultSettings.faqs_json, defaultSettings.website_url,
            defaultSettings.can_lookup_orders, defaultSettings.can_lookup_tracking, defaultSettings.can_quote_shipping,
            defaultSettings.can_search_products, defaultSettings.can_handoff_human
          ]
        );
        settings = { id: insertRes.insertId, ...defaultSettings };
      }

      try { settings.faqs = JSON.parse(settings.faqs_json || '[]'); } catch { settings.faqs = []; }
      res.json({ success: true, ai_settings: settings, readiness: await getOmnichannelReadiness(userId) });
    } catch (err: any) {
      console.error('[Omnichannel] Get AI settings error:', err);
      res.status(500).json({ error: 'Error al consultar configuración de AI.' });
    }
  });

  router.post('/ai-employee', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const {
        agent_name,
        tone,
        language,
        system_prompt,
        business_info,
        faqs,
        website_url,
        can_lookup_orders,
        can_lookup_tracking,
        can_quote_shipping,
        can_search_products,
        can_handoff_human,
        can_send_photos,
        can_create_orders,
        can_generate_tracking,
        min_order_amount,
        free_shipping_threshold,
        sales_contract_text,
        response_delay_seconds,
        personality_instructions,
        auto_learn_conversations
      } = req.body;

      const faqsJson = JSON.stringify(Array.isArray(faqs) ? faqs : []);

      await pool.query(
        `INSERT INTO omnichannel_ai_settings 
          (user_id, agent_name, tone, language, system_prompt, business_info, faqs_json, website_url, 
           can_lookup_orders, can_lookup_tracking, can_quote_shipping, can_search_products, can_handoff_human,
           can_send_photos, can_create_orders, can_generate_tracking, min_order_amount, free_shipping_threshold, sales_contract_text,
           response_delay_seconds, personality_instructions, auto_learn_conversations)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           agent_name = VALUES(agent_name),
           tone = VALUES(tone),
           language = VALUES(language),
           system_prompt = VALUES(system_prompt),
           business_info = VALUES(business_info),
           faqs_json = VALUES(faqs_json),
           website_url = VALUES(website_url),
           can_lookup_orders = VALUES(can_lookup_orders),
           can_lookup_tracking = VALUES(can_lookup_tracking),
           can_quote_shipping = VALUES(can_quote_shipping),
           can_search_products = VALUES(can_search_products),
           can_handoff_human = VALUES(can_handoff_human),
           can_send_photos = VALUES(can_send_photos),
           can_create_orders = VALUES(can_create_orders),
           can_generate_tracking = VALUES(can_generate_tracking),
           min_order_amount = VALUES(min_order_amount),
           free_shipping_threshold = VALUES(free_shipping_threshold),
           sales_contract_text = VALUES(sales_contract_text),
           response_delay_seconds = VALUES(response_delay_seconds),
           personality_instructions = VALUES(personality_instructions),
           auto_learn_conversations = VALUES(auto_learn_conversations),
           updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          agent_name || 'DoorDrop AI Employee',
          tone || 'friendly_professional',
          language || 'auto',
          system_prompt || '',
          business_info || '',
          faqsJson,
          website_url || '',
          can_lookup_orders !== false ? 1 : 0,
          can_lookup_tracking !== false ? 1 : 0,
          can_quote_shipping !== false ? 1 : 0,
          can_search_products !== false ? 1 : 0,
          can_handoff_human !== false ? 1 : 0,
          can_send_photos !== false ? 1 : 0,
          can_create_orders !== false ? 1 : 0,
          can_generate_tracking !== false ? 1 : 0,
          Number(min_order_amount) || 0.00,
          Number(free_shipping_threshold) || 0.00,
          sales_contract_text || '',
          response_delay_seconds !== undefined ? Math.max(1, Math.min(15, Number(response_delay_seconds))) : 3,
          personality_instructions || '',
          auto_learn_conversations !== false ? 1 : 0
        ]
      );

      res.json({
        success: true,
        message: 'Configuración del empleado AI guardada exitosamente.',
        readiness: await getOmnichannelReadiness(userId)
      });
    } catch (err: any) {
      console.error('[Omnichannel] Save AI settings error:', err);
      res.status(500).json({ error: 'Error al guardar configuración de AI.' });
    }
  });

  router.post('/ai-employee/test-tool', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const { tool, args } = req.body;
      if (!tool) return res.status(400).json({ error: 'Herramienta requerida.' });
      if (!await ensureAIReady(userId, res)) return;

      const result = await handleAIToolCall(tool, args || {}, userId);
      res.json({ success: true, tool, result });
    } catch (err: any) {
      console.error('[Omnichannel] Test tool error:', err);
      res.status(500).json({ error: 'Error al ejecutar herramienta de AI.' });
    }
  });

  router.get('/posts', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const [posts]: any = await pool.query(
        "SELECT * FROM omnichannel_posts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
        [userId]
      );
      res.json({ success: true, posts });
    } catch (err: any) {
      console.error('[Omnichannel] Get posts error:', err);
      res.status(500).json({ error: 'Error al listar publicaciones.' });
    }
  });

  router.post('/posts', authMiddleware, requireActiveSubscription, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const { caption, media_urls, target_platforms, scheduled_at } = req.body;

      if (!caption && (!media_urls || media_urls.length === 0)) {
        return res.status(400).json({ error: 'Se requiere texto o archivos multimedia.' });
      }

      const [resInsert]: any = await pool.query(
        `INSERT INTO omnichannel_posts (user_id, caption, media_urls_json, target_platforms_json, scheduled_at, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          caption || '',
          JSON.stringify(Array.isArray(media_urls) ? media_urls : []),
          JSON.stringify(Array.isArray(target_platforms) ? target_platforms : ['all']),
          scheduled_at ? new Date(scheduled_at) : null,
          scheduled_at ? 'scheduled' : 'published'
        ]
      );

      res.json({ success: true, id: resInsert.insertId, message: scheduled_at ? 'Publicación programada' : 'Publicación enviada' });
    } catch (err: any) {
      console.error('[Omnichannel] Create post error:', err);
      res.status(500).json({ error: 'Error al crear publicación.' });
    }
  });

  router.get('/plans', async (req: Request, res: Response) => {
    try {
      const requestedCurrency = String(req.query.currency || '').toUpperCase();
      const [planRows]: any = await pool.query(
        `SELECT id, code, name, description, price, currency, billing_interval,
                channels_limit, included_platforms_json, features_json,
                polar_product_id, polar_price_id, polar_enabled, is_active
           FROM omnichannel_plan_catalog
          WHERE is_active = 1
          ORDER BY price ASC, id ASC`
      );
      const [addonRows]: any = await pool.query(
        `SELECT id, code, name, description, price, currency, billing_interval,
                polar_product_id, polar_price_id, polar_enabled, is_active
           FROM omnichannel_addon_catalog
          WHERE is_active = 1
          ORDER BY price ASC, id ASC`
      );

      const plans = (planRows || []).map((plan: any) => ({
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        price: Number(plan.price || 0),
        currency: String(plan.currency || 'USD').toUpperCase(),
        billing_interval: plan.billing_interval || 'month',
        channels_included: Number(plan.channels_limit || 0),
        included_platforms: parseCatalogJson(plan.included_platforms_json),
        features: parseCatalogJson(plan.features_json),
        polar_plan_id: plan.id,
        polar_product_id: plan.polar_product_id || null,
        polar_price_id: plan.polar_price_id || null,
        polar_enabled: Boolean(plan.polar_enabled),
        checkout_ready: Boolean(plan.polar_enabled && plan.polar_product_id),
        popular: plan.code === 'duo'
      }));

      const addOns = (addonRows || []).map((addon: any) => ({
        id: addon.id,
        code: addon.code,
        name: addon.name,
        description: addon.description,
        price: Number(addon.price || 0),
        currency: String(addon.currency || 'USD').toUpperCase(),
        billing_interval: addon.billing_interval || 'month',
        polar_product_id: addon.polar_product_id || null,
        polar_price_id: addon.polar_price_id || null,
        polar_enabled: Boolean(addon.polar_enabled),
        checkout_ready: Boolean(addon.polar_enabled && addon.polar_product_id)
      }));

      return res.json({
        success: true,
        plans,
        addOns,
        currency: requestedCurrency || (plans[0]?.currency || 'USD'),
        pricing_source: 'omnichannel_plan_catalog',
        note: 'Los precios se cobran con el producto recurrente configurado en Polar; no se convierten automáticamente.'
      });
    } catch (err: any) {
      console.error('[Omnichannel] Get plans error:', err);
      return res.status(500).json({ error: 'Error al consultar planes.' });
    }
  });

  router.post('/subscribe', authMiddleware, async (req: any, res: Response) => {
    return res.status(410).json({
      error: 'La activación directa fue retirada. Debes completar el checkout recurrente de Polar.',
      code: 'OMNICHANNEL_POLAR_CHECKOUT_REQUIRED'
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Super Admin Routes (/api/admin/omnichannel/*)
  // ---------------------------------------------------------------------------
  adminRouter.get('/settings', authMiddleware, requireSuperAdmin, async (_req: any, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        "SELECT setting_key, setting_value, is_secret, updated_at FROM admin_settings WHERE setting_key LIKE 'zernio_%' OR setting_key LIKE 'omnichannel_%'"
      );
      const safeSettings = (rows || []).map((row: any) => ({
        ...row,
        setting_value: row.is_secret ? '' : row.setting_value,
        configured: row.is_secret ? Boolean(row.setting_value) : undefined
      }));
      const [subCount]: any = await pool.query(
        "SELECT COUNT(*) AS total_clients, COALESCE(SUM(monthly_price), 0) AS mrr FROM omnichannel_subscriptions WHERE status = 'active' AND provider = 'polar' AND (current_period_end IS NULL OR current_period_end > UTC_TIMESTAMP())"
      );
      const [accCount]: any = await pool.query(
        "SELECT COUNT(*) AS total_connected_channels FROM omnichannel_accounts"
      );
      const [msgCount]: any = await pool.query(
        "SELECT COUNT(*) AS total_processed_messages FROM omnichannel_messages"
      );

      res.json({
        success: true,
        settings: safeSettings,
        overview: {
          total_subscribers: subCount[0]?.total_clients || 0,
          mrr: Number(subCount[0]?.mrr || 0).toFixed(2),
          total_channels: accCount[0]?.total_connected_channels || 0,
          total_messages: msgCount[0]?.total_processed_messages || 0
        }
      });
    } catch (err: any) {
      console.error('[Omnichannel Admin] Get settings error:', err);
      res.status(500).json({ error: 'Error al consultar configuración.' });
    }
  });

  adminRouter.post('/settings', authMiddleware, requireSuperAdmin, async (req: any, res: Response) => {
    try {
      const { zernio_api_key, zernio_webhook_secret, zernio_api_url, omnichannel_extra_channel_usd, omnichannel_default_currency } = req.body;
      const updates = [
        ['zernio_api_key', zernio_api_key, 1],
        ['zernio_webhook_secret', zernio_webhook_secret, 1],
        ['zernio_api_url', zernio_api_url || 'https://zernio.com/api/v1', 0],
        ['omnichannel_extra_channel_usd', omnichannel_extra_channel_usd || '8.00', 0],
        ['omnichannel_default_currency', omnichannel_default_currency || 'EUR', 0]
      ];

      for (const [key, val, secret] of updates) {
        if (val !== undefined && val !== null && (!secret || String(val).trim() !== '')) {
          await pool.query(
            `INSERT INTO admin_settings (setting_key, setting_value, is_secret)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
            [key, String(val), secret]
          );
        }
      }
      res.json({ success: true, message: 'Configuración Omnicanal guardada exitosamente.' });
    } catch (err: any) {
      console.error('[Omnichannel Admin] Save settings error:', err);
      res.status(500).json({ error: 'Error al guardar configuración.' });
    }
  });

  adminRouter.get('/plans', authMiddleware, requireSuperAdmin, async (_req: any, res: Response) => {
    try {
      const [plans]: any = await pool.query(
        `SELECT id, code, name, description, price, currency, billing_interval,
                channels_limit, included_platforms_json, features_json,
                polar_product_id, polar_price_id, polar_enabled, is_active, updated_at
           FROM omnichannel_plan_catalog
          ORDER BY price ASC, id ASC`
      );
      const [addOns]: any = await pool.query(
        `SELECT id, code, name, description, price, currency, billing_interval,
                polar_product_id, polar_price_id, polar_enabled, is_active, updated_at
           FROM omnichannel_addon_catalog
          ORDER BY price ASC, id ASC`
      );
      res.json({
        success: true,
        plans: (plans || []).map((p: any) => ({
          ...p,
          price: Number(p.price || 0),
          included_platforms: parseCatalogJson(p.included_platforms_json),
          features: parseCatalogJson(p.features_json),
          checkout_ready: Boolean(p.polar_enabled && p.polar_product_id)
        })),
        addOns: (addOns || []).map((a: any) => ({
          ...a,
          price: Number(a.price || 0),
          checkout_ready: Boolean(a.polar_enabled && a.polar_product_id)
        }))
      });
    } catch (err: any) {
      console.error('[Omnichannel Admin] Get catalog error:', err?.message || err);
      res.status(500).json({ error: 'Error al consultar el catálogo Omnicanal.' });
    }
  });

  adminRouter.put('/plans/:id', authMiddleware, requireSuperAdmin, async (req: any, res: Response) => {
    try {
      const id = String(req.params.id || '').trim();
      const [existing]: any = await pool.query('SELECT id FROM omnichannel_plan_catalog WHERE id = ? LIMIT 1', [id]);
      if (!existing?.length) return res.status(404).json({ error: 'Plan Omnicanal no encontrado.' });

      const body = req.body || {};
      const price = Number(body.price);
      const channelsLimit = Number(body.channels_limit);
      if (!Number.isFinite(price) || price < 0 || price > 100000) {
        return res.status(400).json({ error: 'El precio del plan no es válido.' });
      }
      if (!Number.isInteger(channelsLimit) || channelsLimit < 1 || channelsLimit > 100) {
        return res.status(400).json({ error: 'El límite de canales no es válido.' });
      }
      const currency = String(body.currency || 'USD').trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) return res.status(400).json({ error: 'La moneda no es válida.' });

      await pool.query(
        `UPDATE omnichannel_plan_catalog
            SET name = ?, description = ?, price = ?, currency = ?, billing_interval = ?,
                channels_limit = ?, polar_product_id = ?, polar_price_id = ?,
                polar_enabled = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [
          String(body.name || '').trim().slice(0, 120),
          String(body.description || '').trim().slice(0, 500),
          price,
          currency,
          String(body.billing_interval || 'month').trim().slice(0, 20),
          channelsLimit,
          String(body.polar_product_id || '').trim().slice(0, 190) || null,
          String(body.polar_price_id || '').trim().slice(0, 190) || null,
          body.polar_enabled === false || body.polar_enabled === 0 ? 0 : 1,
          body.is_active === false || body.is_active === 0 ? 0 : 1,
          id
        ]
      );
      res.json({ success: true, message: 'Plan Omnicanal actualizado.' });
    } catch (err: any) {
      console.error('[Omnichannel Admin] Update catalog plan error:', err?.message || err);
      res.status(500).json({ error: 'No se pudo actualizar el plan Omnicanal.' });
    }
  });

  adminRouter.put('/addons/:id', authMiddleware, requireSuperAdmin, async (req: any, res: Response) => {
    try {
      const id = String(req.params.id || '').trim();
      const [existing]: any = await pool.query('SELECT id FROM omnichannel_addon_catalog WHERE id = ? LIMIT 1', [id]);
      if (!existing?.length) return res.status(404).json({ error: 'Complemento Omnicanal no encontrado.' });

      const body = req.body || {};
      const price = Number(body.price);
      const currency = String(body.currency || 'USD').trim().toUpperCase();
      if (!Number.isFinite(price) || price < 0 || price > 100000 || !/^[A-Z]{3}$/.test(currency)) {
        return res.status(400).json({ error: 'Los datos del complemento no son válidos.' });
      }
      await pool.query(
        `UPDATE omnichannel_addon_catalog
            SET name = ?, description = ?, price = ?, currency = ?, billing_interval = ?,
                polar_product_id = ?, polar_price_id = ?, polar_enabled = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [
          String(body.name || '').trim().slice(0, 120),
          String(body.description || '').trim().slice(0, 500),
          price,
          currency,
          String(body.billing_interval || 'month').trim().slice(0, 20),
          String(body.polar_product_id || '').trim().slice(0, 190) || null,
          String(body.polar_price_id || '').trim().slice(0, 190) || null,
          body.polar_enabled === false || body.polar_enabled === 0 ? 0 : 1,
          body.is_active === false || body.is_active === 0 ? 0 : 1,
          id
        ]
      );
      res.json({ success: true, message: 'Complemento Omnicanal actualizado.' });
    } catch (err: any) {
      console.error('[Omnichannel Admin] Update catalog addon error:', err?.message || err);
      res.status(500).json({ error: 'No se pudo actualizar el complemento Omnicanal.' });
    }
  });

  adminRouter.get('/clients', authMiddleware, requireSuperAdmin, async (_req: any, res: Response) => {
    try {
      const [clients]: any = await pool.query(
         `SELECT s.*, u.email, u.name,
                (SELECT COUNT(*) FROM omnichannel_accounts a WHERE a.user_id = s.user_id) AS active_channels_count,
                (SELECT COUNT(*) FROM omnichannel_conversations c WHERE c.user_id = s.user_id) AS total_conversations
         FROM omnichannel_subscriptions s
         JOIN users u ON s.user_id = u.id
         ORDER BY s.created_at DESC LIMIT 100`
      );
      res.json({ success: true, clients });
    } catch (err: any) {
      console.error('[Omnichannel Admin] Get clients error:', err);
      res.status(500).json({ error: 'Error al listar clientes Omnicanal.' });
    }
  });

  adminRouter.post('/test-connection', authMiddleware, requireSuperAdmin, async (_req: any, res: Response) => {
    try {
      const resp = await callZernio('/profiles');
      if (resp.status >= 200 && resp.status < 300) {
        return res.json({
          success: true,
          message: 'Conexión con Zernio API verificada exitosamente.',
          profiles_count: resp.data?.profiles?.length || 0
        });
      }
      res.status(400).json({
        error: resp.data?.error || `Zernio respondió con código ${resp.status}`
      });
    } catch (err: any) {
      console.error('[Omnichannel Admin] Test connection error:', err);
      res.status(500).json({ error: err.message || 'Error de conexión con el proveedor.' });
    }
  });

  // Mount routers
  app.use('/api/omnichannel', router);
  app.use('/api/admin/omnichannel', adminRouter);
  console.log('[Omnichannel] All routes mounted successfully on /api/omnichannel & /api/admin/omnichannel');
}
