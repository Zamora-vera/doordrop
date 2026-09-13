/**
 * Persist guest marketplace chat intent with cookie & localStorage token
 * until user completes registration/login, then automatically connects to active chat.
 */

export const GUEST_CHAT_KEY = 'dd_guest_chat_intent';
const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export type GuestChatIntent = {
  token: string;
  listingId: string;
  listingSlug?: string;
  listingTitle?: string;
  sellerId?: string;
  sellerName?: string;
  message?: string;
  createdAt: number;
  expiresAt: number;
};

function randomChatToken(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return (
    'gct_' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

// Cookie helpers
function setCookie(name: string, value: string, maxAgeSec: number) {
  try {
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; SameSite=Lax`;
  } catch (e) {
    console.error('Failed to set cookie', e);
  }
}

function getCookie(name: string): string | null {
  try {
    const prefix = `${encodeURIComponent(name)}=`;
    const parts = document.cookie.split('; ');
    for (const part of parts) {
      if (part.startsWith(prefix)) {
        return decodeURIComponent(part.substring(prefix.length));
      }
    }
  } catch (e) {
    console.error('Failed to read cookie', e);
  }
  return null;
}

function deleteCookie(name: string) {
  try {
    document.cookie = `${encodeURIComponent(name)}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  } catch (e) {}
}

export function saveGuestChatIntent(input: {
  listingId: string;
  listingSlug?: string;
  listingTitle?: string;
  sellerId?: string;
  sellerName?: string;
  message?: string;
}): GuestChatIntent {
  const now = Date.now();
  const session: GuestChatIntent = {
    token: randomChatToken(),
    listingId: String(input.listingId || '').trim(),
    listingSlug: input.listingSlug,
    listingTitle: input.listingTitle,
    sellerId: input.sellerId,
    sellerName: input.sellerName,
    message: (input.message || '').trim(),
    createdAt: now,
    expiresAt: now + TTL_SECONDS * 1000,
  };

  const json = JSON.stringify(session);

  // 1. Persist in Cookie
  setCookie(GUEST_CHAT_KEY, json, TTL_SECONDS);

  // 2. Persist in LocalStorage
  try {
    localStorage.setItem(GUEST_CHAT_KEY, json);
  } catch {}

  return session;
}

export function loadGuestChatIntent(): GuestChatIntent | null {
  try {
    // 1. Try reading cookie first
    let raw = getCookie(GUEST_CHAT_KEY);
    // 2. Fallback to localStorage
    if (!raw) {
      raw = localStorage.getItem(GUEST_CHAT_KEY);
    }
    if (!raw) return null;

    const data = JSON.parse(raw) as GuestChatIntent;
    if (!data?.token || !data?.listingId) return null;
    if (Number(data.expiresAt || 0) < Date.now()) {
      clearGuestChatIntent();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearGuestChatIntent() {
  deleteCookie(GUEST_CHAT_KEY);
  try {
    localStorage.removeItem(GUEST_CHAT_KEY);
  } catch {}
}
