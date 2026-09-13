import { generateAIEmployeeReply, autoGenerateStoreAISettings, isPeakHour } from './deepseek_service';
import { Router, Request, Response } from 'express';
import https from 'https';
import crypto from 'crypto';
import { handleAIToolCall } from './ai_sales_tools';

export function setupOmnichannelRoutes(app: any, options: {
  pool: any;
  authMiddleware: any;
  requireSuperAdmin: any;
  UserRepo?: any;
}) {
  const router = Router();
  const adminRouter = Router();
  const { pool, authMiddleware, requireSuperAdmin } = options;

  let cachedApiKey = 'sk_895a0c3cf6da498f854c000ef72860d0ca5f5c313464055e44e07454a50cfa7a';
  let cachedWebhookSecret = 'whsec_dd_omni_895a0c3cf6da498f854c000ef72860d0';
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

  async function getUserOmnichannelSubscription(userId: string) {
    const [rows]: any = await pool.query(
      "SELECT * FROM omnichannel_subscriptions WHERE user_id = ? LIMIT 1",
      [userId]
    );
    if (rows.length > 0) return rows[0];

    const defaultSub = {
      user_id: userId,
      plan_code: 'whatsapp',
      status: 'active',
      channels_limit: 1,
      ai_enabled: 1,
      comment_automation: 0,
      auto_publish: 0,
      extra_channels_count: 0,
      monthly_price: 9.99,
      currency: 'EUR'
    };

    const [res]: any = await pool.query(
      `INSERT INTO omnichannel_subscriptions 
        (user_id, plan_code, status, channels_limit, ai_enabled, comment_automation, auto_publish, extra_channels_count, monthly_price, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        defaultSub.user_id,
        defaultSub.plan_code,
        defaultSub.status,
        defaultSub.channels_limit,
        defaultSub.ai_enabled,
        defaultSub.comment_automation,
        defaultSub.auto_publish,
        defaultSub.extra_channels_count,
        defaultSub.monthly_price,
        defaultSub.currency
      ]
    );
    return { id: res.insertId, ...defaultSub };
  }

  // ---------------------------------------------------------------------------
  // 1. Central Webhook (/api/webhooks/zernio)
  // ---------------------------------------------------------------------------
  app.post('/api/webhooks/zernio', async (req: Request, res: Response) => {
    const eventId = String(req.headers['x-zernio-event-id'] || req.headers['x-webhook-id'] || `ev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
    const sigHeader = req.headers['x-zernio-signature'] || req.headers['x-hub-signature-256'] || req.headers['x-signature'];

    try {
      const [dup]: any = await pool.query(
        "SELECT id FROM omnichannel_webhook_events WHERE event_id = ? LIMIT 1",
        [eventId]
      );
      if (dup.length > 0) {
        return res.status(200).json({ status: 'duplicate_ignored' });
      }

      await pool.query(
        "INSERT INTO omnichannel_webhook_events (event_id, event_type, payload_json) VALUES (?, ?, ?)",
        [eventId, req.body?.event || req.body?.type || 'unknown', JSON.stringify(req.body)]
      );
    } catch (err: any) {
      console.warn('[Omnichannel Webhook] Log warning:', err.message);
    }

    const payload = req.body || {};
    const eventType = payload.event || payload.type;
    console.log(`[Omnichannel Webhook] Received ${eventType} event ID: ${eventId}`);

    try {
      switch (eventType) {
        case 'message.received': {
          const msg = payload.data || payload.message || payload;
          const convId = msg.conversationId || msg.conversation?._id || msg.conversation?.id || 'conv_default';
          const contactId = msg.senderId || msg.contactId || msg.from;
          const contactName = msg.senderName || msg.sender?.name || 'Cliente';
          const textContent = msg.text || msg.body || msg.content || '';
          const platform = msg.platform || payload.platform || 'whatsapp';
          const profileId = payload.profileId || msg.profileId;

                    let userId = 'usr_cd9c5499356269546b7c9aa27e0adebe';
          const zAccountId = payload.account?.id || payload.account?.accountId || msg.accountId;
          
          if (zAccountId) {
            const [accs]: any = await pool.query(
              "SELECT user_id FROM omnichannel_accounts WHERE zernio_account_id = ? LIMIT 1",
              [zAccountId]
            );
            if (accs.length > 0) userId = accs[0].user_id;
          } else if (profileId) {
            const [prof]: any = await pool.query(
              "SELECT user_id FROM omnichannel_profiles WHERE zernio_profile_id = ? LIMIT 1",
              [profileId]
            );
            if (prof.length > 0) userId = prof[0].user_id;
          }

          const [existingConv]: any = await pool.query(
            "SELECT id, ai_active FROM omnichannel_conversations WHERE user_id = ? AND zernio_conversation_id = ? LIMIT 1",
            [userId, convId]
          );

          let localConvId = existingConv.length > 0 ? existingConv[0].id : null;
          let aiActive = existingConv.length > 0 ? existingConv[0].ai_active : 1;

          if (!localConvId) {
            const [newConv]: any = await pool.query(
              `INSERT INTO omnichannel_conversations 
                (user_id, platform, account_id, zernio_conversation_id, contact_id, contact_name, last_message, last_message_at, unread_count, ai_active)
               VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 1, 1)`,
              [userId, platform, zAccountId || null, convId, contactId, contactName, textContent]
            );
            localConvId = newConv.insertId;
          } else {
            await pool.query(
              `UPDATE omnichannel_conversations 
               SET last_message = ?, last_message_at = NOW(), unread_count = unread_count + 1 
               WHERE id = ?`,
              [textContent, localConvId]
            );
          }

          await pool.query(
            `INSERT INTO omnichannel_messages 
              (conversation_id, zernio_message_id, direction, sender_type, sender_name, text_content, status)
             VALUES (?, ?, 'inbound', 'contact', ?, ?, 'delivered')`,
            [localConvId, msg._id || msg.id || eventId, contactName, textContent]
          );

          // DeepSeek AI Auto-Responder with custom response delay
          if (aiActive && textContent) {
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
                const aiResult = await generateAIEmployeeReply(userId, textContent, contactName, localConvId);
                if (aiResult) {
                  const replyText = typeof aiResult === 'object' ? aiResult.text : String(aiResult);
                  const photoUrl = typeof aiResult === 'object' ? aiResult.mediaUrl : null;
                  console.log(`[AI Sales Auto-Responder] Replying to conversation #${localConvId} (${platform}): "${replyText}" | Photo: ${photoUrl || 'none'}`);

                  let targetAccId = zAccountId;
                  if (!targetAccId) {
                    const [accRows]: any = await pool.query(
                      "SELECT zernio_account_id FROM omnichannel_accounts WHERE user_id = ? AND platform = ? LIMIT 1",
                      [userId, platform]
                    );
                    if (accRows.length > 0) targetAccId = accRows[0].zernio_account_id;
                  }

                  // Send to Zernio
                  const zPayload: any = { message: replyText };
                  if (targetAccId) zPayload.accountId = targetAccId;
                  if (photoUrl) { zPayload.attachmentUrl = photoUrl; zPayload.attachmentType = "image"; }
                  
                  const zRes = await callZernio(`/inbox/conversations/${encodeURIComponent(convId)}/messages`, {
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
            }, 1000);
          }
          break;
        }

        case 'comment.received': {
          const comment = payload.data || payload.comment || payload;
          const profileId = payload.profileId || comment.profileId;
          let userId = 1;
          if (profileId) {
            const [prof]: any = await pool.query(
              "SELECT user_id FROM omnichannel_profiles WHERE zernio_profile_id = ? LIMIT 1",
              [profileId]
            );
            if (prof.length > 0) userId = prof[0].user_id;
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
          let userId = 1;
          if (profileId) {
            const [prof]: any = await pool.query(
              "SELECT user_id FROM omnichannel_profiles WHERE zernio_profile_id = ? LIMIT 1",
              [profileId]
            );
            if (prof.length > 0) userId = prof[0].user_id;
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
        "UPDATE omnichannel_webhook_events SET processed = 1 WHERE event_id = ?",
        [eventId]
      );
      return res.status(200).json({ status: 'ok', eventId });
    } catch (err: any) {
      console.error('[Omnichannel Webhook] Processing error:', err);
      return res.status(200).json({ status: 'error_recorded', error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Client API Routes (/api/omnichannel/*)
  // ---------------------------------------------------------------------------
  router.get('/dashboard', authMiddleware, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const subscription = await getUserOmnichannelSubscription(userId);

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
      const userCountry = userRows[0]?.country || 'IT';
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
          wallet: {
            balance: userBalance,
            currency: userRows[0]?.currency || 'EUR',
            is_blocked: isCreditBlocked,
            limit: -1.00
          },
          peak_hours: {
            is_active: peakActive,
            country: userCountry,
            standard_margin: 10,
            peak_margin: 25,
            current_margin: peakActive ? 25 : 10,
            surcharge_label: peakActive ? '+15% Ora di Punta (18:00-22:00)' : 'Tariffa Standard (+10%)'
          }
        }
      });
    } catch (err: any) {
      console.error('[Omnichannel] Dashboard error:', err);
      res.status(500).json({ error: 'Error al obtener datos del panel Omnicanal.' });
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

  router.post('/channels/connect-url', authMiddleware, async (req: any, res: Response) => {
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

  router.get('/conversations', authMiddleware, async (req: any, res: Response) => {
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

  router.get('/conversations/:id/messages', authMiddleware, async (req: any, res: Response) => {
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

  router.post('/conversations/:id/messages', authMiddleware, async (req: any, res: Response) => {
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

  router.post('/conversations/:id/toggle-ai', authMiddleware, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const convId = Number(req.params.id);
      const { ai_active } = req.body;

      await pool.query(
        "UPDATE omnichannel_conversations SET ai_active = ? WHERE id = ? AND user_id = ?",
        [ai_active ? 1 : 0, convId, userId]
      );
      res.json({ success: true, ai_active: !!ai_active });
    } catch (err: any) {
      console.error('[Omnichannel] Toggle AI error:', err);
      res.status(500).json({ error: 'Error al cambiar estado de AI.' });
    }
  });

  router.get('/comments', authMiddleware, async (req: any, res: Response) => {
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

  router.post('/comments/:id/reply', authMiddleware, async (req: any, res: Response) => {
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

  router.post('/comments/rules', authMiddleware, async (req: any, res: Response) => {
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
  router.post('/ai-employee/autofill', authMiddleware, async (req: any, res: Response) => {
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

  router.get('/ai-employee', authMiddleware, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const [rows]: any = await pool.query(
        "SELECT * FROM omnichannel_ai_settings WHERE user_id = ? LIMIT 1",
        [userId]
      );

      let settings = rows[0];
      if (!settings) {
        const defaultSettings = {
          user_id: userId,
          agent_name: 'DoorDrop AI Employee',
          tone: 'friendly_professional',
          language: 'it',
          system_prompt: 'Sei il consulente virtuale DoorDrop dedicato a questo negozio. Rispondi con cortesia, precisione e rapidità ai clienti.',
          business_info: 'Negozio online con spedizioni tracciate e garantite DoorDrop.',
          faqs_json: JSON.stringify([
            { q: 'Quali sono i tempi di spedizione?', a: 'Spediamo in 24/48 ore lavorative in tutta Italia con corriere espresso tracciato.' },
            { q: 'Come posso tracciare il mio pacco?', a: 'Puoi comunicarci il numero d\'ordine o codice di tracciamento e controllerò immediatamente lo stato.' }
          ]),
          website_url: 'https://doordrop.lat',
          can_lookup_orders: 1,
          can_lookup_tracking: 1,
          can_quote_shipping: 1,
          can_search_products: 1,
          can_handoff_human: 1
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
      res.json({ success: true, ai_settings: settings });
    } catch (err: any) {
      console.error('[Omnichannel] Get AI settings error:', err);
      res.status(500).json({ error: 'Error al consultar configuración de AI.' });
    }
  });

  router.post('/ai-employee', authMiddleware, async (req: any, res: Response) => {
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
          language || 'it',
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

      res.json({ success: true, message: 'Configuración del empleado AI guardada exitosamente.' });
    } catch (err: any) {
      console.error('[Omnichannel] Save AI settings error:', err);
      res.status(500).json({ error: 'Error al guardar configuración de AI.' });
    }
  });

  router.post('/ai-employee/test-tool', authMiddleware, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const { tool, args } = req.body;
      if (!tool) return res.status(400).json({ error: 'Herramienta requerida.' });

      const result = await handleAIToolCall(tool, args || {}, userId);
      res.json({ success: true, tool, result });
    } catch (err: any) {
      console.error('[Omnichannel] Test tool error:', err);
      res.status(500).json({ error: 'Error al ejecutar herramienta de AI.' });
    }
  });

  router.get('/posts', authMiddleware, async (req: any, res: Response) => {
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

  router.post('/posts', authMiddleware, async (req: any, res: Response) => {
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
      const [settings]: any = await pool.query(
        "SELECT setting_key, setting_value FROM admin_settings WHERE setting_key IN ('omnichannel_extra_channel_usd', 'omnichannel_default_currency')"
      );
      let extraChannelPrice = 8.00;
      for (const s of settings) {
        if (s.setting_key === 'omnichannel_extra_channel_usd') extraChannelPrice = Number(s.setting_value) || 8.00;
      }

      // Base prices defined in USD (official Polar requirement)
      const basePlansUSD = [
        {
          code: 'whatsapp',
          name: 'WhatsApp Dedicated',
          priceUSD: 10.99,
          polar_plan_id: 'plan_omni_whatsapp',
          channels_included: 1,
          included_platforms: ['whatsapp'],
          features: [
            '1 canal WhatsApp dedicado',
            'Bandeja de conversaciones unificada',
            'Gestión de contactos y clientes',
            'Empleado AI disponible 24/7 (DeepSeek)',
            'Conocimiento del negocio y FAQs ilimitadas',
            'Control total y traspaso a humano en DoorDrop',
            'Mensajes ilimitados'
          ]
        },
        {
          code: 'duo',
          name: 'DoorDrop Duo',
          priceUSD: 19.99,
          polar_plan_id: 'plan_omni_duo',
          popular: true,
          channels_included: 2,
          included_platforms: ['whatsapp', 'instagram | facebook | telegram'],
          features: [
            'WhatsApp + 1 canal a elección del cliente',
            'Bandeja omnicanal combinada',
            'Empleado AI en ambos canales (DeepSeek)',
            'Historial de pedidos y tracking conectado',
            'Filtros inteligentes y etiquetas',
            'Mensajes ilimitados'
          ]
        },
        {
          code: 'omni3',
          name: 'DoorDrop Omni 3',
          priceUSD: 27.99,
          polar_plan_id: 'plan_omni_omni3',
          channels_included: 3,
          included_platforms: ['whatsapp', 'instagram', 'facebook'],
          features: [
            'WhatsApp + Instagram + Facebook incluidos',
            'Empleado AI multicanal sincronizado (DeepSeek)',
            'Soporte prioritario DoorDrop',
            'Cotizador de envíos y catálogo integrado',
            'Respuestas rápidas y notas internas',
            'Mensajes ilimitados'
          ]
        }
      ];

      // Format with client currency
      const userCurrency = String(req.query.currency || 'EUR').toUpperCase();
      let rate = 1.0;
      if (userCurrency === 'EUR') rate = 0.92;

      const plans = basePlansUSD.map(p => ({
        ...p,
        price: Number((p.priceUSD * (userCurrency === 'USD' ? 1.0 : rate)).toFixed(2)),
        currency: userCurrency
      }));

      const addOns = [
        {
          code: 'extra_channel',
          name: 'Canal Adicional',
          price: extraChannelPrice,
          currency: 'USD',
          description: 'Suma cualquier red adicional (Telegram, TikTok, etc.) a tu plan actual.'
        },
        {
          code: 'comment_automation',
          name: 'Comment-to-DM Automation',
          price: Number((2.20 * (userCurrency === 'USD' ? 1.0 : rate)).toFixed(2)),
          currency: userCurrency,
          description: 'Convierte comentarios de publicaciones en conversaciones y ventas directas por DM automáticamente.'
        },
        {
          code: 'auto_publish',
          name: 'Auto-Publishing Multicanal',
          price: Number((2.20 * (userCurrency === 'USD' ? 1.0 : rate)).toFixed(2)),
          currency: userCurrency,
          description: 'Programa y publica posts, fotos y promociones en todas tus redes con calendario visual.'
        }
      ];

      return res.json({ success: true, plans, addOns, currency: userCurrency });
    } catch (err: any) {
      console.error('[Omnichannel] Get plans error:', err);
      return res.status(500).json({ error: 'Error al consultar planes.' });
    }
  });

  router.post('/subscribe', authMiddleware, async (req: any, res: Response) => {
    try {
      const userId = String(req.user.id || req.user.userId);
      const { plan_code, add_ons } = req.body;

      let channelsLimit = 1;
      let price = 9.99;
      if (plan_code === 'duo') {
        channelsLimit = 2;
        price = 18.00;
      } else if (plan_code === 'omni3') {
        channelsLimit = 3;
        price = 24.99;
      }

      const commentAutomation = add_ons?.includes('comment_automation') ? 1 : 0;
      const autoPublish = add_ons?.includes('auto_publish') ? 1 : 0;
      const extraChannels = Number(req.body.extra_channels) || 0;

      await pool.query(
        `INSERT INTO omnichannel_subscriptions 
          (user_id, plan_code, status, channels_limit, ai_enabled, comment_automation, auto_publish, extra_channels_count, monthly_price, currency)
         VALUES (?, ?, 'active', ?, 1, ?, ?, ?, ?, 'EUR')
         ON DUPLICATE KEY UPDATE 
           plan_code = VALUES(plan_code),
           status = 'active',
           channels_limit = VALUES(channels_limit),
           ai_enabled = 1,
           comment_automation = VALUES(comment_automation),
           auto_publish = VALUES(auto_publish),
           extra_channels_count = VALUES(extra_channels_count),
           monthly_price = VALUES(monthly_price),
           updated_at = CURRENT_TIMESTAMP`,
        [userId, plan_code || 'whatsapp', channelsLimit, commentAutomation, autoPublish, extraChannels, price]
      );

      res.json({ success: true, message: 'Plan Omnicanal activado con éxito.' });
    } catch (err: any) {
      console.error('[Omnichannel] Subscribe error:', err);
      res.status(500).json({ error: 'Error al actualizar suscripción.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Super Admin Routes (/api/admin/omnichannel/*)
  // ---------------------------------------------------------------------------
  adminRouter.get('/settings', authMiddleware, requireSuperAdmin, async (_req: any, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        "SELECT setting_key, setting_value, is_secret, updated_at FROM admin_settings WHERE setting_key LIKE 'zernio_%' OR setting_key LIKE 'omnichannel_%'"
      );
      const [subCount]: any = await pool.query(
        "SELECT COUNT(*) AS total_clients, COALESCE(SUM(monthly_price), 0) AS mrr FROM omnichannel_subscriptions WHERE status = 'active'"
      );
      const [accCount]: any = await pool.query(
        "SELECT COUNT(*) AS total_connected_channels FROM omnichannel_accounts"
      );
      const [msgCount]: any = await pool.query(
        "SELECT COUNT(*) AS total_processed_messages FROM omnichannel_messages"
      );

      res.json({
        success: true,
        settings: rows,
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
        if (val !== undefined && val !== null) {
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

  adminRouter.get('/clients', authMiddleware, requireSuperAdmin, async (_req: any, res: Response) => {
    try {
      const [clients]: any = await pool.query(
        `SELECT s.*, u.email, u.name, u.store_name,
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
