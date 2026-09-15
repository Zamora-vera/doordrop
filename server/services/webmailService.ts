import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import sanitizeHtml from 'sanitize-html';
import { buildWebmailMimeMessage, getTransporter, sendWebmailMessage, WebmailAttachmentInput } from './emailService';

export type WebmailFolderKey = 'inbox' | 'unread' | 'starred' | 'sent' | 'drafts' | 'spam' | 'trash' | 'archive';

export interface WebmailComposeInput {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: WebmailAttachmentInput[];
  inReplyTo?: string;
  references?: string | string[];
}

export class WebmailServiceError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'WebmailServiceError';
    this.code = code;
  }
}

const FOLDER_DEFINITIONS: Array<{ key: WebmailFolderKey; label: string; specialUses: string[]; names: string[] }> = [
  { key: 'inbox', label: 'Recibidos', specialUses: ['\\inbox'], names: ['inbox', 'recibidos'] },
  { key: 'sent', label: 'Enviados', specialUses: ['\\sent'], names: ['sent', 'sent items', 'enviados', 'inviati'] },
  { key: 'drafts', label: 'Borradores', specialUses: ['\\drafts'], names: ['drafts', 'draft', 'borradores', 'bozze'] },
  { key: 'spam', label: 'Spam', specialUses: ['\\junk', '\\spam'], names: ['spam', 'junk', 'junk e-mail', 'correo no deseado'] },
  { key: 'trash', label: 'Papelera', specialUses: ['\\trash'], names: ['trash', 'deleted', 'deleted items', 'papelera', 'cestino'] },
  { key: 'archive', label: 'Archivo', specialUses: ['\\archive'], names: ['archive', 'archivo', 'archivio'] }
];

const LIST_FOLDER_KEYS = new Set<WebmailFolderKey>(['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive']);
const VIRTUAL_FOLDER_KEYS = new Set<WebmailFolderKey>(['unread', 'starred']);
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 8;
const MAX_MESSAGE_SOURCE_BYTES = 8 * 1024 * 1024;

let lastSuccessfulSyncAt: string | null = null;

function configuredImap() {
  const host = String(process.env.IMAP_HOST || process.env.MAILBOX_HOST || 'mail.doordrop.lat').trim();
  const port = Number(process.env.IMAP_PORT || process.env.MAILBOX_PORT || 993) || 993;
  const secure = process.env.IMAP_SECURE !== undefined
    ? process.env.IMAP_SECURE === 'true'
    : (process.env.MAILBOX_SECURE !== undefined ? process.env.MAILBOX_SECURE === 'true' : port === 993);
  const user = String(process.env.IMAP_USER || process.env.MAILBOX_USER || process.env.MAIL_FROM_EMAIL || 'info@doordrop.lat').trim();
  const pass = String(process.env.IMAP_PASS || process.env.MAILBOX_PASS || '');
  return { host, port, secure, user, pass };
}

function ensureImapCredentials() {
  const config = configuredImap();
  if (!config.host || !config.user || !config.pass) {
    throw new WebmailServiceError('MAILBOX_NOT_CONFIGURED', 'El buzón corporativo aún no está configurado.');
  }
  return config;
}

function newImapClient(): ImapFlow {
  const config = ensureImapCredentials();
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    tls: {
      servername: config.host,
      rejectUnauthorized: true
    },
    socketTimeout: 15_000,
    greetingTimeout: 10_000,
    logger: false
  });
}

async function withImap<T>(operation: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = newImapClient();
  try {
    await client.connect();
    const result = await operation(client);
    lastSuccessfulSyncAt = new Date().toISOString();
    return result;
  } catch (error: any) {
    if (error instanceof WebmailServiceError) throw error;
    const wrapped = new WebmailServiceError('MAILBOX_UNAVAILABLE', 'No se pudo conectar con el servicio de correo.');
    (wrapped as any).causeCode = String(error?.code || 'imap_error').slice(0, 80);
    throw wrapped;
  } finally {
    try {
      if (client.usable) await client.logout();
    } catch {
      // La operación principal ya tiene su resultado; no registrar credenciales ni trazas.
    }
  }
}

function normalizeFolderName(value: any): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function listMailboxes(client: ImapFlow): Promise<any[]> {
  const folders = await client.list();
  return (folders || []).filter((folder: any) => folder?.path);
}

function folderMatches(definition: typeof FOLDER_DEFINITIONS[number], folder: any): boolean {
  const specialUse = String(folder?.specialUse || '').toLowerCase();
  const name = normalizeFolderName(folder?.name || folder?.path);
  const path = normalizeFolderName(folder?.path);
  return definition.specialUses.includes(specialUse)
    || definition.names.some((candidate) => candidate === name || candidate === path);
}

function findFolder(folders: any[], key: WebmailFolderKey): any | null {
  if (key === 'unread' || key === 'starred') return findFolder(folders, 'inbox');
  const definition = FOLDER_DEFINITIONS.find((item) => item.key === key);
  if (!definition) return null;
  return folders.find((folder) => folderMatches(definition, folder)) || null;
}

function physicalFolderAllowed(folders: any[], requestedPath: string): any | null {
  const normalizedRequested = String(requestedPath || '').trim();
  if (!normalizedRequested || normalizedRequested.length > 255) return null;
  return folders.find((folder) => String(folder.path) === normalizedRequested) || null;
}

function folderKeyForPath(folders: any[], path: string): WebmailFolderKey | 'custom' {
  for (const definition of FOLDER_DEFINITIONS) {
    const found = folders.find((folder) => String(folder.path) === path && folderMatches(definition, folder));
    if (found) return definition.key;
  }
  return 'custom';
}

function friendlyFolderLabel(key: WebmailFolderKey): string {
  return FOLDER_DEFINITIONS.find((item) => item.key === key)?.label || 'Correo';
}

function addressValue(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (value.address) return String(value.address).trim();
  if (value.mailbox && value.host) return `${value.mailbox}@${value.host}`;
  return '';
}

function addressName(value: any): string {
  if (!value || typeof value === 'string') return '';
  return String(value.name || '').trim();
}

function addressList(values: any): string[] {
  const list = Array.isArray(values) ? values : (values?.value || []);
  return list.map((value: any) => addressValue(value)).filter(Boolean).slice(0, 100);
}

function addressListDisplay(values: any): Array<{ name: string; address: string }> {
  const list = Array.isArray(values) ? values : (values?.value || []);
  return list
    .map((value: any) => ({ name: addressName(value), address: addressValue(value) }))
    .filter((value: any) => value.address)
    .slice(0, 100);
}

function cleanText(value: any, maxLength = 1000): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeWebmailHtml(value: any): string {
  return sanitizeHtml(String(value || ''), {
    allowedTags: [
      'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3',
      'hr', 'i', 'li', 'ol', 'p', 'pre', 's', 'strong', 'table', 'tbody', 'td',
      'th', 'thead', 'tr', 'u', 'ul'
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer nofollow'
        }
      })
    }
  });
}

function sourceToBuffer(source: any): Buffer {
  if (Buffer.isBuffer(source)) return source;
  if (source instanceof Uint8Array) return Buffer.from(source);
  return Buffer.from(String(source || ''));
}

function subjectFrom(message: any, parsed: any): string {
  return cleanText(message?.envelope?.subject || parsed?.subject || '(Sin asunto)', 255) || '(Sin asunto)';
}

function dateFrom(message: any, parsed: any): string {
  const value = message?.internalDate || parsed?.date || message?.envelope?.date;
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function serializeMessage(message: any, mailbox: string, full = false): Promise<any> {
  const source = sourceToBuffer(message?.source);
  if (!source.length || source.length > MAX_MESSAGE_SOURCE_BYTES) {
    throw new WebmailServiceError('MESSAGE_TOO_LARGE', 'El mensaje no se puede mostrar en este momento.');
  }

  const parsed = await simpleParser(source, { skipHtmlToText: false });
  const fromObject = message?.envelope?.from?.[0] || parsed?.from?.value?.[0];
  const recipients = {
    to: addressListDisplay(message?.envelope?.to || parsed?.to),
    cc: addressListDisplay(message?.envelope?.cc || parsed?.cc),
    bcc: addressListDisplay(message?.envelope?.bcc || parsed?.bcc)
  };
  const text = cleanText(parsed?.text || '', full ? 200_000 : 700);
  const html = sanitizeWebmailHtml(parsed?.html || (text ? `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>` : ''));
  const attachments = (parsed?.attachments || []).slice(0, MAX_ATTACHMENTS).map((attachment: any, index: number) => ({
    index,
    filename: String(attachment.filename || `archivo-${index + 1}`).replace(/[\\/\r\n]+/g, '_').slice(0, 180),
    contentType: String(attachment.contentType || 'application/octet-stream').slice(0, 120),
    size: Number(attachment.size || attachment.content?.length || 0),
    contentId: attachment.cid ? String(attachment.cid).slice(0, 180) : null
  }));

  const result = {
    uid: String(message.uid || message.seq || ''),
    mailbox,
    subject: subjectFrom(message, parsed),
    preview: text.slice(0, 320),
    date: dateFrom(message, parsed),
    read: Array.from(message?.flags || []).some((flag: any) => String(flag).toLowerCase() === '\\seen'),
    starred: Array.from(message?.flags || []).some((flag: any) => String(flag).toLowerCase() === '\\flagged'),
    hasAttachments: attachments.length > 0,
    attachmentCount: attachments.length,
    from: {
      name: addressName(fromObject),
      address: addressValue(fromObject)
    },
    ...recipients,
    messageId: String(parsed?.messageId || message?.envelope?.messageId || '').slice(0, 998),
    inReplyTo: String(parsed?.inReplyTo || '').slice(0, 998),
    references: Array.isArray(parsed?.references) ? parsed.references.slice(0, 50).map(String) : [],
    attachments
  };

  if (full) {
    return {
      ...result,
      text,
      html,
      replyTo: addressListDisplay(parsed?.replyTo || message?.envelope?.replyTo),
      sentAt: dateFrom(message, parsed)
    };
  }
  return result;
}

async function fetchBySequenceRange(client: ImapFlow, mailbox: string, page: number, pageSize: number, criteria: any = {}): Promise<any[]> {
  const status: any = await client.status(mailbox, { messages: true, unseen: true });
  const total = Number(status?.messages || 0);
  if (!total) return [];
  if (Object.keys(criteria).length) {
    const uids: number[] = (await client.search(criteria, { uid: true })) || [];
    const selected = uids.slice().sort((a, b) => b - a).slice((page - 1) * pageSize, page * pageSize);
    if (!selected.length) return [];
    const messages: any[] = [];
    for await (const message of client.fetch(selected.join(','), {
      source: true,
      envelope: true,
      flags: true,
      internalDate: true
    }, { uid: true })) {
      messages.push(message);
    }
    return messages;
  }

  const end = total - ((page - 1) * pageSize);
  const start = Math.max(1, end - pageSize + 1);
  if (start > end) return [];
  const messages: any[] = [];
  for await (const message of client.fetch(`${start}:${end}`, {
    source: true,
    envelope: true,
    flags: true,
    internalDate: true
  })) {
    messages.push(message);
  }
  return messages.sort((a, b) => Number(b.uid || b.seq) - Number(a.uid || a.seq));
}

async function virtualFolderMessages(client: ImapFlow, folders: any[], key: 'unread' | 'starred', page: number, pageSize: number): Promise<{ message: any; mailbox: string }[]> {
  const results: { message: any; mailbox: string }[] = [];
  const criteria = key === 'unread' ? { seen: false } : { flagged: true };
  const candidates = folders
    .filter((folder) => folder?.path && !folderMatches(FOLDER_DEFINITIONS[3], folder) && !folderMatches(FOLDER_DEFINITIONS[4], folder))
    .slice(0, 12);

  for (const folder of candidates) {
    try {
      await client.mailboxOpen(folder.path, { readOnly: true });
      const messages = await fetchBySequenceRange(client, folder.path, 1, Math.max(pageSize * 2, 40), criteria);
      for (const message of messages) results.push({ message, mailbox: String(folder.path) });
    } catch {
      // Una carpeta individual no debe hacer caer la bandeja completa.
    }
  }
  results.sort((left, right) => new Date(right.message.internalDate || 0).getTime() - new Date(left.message.internalDate || 0).getTime());
  return results.slice((page - 1) * pageSize, page * pageSize);
}

export async function getWebmailStatus(options: { verify?: boolean } = {}): Promise<any> {
  const config = configuredImap();
  let receiveStatus: 'operational' | 'not_configured' | 'unavailable' = config.pass ? 'unavailable' : 'not_configured';
  let sendStatus: 'operational' | 'unavailable' = 'unavailable';
  if (config.pass && options.verify) {
    try {
      await withImap(async (client) => {
        await client.list();
        return true;
      });
      receiveStatus = 'operational';
    } catch {
      receiveStatus = 'unavailable';
    }
  }
  try {
    await getTransporter().verify();
    sendStatus = 'operational';
  } catch {
    sendStatus = 'unavailable';
  }
  return {
    success: true,
    account: config.user || 'info@doordrop.lat',
    senderName: process.env.MAIL_FROM_NAME || 'DoorDrop',
    senderEmail: 'info@doordrop.lat',
    receiveStatus,
    sendStatus,
    imapConfigured: Boolean(config.pass),
    lastSyncAt: lastSuccessfulSyncAt,
    imap: {
      host: config.host,
      port: config.port,
      secure: config.secure
    }
  };
}

export async function verifyWebmailConnection(): Promise<any> {
  ensureImapCredentials();
  await withImap(async (client) => {
    await client.list();
    return true;
  });
  const status = await getWebmailStatus({ verify: false });
  return { ...status, receiveStatus: 'operational' };
}

export async function getWebmailFolders(): Promise<any[]> {
  return withImap(async (client) => {
    const folders = await listMailboxes(client);
    const result: any[] = [];
    for (const definition of FOLDER_DEFINITIONS.filter((item) => item.key !== 'archive')) {
      const folder = findFolder(folders, definition.key);
      let messages = 0;
      let unread = 0;
      if (folder?.path) {
        try {
          const status: any = await client.status(folder.path, { messages: true, unseen: true });
          messages = Number(status?.messages || 0);
          unread = Number(status?.unseen || 0);
        } catch {
          // A folder can disappear during synchronization; keep a valid empty count.
        }
      }
      result.push({
        key: definition.key,
        label: definition.label,
        available: Boolean(folder?.path),
        messages,
        unread
      });
    }
    const inbox = result.find((item) => item.key === 'inbox');
    result.splice(1, 0,
      { key: 'unread', label: 'No leídos', available: Boolean(inbox?.available), messages: Number(inbox?.unread || 0), unread: Number(inbox?.unread || 0) },
      { key: 'starred', label: 'Destacados', available: Boolean(inbox?.available), messages: 0, unread: 0 }
    );
    return result;
  });
}

export async function listWebmailMessages(params: { folder: WebmailFolderKey; page: number; pageSize: number; search?: string }): Promise<any> {
  const folder = VIRTUAL_FOLDER_KEYS.has(params.folder) ? params.folder : params.folder;
  const page = Math.max(1, Math.min(1000, Number(params.page) || 1));
  const pageSize = Math.max(10, Math.min(50, Number(params.pageSize) || 25));
  const search = String(params.search || '').trim().slice(0, 120);

  return withImap(async (client) => {
    const folders = await listMailboxes(client);
    let rows: Array<{ message: any; mailbox: string }> = [];
    if (VIRTUAL_FOLDER_KEYS.has(folder as any)) {
      rows = await virtualFolderMessages(client, folders, folder as 'unread' | 'starred', page, pageSize);
    } else {
      const found = findFolder(folders, folder as WebmailFolderKey);
      if (!found?.path) {
        return { folder, label: friendlyFolderLabel(folder as WebmailFolderKey), items: [], page, pageSize, total: 0, hasNext: false };
      }
      await client.mailboxOpen(found.path, { readOnly: true });
      const criteria = search
        ? { or: [{ subject: search }, { from: search }, { to: search }, { body: search }] }
        : {};
      const messages = await fetchBySequenceRange(client, found.path, page, pageSize, criteria);
      rows = messages.map((message) => ({ message, mailbox: String(found.path) }));
    }

    const items: any[] = [];
    for (const row of rows) {
      try {
        const item = await serializeMessage(row.message, row.mailbox, false);
        items.push({ ...item, folder: folderKeyForPath(folders, row.mailbox) });
      } catch {
        // Omite solo los mensajes corruptos o demasiado grandes, nunca toda la bandeja.
      }
    }
    return {
      folder,
      label: friendlyFolderLabel(folder as WebmailFolderKey),
      items,
      page,
      pageSize,
      total: items.length + ((page - 1) * pageSize),
      hasNext: items.length === pageSize
    };
  });
}

async function resolvePhysicalFolder(client: ImapFlow, mailbox: string): Promise<{ path: string; folders: any[] }> {
  const folders = await listMailboxes(client);
  const found = physicalFolderAllowed(folders, mailbox);
  if (!found?.path) throw new WebmailServiceError('FOLDER_NOT_FOUND', 'La carpeta solicitada no está disponible.');
  return { path: String(found.path), folders };
}

export async function getWebmailMessage(mailbox: string, uid: number): Promise<any> {
  if (!Number.isSafeInteger(uid) || uid < 1) throw new WebmailServiceError('MESSAGE_NOT_FOUND', 'El mensaje solicitado no está disponible.');
  return withImap(async (client) => {
    const resolved = await resolvePhysicalFolder(client, mailbox);
    await client.mailboxOpen(resolved.path, { readOnly: false });
    const message: any = await client.fetchOne(uid, { source: true, envelope: true, flags: true, internalDate: true }, { uid: true });
    if (!message) throw new WebmailServiceError('MESSAGE_NOT_FOUND', 'El mensaje solicitado no está disponible.');
    await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
    const result = await serializeMessage({ ...message, flags: new Set([...(message.flags || []), '\\Seen']) }, resolved.path, true);
    return { ...result, folder: folderKeyForPath(resolved.folders, resolved.path) };
  });
}

export async function actOnWebmailMessage(params: { mailbox: string; uid: number; action: string; targetMailbox?: string }): Promise<void> {
  if (!Number.isSafeInteger(params.uid) || params.uid < 1) throw new WebmailServiceError('MESSAGE_NOT_FOUND', 'El mensaje solicitado no está disponible.');
  const action = String(params.action || '').trim();
  const allowedActions = new Set(['read', 'unread', 'star', 'unstar', 'delete', 'archive', 'move']);
  if (!allowedActions.has(action)) throw new WebmailServiceError('ACTION_NOT_ALLOWED', 'La acción solicitada no está disponible.');

  await withImap(async (client) => {
    const resolved = await resolvePhysicalFolder(client, params.mailbox);
    await client.mailboxOpen(resolved.path, { readOnly: false });
    const uid = params.uid;
    if (action === 'read') await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
    if (action === 'unread') await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true });
    if (action === 'star') await client.messageFlagsAdd(uid, ['\\Flagged'], { uid: true });
    if (action === 'unstar') await client.messageFlagsRemove(uid, ['\\Flagged'], { uid: true });
    if (action === 'delete') {
      const trash = findFolder(resolved.folders, 'trash');
      if (trash?.path && String(trash.path) !== resolved.path) {
        await client.messageMove(uid, String(trash.path), { uid: true });
      } else {
        await client.messageDelete(uid, { uid: true });
      }
    }
    if (action === 'archive') {
      const archive = findFolder(resolved.folders, 'archive');
      if (!archive?.path) throw new WebmailServiceError('FOLDER_NOT_FOUND', 'La carpeta de archivo no está disponible.');
      await client.messageMove(uid, String(archive.path), { uid: true });
    }
    if (action === 'move') {
      const targetMailbox = String(params.targetMailbox || '').trim();
      const target = physicalFolderAllowed(resolved.folders, targetMailbox)
        || (LIST_FOLDER_KEYS.has(targetMailbox as WebmailFolderKey) ? findFolder(resolved.folders, targetMailbox as WebmailFolderKey) : null);
      if (!target?.path) throw new WebmailServiceError('FOLDER_NOT_FOUND', 'La carpeta de destino no está disponible.');
      await client.messageMove(uid, String(target.path), { uid: true });
    }
  });
}

export async function saveWebmailDraft(input: WebmailComposeInput): Promise<void> {
  const html = sanitizeWebmailHtml(input.html || '');
  const text = String(input.text || '').slice(0, 2_000_000);
  const raw = await buildWebmailMimeMessage({
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text,
    html,
    attachments: input.attachments,
    inReplyTo: input.inReplyTo,
    references: input.references
  });
  await withImap(async (client) => {
    const folders = await listMailboxes(client);
    const drafts = findFolder(folders, 'drafts');
    if (!drafts?.path) throw new WebmailServiceError('FOLDER_NOT_FOUND', 'La carpeta de borradores no está disponible.');
    await client.append(String(drafts.path), raw, ['\\Draft']);
  });
}

export async function sendWebmailCompose(input: WebmailComposeInput): Promise<{ messageId?: string }> {
  const html = sanitizeWebmailHtml(input.html || '');
  const text = String(input.text || '').slice(0, 2_000_000);
  return sendWebmailMessage({
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text,
    html,
    attachments: input.attachments,
    inReplyTo: input.inReplyTo,
    references: input.references
  });
}

export async function downloadWebmailAttachment(mailbox: string, uid: number, index: number): Promise<{ filename: string; contentType: string; content: Buffer }> {
  if (!Number.isSafeInteger(uid) || uid < 1 || !Number.isSafeInteger(index) || index < 0 || index >= MAX_ATTACHMENTS) {
    throw new WebmailServiceError('ATTACHMENT_NOT_FOUND', 'El archivo adjunto no está disponible.');
  }
  return withImap(async (client) => {
    const resolved = await resolvePhysicalFolder(client, mailbox);
    await client.mailboxOpen(resolved.path, { readOnly: true });
    const message: any = await client.fetchOne(uid, { source: true }, { uid: true });
    if (!message?.source) throw new WebmailServiceError('ATTACHMENT_NOT_FOUND', 'El archivo adjunto no está disponible.');
    const parsed: any = await simpleParser(sourceToBuffer(message.source));
    const attachment: any = parsed.attachments?.[index];
    if (!attachment?.content) throw new WebmailServiceError('ATTACHMENT_NOT_FOUND', 'El archivo adjunto no está disponible.');
    const content = sourceToBuffer(attachment.content);
    if (content.length > MAX_ATTACHMENT_BYTES) throw new WebmailServiceError('ATTACHMENT_TOO_LARGE', 'El archivo adjunto supera el tamaño permitido.');
    return {
      filename: String(attachment.filename || `archivo-${index + 1}`).replace(/[\\/\r\n]+/g, '_').slice(0, 180),
      contentType: String(attachment.contentType || 'application/octet-stream').slice(0, 120),
      content
    };
  });
}

export function getWebmailAttachmentLimits() {
  return { maxAttachmentBytes: MAX_ATTACHMENT_BYTES, maxAttachments: MAX_ATTACHMENTS };
}
