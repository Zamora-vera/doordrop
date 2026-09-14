import https from 'https';
import crypto from 'crypto';
import { pool } from '../db/connection.js';
export {
  getUserOmnichannelSubscription,
  hasActiveOmnichannelSubscription,
  getOmnichannelPlanByRef,
  getOmnichannelPlanByPolarProduct,
  parseCatalogJson
} from './entitlements.js';

export interface ZernioRequestOptions {
  method?: string;
  body?: any;
  profileId?: string;
  queryParams?: Record<string, string | number | boolean | undefined>;
}

// Global cached config
let cachedApiKey = '';
let cachedWebhookSecret = '';
let cachedApiUrl = 'https://zernio.com/api/v1';

export async function getZernioSettings() {
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

export async function callZernio(endpoint: string, options: ZernioRequestOptions = {}) {
  const { apiKey, apiUrl } = await getZernioSettings();
  const method = options.method || 'GET';
  
  let fullUrl = endpoint.startsWith('http') ? endpoint : `${apiUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  if (options.queryParams) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(options.queryParams)) {
      if (v !== undefined && v !== null) sp.append(k, String(v));
    }
    const qStr = sp.toString();
    if (qStr) {
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + qStr;
    }
  }

  const parsedUrl = new URL(fullUrl);
  const data = options.body ? JSON.stringify(options.body) : null;

  return new Promise<{ status: number; data: any }>((resolve, reject) => {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json'
    };

    if (options.profileId) {
      headers['X-Profile-Id'] = options.profileId;
    }

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
      reject(new Error('Zernio API request timed out (20s)'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

/**
 * Ensures an isolated Zernio Profile exists for a given DoorDrop user.
 * Prevents account overlap or leakage across multi-tenant clients.
 */
export async function getOrCreateUserProfile(userId: string, userName?: string): Promise<string> {
  const [existing]: any = await pool.query(
    "SELECT zernio_profile_id FROM omnichannel_profiles WHERE user_id = ? LIMIT 1",
    [userId]
  );

  if (existing.length > 0 && existing[0].zernio_profile_id) {
    return existing[0].zernio_profile_id;
  }

  // Create profile in Zernio
  const profileName = `DoorDrop User #${userId}${userName ? ' - ' + userName : ''}`;
  try {
    const resp = await callZernio('/profiles', {
      method: 'POST',
      body: { name: profileName }
    });

    const zernioProfileId = resp.data?.profile?._id || resp.data?._id || resp.data?.id;
    if (!zernioProfileId) {
      throw new Error(`Invalid profile creation response from Zernio: ${JSON.stringify(resp.data)}`);
    }

    await pool.query(
      `INSERT INTO omnichannel_profiles (user_id, zernio_profile_id, profile_name, is_active)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE zernio_profile_id = VALUES(zernio_profile_id), updated_at = CURRENT_TIMESTAMP`,
      [userId, zernioProfileId, profileName]
    );

    return zernioProfileId;
  } catch (err: any) {
    console.error(`[Omnichannel] Failed to create profile for user ${userId}:`, err.message);
    throw err;
  }
}

/**
 * HMAC-SHA256 verification for incoming Zernio Webhook events
 */
export function verifyZernioWebhookSignature(rawBody: string, signatureHeader?: string, secret?: string): boolean {
  if (!signatureHeader) return false;
  const hmacSecret = secret || cachedWebhookSecret;
  try {
    // Signature header might be raw hex or sha256=...
    const cleanSig = signatureHeader.replace(/^sha256=/, '').trim();
    const computed = crypto.createHmac('sha256', hmacSecret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(cleanSig, 'hex'), Buffer.from(computed, 'hex'));
  } catch (err) {
    console.error('[Omnichannel] Webhook signature verification error:', err);
    return false;
  }
}
