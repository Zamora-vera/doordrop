import React, { useState, useEffect } from 'react';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { LifeBuoy, Send, MessageSquare, ChevronRight, Clock, User, Sparkles, AlertTriangle, ArrowLeft, CheckCircle, HelpCircle, Shield, Check, XCircle, Wallet } from 'lucide-react';

export function AdminTickets({ canReviewSensitive = true }: { canReviewSensitive?: boolean }) {
  const { t, language } = useI18n();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestedText, setAiSuggestedText] = useState('');

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-medium">Cargando tickets...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans">
      {/* HEADER SECTION */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg">
            <LifeBuoy className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900">Soporte, Tickets & Copiloto IA</h1>
            <p className="text-sm text-gray-500 font-medium">Panel de administración para resolver incidencias de clientes y simular respuestas generadas por Inteligencia Artificial.</p>
          </div>
        </div>
      </div>

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
                <p className="font-bold text-gray-900 mt-1">{activeTicket.userName}</p>
                <p className="text-xs text-slate-500 font-medium font-mono mt-0.5">{activeTicket.userEmail}</p>
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

              {activeTicket.trackingCode && (
                <div>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Código de Seguimiento</span>
                  <p className="font-mono text-sm text-blue-600 font-bold mt-1 underline">
                    {activeTicket.trackingCode}
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
                  {new Date(activeTicket.createdAt).toLocaleString()}
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
                    <p className="text-xs text-blue-600 font-bold mb-1">{activeTicket.userName} (Cliente)</p>
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
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          {tickets.length === 0 ? (
            <div className="p-20 text-center">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                <LifeBuoy className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-xl text-gray-900 mb-2">No hay incidencias registradas</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Los clientes no han abierto tickets todavía. Cuando lo hagan, aparecerán listados aquí para que puedas darles respuesta usando la Inteligencia Artificial.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-150">
              <div className="p-5 bg-slate-50/50 grid grid-cols-12 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <div className="col-span-4">Cliente & ID</div>
                <div className="col-span-3">Asunto / Categoría</div>
                <div className="col-span-3">Último Mensaje</div>
                <div className="col-span-2 text-right">Estado</div>
              </div>

              {tickets.map((t) => (
                <div 
                  key={t.id}
                  onClick={() => setActiveTicket(t)}
                  className="p-5 grid grid-cols-12 items-center hover:bg-slate-50/60 transition-colors cursor-pointer"
                >
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm shrink-0">
                      {t.userName ? t.userName.substring(0, 2).toUpperCase() : 'US'}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm leading-tight">{t.userName}</p>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">{t.userEmail}</p>
                      <p className="font-mono text-[10px] text-gray-400 mt-1">{t.id}</p>
                    </div>
                  </div>

                  <div className="col-span-3 pr-4">
                    <p className="font-bold text-gray-850 text-sm leading-tight line-clamp-1">{t.subject}</p>
                    <div className="mt-1">
                      <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-full border border-blue-100">
                        {getCategoryLabel(t.category)}
                      </span>
                    </div>
                  </div>

                  <div className="col-span-3 text-sm text-gray-600 font-medium line-clamp-2 pr-4">
                    {t.replies && t.replies.length > 0 ? (
                      <span className="italic">
                        {t.replies[t.replies.length - 1].senderName}: {t.replies[t.replies.length - 1].message}
                      </span>
                    ) : (
                      <span className="italic text-gray-400">Sin mensajes</span>
                    )}
                  </div>

                  <div className="col-span-2 text-right flex items-center justify-end gap-2">
                    {t.status === 'open' ? (
                      <span className="px-2.5 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full border border-green-100">
                        Abierto
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-500 text-xs font-bold rounded-full">
                        Resuelto
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
