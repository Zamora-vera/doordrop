import path from 'node:path';
import { access, mkdir } from 'node:fs/promises';
import QRCode from 'qrcode';

export type InternalWhatsappStatus =
  | 'disabled'
  | 'idle'
  | 'starting'
  | 'qr'
  | 'authenticated'
  | 'ready'
  | 'auth_failure'
  | 'disconnected'
  | 'error';

export type InternalWhatsappSnapshot = {
  enabled: boolean;
  mode: 'whatsapp_web';
  status: InternalWhatsappStatus;
  qrDataUrl: string | null;
  qrIssuedAt: string | null;
  phoneNumber: string | null;
  lastError: string | null;
  readyAt: string | null;
  sessionConfigured: boolean;
};

type MessageHandler = (message: any) => Promise<void>;
type StatusHandler = (snapshot: InternalWhatsappSnapshot) => Promise<void> | void;

const CLIENT_ID = 'doordrop-internal';
const DEFAULT_DATA_PATH = path.join(process.cwd(), 'data', 'whatsapp-internal');
const WHATSAPP_BROWSER_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

let client: any | null = null;
let initialization: Promise<void> | null = null;
let messageHandler: MessageHandler | null = null;
let statusHandler: StatusHandler | null = null;
let snapshot: InternalWhatsappSnapshot = {
  enabled: process.env.WHATSAPP_INTERNAL_ENABLED !== 'false',
  mode: 'whatsapp_web',
  status: process.env.WHATSAPP_INTERNAL_ENABLED === 'false' ? 'disabled' : 'idle',
  qrDataUrl: null,
  qrIssuedAt: null,
  phoneNumber: null,
  lastError: null,
  readyAt: null,
  sessionConfigured: false
};

function dataPath(): string {
  return process.env.WHATSAPP_INTERNAL_DATA_PATH || DEFAULT_DATA_PATH;
}

export async function hasPersistedInternalWhatsappSession(): Promise<boolean> {
  if (!snapshot.enabled) return false;
  try {
    await access(path.join(dataPath(), `session-${CLIENT_ID}`));
    return true;
  } catch {
    return false;
  }
}

function chromePath(): string | undefined {
  const value = String(process.env.WHATSAPP_INTERNAL_CHROME_PATH || '').trim();
  return value || undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizedError(error: unknown): string {
  const value = String((error as any)?.message || error || 'Error desconocido').replace(/[\r\n]+/g, ' ').trim();
  return value.slice(0, 500);
}

function publicSnapshot(): InternalWhatsappSnapshot {
  return { ...snapshot };
}

async function publish(): Promise<void> {
  const current = publicSnapshot();
  try { await statusHandler?.(current); } catch (error) { console.error('[Admin Assistance] WhatsApp status handler error:', sanitizedError(error)); }
}

function setState(next: Partial<InternalWhatsappSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  void publish();
}

async function createClient(): Promise<any> {
  // Set the cache before loading whatsapp-web.js. Puppeteer reads its cache
  // directory while the package is initialized, and production keeps this
  // directory on the application volume across container restarts.
  process.env.PUPPETEER_CACHE_DIR ||= path.join(process.cwd(), '.cache', 'puppeteer');
  const whatsappModule: any = await import('whatsapp-web.js');
  const whatsappPackage = whatsappModule.default || whatsappModule;
  const { Client, LocalAuth } = whatsappPackage;
  const executablePath = chromePath();
  return new Client({
    authStrategy: new LocalAuth({ clientId: CLIENT_ID, dataPath: dataPath() }),
    puppeteer: {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        `--user-agent=${WHATSAPP_BROWSER_USER_AGENT}`
      ]
    },
    // whatsapp-web.js calls page.setUserAgent() before Puppeteer has attached
    // its main frame on some Linux/Puppeteer combinations. Supplying the same
    // value as a Chrome launch argument avoids that race without using Zernio.
    userAgent: false,
    qrMaxRetries: 0,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 10000
  });
}

function registerClientEvents(nextClient: any): void {
  nextClient.on('qr', async (rawQr: string) => {
    try {
      const qrDataUrl = await QRCode.toDataURL(rawQr, {
        width: 360,
        margin: 2,
        errorCorrectionLevel: 'M'
      });
      setState({ status: 'qr', qrDataUrl, qrIssuedAt: nowIso(), lastError: null, sessionConfigured: false });
    } catch (error) {
      setState({ status: 'error', lastError: `No se pudo generar el QR: ${sanitizedError(error)}` });
    }
  });

  nextClient.on('authenticated', () => {
    setState({ status: 'authenticated', qrDataUrl: null, qrIssuedAt: null, lastError: null, sessionConfigured: true });
  });

  nextClient.on('ready', () => {
    const phone = String(nextClient.info?.wid?.user || '').trim();
    setState({ status: 'ready', qrDataUrl: null, qrIssuedAt: null, phoneNumber: phone ? `+${phone}` : null, readyAt: nowIso(), lastError: null, sessionConfigured: true });
  });

  nextClient.on('auth_failure', (message: string) => {
    setState({ status: 'auth_failure', qrDataUrl: null, qrIssuedAt: null, lastError: sanitizedError(message), sessionConfigured: false });
  });

  nextClient.on('disconnected', (reason: string) => {
    setState({ status: 'disconnected', qrDataUrl: null, qrIssuedAt: null, lastError: sanitizedError(reason), sessionConfigured: false });
  });

  nextClient.on('message', (message: any) => {
    if (!messageHandler) return;
    void messageHandler(message).catch((error) => console.error('[Admin Assistance] WhatsApp inbound handler error:', sanitizedError(error)));
  });
}

export function getInternalWhatsappStatus(): InternalWhatsappSnapshot {
  return publicSnapshot();
}

export function setInternalWhatsappMessageHandler(handler: MessageHandler | null): void {
  messageHandler = handler;
}

export function setInternalWhatsappStatusHandler(handler: StatusHandler | null): void {
  statusHandler = handler;
}

export async function startInternalWhatsapp(): Promise<InternalWhatsappSnapshot> {
  if (!snapshot.enabled) throw new Error('El conector WhatsApp interno está desactivado.');
  if (snapshot.status === 'ready' && client) return publicSnapshot();
  if (initialization) return publicSnapshot();

  setState({ status: 'starting', qrDataUrl: null, qrIssuedAt: null, lastError: null });
  const pending = (async () => {
    await mkdir(dataPath(), { recursive: true });
    if (!client) {
      client = await createClient();
      registerClientEvents(client);
    }
    try {
      await client.initialize();
    } catch (error) {
      setState({ status: 'error', lastError: sanitizedError(error), qrDataUrl: null, qrIssuedAt: null });
      try { await client.destroy(); } catch {}
      client = null;
      throw error;
    }
  })();
  initialization = pending;
  void pending.finally(() => {
    if (initialization === pending) initialization = null;
  }).catch(() => undefined);
  return publicSnapshot();
}

export async function sendInternalWhatsappMessage(chatId: string, text: string): Promise<any> {
  if (!client || snapshot.status !== 'ready') throw new Error('WhatsApp interno no está conectado. Genera el QR y vincula el teléfono primero.');
  const normalizedChatId = String(chatId || '').trim();
  const normalizedText = String(text || '').trim().slice(0, 12000);
  if (!normalizedChatId || !normalizedText) throw new Error('El destinatario y el mensaje son obligatorios.');
  return client.sendMessage(normalizedChatId, normalizedText);
}

export async function logoutInternalWhatsapp(): Promise<InternalWhatsappSnapshot> {
  if (initialization) await initialization.catch(() => undefined);
  const current = client;
  client = null;
  setState({ status: snapshot.enabled ? 'idle' : 'disabled', qrDataUrl: null, qrIssuedAt: null, phoneNumber: null, readyAt: null, lastError: null, sessionConfigured: false });
  if (current) {
    try { await current.logout(); } catch {}
    try { await current.destroy(); } catch {}
  }
  return publicSnapshot();
}
