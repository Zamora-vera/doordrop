import React, { useState, useEffect, useRef } from 'react';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { Sparkles, Send, Bot, User, Trash2, ArrowRight, LifeBuoy, ShieldCheck } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  escalated?: boolean;
}

const shortTime = (value: string) => {
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const sanitizeCopilotText = (value: string) => String(value || '')
  .replace(/\s*\(ad es\.[^)]*\)/gi, '')
  .replace(/\b(?:Paccofacile|SpediamoPro|ParcelABC)\b/gi, 'courier DoorDrop');

export function AiCopilotChat() {
  const { t, language } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>(() => localStorage.getItem('ship24go_ai_conversation_id') || '');
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const storageKey = `ship24go_ai_copilot_chat_${language}`;

  const initializeWelcomeMessage = () => {
    const welcomeMsg: ChatMessage = {
      id: 'welcome',
      role: 'assistant',
      content: t('ai_chat_welcome'),
      timestamp: new Date().toISOString()
    };
    setMessages([welcomeMsg]);
  };

  useEffect(() => {
    const savedChat = localStorage.getItem(storageKey);
    if (savedChat) {
      try {
        const parsed = JSON.parse(savedChat);
        if (Array.isArray(parsed) && parsed.length) {
          setMessages(parsed.map((message) => ({
            ...message,
            content: sanitizeCopilotText(message?.content || '')
          })));
          return;
        }
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
    initializeWelcomeMessage();
  }, [language]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (messages.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    }
  }, [messages, storageKey]);

  const handleSendMessage = async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText || loading) return;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: cleanText,
      timestamp: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setLoading(true);

    try {
      const historyPayload = messages
        .filter((m) => m.id !== 'welcome')
        .slice(-8)
        .map((m) => ({ role: m.role, content: sanitizeCopilotText(m.content) }));

      const res = await api.copilotMessage(cleanText, historyPayload, language, conversationId);
      if (res.conversationId) {
        setConversationId(res.conversationId);
        localStorage.setItem('ship24go_ai_conversation_id', res.conversationId);
      }

      const responseText = sanitizeCopilotText(res.response || res.message || t('ai_error_message'));
      const ticketNotice = res.ticket?.subject
        ? `${t('ai_ticket_created_notice')}\n${t('ticket_subject')}: ${sanitizeCopilotText(res.ticket.subject)}`
        : '';
      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}_a`,
        role: 'assistant',
        content: ticketNotice ? `${responseText}\n\n${ticketNotice}` : responseText,
        timestamp: new Date().toISOString(),
        escalated: Boolean(res.escalated)
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `msg_${Date.now()}_err`,
        role: 'assistant',
        content: t('ai_error_message'),
        timestamp: new Date().toISOString()
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    localStorage.removeItem(storageKey);
    localStorage.removeItem('ship24go_ai_conversation_id');
    setConversationId('');
    initializeWelcomeMessage();
  };

  const suggestions = [
    t('ai_chat_suggest_1'),
    t('ai_chat_suggest_2'),
    t('ai_chat_suggest_3')
  ];

  return (
    <div className="max-w-6xl mx-auto font-sans p-4 sm:p-6 lg:p-8">
      <div className="relative overflow-hidden rounded-[2rem] border border-blue-100 dark:border-blue-900/40 bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-950 p-6 sm:p-8 text-white shadow-xl shadow-blue-900/10 mb-6">
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-black uppercase tracking-[0.18em] mb-4">
              <Sparkles className="w-4 h-4" />
              {t('ai_connection_badge')}
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3">{t('ai_copilot')}</h1>
            <p className="text-sm sm:text-base text-blue-50/90 leading-relaxed font-medium">
              {t('ai_copilot_subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 min-w-[260px]">
            <div className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-sm">
              <ShieldCheck className="w-5 h-5 mb-2 text-emerald-200" />
              <p className="text-xs font-black uppercase tracking-wider text-blue-100">{t('ai_status_title')}</p>
              <p className="text-sm font-bold mt-1">{t('ai_status_connected')}</p>
            </div>
            <div className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-sm">
              <LifeBuoy className="w-5 h-5 mb-2 text-amber-200" />
              <p className="text-xs font-black uppercase tracking-wider text-blue-100">{t('ai_human_handoff')}</p>
              <p className="text-sm font-bold mt-1">{t('ai_human_handoff_ready')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="p-5 rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-slate-900/80 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              {t('ai_suggested_questions')}
            </h3>
            <div className="space-y-2.5">
              {suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(suggestion)}
                  disabled={loading}
                  className="w-full text-left p-3 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-slate-800/70 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-blue-200 dark:hover:border-blue-700 transition-all flex items-start gap-2 group cursor-pointer disabled:opacity-50"
                >
                  <ArrowRight className="w-3.5 h-3.5 mt-0.5 text-gray-400 group-hover:text-blue-500 transition-colors shrink-0" />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-bold block uppercase tracking-widest mb-1.5">
                {t('ai_data_scope_label')}
              </span>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal font-medium">
                {t('ai_data_scope_text')}
              </p>
            </div>
          </div>

          {messages.length > 1 && (
            <button
              onClick={clearChat}
              className="w-full flex items-center justify-center gap-2 text-xs font-bold text-red-600 dark:text-red-300 px-4 py-3 rounded-2xl bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors border border-red-100 dark:border-red-900/40 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{t('ai_clear_history')}</span>
            </button>
          )}
        </div>

        <div className="lg:col-span-3 flex flex-col h-[560px] sm:h-[640px] rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6 bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
            {messages.map((msg) => {
              const isAssistant = msg.role === 'assistant';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-[92%] sm:max-w-[85%] ${!isAssistant ? 'ml-auto flex-row-reverse' : ''}`}
                >
                  <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white shadow-md ${
                    isAssistant ? 'bg-gradient-to-tr from-blue-600 to-indigo-600' : 'bg-gray-900 dark:bg-white dark:text-gray-900'
                  }`}>
                    {isAssistant ? <Bot className="w-5 h-5" /> : <User className="w-4 h-4" />}
                  </div>

                  <div className={`p-3.5 sm:p-4 rounded-2xl border shadow-sm ${
                    !isAssistant
                      ? 'bg-blue-600 border-blue-700 text-white rounded-tr-none'
                      : msg.escalated
                        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 text-gray-800 dark:text-amber-50 rounded-tl-none'
                        : 'bg-white dark:bg-slate-800 border-gray-200/80 dark:border-gray-800/80 text-gray-800 dark:text-gray-200 rounded-tl-none'
                  }`}>
                    <p className={`text-[10px] font-black uppercase tracking-wider mb-1 ${!isAssistant ? 'text-blue-200' : 'text-blue-600 dark:text-blue-300'}`}>
                      {isAssistant ? t('ai_assistant_name') : t('ai_user_label')}
                    </p>
                    <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    <span className={`text-[9px] block text-right mt-1.5 ${!isAssistant ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'}`}>
                      {shortTime(msg.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex gap-3 max-w-[70%] animate-pulse">
                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-800 p-4 rounded-2xl rounded-tl-none flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-300">{t('ai_thinking')}</span>
                  <span className="flex gap-1.5">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:120ms]" />
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:240ms]" />
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(inputValue);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                required
                disabled={loading}
                placeholder={t('ai_chat_placeholder')}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="flex-1 px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={loading || !inputValue.trim()}
                title={t('ai_send')}
                className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl disabled:opacity-40 flex items-center justify-center shrink-0 shadow-md cursor-pointer transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
