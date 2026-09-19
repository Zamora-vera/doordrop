import React, { useState, useEffect } from 'react';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { LifeBuoy, Send, MessageSquare, ChevronRight, Clock, User, Sparkles, AlertTriangle, ArrowLeft, CheckCircle, HelpCircle, Shield, Check, XCircle, Wallet, Search, RefreshCw, SlidersHorizontal, Inbox, CheckCircle2 } from 'lucide-react';

export function AdminTickets({ canReviewSensitive = true }: { canReviewSensitive?: boolean }) {
  const { t, language } = useI18n();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestedText, setAiSuggestedText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await api.getTickets();
      setTickets(res.tickets || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReply = async (e?: React.FormEvent, customMsg?: string) => {
    if (e) e.preventDefault();
    const messageToSend = customMsg || replyMessage;
    if (!messageToSend.trim() || !activeTicket) return;

    setReplyLoading(true);
    try {
      const senderType = customMsg && customMsg.includes('AI') ? 'ai' : 'admin';
      const senderName = customMsg && customMsg.includes('AI') ? 'DoorDrop AI Assistant' : 'Super Admin';
      
      const res = await api.replyTicket(activeTicket.id, {
        message: messageToSend,
        sender: senderType,
        senderName: senderName
      });
      if (res.success) {
        if (!customMsg) setReplyMessage('');
        setAiSuggestedText('');
        // Refresh active ticket details
        const updatedTicket = res.ticket || { 
          ...activeTicket, 
          replies: [...activeTicket.replies, res.reply] 
        };
        setActiveTicket(updatedTicket);
        // Refresh list
        await fetchTickets();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReplyLoading(false);
    }
  };

  const handleSuggestAIResponse = async () => {
    if (!activeTicket) return;
    setAiLoading(true);
    setAiSuggestedText('');
    try {
      const res = await api.aiSuggestReply(activeTicket.id, language);
      if (res.success && res.message) {
        setAiSuggestedText(res.message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAiLoading(false);
    }
  };

  const handleResolveTicket = async () => {
    if (!activeTicket) return;
    try {
      const res = await api.resolveTicket(activeTicket.id);
      if (res.success) {
        setActiveTicket({ ...activeTicket, status: 'resolved' });
        await fetchTickets();
      }
    } catch (err) {
      console.error(err);
    }
  };


  const handleApproveCancellation = async () => {
    if (!activeTicket?.cancellationRequest) return;
    const note = window.prompt('Nota para el cliente:', 'Solicitud aprobada. El importe fue acreditado en tu monedero DoorDrop.');
    if (note === null) return;
    try {
      const res = await api.adminApproveCancellation(activeTicket.cancellationRequest.id, { note });
      alert(res.message || 'Reembolso aprobado.');
      await fetchTickets();
      setActiveTicket(null);
    } catch (err: any) {
      alert(err.message || 'No se pudo aprobar la solicitud.');
    }
  };

  const handleRejectCancellation = async () => {
    if (!activeTicket?.cancellationRequest) return;
    const note = window.prompt('Motivo para el cliente:', 'Solicitud revisada. No fue posible aprobar el reembolso en este momento.');
    if (note === null) return;
    try {
      const res = await api.adminRejectCancellation(activeTicket.cancellationRequest.id, { note });
      alert(res.message || 'Solicitud rechazada.');
      await fetchTickets();
      setActiveTicket(null);
    } catch (err: any) {
      alert(err.message || 'No se pudo rechazar la solicitud.');
    }
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
      case 'ai_copilot_handoff':
        return t('ticket_category_ai');
      default:
        return cat;
    }
  };

  const ticketCategories: string[] = Array.from(new Set(tickets.map((ticket) => String(ticket.category || '')).filter(Boolean)));
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredTickets = tickets.filter((ticket) => {
    const latestReply = ticket.replies?.[ticket.replies.length - 1];
    const searchFields = [
      ticket.userName,
      ticket.userEmail,
      ticket.id,
      ticket.subject,
      ticket.description,
      ticket.tracking_code,
      latestReply?.message
    ].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !normalizedSearch || searchFields.includes(normalizedSearch);
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || ticket.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const getTicketName = (ticket: any) => ticket.userName || ticket.userEmail || 'Cliente DoorDrop';
  const getTicketInitials = (ticket: any) => getTicketName(ticket).split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase() || 'US';
  const formatTicketDate = (value: any) => value ? new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin fecha';
  const formatTicketDateTime = (value: any) => {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-medium">Cargando tickets...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f6f8fb] p-4 sm:p-6 lg:p-8 max-w-[1440px] mx-auto font-sans">
      {/* HEADER SECTION */}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-5 py-6 sm:px-8 sm:py-7 text-white shadow-xl shadow-slate-200/60 mb-6">
        <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
        <div className="absolute right-20 bottom-[-90px] h-48 w-48 rounded-full bg-indigo-400/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 ring-1 ring-white/20 text-blue-200 flex items-center justify-center shadow-lg backdrop-blur-sm">
              <LifeBuoy className="w-7 h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-300">Centro de operaciones</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold text-emerald-200 ring-1 ring-emerald-300/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Atención activa
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Soporte y Copiloto IA</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">Resuelve incidencias, revisa conversaciones y responde a tus clientes desde una sola vista.</p>
            </div>
          </div>
          {!activeTicket && (
            <button
              type="button"
              onClick={fetchTickets}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white ring-1 ring-white/20 transition hover:bg-white/20 disabled:opacity-60"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
            </button>
          )}
        </div>
      </div>

      {!activeTicket && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-6">
            <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm shadow-blue-100/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total tickets</span>
                <span className="rounded-xl bg-blue-50 p-2 text-blue-600"><Inbox className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-2xl font-black text-slate-900">{tickets.length}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Todas las conversaciones recibidas</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm shadow-emerald-100/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Pendientes</span>
                <span className="rounded-xl bg-emerald-50 p-2 text-emerald-600"><CheckCircle2 className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-2xl font-black text-slate-900">{tickets.filter((ticket) => ticket.status === 'open').length}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Requieren atención del equipo</p>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm shadow-violet-100/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Resueltos</span>
                <span className="rounded-xl bg-violet-50 p-2 text-violet-600"><CheckCircle className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-2xl font-black text-slate-900">{tickets.filter((ticket) => ticket.status !== 'open').length}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Casos cerrados por el equipo</p>
            </div>
          </div>
        </>
      )}

      {/* TICKET DETAIL / RESPONSE VIEW */}
      {activeTicket ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          {/* LEFT COLUMN: TICKET SPECIFICATIONS */}
          <div className="lg:col-span-1 space-y-6">
            <button 
              onClick={() => { setActiveTicket(null); fetchTickets(); }}
              className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 mb-2"
            >
              <ArrowLeft className="w-4 h-4" /> Volver al listado de incidencias
            </button>

            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
              <div className="pb-4 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cliente Emisor</span>
                <p className="font-bold text-gray-900 mt-1">{getTicketName(activeTicket)}</p>
                <p className="text-xs text-slate-500 font-medium font-mono mt-0.5">{activeTicket.userEmail || 'Cliente DoorDrop'}</p>
              </div>

              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ID de Incidencia</span>
                <p className="font-mono text-sm font-bold text-gray-900 mt-1">{activeTicket.id}</p>
              </div>

              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Asunto</span>
                <p className="font-bold text-gray-900 text-base mt-1">{activeTicket.subject}</p>
              </div>

              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Categoría Seleccionada</span>
                <div className="mt-2">
                  <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-full border border-blue-100">
                    {getCategoryLabel(activeTicket.category)}
                  </span>
                </div>
              </div>

              {(activeTicket.trackingCode || activeTicket.tracking_code) && (
                <div>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Código de Seguimiento</span>
                  <p className="font-mono text-sm text-blue-600 font-bold mt-1 underline">
                    {activeTicket.trackingCode || activeTicket.tracking_code}
                  </p>
                </div>
              )}

              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Estado de Ticket</span>
                <div className="mt-2">
                  {activeTicket.status === 'open' ? (
                    <span className="px-3 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full border border-green-100">
                      Abierto
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-gray-100 text-gray-500 text-xs font-bold rounded-full">
                      Resuelto
                    </span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Fecha de Creación</span>
                <p className="text-sm text-gray-700 font-medium mt-1 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-gray-400" />
                  {formatTicketDateTime(activeTicket.createdAt || activeTicket.created_at)}
                </p>
              </div>

              {activeTicket.cancellationRequest && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-800 font-black text-sm">
                    <Wallet className="w-4 h-4" /> Solicitud de cancelación
                  </div>
                  <p className="text-xs text-amber-900 font-bold">Importe a revisar: {Number(activeTicket.cancellationRequest.amount || 0).toFixed(2)} {activeTicket.cancellationRequest.currency || 'EUR'}</p>
                  <p className="text-xs text-amber-700">Estado: {activeTicket.cancellationRequest.status}</p>
                  {canReviewSensitive && activeTicket.cancellationRequest.status === 'pending_review' && (
                    <div className="grid grid-cols-1 gap-2">
                      <button onClick={handleApproveCancellation} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center justify-center gap-2">
                        <CheckCircle className="w-4 h-4" /> Aprobar y reembolsar
                      </button>
                      <button onClick={handleRejectCancellation} className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm flex items-center justify-center gap-2">
                        <XCircle className="w-4 h-4" /> Rechazar solicitud
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeTicket.status === 'open' && (
                <button
                  onClick={handleResolveTicket}
                  className="w-full py-2.5 rounded-xl border border-green-500 hover:bg-green-50 text-green-600 font-bold text-sm transition-colors cursor-pointer"
                >
                  Resolver esta Incidencia
                </button>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: CO-PILOT AI AND MESSAGE CONVERSATION */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* COPILOT COPILOT BOX */}
            {activeTicket.status === 'open' && (
              <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 p-6 rounded-3xl border border-blue-100 shadow-sm relative overflow-hidden">
                <div className="absolute right-[-5%] top-[-20%] text-blue-500/10 text-9xl font-black pointer-events-none">
                  <Sparkles />
                </div>
                
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />
                    <span>Copiloto de Soporte DoorDrop AI</span>
                  </h3>
                  <button
                    onClick={handleSuggestAIResponse}
                    disabled={aiLoading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl text-xs transition shadow-md disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                  >
                    {aiLoading ? 'Generando respuesta...' : 'Generar Sugerencia de IA'}
                  </button>
                </div>

                {aiSuggestedText ? (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 relative z-10">
                    <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl border border-indigo-100 text-sm text-gray-800 leading-relaxed">
                      {aiSuggestedText}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => {
                          setReplyMessage(aiSuggestedText);
                          setAiSuggestedText('');
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-bold border border-indigo-200 text-indigo-700 hover:bg-white transition-colors"
                      >
                        Copiar al editor de texto
                      </button>
                      <button
                        onClick={() => handleSendReply(undefined, aiSuggestedText)}
                        className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-xs font-bold shadow-md hover:opacity-90 transition"
                      >
                        Enviar directamente como IA
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 font-medium relative z-10">
                    Utiliza la inteligencia artificial para redactar automáticamente una respuesta profesional y empática en el idioma del cliente ({language.toUpperCase()}).
                  </p>
                )}
              </div>
            )}

            {/* MESSAGE CONVERSATION COMPONENT */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col h-[500px] overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex items-center gap-2 bg-slate-50/50">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                <span className="font-bold text-gray-900">Historial de Conversación</span>
              </div>

              {/* Messages Content */}
              <div className="flex-1 p-6 overflow-y-auto space-y-6">
                {/* Original Complaint */}
                <div className="flex gap-3 max-w-[85%]">
                  <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white shrink-0 shadow-md">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl rounded-tl-none border border-slate-100">
                    <p className="text-xs text-blue-600 font-bold mb-1">{getTicketName(activeTicket)} (Cliente)</p>
                    <p className="text-sm text-gray-800 font-medium whitespace-pre-wrap">{activeTicket.description}</p>
                    <span className="text-[10px] text-gray-400 block mt-2 text-right">
                      {new Date(activeTicket.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {/* Thread Messages */}
                {(activeTicket.replies || []).map((reply: any) => {
                  const isAI = reply.sender === 'ai';
                  const isAdmin = reply.sender === 'admin' || reply.sender === 'super_admin' || reply.sender === 'support';
                  
                  return (
                    <div key={reply.id} className={`flex gap-3 max-w-[85%] ${isAdmin ? 'ml-auto flex-row-reverse' : ''}`}>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 shadow-md ${
                        isAI ? 'bg-gradient-to-tr from-pink-500 to-indigo-500' :
                        isAdmin ? 'bg-blue-600' : 'bg-slate-400'
                      }`}>
                        {isAI ? <Sparkles className="w-4 h-4" /> : isAdmin ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                      </div>
                      <div className={`p-4 rounded-2xl border ${
                        isAdmin 
                          ? 'bg-blue-600 border-blue-700 text-white rounded-tr-none' 
                          : isAI 
                          ? 'bg-indigo-50/50 border-indigo-100/50 rounded-tl-none'
                          : 'bg-slate-50 border-slate-100 rounded-tl-none'
                      }`}>
                        <p className={`text-xs font-bold mb-1 ${
                          isAdmin ? 'text-blue-100' : isAI ? 'text-indigo-600 font-semibold' : 'text-gray-500'
                        }`}>
                          {reply.senderName || (isAI ? 'Asistente IA DoorDrop' : 'Administrador')}
                        </p>
                        <p className={`text-sm font-medium whitespace-pre-wrap ${isAdmin ? 'text-white' : 'text-gray-800'}`}>
                          {reply.message}
                        </p>
                        <span className={`text-[10px] block mt-2 text-right ${isAdmin ? 'text-blue-200' : 'text-gray-400'}`}>
                          {new Date(reply.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Message Typing Footer */}
              <div className="p-4 border-t border-gray-100 bg-slate-50/50">
                {activeTicket.status === 'open' ? (
                  <form onSubmit={handleSendReply} className="flex gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Escribe tu respuesta como Administrador..."
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      className="flex-1 input-dynamic bg-white border-gray-200 py-3"
                    />
                    <button
                      type="submit"
                      disabled={replyLoading}
                      className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center shrink-0 shadow-md cursor-pointer"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </form>
                ) : (
                  <div className="text-center py-2 text-sm font-bold text-gray-500 bg-gray-100 rounded-xl">
                    Esta incidencia ha sido marcada como resuelta.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* TICKET LIST VIEW */
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/60 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar por cliente, correo, asunto o ID..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {([
                  { value: 'all', label: 'Todos' },
                  { value: 'open', label: 'Abiertos' },
                  { value: 'resolved', label: 'Resueltos' }
                ] as const).map((filter) => (
                  <button
                    type="button"
                    key={filter.value}
                    onClick={() => setStatusFilter(filter.value)}
                    className={`h-10 rounded-xl px-3.5 text-xs font-bold transition ${statusFilter === filter.value ? 'bg-slate-900 text-white shadow-md shadow-slate-900/15' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'}`}
                  >
                    {filter.label}
                  </button>
                ))}
                {ticketCategories.length > 0 && (
                  <label className="relative flex h-10 items-center">
                    <SlidersHorizontal className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" />
                    <select
                      value={categoryFilter}
                      onChange={(event) => setCategoryFilter(event.target.value)}
                      className="h-10 max-w-[190px] appearance-none rounded-xl border border-slate-200 bg-white pl-8 pr-8 text-xs font-bold text-slate-600 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                    >
                      <option value="all">Todas las categorías</option>
                      {ticketCategories.map((category) => <option key={category} value={category}>{getCategoryLabel(category)}</option>)}
                    </select>
                  </label>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">
              <span>{filteredTickets.length} de {tickets.length} conversaciones</span>
              {(searchTerm || statusFilter !== 'all' || categoryFilter !== 'all') && (
                <button type="button" onClick={() => { setSearchTerm(''); setStatusFilter('all'); setCategoryFilter('all'); }} className="font-bold text-blue-600 hover:text-blue-700">
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {tickets.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <LifeBuoy className="h-8 w-8" />
              </div>
              <h3 className="mb-2 text-xl font-black text-slate-900">No hay incidencias registradas</h3>
              <p className="mx-auto max-w-md text-sm font-medium leading-6 text-slate-500">Los clientes no han abierto tickets todavía. Cuando lo hagan, aparecerán listados aquí para que puedas darles respuesta.</p>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
              <Search className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <h3 className="text-lg font-black text-slate-900">No encontramos coincidencias</h3>
              <p className="mt-1 text-sm font-medium text-slate-500">Prueba con otro término o limpia los filtros para ver todos los tickets.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTickets.map((ticket) => {
                const latestReply = ticket.replies?.[ticket.replies.length - 1];
                const isOpen = ticket.status === 'open';
                return (
                  <button
                    type="button"
                    key={ticket.id}
                    onClick={() => setActiveTicket(ticket)}
                    className="group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm shadow-slate-200/40 transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-100/50 sm:p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3 sm:min-w-[220px] lg:max-w-[30%]">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${isOpen ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100' : 'bg-slate-100 text-slate-500'}`}>
                          {getTicketInitials(ticket)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-900">{getTicketName(ticket)}</p>
                          <p className="truncate text-xs font-medium text-slate-500">{ticket.userEmail || 'Cliente DoorDrop'}</p>
                          <p className="mt-1 truncate font-mono text-[10px] font-semibold text-slate-400">{ticket.id}</p>
                        </div>
                      </div>

                      <div className="min-w-0 flex-1 lg:max-w-[28%]">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-black text-slate-900">{ticket.subject || 'Consulta de soporte'}</p>
                          <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700 ring-1 ring-blue-100">{getCategoryLabel(ticket.category)}</span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-slate-500">{ticket.description || 'Sin descripción disponible.'}</p>
                      </div>

                      <div className="min-w-0 flex-1 lg:max-w-[28%]">
                        <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Última actividad</p>
                        <p className="line-clamp-2 text-xs font-medium leading-5 text-slate-600">{latestReply ? `${latestReply.senderName || 'Cliente'}: ${latestReply.message}` : 'Sin mensajes adicionales'}</p>
                        <p className="mt-2 text-[11px] font-semibold text-slate-400">{formatTicketDate(ticket.createdAt || ticket.created_at)}</p>
                      </div>

                      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 pt-3 lg:border-0 lg:pt-0">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ${isOpen ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-slate-100 text-slate-500'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${isOpen ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {isOpen ? 'Abierto' : 'Resuelto'}
                        </span>
                        <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
