import { pool } from '../db/connection.js';
import { getMerchantContext } from './ai_sales_tools.js';
import { getUserOmnichannelSubscription, hasActiveOmnichannelSubscription } from './entitlements.js';

export type OmnichannelReadinessBlocker = {
  code: string;
  message: string;
  action: string;
};

export type OmnichannelReadiness = {
  ready: boolean;
  blockers: OmnichannelReadinessBlocker[];
  checks: {
    subscription: { active: boolean; aiEnabled: boolean };
    merchant: {
      active: boolean;
      countryConfigured: boolean;
      currencyConfigured: boolean;
      originConfigured: boolean;
    };
    channels: { connected: boolean; count: number };
    providers: { connected: boolean; count: number };
    catalog: { sellable: boolean; count: number };
    ai: {
      settingsConfigured: boolean;
      deepseekConfigured: boolean;
      zernioConfigured: boolean;
      webhookConfigured: boolean;
      capabilities: Record<string, boolean>;
    };
  };
};

function validCountry(value: unknown): boolean {
  return /^[A-Z]{2}$/.test(String(value || '').trim().toUpperCase());
}

function validCurrency(value: unknown): boolean {
  return /^[A-Z]{3}$/.test(String(value || '').trim().toUpperCase());
}

function blocker(blockers: OmnichannelReadinessBlocker[], code: string, message: string, action: string) {
  blockers.push({ code, message, action });
}

/**
 * Single server-side gate for autonomous sales. Every check is derived from
 * DoorDrop's tenant data and provider configuration; nothing is synthesized
 * when a merchant has not finished setup.
 */
export async function getOmnichannelReadiness(userId: string): Promise<OmnichannelReadiness> {
  const blockers: OmnichannelReadinessBlocker[] = [];
  const checks: OmnichannelReadiness['checks'] = {
    subscription: { active: false, aiEnabled: false },
    merchant: { active: false, countryConfigured: false, currencyConfigured: false, originConfigured: false },
    channels: { connected: false, count: 0 },
    providers: { connected: false, count: 0 },
    catalog: { sellable: false, count: 0 },
    ai: {
      settingsConfigured: false,
      deepseekConfigured: false,
      zernioConfigured: false,
      webhookConfigured: false,
      capabilities: {
        can_search_products: false,
        can_quote_shipping: false,
        can_create_orders: false,
        can_handoff_human: false
      }
    }
  };

  const [userRows]: any = await pool.query(
    'SELECT status, country, currency FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  const user = userRows?.[0];
  if (!user) {
    blocker(blockers, 'MERCHANT_NOT_FOUND', 'No se encontró el negocio vendedor.', 'Verifica que la cuenta exista y esté activa.');
    return { ready: false, blockers, checks };
  }

  checks.merchant.active = String(user.status || 'active').toLowerCase() === 'active';
  checks.merchant.countryConfigured = validCountry(user.country);
  checks.merchant.currencyConfigured = validCurrency(user.currency);
  if (!checks.merchant.active) {
    blocker(blockers, 'MERCHANT_INACTIVE', 'La cuenta del negocio no está activa.', 'Activa la cuenta desde el panel de administración.');
  }
  if (!checks.merchant.countryConfigured) {
    blocker(blockers, 'MERCHANT_COUNTRY_REQUIRED', 'El país del negocio no está configurado correctamente.', 'Configura un país ISO real de dos letras en el perfil del negocio.');
  }
  if (!checks.merchant.currencyConfigured) {
    blocker(blockers, 'MERCHANT_CURRENCY_REQUIRED', 'La moneda principal del negocio no es válida.', 'Configura una moneda ISO real de tres letras en el perfil del negocio.');
  }

  const subscription = await getUserOmnichannelSubscription(userId);
  checks.subscription.active = hasActiveOmnichannelSubscription(subscription);
  checks.subscription.aiEnabled = checks.subscription.active && Number(subscription.ai_enabled) === 1;
  if (!checks.subscription.active) {
    blocker(blockers, 'POLAR_SUBSCRIPTION_REQUIRED', 'Se necesita una suscripción Omnicanal activa.', 'Completa y mantén activa la suscripción recurrente del plan Omnicanal.');
  } else if (!checks.subscription.aiEnabled) {
    blocker(blockers, 'AI_ENTITLEMENT_REQUIRED', 'El plan activo no tiene habilitado el agente de ventas AI.', 'Activa un plan Polar que incluya el agente de ventas AI.');
  }

  try {
    const [accountRows]: any = await pool.query(
      "SELECT COUNT(*) AS count FROM omnichannel_accounts WHERE user_id = ? AND status = 'connected'",
      [userId]
    );
    checks.channels.count = Number(accountRows?.[0]?.count || 0);
    checks.channels.connected = checks.channels.count > 0;
  } catch {
    checks.channels.connected = false;
  }
  if (!checks.channels.connected) {
    blocker(blockers, 'CHANNEL_REQUIRED', 'No hay ningún canal social conectado y activo.', 'Conecta al menos un canal oficial desde Omnicanal > Canales.');
  }

  let merchant: any = null;
  try { merchant = await getMerchantContext(userId); } catch { merchant = null; }
  checks.merchant.originConfigured = Boolean(
    merchant?.origin?.country && merchant?.origin?.zipCode
  );
  if (!checks.merchant.originConfigured) {
    blocker(blockers, 'PICKUP_ORIGIN_REQUIRED', 'Falta una dirección real de recogida.', 'Configura país y código postal en una dirección de recogida, empresa o remitente.');
  }

  try {
    const [providerRows]: any = await pool.query(
      'SELECT COUNT(*) AS count FROM providers WHERE is_active = 1 AND is_connected = 1',
    );
    checks.providers.count = Number(providerRows?.[0]?.count || 0);
    checks.providers.connected = checks.providers.count > 0;
  } catch {
    checks.providers.connected = false;
  }
  if (!checks.providers.connected) {
    blocker(blockers, 'SHIPPING_PROVIDER_REQUIRED', 'No hay un proveedor de transporte activo y conectado.', 'Conecta y valida al menos un proveedor real desde el área de transportistas.');
  }

  try {
    const [listingRows]: any = await pool.query(
      "SELECT COUNT(*) AS count FROM marketplace_listings WHERE status = 'active' AND COALESCE(quantity, 0) > 0 AND seller_id = ?",
      [userId]
    );
    checks.catalog.count = Number(listingRows?.[0]?.count || 0);
    checks.catalog.sellable = checks.catalog.count > 0;
  } catch {
    checks.catalog.sellable = false;
  }
  if (!checks.catalog.sellable) {
    blocker(blockers, 'SELLABLE_CATALOG_REQUIRED', 'El negocio no tiene productos reales activos con stock disponible.', 'Publica al menos un producto activo y disponible en el Marketplace.');
  }

  let adminSettings: Record<string, string> = {};
  try {
    const [settingsRows]: any = await pool.query(
      `SELECT setting_key, setting_value
         FROM admin_settings
        WHERE setting_key IN ('deepseek_api_key', 'zernio_api_key', 'zernio_webhook_secret')`
    );
    adminSettings = Object.fromEntries(
      (settingsRows || []).map((row: any) => [String(row.setting_key), String(row.setting_value || '').trim()])
    );
  } catch {
    adminSettings = {};
  }

  checks.ai.deepseekConfigured = Boolean(String(process.env.DEEPSEEK_API_KEY || '').trim() || adminSettings.deepseek_api_key);
  checks.ai.zernioConfigured = Boolean(adminSettings.zernio_api_key);
  checks.ai.webhookConfigured = Boolean(adminSettings.zernio_webhook_secret);
  if (!checks.ai.deepseekConfigured) {
    blocker(blockers, 'DEEPSEEK_CONFIGURATION_REQUIRED', 'El motor AI no está configurado.', 'Configura la credencial de DeepSeek desde el área segura de Super Admin.');
  }
  if (!checks.ai.zernioConfigured) {
    blocker(blockers, 'ZERNIO_CONFIGURATION_REQUIRED', 'El gateway de canales no está configurado.', 'Configura la credencial segura del gateway omnicanal en Super Admin.');
  }
  if (!checks.ai.webhookConfigured) {
    blocker(blockers, 'WEBHOOK_CONFIGURATION_REQUIRED', 'La firma de webhooks no está configurada.', 'Configura el secreto de webhooks del gateway en Super Admin.');
  }

  const [aiRows]: any = await pool.query(
    'SELECT can_search_products, can_quote_shipping, can_create_orders, can_handoff_human FROM omnichannel_ai_settings WHERE user_id = ? LIMIT 1',
    [userId]
  );
  const aiSettings = aiRows?.[0];
  checks.ai.settingsConfigured = Boolean(aiSettings);
  if (!aiSettings) {
    blocker(blockers, 'AI_SETTINGS_REQUIRED', 'El agente todavía no tiene una configuración guardada.', 'Guarda la configuración del agente desde Omnicanal > Empleado AI.');
  } else {
    for (const capability of Object.keys(checks.ai.capabilities)) {
      checks.ai.capabilities[capability] = Number(aiSettings[capability]) === 1;
      if (!checks.ai.capabilities[capability]) {
        blocker(
          blockers,
          `AI_CAPABILITY_${capability.toUpperCase()}_REQUIRED`,
          `La capacidad ${capability.replace(/^can_/, '').replace(/_/g, ' ')} es obligatoria para activar las ventas autónomas.`,
          'Activa esta capacidad y guarda la configuración del agente.'
        );
      }
    }
  }

  return { ready: blockers.length === 0, blockers, checks };
}
