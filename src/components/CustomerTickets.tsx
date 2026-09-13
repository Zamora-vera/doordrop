import React, { useState, useEffect } from 'react';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import {
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Clock,
  ExternalLink,
  HelpCircle,
  Inbox,
  LifeBuoy,
  ListChecks,
  MessageCircle,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  User
} from 'lucide-react';

const supportChannels = [
  {
    id: 'whatsapp',
    titleKey: 'tickets.channels.whatsapp.title',
    subtitleKey: 'tickets.channels.whatsapp.subtitle',
    href: 'https://wa.me/13402000271',
    icon: MessageCircle,
    cardClass: 'from-emerald-500 to-green-600 shadow-emerald-500/20'
  }
];

export function CustomerTickets() {
  const { t, language } = useI18n();
  const [tickets, setTickets] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('tracking_problem');
  const [trackingCode, setTrackingCode] = useState('');
  const [description, setDescription] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const tRes = await api.getTickets();
      setTickets(tRes.tickets || []);

      const sRes = await api.getShipments();
      setShipments(sRes.shipments || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;

    setSubmitLoading(true);
    try {
      const res = await api.createTicket({
        subject,
        category,
        description,
        trackingCode,
        lang: language
      });
      if (res.success) {
        setSubject('');
        setDescription('');
        setTrackingCode('');
        setIsCreating(false);
        await fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim() || !activeTicket) return;

    setReplyLoading(true);
    try {
      const res = await api.replyTicket(activeTicket.id, {
        message: replyMessage,
        sender: 'user'
      });
      if (res.success) {
        setReplyMessage('');
        const updatedTicket = res.ticket || {
          ...activeTicket,
          replies: [...(activeTicket.replies || []), res.reply]
        };
        setActiveTicket(updatedTicket);
        await fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReplyLoading(false);
    }
  };

  const handleResolveTicket = async () => {
    if (!activeTicket) return;
    try {
      const res = await api.resolveTicket(activeTicket.id);
      if (res.success) {
        setActiveTicket({ ...activeTicket, status: 'resolved' });
        await fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startCreateTicket = () => {
    setActiveTicket(null);
    setIsCreating(true);
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'tracking_problem':
        return t('ticket_category_tracking');
      case 'delayed_shipment':
        return t('ticket_category_delayed');
      case 'weight_mismatch':
        return t('ticket_category_weight');
      case 'cancellation_request':
        return t('ticket_category_cancellation');
      default:
        return cat;
    }
  };

  const formatDate = (value: string | number | Date, variant: 'short' | 'long' = 'short') => {
    try {
      const date = new Date(value);
      return new Intl.DateTimeFormat(language, variant === 'long' ? {
        dateStyle: 'medium',
        timeStyle: 'short'
      } : {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
      }).format(date);
    } catch {
      return String(value || '');
    }
  };

  const getStatusBadge = (status: string) => {
    const isOpen = status === 'open';
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black ${
        isOpen
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300'
          : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
      }`}>
        <span className={`h-1.5 w-1.5 rounded-full ${isOpen ? 'bg-emerald-500' : 'bg-slate-400'}`} />
        {isOpen ? t('ticket_status_open') : t('ticket_status_resolved')}
      </span>
    );
  };

  const totalTickets = tickets.length;
  const openTickets = tickets.filter((ticket) => ticket.status === 'open').length;
  const resolvedTickets = Math.max(totalTickets - openTickets, 0);

  if (loading) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white/80 py-20 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent dark:border-cyan-300 dark:border-t-transparent" />
        <p className="font-semibold text-slate-500 dark:text-slate-400">{t('tickets.loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 pb-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-blue-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 md:p-7">
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-blue-50 via-cyan-50 to-emerald-50 dark:from-blue-950/40 dark:via-cyan-950/20 dark:to-emerald-950/20" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20 dark:bg-cyan-300 dark:text-slate-950 dark:shadow-cyan-300/20">
              <LifeBuoy className="h-7 w-7" />
            </div>
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-blue-600 dark:text-cyan-300">{t('tickets.hero.eyebrow')}</p>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white md:text-4xl">{t('tickets.customer.title')}</h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-400 md:text-base">{t('tickets.customer.subtitle')}</p>
            </div>
          </div>

          {!isCreating && (
            <button
              onClick={startCreateTicket}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5 hover:bg-blue-700 dark:bg-cyan-300 dark:text-slate-950 dark:shadow-cyan-300/20 dark:hover:bg-cyan-200 sm:w-auto"
            >
              <Plus className="h-5 w-5" />
              {t('create_ticket_btn')}
            </button>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-cyan-300/10 dark:text-cyan-300">
            <Inbox className="h-5 w-5" />
          </div>
          <p className="text-2xl font-black text-slate-950 dark:text-white">{totalTickets}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('tickets.stats.total')}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-300/10 dark:text-emerald-300">
            <MessageSquare className="h-5 w-5" />
          </div>
          <p className="text-2xl font-black text-slate-950 dark:text-white">{openTickets}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('tickets.stats.open')}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <CheckCircle className="h-5 w-5" />
          </div>
          <p className="text-2xl font-black text-slate-950 dark:text-white">{resolvedTickets}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('tickets.stats.resolved')}</p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 md:p-6">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-cyan-300">{t('tickets.channels.eyebrow')}</p>
            <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">{t('tickets.channels.title')}</h2>
            <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500 dark:text-slate-400">{t('tickets.channels.subtitle')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {supportChannels.map((channel) => {
            const Icon = channel.icon;
            return (
              <a
                key={channel.id}
                href={channel.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-md dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-cyan-400/30 dark:hover:bg-slate-900"
                aria-label={t('tickets.channels.open')}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${channel.cardClass}`}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-slate-900 dark:text-white">{t(channel.titleKey)}</span>
                    <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{t(channel.subtitleKey)}</span>
                  </span>
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm transition-colors group-hover:bg-blue-600 group-hover:text-white dark:bg-slate-950 dark:text-cyan-300 dark:group-hover:bg-cyan-300 dark:group-hover:text-slate-950">
                  <ExternalLink className="h-4 w-4" />
                </span>
              </a>
            );
          })}
        </div>
      </section>

      {isCreating && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 md:p-8">
          <button
            onClick={() => setIsCreating(false)}
            className="mb-6 inline-flex items-center gap-2 text-sm font-black text-slate-500 transition-colors hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('back_btn')}
          </button>

          <div className="mb-6">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-cyan-300">{t('tickets.create.eyebrow')}</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{t('tickets.create.title')}</h2>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500 dark:text-slate-400">{t('tickets.create.subtitle')}</p>
          </div>

          <form onSubmit={handleCreateTicket} className="space-y-6">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('ticket_subject')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('tickets.form.subject_placeholder')}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="input-dynamic font-medium"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('ticket_category')}</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="input-dynamic bg-white font-medium dark:bg-dark-800"
                >
                  <option value="tracking_problem">{t('ticket_category_tracking')}</option>
                  <option value="delayed_shipment">{t('ticket_category_delayed')}</option>
                  <option value="weight_mismatch">{t('ticket_category_weight')}</option>
                  <option value="cancellation_request">{t('ticket_category_cancellation')}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('ticket_tracking_code')}</label>
              <select
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
                className="input-dynamic bg-white font-medium dark:bg-dark-800"
              >
                <option value="">{t('tickets.form.no_tracking')}</option>
                {shipments.map((s) => (
                  <option key={s.id} value={s.trackingCode}>
                    {s.trackingCode} - {s.recipient?.name || t('tickets.shipment_fallback')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('ticket_description')}</label>
              <textarea
                required
                rows={5}
                placeholder={t('tickets.form.description_placeholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-dynamic resize-none font-medium"
              />
            </div>

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="rounded-2xl border border-slate-200 px-6 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {t('common.actions.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitLoading}
                className="rounded-2xl bg-blue-600 px-7 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 disabled:opacity-50 dark:bg-cyan-300 dark:text-slate-950 dark:shadow-cyan-300/20 dark:hover:bg-cyan-200"
              >
                {submitLoading ? t('tickets.create.submitting') : t('create_ticket_btn')}
              </button>
            </div>
          </form>
        </section>
      )}

      {activeTicket && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <button
              onClick={() => { setActiveTicket(null); fetchData(); }}
              className="inline-flex items-center gap-2 text-sm font-black text-slate-500 transition-colors hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('tickets.list.back')}
            </button>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="space-y-6">
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('tickets.detail.id')}</span>
                  <p className="mt-1 break-all font-mono text-sm font-black text-slate-950 dark:text-white">{activeTicket.id}</p>
                </div>

                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('ticket_subject')}</span>
                  <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{activeTicket.subject}</p>
                </div>

                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('ticket_category')}</span>
                  <div className="mt-2">
                    <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 dark:border-cyan-300/20 dark:bg-cyan-300/10 dark:text-cyan-300">
                      {getCategoryLabel(activeTicket.category)}
                    </span>
                  </div>
                </div>

                {activeTicket.trackingCode && (
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('ticket_tracking_code')}</span>
                    <p className="mt-1 break-all font-mono text-sm font-black text-blue-600 dark:text-cyan-300">{activeTicket.trackingCode}</p>
                  </div>
                )}

                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('tickets.detail.status')}</span>
                  <div className="mt-2">{getStatusBadge(activeTicket.status)}</div>
                </div>

                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('tickets.detail.created_at')}</span>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
                    <Clock className="h-4 w-4 text-slate-400" />
                    {formatDate(activeTicket.createdAt, 'long')}
                  </p>
                </div>

                {activeTicket.status === 'open' && (
                  <button
                    onClick={handleResolveTicket}
                    className="w-full rounded-2xl border border-emerald-500 px-4 py-3 text-sm font-black text-emerald-700 transition-colors hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/20"
                  >
                    {t('tickets.detail.resolve')}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex h-[min(680px,calc(100vh-12rem))] min-h-[520px] flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/50">
              <span className="flex items-center gap-2 font-black text-slate-950 dark:text-white">
                <MessageSquare className="h-5 w-5 text-blue-600 dark:text-cyan-300" />
                {t('tickets.conversation')}
              </span>
              {getStatusBadge(activeTicket.status)}
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-5 md:p-6">
              <div className="flex max-w-[90%] gap-3 md:max-w-[82%]">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-md dark:bg-cyan-300 dark:text-slate-950">
                  <User className="h-4 w-4" />
                </div>
                <div className="rounded-2xl rounded-tl-none border border-blue-100 bg-blue-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="mb-1 text-xs font-black text-blue-700 dark:text-cyan-300">{t('tickets.detail.original_author')}</p>
                  <p className="whitespace-pre-wrap text-sm font-medium text-slate-800 dark:text-slate-200">{activeTicket.description}</p>
                  <span className="mt-2 block text-right text-[10px] font-semibold text-slate-400">{formatDate(activeTicket.createdAt, 'long')}</span>
                </div>
              </div>

              {(activeTicket.replies || []).map((reply: any) => {
                const isAI = reply.sender === 'ai';
                const isAdmin = reply.sender === 'admin';
                const isUser = reply.sender === 'user';

                return (
                  <div key={reply.id} className={`flex max-w-[90%] gap-3 md:max-w-[82%] ${isUser ? 'ml-auto flex-row-reverse' : ''}`}>
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-md ${
                      isAI
                        ? 'bg-gradient-to-tr from-pink-500 to-indigo-500 text-white'
                        : isAdmin
                          ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                          : 'bg-blue-600 text-white dark:bg-cyan-300 dark:text-slate-950'
                    }`}>
                      {isAI ? <Sparkles className="h-4 w-4" /> : isUser ? <User className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />}
                    </div>
                    <div className={`rounded-2xl border p-4 ${
                      isUser
                        ? 'rounded-tr-none border-blue-700 bg-blue-600 text-white dark:border-cyan-300 dark:bg-cyan-300 dark:text-slate-950'
                        : isAI
                          ? 'rounded-tl-none border-purple-100 bg-purple-50/80 dark:border-purple-900/30 dark:bg-purple-950/20'
                          : 'rounded-tl-none border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70'
                    }`}>
                      <p className={`mb-1 text-xs font-black ${
                        isUser ? 'text-blue-100 dark:text-slate-700' : isAI ? 'text-purple-600 dark:text-pink-300' : 'text-slate-500 dark:text-slate-400'
                      }`}>
                        {reply.senderName || (isAI ? t('ticket_ai_reply') : isAdmin ? t('ticket_admin_reply') : t('ticket_user_reply'))}
                      </p>
                      <p className={`whitespace-pre-wrap text-sm font-medium ${isUser ? 'text-white dark:text-slate-950' : 'text-slate-800 dark:text-slate-200'}`}>{reply.message}</p>
                      <span className={`mt-2 block text-right text-[10px] font-semibold ${isUser ? 'text-blue-100 dark:text-slate-700' : 'text-slate-400'}`}>{formatDate(reply.createdAt, 'long')}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-200 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-950/90">
              {activeTicket.status === 'open' ? (
                <form onSubmit={handleSendReply} className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder={t('tickets.reply.placeholder')}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    className="input-dynamic flex-1 bg-white py-3 dark:bg-dark-800"
                  />
                  <button
                    type="submit"
                    disabled={replyLoading}
                    className="flex shrink-0 items-center justify-center rounded-2xl bg-blue-600 p-3 text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-cyan-300 dark:text-slate-950"
                    aria-label={t('ticket_send_reply')}
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </form>
              ) : (
                <div className="rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-black text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  {t('tickets.detail.resolved_message')}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {!isCreating && !activeTicket && (
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          {tickets.length === 0 ? (
            <div className="relative overflow-hidden p-8 text-center md:p-14">
              <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-blue-50 to-transparent dark:from-blue-950/25" />
              <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center">
                <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-blue-600 shadow-inner dark:bg-cyan-300/10 dark:text-cyan-300">
                  <LifeBuoy className="h-10 w-10" />
                </div>
                <h3 className="text-2xl font-black text-slate-950 dark:text-white">{t('tickets.empty.title')}</h3>
                <p className="mt-3 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400 md:text-base">{t('tickets.empty.description')}</p>
                <button
                  onClick={startCreateTicket}
                  className="mt-7 inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5 hover:bg-blue-700 dark:bg-cyan-300 dark:text-slate-950 dark:shadow-cyan-300/20 dark:hover:bg-cyan-200"
                >
                  <Plus className="h-5 w-5" />
                  {t('create_ticket_btn')}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="hidden grid-cols-12 border-b border-slate-200 bg-slate-50/70 p-5 text-xs font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-500 md:grid">
                <div className="col-span-5">{t('tickets.list.subject_id')}</div>
                <div className="col-span-3">{t('tickets.list.category')}</div>
                <div className="col-span-2">{t('tickets.list.status')}</div>
                <div className="col-span-2 text-right">{t('tickets.list.created')}</div>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    onClick={() => setActiveTicket(ticket)}
                    className="grid w-full grid-cols-1 gap-4 p-5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60 md:grid-cols-12 md:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3 md:col-span-5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-cyan-300/10 dark:text-cyan-300">
                        <MessageSquare className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950 dark:text-white">{ticket.subject}</p>
                        <p className="mt-0.5 truncate font-mono text-[11px] font-semibold text-slate-400">{ticket.id}</p>
                      </div>
                    </div>

                    <div className="md:col-span-3">
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {getCategoryLabel(ticket.category)}
                      </span>
                    </div>

                    <div className="md:col-span-2">{getStatusBadge(ticket.status)}</div>

                    <div className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 md:col-span-2 md:justify-end md:text-right">
                      <span>{formatDate(ticket.createdAt)}</span>
                      <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
