import { pool } from '../db/connection.js';

export type OmnichannelSubscription = {
  id?: number;
  user_id: string;
  plan_code: string | null;
  status: string;
  provider?: string | null;
  provider_subscription_id?: string | null;
  provider_customer_id?: string | null;
  polar_product_id?: string | null;
  channels_limit: number;
  ai_enabled: number;
  comment_automation: number;
  auto_publish: number;
  extra_channels_count: number;
  monthly_price: number;
  currency: string;
  renews_at?: Date | string | null;
  current_period_start?: Date | string | null;
  current_period_end?: Date | string | null;
  cancel_at_period_end?: number;
  last_payment_status?: string | null;
  last_provider_event_id?: string | null;
  metadata_json?: string | null;
  is_active: boolean;
  total_channels_limit: number;
};

function isDateInFuture(value: unknown): boolean {
  if (!value) return true;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) && time > Date.now();
}

export function hasActiveOmnichannelSubscription(subscription: any): boolean {
  if (!subscription) return false;
  return subscription.provider === 'polar'
    && String(subscription.status || '').toLowerCase() === 'active'
    && isDateInFuture(subscription.current_period_end || subscription.renews_at);
}

function normalizeSubscription(row: any, userId: string): OmnichannelSubscription {
  const normalized = row || {
    user_id: userId,
    plan_code: null,
    status: 'not_subscribed',
    provider: null,
    channels_limit: 0,
    ai_enabled: 0,
    comment_automation: 0,
    auto_publish: 0,
    extra_channels_count: 0,
    monthly_price: 0,
    currency: 'USD'
  };

  const active = hasActiveOmnichannelSubscription(normalized);
  const channels = active ? Math.max(0, Number(normalized.channels_limit || 0)) : 0;
  const extras = active ? Math.max(0, Number(normalized.extra_channels_count || 0)) : 0;

  return {
    ...normalized,
    plan_code: normalized.plan_code || null,
    status: String(normalized.status || 'not_subscribed'),
    channels_limit: channels,
    ai_enabled: active ? Number(normalized.ai_enabled || 0) : 0,
    comment_automation: active ? Number(normalized.comment_automation || 0) : 0,
    auto_publish: active ? Number(normalized.auto_publish || 0) : 0,
    extra_channels_count: extras,
    monthly_price: Number(normalized.monthly_price || 0),
    currency: String(normalized.currency || 'USD').toUpperCase(),
    is_active: active,
    total_channels_limit: channels + extras
  };
}

/**
 * Reads the user's entitlement without creating an implicit trial or active row.
 * A payment-backed Polar subscription is the only state that grants access.
 */
export async function getUserOmnichannelSubscription(userId: string): Promise<OmnichannelSubscription> {
  const [rows]: any = await pool.query(
    'SELECT * FROM omnichannel_subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1',
    [userId]
  );
  return normalizeSubscription(rows?.[0], userId);
}

export async function getOmnichannelPlanByRef(planRef: string): Promise<any | null> {
  const ref = String(planRef || '').trim();
  if (!ref) return null;
  const [rows]: any = await pool.query(
    `SELECT *
       FROM omnichannel_plan_catalog
      WHERE is_active = 1 AND (id = ? OR code = ?)
      LIMIT 1`,
    [ref, ref]
  );
  return rows?.[0] || null;
}

export async function getOmnichannelPlanByPolarProduct(productId: string): Promise<any | null> {
  const ref = String(productId || '').trim();
  if (!ref) return null;
  const [rows]: any = await pool.query(
    `SELECT *
       FROM omnichannel_plan_catalog
      WHERE is_active = 1 AND polar_product_id = ?
      LIMIT 1`,
    [ref]
  );
  return rows?.[0] || null;
}

export function parseCatalogJson(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
