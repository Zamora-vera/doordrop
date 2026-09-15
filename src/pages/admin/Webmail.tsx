import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Bold,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Forward,
  Italic,
  Link as LinkIcon,
  Loader2,
  Mail,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  Star,
  Trash2,
  Undo2,
  X
} from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

type FolderKey = 'inbox' | 'unread' | 'starred' | 'sent' | 'drafts' | 'spam' | 'trash' | 'archive';

interface FolderSummary {
  key: FolderKey;
  label: string;
  available: boolean;
  messages: number;
  unread: number;
}

interface MailItem {
  uid: string;
  mailbox: string;
  folder: string;
  subject: string;
  preview: string;
  date: string;
  read: boolean;
  starred: boolean;
  hasAttachments: boolean;
  attachmentCount: number;
  from: { name: string; address: string };
}

interface MailDetail extends MailItem {
  text?: string;
  html?: string;
  to: Array<{ name: string; address: string }>;
  cc: Array<{ name: string; address: string }>;
  bcc: Array<{ name: string; address: string }>;
  replyTo: Array<{ name: string; address: string }>;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  attachments: Array<{ index: number; filename: string; contentType: string; size: number }>;
}

interface ComposeAttachment {
  filename: string;
  contentType: string;
  contentBase64: string;
  size: number;
}

interface ComposeState {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  html: string;
  text: string;
  attachments: ComposeAttachment[];
  inReplyTo?: string;
  references?: string[];
}

const folderIcons: Record<FolderKey, React.ComponentType<{ className?: string }>> = {
  inbox: Mail,
  unread: MailOpen,
  starred: Star,
  sent: Send,
  drafts: Pencil,
  spam: MoreHorizontal,
  trash: Trash2,
  archive: Archive
};

const formatMailDate = (value: string, language: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language || 'es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const displayName = (from: { name?: string; address?: string }) => from?.name || from?.address || '—';

const addresses = (items: Array<{ address: string }> = []) => items.map((item) => item.address).filter(Boolean).join(', ');

const htmlToText = (value: string) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const emptyCompose = (): ComposeState => ({ to: '', cc: '', bcc: '', subject: '', html: '', text: '', attachments: [] });

const splitRecipients = (value: string) => value.split(/[;,]/).map((item) => item.trim()).filter(Boolean).join(', ');

export default function Webmail() {
  const { t, language } = useI18n();
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [activeFolder, setActiveFolder] = useState<FolderKey>('inbox');
  const [messages, setMessages] = useState<MailItem[]>([]);
  const [selected, setSelected] = useState<MailDetail | null>(null);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [composeVersion, setComposeVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const editorRef = useRef<HTMLDivElement | null>(null);

  const activeFolderSummary = useMemo(() => folders.find((item) => item.key === activeFolder), [folders, activeFolder]);

  const loadStatus = async () => {
    try {
      const result = await api.getAdminWebmailStatus();
      setStatus(result);
    } catch {
      setStatus(null);
    }
  };

  const loadFolders = async () => {
    try {
      const result = await api.getAdminWebmailFolders();
      setFolders(result.folders || []);
      setError('');
    } catch (err: any) {
      setFolders([]);
      setError(err?.message || t('admin_webmail_service_unavailable'));
    }
  };

  const loadMessages = async () => {
    setLoading(true);
    try {
      const result = await api.getAdminWebmailMessages({ folder: activeFolder, page, pageSize: 25, search });
      setMessages(result.items || []);
      setHasNext(Boolean(result.hasNext));
      setError('');
    } catch (err: any) {
      setMessages([]);
      setHasNext(false);
      setError(err?.message || t('admin_webmail_service_unavailable'));
    } finally {
      setLoading(false);
    }
  };

  const refreshAll = async () => {
    setWorking(true);
    await Promise.all([loadStatus(), loadFolders(), loadMessages()]);
    setWorking(false);
  };

  useEffect(() => {
    void loadStatus();
    void loadFolders();
  }, []);

  useEffect(() => {
    void loadMessages();
  }, [activeFolder, page, search]);

  const openMessage = async (item: MailItem) => {
    setLoadingDetail(true);
    setError('');
    try {
      const result = await api.getAdminWebmailMessage(item.uid, item.mailbox);
      setSelected(result.message);
      setMessages((current) => current.map((message) => message.uid === item.uid && message.mailbox === item.mailbox ? { ...message, read: true } : message));
      void loadFolders();
    } catch (err: any) {
      setError(err?.message || t('admin_webmail_message_unavailable'));
    } finally {
      setLoadingDetail(false);
    }
  };

  const act = async (action: string, item = selected, targetMailbox?: string) => {
    if (!item) return;
    setWorking(true);
    try {
      await api.adminWebmailMessageAction(item.uid, { mailbox: item.mailbox, action, targetMailbox });
      setNotice(t('admin_webmail_action_done'));
      setSelected(null);
      await Promise.all([loadMessages(), loadFolders()]);
    } catch (err: any) {
      setError(err?.message || t('admin_webmail_service_unavailable'));
    } finally {
      setWorking(false);
    }
  };

  const openComposer = (initial: Partial<ComposeState> = {}) => {
    setSelected(null);
    setCompose({ ...emptyCompose(), ...initial });
    setComposeVersion((version) => version + 1);
    setNotice('');
    setError('');
  };

  const replyToMessage = (replyAll = false, forward = false) => {
    if (!selected) return;
    const target = forward
      ? ''
      : replyAll
        ? addresses([...selected.replyTo, ...selected.to, ...selected.cc].filter((item, index, list) => list.findIndex((candidate) => candidate.address === item.address) === index))
        : addresses(selected.replyTo.length ? selected.replyTo : [selected.from]);
    const prefix = forward ? 'Fwd: ' : 'Re: ';
    const quote = selected.html || `<p>${String(selected.text || '').replace(/\n/g, '<br>')}</p>`;
    openComposer({
      to: target,
      subject: selected.subject.startsWith(prefix) ? selected.subject : `${prefix}${selected.subject}`,
      html: `<p><br></p><blockquote style="border-left:3px solid #cbd5e1;padding-left:12px;color:#64748b">${quote}</blockquote>`,
      text: `\n\n----- ${forward ? 'Mensaje reenviado' : 'Mensaje original'} -----\n${selected.text || selected.preview}`,
      inReplyTo: forward ? undefined : selected.messageId,
      references: forward ? undefined : [...(selected.references || []), selected.messageId || ''].filter(Boolean)
    });
  };

  const updateComposeHtml = () => {
    const html = editorRef.current?.innerHTML || '';
    setCompose((current) => current ? { ...current, html, text: htmlToText(html) } : current);
  };

  const formatEditor = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    updateComposeHtml();
  };

  const onFilesSelected = async (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files).slice(0, 8);
    const maxBytes = 5 * 1024 * 1024;
    const readFile = (file: File) => new Promise<ComposeAttachment>((resolve, reject) => {
      if (file.size > maxBytes) return reject(new Error(t('admin_webmail_attachment_size')));
      const reader = new FileReader();
      reader.onload = () => resolve({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        contentBase64: String(reader.result || '').split(',')[1] || '',
        size: file.size
      });
      reader.onerror = () => reject(new Error(t('admin_webmail_attachment_error')));
      reader.readAsDataURL(file);
    });
    try {
      const attachments = await Promise.all(selectedFiles.map(readFile));
      setCompose((current) => current ? { ...current, attachments: [...current.attachments, ...attachments].slice(0, 8) } : current);
    } catch (err: any) {
      setError(err?.message || t('admin_webmail_attachment_error'));
    }
  };

  const sendCompose = async (saveDraft = false) => {
    if (!compose) return;
    const latestHtml = editorRef.current?.innerHTML ?? compose.html;
    const payload = {
      ...compose,
      html: latestHtml,
      text: htmlToText(latestHtml) || compose.text
    };
    setWorking(true);
    try {
      if (saveDraft) {
        await api.saveAdminWebmailDraft(payload);
        setNotice(t('admin_webmail_draft_saved'));
      } else {
        await api.sendAdminWebmail(payload);
        setNotice(t('admin_webmail_sent'));
      }
      setCompose(null);
      await Promise.all([loadMessages(), loadFolders(), loadStatus()]);
    } catch (err: any) {
      setError(err?.message || t('admin_webmail_service_unavailable'));
    } finally {
      setWorking(false);
    }
  };

  const downloadAttachment = async (attachment: MailDetail['attachments'][number]) => {
    if (!selected) return;
    try {
      const blob = await api.downloadAdminWebmailAttachment(selected.uid, selected.mailbox, attachment.index);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || t('admin_webmail_attachment_error'));
    }
  };

  const renderStatus = (value: string | undefined) => {
    if (value === 'operational') return { label: t('admin_webmail_operational'), className: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300' };
    if (value === 'not_configured') return { label: t('admin_webmail_pending'), className: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300' };
    return { label: t('admin_webmail_unavailable'), className: 'text-rose-600 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-300' };
  };

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 text-slate-900 dark:text-slate-100">
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">{t('admin_webmail_eyebrow')}</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight">{t('admin_webmail_title')}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('admin_webmail_subtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => openComposer()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">
              <Plus className="h-4 w-4" /> {t('admin_webmail_new')}
            </button>
            <button onClick={() => void refreshAll()} disabled={working} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
              <RefreshCw className={`h-4 w-4 ${working ? 'animate-spin' : ''}`} /> {t('admin_webmail_refresh')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: t('admin_webmail_account'), value: status?.account || 'info@doordrop.lat', state: 'operational' },
            { label: t('admin_webmail_receive'), value: renderStatus(status?.receiveStatus).label, state: status?.receiveStatus },
            { label: t('admin_webmail_send'), value: renderStatus(status?.sendStatus).label, state: status?.sendStatus }
          ].map((item) => {
            const badge = renderStatus(item.state);
            return <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">{item.label}</p>
              <div className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{item.value}</span><span className={`rounded-full px-2 py-1 text-[10px] font-black ${badge.className}`}>{badge.label}</span></div>
            </div>;
          })}
        </div>

        {notice && <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"><span>{notice}</span><button onClick={() => setNotice('')}><X className="h-4 w-4" /></button></div>}
        {error && <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"><span>{error}</span><button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}

        <div className="grid min-h-[620px] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950 lg:border-b-0 lg:border-r">
            <button onClick={() => openComposer()} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-3 text-sm font-black text-white hover:bg-slate-700 dark:bg-blue-600 dark:hover:bg-blue-700"><Pencil className="h-4 w-4" /> {t('admin_webmail_new')}</button>
            <nav className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
              {folders.map((folder) => {
                const Icon = folderIcons[folder.key] || Mail;
                const active = activeFolder === folder.key;
                return <button key={folder.key} onClick={() => { setActiveFolder(folder.key); setPage(1); setSelected(null); }} className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${active ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900'}`}>
                  <span className="flex min-w-0 items-center gap-2"><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{t(`admin_webmail_folder_${folder.key}`)}</span></span>
                  {folder.unread > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'}`}>{folder.unread}</span>}
                </button>;
              })}
            </nav>
            <div className="mt-5 hidden rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900 lg:block">
              <p className="font-black text-slate-700 dark:text-slate-200">{t('admin_webmail_last_sync')}</p>
              <p className="mt-1 text-slate-500 dark:text-slate-400">{status?.lastSyncAt ? formatMailDate(status.lastSyncAt, language) : t('admin_webmail_not_synced')}</p>
            </div>
          </aside>

          <section className="min-w-0 bg-white dark:bg-slate-900">
            {compose ? <Composer
              key={composeVersion}
              compose={compose}
              setCompose={setCompose}
              editorRef={editorRef}
              onFormat={formatEditor}
              onFilesSelected={onFilesSelected}
              onSend={() => void sendCompose(false)}
              onSaveDraft={() => void sendCompose(true)}
              onCancel={() => setCompose(null)}
              working={working}
              t={t}
            /> : selected ? <MessageDetail
              selected={selected}
              language={language}
              onBack={() => setSelected(null)}
              onReply={() => replyToMessage(false)}
              onReplyAll={() => replyToMessage(true)}
              onForward={() => replyToMessage(false, true)}
              onAction={act}
              onDownload={downloadAttachment}
              working={working || loadingDetail}
              t={t}
            /> : <>
              <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:p-4 dark:border-slate-800 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-950"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={searchValue} onChange={(event) => setSearchValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { setPage(1); setSearch(searchValue.trim()); } }} placeholder={t('admin_webmail_search_placeholder')} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" /><button onClick={() => { setPage(1); setSearch(searchValue.trim()); }} className="text-xs font-black text-blue-600">{t('admin_webmail_search')}</button></div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"><span className="font-bold">{activeFolderSummary?.messages || 0} {t('admin_webmail_messages')}</span><button onClick={() => void loadMessages()} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" /></button></div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? <div className="flex min-h-[420px] items-center justify-center text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('admin_webmail_loading')}</div> : messages.length === 0 ? <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center text-slate-400"><Mail className="mb-3 h-10 w-10" /><p className="font-black">{error || t('admin_webmail_empty')}</p><p className="mt-1 text-sm">{t('admin_webmail_empty_hint')}</p></div> : messages.map((item) => <button key={`${item.mailbox}:${item.uid}`} onClick={() => void openMessage(item)} className={`flex w-full items-start gap-3 px-3 py-4 text-left transition hover:bg-slate-50 sm:px-5 dark:hover:bg-slate-950 ${item.read ? '' : 'bg-blue-50/50 dark:bg-blue-950/10'}`}>
                  <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.read ? 'bg-transparent' : 'bg-blue-600'}`}></div>
                  <div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className={`truncate text-sm ${item.read ? 'font-bold text-slate-700 dark:text-slate-200' : 'font-black text-slate-950 dark:text-white'}`}>{displayName(item.from)}</p><span className="shrink-0 text-xs text-slate-400">{formatMailDate(item.date, language)}</span></div><p className={`truncate text-sm ${item.read ? 'font-semibold text-slate-600 dark:text-slate-300' : 'font-black text-slate-900 dark:text-white'}`}>{item.subject}</p><p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{item.preview}</p></div>
                  <div className="flex shrink-0 items-center gap-2 text-slate-400">{item.hasAttachments && <Paperclip className="h-4 w-4" />}{item.starred && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}</div>
                </button>)}
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-800"><button disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-40 dark:border-slate-700"><ChevronLeft className="h-4 w-4" /> {t('admin_webmail_previous')}</button><span className="text-xs font-black text-slate-400">{t('admin_webmail_page')} {page}</span><button disabled={!hasNext || loading} onClick={() => setPage((value) => value + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-40 dark:border-slate-700">{t('admin_webmail_next')} <ChevronRight className="h-4 w-4" /></button></div>
            </>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Composer({ compose, setCompose, editorRef, onFormat, onFilesSelected, onSend, onSaveDraft, onCancel, working, t }: any) {
  return <div className="flex min-h-[620px] flex-col">
    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800"><div className="flex items-center gap-3"><button onClick={onCancel} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft className="h-5 w-5" /></button><div><p className="font-black">{t('admin_webmail_compose_title')}</p><p className="text-xs text-slate-400">{t('admin_webmail_sender')}: info@doordrop.lat</p></div></div><button onClick={onCancel} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div>
    <div className="space-y-3 p-4 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-[70px_minmax(0,1fr)] sm:items-center"><label className="text-xs font-black uppercase tracking-wider text-slate-400">{t('admin_webmail_to')}</label><input value={compose.to} onChange={(event) => setCompose((current: ComposeState) => ({ ...current, to: event.target.value }))} placeholder="correo@dominio.com" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" /></div>
      <div className="grid gap-3 sm:grid-cols-[70px_minmax(0,1fr)] sm:items-center"><label className="text-xs font-black uppercase tracking-wider text-slate-400">CC</label><input value={compose.cc} onChange={(event) => setCompose((current: ComposeState) => ({ ...current, cc: event.target.value }))} placeholder={t('admin_webmail_optional')} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" /></div>
      <div className="grid gap-3 sm:grid-cols-[70px_minmax(0,1fr)] sm:items-center"><label className="text-xs font-black uppercase tracking-wider text-slate-400">CCO</label><input value={compose.bcc} onChange={(event) => setCompose((current: ComposeState) => ({ ...current, bcc: event.target.value }))} placeholder={t('admin_webmail_optional')} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" /></div>
      <div className="grid gap-3 sm:grid-cols-[70px_minmax(0,1fr)] sm:items-center"><label className="text-xs font-black uppercase tracking-wider text-slate-400">{t('admin_webmail_subject')}</label><input value={compose.subject} onChange={(event) => setCompose((current: ComposeState) => ({ ...current, subject: event.target.value }))} placeholder={t('admin_webmail_subject_placeholder')} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" /></div>
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"><div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950"><button onClick={() => onFormat('bold')} title={t('admin_webmail_bold')} className="rounded-lg p-2 hover:bg-white dark:hover:bg-slate-800"><Bold className="h-4 w-4" /></button><button onClick={() => onFormat('italic')} title={t('admin_webmail_italic')} className="rounded-lg p-2 hover:bg-white dark:hover:bg-slate-800"><Italic className="h-4 w-4" /></button><button onClick={() => onFormat('insertUnorderedList')} title={t('admin_webmail_list')} className="rounded-lg px-2 py-1 text-sm font-black hover:bg-white dark:hover:bg-slate-800">• • •</button><button onClick={() => onFormat('createLink', window.prompt(t('admin_webmail_link_prompt')) || '')} title={t('admin_webmail_link')} className="rounded-lg p-2 hover:bg-white dark:hover:bg-slate-800"><LinkIcon className="h-4 w-4" /></button></div><div ref={editorRef} contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: compose.html }} onInput={() => { const html = editorRef.current?.innerHTML || ''; setCompose((current: ComposeState) => ({ ...current, html, text: htmlToText(html) })); }} className="min-h-[260px] bg-white p-4 text-sm outline-none dark:bg-slate-900" data-placeholder={t('admin_webmail_message_placeholder')}></div></div>
      {compose.attachments.length > 0 && <div className="flex flex-wrap gap-2">{compose.attachments.map((attachment: ComposeAttachment, index: number) => <span key={`${attachment.filename}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold dark:bg-slate-800"><Paperclip className="h-3.5 w-3.5" /><span className="max-w-[220px] truncate">{attachment.filename}</span><button onClick={() => setCompose((current: ComposeState) => ({ ...current, attachments: current.attachments.filter((_: ComposeAttachment, itemIndex: number) => itemIndex !== index) }))}><X className="h-3.5 w-3.5" /></button></span>)}</div>}
    </div>
    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800"><div><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Paperclip className="h-4 w-4" /> {t('admin_webmail_attach')}<input type="file" multiple className="hidden" onChange={(event) => { void onFilesSelected(event.target.files); event.currentTarget.value = ''; }} /></label></div><div className="flex flex-wrap gap-2"><button onClick={onCancel} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">{t('admin_webmail_cancel')}</button><button onClick={onSaveDraft} disabled={working} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">{t('admin_webmail_save_draft')}</button><button onClick={onSend} disabled={working} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t('admin_webmail_send_button')}</button></div></div>
  </div>;
}

function MessageDetail({ selected, language, onBack, onReply, onReplyAll, onForward, onAction, onDownload, working, t }: any) {
  const [moveOpen, setMoveOpen] = useState(false);
  return <div className="flex min-h-[620px] flex-col">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800"><div className="flex items-center gap-2"><button onClick={onBack} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft className="h-5 w-5" /></button><button disabled={working} onClick={() => onAction(selected.starred ? 'unstar' : 'star')} className={`rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800 ${selected.starred ? 'text-amber-500' : 'text-slate-400'}`}><Star className={`h-5 w-5 ${selected.starred ? 'fill-amber-400' : ''}`} /></button><button disabled={working} onClick={() => onAction(selected.read ? 'unread' : 'read')} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">{selected.read ? <Mail className="h-5 w-5" /> : <MailOpen className="h-5 w-5" />}</button></div><div className="flex items-center gap-1"><button disabled={working} onClick={() => onAction('archive')} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title={t('admin_webmail_archive')}><Archive className="h-5 w-5" /></button><button disabled={working} onClick={() => onAction('delete')} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30" title={t('admin_webmail_delete')}><Trash2 className="h-5 w-5" /></button><div className="relative"><button disabled={working} onClick={() => setMoveOpen((value) => !value)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><MoreHorizontal className="h-5 w-5" /></button>{moveOpen && <div className="absolute right-0 top-10 z-10 w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"><p className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{t('admin_webmail_move')}</p>{['inbox', 'sent', 'drafts', 'spam', 'trash'].map((folder) => <button key={folder} onClick={() => { setMoveOpen(false); onAction('move', selected, folder); }} className="block w-full rounded-lg px-2 py-2 text-left text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800">{t(`admin_webmail_folder_${folder}`)}</button>)}</div>}</div></div></div>
    <div className="flex-1 overflow-y-auto p-4 sm:p-8"><div className="mx-auto max-w-4xl"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">{displayName(selected.from).slice(0, 1).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-sm font-black">{displayName(selected.from)}</p><p className="truncate text-xs text-slate-500 dark:text-slate-400">{selected.from.address}</p><p className="mt-1 text-xs text-slate-400">{t('admin_webmail_to')}: {addresses(selected.to)}</p>{selected.cc?.length > 0 && <p className="text-xs text-slate-400">CC: {addresses(selected.cc)}</p>}</div></div><p className="flex shrink-0 items-center gap-1 text-xs text-slate-400"><Clock3 className="h-3.5 w-3.5" /> {formatMailDate(selected.date, language)}</p></div><h2 className="mt-6 break-words text-xl font-black sm:text-2xl">{selected.subject}</h2><div className="mt-6 overflow-x-auto text-sm leading-7 text-slate-700 dark:text-slate-200" dangerouslySetInnerHTML={{ __html: selected.html || `<p>${String(selected.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>` }}></div>{selected.attachments?.length > 0 && <div className="mt-8 border-t border-slate-200 pt-5 dark:border-slate-800"><p className="mb-3 flex items-center gap-2 text-sm font-black"><Paperclip className="h-4 w-4" /> {t('admin_webmail_attachments')}</p><div className="flex flex-wrap gap-2">{selected.attachments.map((attachment: any) => <button key={attachment.index} onClick={() => onDownload(attachment)} className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><FileText className="h-4 w-4 text-blue-600" /><span className="max-w-[240px] truncate">{attachment.filename}</span><Download className="h-3.5 w-3.5 text-slate-400" /></button>)}</div></div>}</div></div>
    <div className="flex flex-wrap gap-2 border-t border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800"><button onClick={onReply} disabled={working} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"><Reply className="h-4 w-4" /> {t('admin_webmail_reply')}</button><button onClick={onReplyAll} disabled={working} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"><ReplyAll className="h-4 w-4" /> {t('admin_webmail_reply_all')}</button><button onClick={onForward} disabled={working} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"><Forward className="h-4 w-4" /> {t('admin_webmail_forward')}</button></div>
  </div>;
}
