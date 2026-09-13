/** Persist guest-selected quote until login/register completes purchase. */

export const GUEST_QUOTE_KEY = 'ship24go_guest_quote_v1';
const TTL_MS = 24 * 60 * 60 * 1000;

export type GuestQuoteSession = {
  token: string;
  createdAt: number;
  expiresAt: number;
  form: {
    originCountry?: string;
    originZip?: string;
    originCity?: string;
    destCountry?: string;
    destZip?: string;
    destCity?: string;
    packages?: any[];
    currency?: string;
  };
  quote: any;
  quoteId: string;
};

function randomToken(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return (
    'gqt_' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function saveGuestQuoteSession(input: {
  form: GuestQuoteSession['form'];
  quote: any;
}): GuestQuoteSession {
  const now = Date.now();
  const quoteId = String(input.quote?.id || input.quote?.quoteId || '').trim();
  const session: GuestQuoteSession = {
    token: randomToken(),
    createdAt: now,
    expiresAt: now + TTL_MS,
    form: {
      originCountry: input.form?.originCountry,
      originZip: input.form?.originZip,
      originCity: input.form?.originCity,
      destCountry: input.form?.destCountry,
      destZip: input.form?.destZip,
      destCity: input.form?.destCity,
      packages: Array.isArray(input.form?.packages) ? input.form.packages : undefined,
      currency: input.form?.currency || input.quote?.currency || 'EUR',
    },
    quote: input.quote,
    quoteId,
  };
  try {
    localStorage.setItem(GUEST_QUOTE_KEY, JSON.stringify(session));
  } catch {}
  return session;
}

export function loadGuestQuoteSession(): GuestQuoteSession | null {
  try {
    const raw = localStorage.getItem(GUEST_QUOTE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as GuestQuoteSession;
    if (!data?.token || !data?.quoteId || !data?.quote) return null;
    if (Number(data.expiresAt || 0) < Date.now()) {
      clearGuestQuoteSession();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearGuestQuoteSession() {
  try {
    localStorage.removeItem(GUEST_QUOTE_KEY);
  } catch {}
}

/** Build react-router state for /panel/quote after auth */
export function guestSessionToPanelState(session: GuestQuoteSession) {
  return {
    prefill: {
      ...session.form,
      packages: session.form.packages,
      selectedQuoteId: session.quoteId,
    },
    guestQuote: session.quote,
    guestToken: session.token,
    autoSelectQuote: true,
  };
}
