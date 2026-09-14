import React, { useState, useEffect, useRef } from 'react';
import {
useLocation, useNavigate } from 'react-router-dom';
import {
  Settings,
  Volume2,
  VolumeX,
  MessageSquare,
  Bot,
  Share2,
  Calendar,
  Send,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCw,
  Search,
  Filter,
  User,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Trash2,
  Sliders,
  Check,
  CheckCheck,
  Zap,
  Globe,
  Radio,
  FileText,
  ShoppingBag,
  Truck,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Power,
  CreditCard,
  Wallet,
  X,
  Paperclip,
  PanelLeftClose,
  PanelLeft,
  UserCheck,
  Users,
  Phone,
  Mail,
  Package,
  ChevronDown
} from 'lucide-react';
import {
omnichannelApi } from '../lib/omnichannelApi';
import {
useI18n } from '../lib/i18n';


// Web Audio API soft chime for new incoming messages
function playNotificationChime() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    // Two-tone bell: 587Hz (D5) -> 880Hz (A5)
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (e) {
    // Ignore audio autoplays restrictions
  }
}


function renderPlatformLogo(platform: string, size = "w-4 h-4") {
  const p = (platform || '').toLowerCase();
  if (p === 'whatsapp') {
    return (
      <span className="inline-flex items-center justify-center rounded-full bg-[#25D366] text-white p-1" title="WhatsApp">
        <svg className={size} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.699c.971.531 1.769.814 2.796.814 3.183 0 5.769-2.586 5.769-5.766.001-3.18-2.585-5.766-5.769-5.766zm9.969 5.766c0 5.503-4.468 9.969-9.969 9.969-1.754 0-3.395-.453-4.823-1.248l-5.208 1.368 1.391-5.085c-.886-1.487-1.391-3.228-1.391-5.085 0-5.503 4.467-9.969 9.969-9.969 5.501 0 9.969 4.466 9.969 9.969z"/>
        </svg>
      </span>
    );
  }
  if (p === 'facebook' || p === 'messenger') {
    return (
      <span className="inline-flex items-center justify-center rounded-full bg-[#0084FF] text-white p-1" title="Facebook Messenger">
        <svg className={size} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.914 1.455 5.527 3.735 7.205V22l3.382-1.856c.928.257 1.91.396 2.923.396 5.523 0 10-4.145 10-9.258C22 6.145 17.523 2 12 2zm1.066 12.447l-2.724-2.906-5.312 2.906 5.845-6.208 2.725 2.906 5.31-2.906-5.844 6.208z"/>
        </svg>
      </span>
    );
  }
  if (p === 'instagram') {
    return (
      <span className="inline-flex items-center justify-center rounded-full bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] text-white p-1" title="Instagram">
        <svg className={size} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-[#0088cc] text-white p-1" title="Telegram">
      <svg className={size} fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
      </svg>
    </span>
  );
}

export function OmnichannelApp({ profile }: { profile: any }) {
  const { language } = useI18n();
  const lang = (language?.startsWith('it') ? 'it' : language?.startsWith('en') ? 'en' : language?.startsWith('de') ? 'de' : 'es');

  // Multi-language text dictionary
  const t = {
    es: {
      badge: 'DoorDrop Omnicanal + AI Employee',
      title: 'Atención Omnicanal y Empleado Inteligente 24/7',
      desc: 'Conecta WhatsApp, Instagram, Facebook y Telegram. Automatiza ventas, cotizaciones de envíos y respuestas sin límites de mensajes.',
      tabDashboard: 'Resumen',
      tabChannels: 'Canales Conectados',
      tabInbox: 'Bandeja Unificada',
      tabComments: 'Comentarios & DM',
      tabAi: 'Empleado AI',
      tabPublishing: 'Auto-Publicación',
      tabTeam: 'Equipo & Empleados',
      tabPlans: 'Planes & Precios',
      managePlans: 'Gestionar Planes',
      activePlan: 'Plan Actual Activo',
      activeChannels: 'Canales Activos',
      conversations: 'Conversaciones',
      processedMessages: 'Mensajes Procesados',
      aiEmployee: 'Empleado AI',
      unlimited: 'Ilimitados incluidos',
      noChannels: 'Aún no tienes canales conectados',
      noChannelsDesc: 'Conecta tu WhatsApp Business, Instagram o Messenger para empezar a atender clientes en una sola bandeja.',
      connectFirst: 'Conectar mi primer canal',
      connectChannel: 'Conectar Canal',
      connected: 'Conectado',
      disconnect: 'Desconectar',
      aiActive: 'AI Respondiendo',
      humanHandoff: 'Traspaso a Humano',
      selectConv: 'Selecciona una conversación de la lista',
      writeMsg: 'Escribe un mensaje...',
      send: 'Enviar',
      aiConfigTitle: 'Configuración del Empleado AI DoorDrop',
      aiConfigDesc: 'Alimentado por DeepSeek AI con conocimiento de tu catálogo y cotizador de envíos DoorDrop.',
      assistantName: 'Nombre del Asistente',
      tone: 'Tono de Comunicación',
      mainLang: 'Idioma Principal',
      businessKnowledge: 'Información del Negocio & Políticas (Knowledge Base)',
      faqs: 'Preguntas Frecuentes (FAQs)',
      saveAi: 'Guardar Configuración AI',
      savedSuccess: 'Configuración guardada exitosamente.',
      polarCheckout: 'Suscribirse con Polar',
      walletPay: 'Pagar con Saldo DoorDrop',
      currentPlanBadge: 'TU PLAN ACTUAL',
      upgradePlan: 'Cambiar a este Plan'
    },
    it: {
      badge: 'DoorDrop Omnicanale + AI Employee',
      title: 'Assistenza Omnicanale & Dipendente Virtuale 24/7',
      desc: 'Collega WhatsApp, Instagram, Facebook e Telegram. Automatizza vendite, preventivi di spedizione e risposte senza limiti di messaggi.',
      tabDashboard: 'Riepilogo',
      tabChannels: 'Canali Collegati',
      tabInbox: 'Posta Unificata',
      tabComments: 'Commenti & DM',
      tabAi: 'Dipendente AI',
      tabPublishing: 'Auto-Pubblicazione',
      tabTeam: 'Team & Dipendenti',
      tabPlans: 'Piani & Prezzi',
      managePlans: 'Gestisci Piani',
      activePlan: 'Piano Attuale Attivo',
      activeChannels: 'Canali Attivi',
      conversations: 'Conversazioni',
      processedMessages: 'Messaggi Elaborati',
      aiEmployee: 'Dipendente AI',
      unlimited: 'Illimitati inclusi',
      noChannels: 'Nessun canale ancora collegato',
      noChannelsDesc: 'Collega il tuo WhatsApp Business, Instagram o Messenger per gestire tutti i clienti in un unico posto.',
      connectFirst: 'Collega il tuo primo canale',
      connectChannel: 'Collega Canale',
      connected: 'Collegato',
      disconnect: 'Disconnetti',
      aiActive: 'AI in Risposta',
      humanHandoff: 'Passa a Operatore Umano',
      selectConv: 'Seleziona una conversazione dall\'elenco',
      writeMsg: 'Scrivi una risposta...',
      send: 'Invia',
      aiConfigTitle: 'Configurazione Dipendente AI DoorDrop',
      aiConfigDesc: 'Potenziato con DeepSeek AI, catalogo prodotti e calcolo spedizioni DoorDrop in tempo reale.',
      assistantName: 'Nome Assistente',
      tone: 'Tono di Comunicazione',
      mainLang: 'Lingua Principale',
      businessKnowledge: 'Informazioni Negozio & Politiche (Base di Conoscenza)',
      faqs: 'Domande Frequenti (FAQ)',
      saveAi: 'Salva Configurazione AI',
      savedSuccess: 'Configurazione salvata con successo.',
      polarCheckout: 'Abbonati con Polar',
      walletPay: 'Paga con Saldo DoorDrop',
      currentPlanBadge: 'IL TUO PIANO ATTUALE',
      upgradePlan: 'Passa a questo Piano'
    },
    en: {
      badge: 'DoorDrop Omnichannel + AI Employee',
      title: 'Omnichannel Support & 24/7 AI Employee',
      desc: 'Connect WhatsApp, Instagram, Facebook and Telegram. Automate sales, live shipping quotes, and customer inquiries with unlimited messages.',
      tabDashboard: 'Overview',
      tabChannels: 'Channels',
      tabInbox: 'Unified Inbox',
      tabComments: 'Comments & DM',
      tabAi: 'AI Employee',
      tabPublishing: 'Auto-Publishing',
      tabTeam: 'Team & Staff',
      tabPlans: 'Plans & Pricing',
      managePlans: 'Manage Plans',
      activePlan: 'Current Active Plan',
      activeChannels: 'Active Channels',
      conversations: 'Conversations',
      processedMessages: 'Processed Messages',
      aiEmployee: 'AI Employee',
      unlimited: 'Unlimited included',
      noChannels: 'No connected channels yet',
      noChannelsDesc: 'Connect your WhatsApp Business, Instagram or Messenger to reply to customers in a single inbox.',
      connectFirst: 'Connect your first channel',
      connectChannel: 'Connect Channel',
      connected: 'Connected',
      disconnect: 'Disconnect',
      aiActive: 'AI Replying',
      humanHandoff: 'Human Handoff',
      selectConv: 'Select a conversation from the list',
      writeMsg: 'Type a message...',
      send: 'Send',
      aiConfigTitle: 'DoorDrop AI Employee Configuration',
      aiConfigDesc: 'Powered by DeepSeek AI with store inventory knowledge and live DoorDrop shipping calculation.',
      assistantName: 'Assistant Name',
      tone: 'Communication Tone',
      mainLang: 'Primary Language',
      businessKnowledge: 'Store Info & Policies (Knowledge Base)',
      faqs: 'Frequently Asked Questions (FAQs)',
      saveAi: 'Save AI Settings',
      savedSuccess: 'Settings saved successfully.',
      polarCheckout: 'Subscribe with Polar',
      walletPay: 'Pay with DoorDrop Balance',
      currentPlanBadge: 'YOUR CURRENT PLAN',
      upgradePlan: 'Upgrade to this Plan'
    },
    de: {
      badge: 'DoorDrop Omnikanal + AI Employee',
      title: 'Omnikanal-Support & 24/7 KI-Mitarbeiter',
      desc: 'Verbinden Sie WhatsApp, Instagram, Facebook und Telegram. Unbegrenzte Nachrichten und automatische Versandkalkulation.',
      tabDashboard: 'Übersicht',
      tabChannels: 'Kanäle',
      tabInbox: 'Posteingang',
      tabComments: 'Kommentare & DM',
      tabAi: 'KI-Mitarbeiter',
      tabPublishing: 'Auto-Publishing',
      tabTeam: 'Team & Mitarbeiter',
      tabPlans: 'Pläne & Preise',
      managePlans: 'Pläne verwalten',
      activePlan: 'Aktueller aktiver Plan',
      activeChannels: 'Aktive Kanäle',
      conversations: 'Unterhaltungen',
      processedMessages: 'Verarbeitete Nachrichten',
      aiEmployee: 'KI-Mitarbeiter',
      unlimited: 'Unbegrenzt inklusive',
      noChannels: 'Noch keine Kanäle verbunden',
      noChannelsDesc: 'Verbinden Sie WhatsApp Business oder Instagram, um Kunden zentral zu betreuen.',
      connectFirst: 'Ersten Kanal verbinden',
      connectChannel: 'Kanal verbinden',
      connected: 'Verbunden',
      disconnect: 'Trennen',
      aiActive: 'KI antwortet',
      humanHandoff: 'An Menschen übergeben',
      selectConv: 'Wählen Sie ein Gespräch aus der Liste',
      writeMsg: 'Nachricht schreiben...',
      send: 'Senden',
      aiConfigTitle: 'DoorDrop KI-Konfiguration',
      aiConfigDesc: 'Unterstützt von DeepSeek AI mit Produkt- und Versandinventar in Echtzeit.',
      assistantName: 'Name des Assistenten',
      tone: 'Kommunikationston',
      mainLang: 'Hauptsprache',
      businessKnowledge: 'Unternehmensdaten & Richtlinien',
      faqs: 'Häufig gestellte Fragen (FAQs)',
      saveAi: 'KI-Einstellungen speichern',
      savedSuccess: 'Erfolgreich gespeichert.',
      polarCheckout: 'Mit Polar abonnieren',
      walletPay: 'Mit Guthaben bezahlen',
      currentPlanBadge: 'IHR AKTUELLER PLAN',
      upgradePlan: 'Zu diesem Plan wechseln'
    }
  }[lang];

  const location = useLocation();
  const navigate = useNavigate();

  const getInitialTab = (): 'dashboard' | 'channels' | 'inbox' | 'comments' | 'ai' | 'publishing' | 'team' | 'plans' => {
    try {
      const params = new URLSearchParams(location.search);
      const t = params.get('tab');
      if (t && ['dashboard', 'channels', 'inbox', 'comments', 'ai', 'publishing', 'team', 'plans'].includes(t)) {
        return t as any;
      }
    } catch {}
    return 'dashboard';
  };

  const [activeTab, setActiveTabState] = useState<'dashboard' | 'channels' | 'inbox' | 'comments' | 'ai' | 'publishing' | 'team' | 'plans'>(getInitialTab);

  const setActiveTab = (tab: 'dashboard' | 'channels' | 'inbox' | 'comments' | 'ai' | 'publishing' | 'team' | 'plans') => {
    setActiveTabState(tab);
    try {
      const sp = new URLSearchParams(location.search);
      sp.set('tab', tab);
      navigate({ search: sp.toString() }, { replace: true });
    } catch {}
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get('tab');
    if (t && t !== activeTab && ['dashboard', 'channels', 'inbox', 'comments', 'ai', 'publishing', 'team', 'plans'].includes(t)) {
      setActiveTabState(t as any);
    }
  }, [location.search]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Inbox States
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // Live Chat UI & Team State (Modern Omnichannel Inbox)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [mobileView, setMobileView] = useState<'sidebar' | 'chat'>('chat');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showCatalogModal, setShowCatalogModal] = useState<boolean>(false);
  const [showQuickReplies, setShowQuickReplies] = useState<boolean>(false);
  const [showInfoDrawer, setShowInfoDrawer] = useState<boolean>(false);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loadingTeam, setLoadingTeam] = useState<boolean>(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState<boolean>(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberType, setNewMemberType] = useState<'human' | 'ai'>('human');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Real Catalog & Products State (Marketplace Matterhorn / Zubay IT - 100% Real Live Inventory)
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(false);
  const [catalogSearch, setCatalogSearch] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // New Conversation Modal State
  const [showNewConvModal, setShowNewConvModal] = useState<boolean>(false);
  const [newConvName, setNewConvName] = useState<string>('');
  const [newConvPhone, setNewConvPhone] = useState<string>('');
  const [newConvPlatform, setNewConvPlatform] = useState<string>('whatsapp');
  const [newConvMsg, setNewConvMsg] = useState<string>('');
  const [creatingConv, setCreatingConv] = useState<boolean>(false);

  const handleCreateConversation = async () => {
    if (!newConvName.trim() && !newConvPhone.trim()) {
      alert('Ingresa el nombre o número de contacto.');
      return;
    }
    setCreatingConv(true);
    try {
      const res = await (omnichannelApi as any).createConversation({
        contact_name: newConvName.trim() || 'Cliente Directo',
        contact_phone: newConvPhone.trim(),
        platform: newConvPlatform,
        initial_message: newConvMsg.trim() || '¡Hola! Gracias por contactarnos en DoorDrop. ¿En qué podemos ayudarte hoy?'
      });
      setShowNewConvModal(false);
      setNewConvName('');
      setNewConvPhone('');
      setNewConvMsg('');
      await loadInbox();
      if (res && res.conversation) {
        selectConversation(res.conversation);
      }
    } catch (err: any) {
      alert(err.message || 'Error creando la conversación');
    } finally {
      setCreatingConv(false);
    }
  };


  // AI Employee States
  const [aiSettings, setAiSettings] = useState<any>({
    agent_name: 'DoorDrop Sales Consultant',
    tone: 'friendly_professional',
    language: lang,
    system_prompt: '',
    business_info: '',
    faqs: [],
    website_url: '',
    can_lookup_orders: true,
    can_lookup_tracking: true,
    can_quote_shipping: true,
    can_search_products: true,
    can_handoff_human: true,
    can_send_photos: true,
    can_create_orders: true,
    can_generate_tracking: true,
    min_order_amount: '0.00',
    free_shipping_threshold: '50.00',
    sales_contract_text: 'Spedizioni espresse 24/48h tracciate con corriere DoorDrop. Spedizione gratuita per ordini superiori a 50€. Reso e sostituzione taglia garantiti entro 14 giorni dalla ricezione del pacco.',
    response_delay_seconds: 3,
    personality_instructions: 'Sii sempre accogliente, cordiale ed empatico. Guida il cliente nella scelta della taglia corretta, proponi abbinamenti eleganti e concludi la vendita fornendo risposte chiare e trasparenti.',
    auto_learn_conversations: true
  });
  const [faqQ, setFaqQ] = useState('');
  const [faqA, setFaqA] = useState('');
  const [savingAi, setSavingAi] = useState(false);
  const [autofillingAi, setAutofillingAi] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<'all' | 'unread' | 'whatsapp' | 'instagram' | 'facebook' | 'telegram'>('all');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevMsgCountRef = useRef<number>(0);
  const [toolTestResult, setToolTestResult] = useState<any>(null);

  // Comments State
  const [comments, setComments] = useState<any[]>([]);
  const [replyTextMap, setReplyTextMap] = useState<Record<number, string>>({});
  const [commentRules, setCommentRules] = useState<any[]>([]);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleKeywords, setNewRuleKeywords] = useState('');
  const [newRulePublicReply, setNewRulePublicReply] = useState('');

  // Plans & Addons
  const [plansData, setPlansData] = useState<any>(null);
  const [subscribingCode, setSubscribingCode] = useState<string | null>(null);

  const clientCurrency = profile?.currency || 'EUR';

  // Load Dashboard Data
  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await omnichannelApi.getDashboard();
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Error al obtener datos del panel Omnicanal.');
    } finally {
      setLoading(false);
    }
  };

  // Load Inbox
  const loadInbox = async () => {
    if (teamMembers.length === 0) loadTeam();
    try {
      const res = await omnichannelApi.getConversations();
      const list = res.conversations || [];
      setConversations(list);

      // Check total messages to sound chime on incoming
      const totalUnread = list.reduce((acc: number, c: any) => acc + (Number(c.unread_count) || 0), 0);
      if (prevMsgCountRef.current > 0 && totalUnread > prevMsgCountRef.current && soundEnabled) {
        playNotificationChime();
      }
      prevMsgCountRef.current = totalUnread;
      if (res.conversations?.length > 0) {
        if (!selectedConv) {
          selectConversation(res.conversations[0]);
        } else {
          // Update selected conv if active
          const updated = res.conversations.find((c: any) => c.id === selectedConv.id);
          if (updated) setSelectedConv(updated);
        }
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const selectConversation = async (conv: any) => {
    setSelectedConv(conv);
    try {
      const res = await omnichannelApi.getMessages(conv.id);
      setMessages(res.messages || []);
    } catch (e: any) {
      console.error(e);
    }
  };

  // Load Team
  const loadTeam = async () => {
    setLoadingTeam(true);
    try {
      const res = await (omnichannelApi as any).getTeam();
      if (res && res.team) {
        setTeamMembers(res.team);
      }
    } catch (e: any) {
      console.error('[Omnichannel] Error loading team:', e);
    } finally {
      setLoadingTeam(false);
    }
  };

  // Transfer conversation to an agent (AI or human)
  const handleTransfer = async (targetAgent: any) => {
    if (!selectedConv) return;
    try {
      const res = await (omnichannelApi as any).transferConversation(
        selectedConv.id,
        targetAgent.member_id || targetAgent.id,
        targetAgent.name,
        targetAgent.type
      );
      
      const updatedConv = {
        ...selectedConv,
        assigned_agent_id: targetAgent.member_id || targetAgent.id,
        assigned_agent_name: targetAgent.name,
        assigned_agent_type: targetAgent.type,
        ai_active: targetAgent.type === 'ai' ? 1 : 0
      };
      
      setSelectedConv(updatedConv);
      setConversations(conversations.map(c => c.id === selectedConv.id ? updatedConv : c));
      
      // Reload messages to display the automatic system banner
      const mRes = await omnichannelApi.getMessages(selectedConv.id);
      setMessages(mRes.messages || []);
    } catch (err: any) {
      alert(err.message || 'Error al transferir conversación');
    }
  };

  // Toggle quick AI <-> Human handover
  const handleQuickHandover = async () => {
    if (!selectedConv) return;
    const isCurrentlyAi = selectedConv.ai_active === 1 || selectedConv.assigned_agent_type === 'ai';
    const target = isCurrentlyAi
      ? teamMembers.find(m => m.type === 'human')
      : teamMembers.find(m => m.type === 'ai');
    if (!target) { alert('No hay miembros del equipo configurados. Ve a "Equipo" para agregar agentes.'); return; }
    
    await handleTransfer(target);
  };

  // Add new team member
  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;
    try {
      await (omnichannelApi as any).addTeamMember({
        name: newMemberName.trim(),
        role: newMemberRole.trim() || (newMemberType === 'ai' ? 'Agente Virtual' : 'Especialista de Ventas'),
        email: newMemberEmail.trim(),
        phone: newMemberPhone.trim(),
        type: newMemberType
      });
      setShowAddMemberModal(false);
      setNewMemberName('');
      setNewMemberRole('');
      setNewMemberEmail('');
      setNewMemberPhone('');
      loadTeam();
      alert('Miembro del equipo registrado exitosamente.');
    } catch (err: any) {
      alert(err.message || 'Error al registrar miembro del equipo');
    }
  };

  // Delete team member
  const handleDeleteMember = async (id: any) => {
    if (!confirm('¿Seguro que deseas desactivar este miembro del equipo?')) return;
    try {
      await (omnichannelApi as any).deleteTeamMember(id);
      loadTeam();
    } catch (err: any) {
      alert(err.message || 'Error al eliminar miembro');
    }
  };

  
  // Real Marketplace Catalog Fetcher
  const loadCatalogProducts = async () => {
    setLoadingCatalog(true);
    try {
      const res = await fetch('/api/marketplace/listings?limit=50');
      const json = await res.json();
      if (json && Array.isArray(json.listings)) {
        const mapped = json.listings.map((item: any) => ({
          id: item.id,
          title: item.title,
          slug: item.slug,
          price: (Number(item.price_minor || 0) / 100).toFixed(2),
          currency: item.currency || 'EUR',
          image: item.cover_image_url || (item.images && item.images[0]?.url) || '',
          quantity: item.quantity || 0,
          category: item.category_name || item.category?.name || 'General',
          sku: item.id.slice(0, 8).toUpperCase()
        }));
        setCatalogProducts(mapped);
      }
    } catch (err) {
      console.error('Error loading real marketplace catalog:', err);
    } finally {
      setLoadingCatalog(false);
    }
  };

  const handleSendProduct = async (item: any) => {
    if (!selectedConv) return;
    const productUrl = `https://doordrop.lat/marketplace/listing/${item.slug || item.id}`;
    const text = `🛍️ *${item.title}*\n💰 Precio: ${item.price} ${item.currency}\n📦 Envío Express disponible por DoorDrop\n🔗 Ver producto y comprar: ${productUrl}`;
    setShowCatalogModal(false);
    try {
      await omnichannelApi.sendMessage(selectedConv.id, text);
      const res = await omnichannelApi.getMessages(selectedConv.id);
      setMessages(res.messages || []);
      loadInbox();
    } catch (err: any) {
      alert(err.message || 'Error al enviar producto');
    }
  };

  const handleSendCheckout = async (item: any) => {
    if (!selectedConv) return;
    const checkoutUrl = `https://doordrop.lat/marketplace/listing/${item.slug || item.id}`;
    const text = `💳 *Orden de Pago Seguro DoorDrop SafePay*\n📦 Producto: ${item.title}\n💵 Total a pagar: ${item.price} ${item.currency}\n🔒 Transacción protegida con garantía SafePay DoorDrop.\n👉 Pagar ahora: ${checkoutUrl}`;
    setShowCatalogModal(false);
    try {
      await omnichannelApi.sendMessage(selectedConv.id, text);
      const res = await omnichannelApi.getMessages(selectedConv.id);
      setMessages(res.messages || []);
      loadInbox();
    } catch (err: any) {
      alert(err.message || 'Error al generar orden SafePay');
    }
  };

  const handleSendMessage = async () => {
    if (!msgInput.trim() || !selectedConv || sendingMsg) return;
    setSendingMsg(true);
    try {
      await omnichannelApi.sendMessage(selectedConv.id, msgInput.trim());
      setMsgInput('');
      const res = await omnichannelApi.getMessages(selectedConv.id);
      setMessages(res.messages || []);
      loadInbox();
    } catch (err: any) {
      alert(err.message || 'Error al enviar mensaje');
    } finally {
      setSendingMsg(false);
    }
  };

  const handleToggleAi = async () => {
    if (!selectedConv) return;
    const nextVal = !selectedConv.ai_active;
    try {
      await omnichannelApi.toggleAi(selectedConv.id, nextVal);
      setSelectedConv({ ...selectedConv, ai_active: nextVal ? 1 : 0 });
      setConversations(conversations.map(c => c.id === selectedConv.id ? { ...c, ai_active: nextVal ? 1 : 0 } : c));
    } catch (e: any) {
      alert('Error cambiando estado de AI');
    }
  };

  // Connect Channel
  const handleConnectChannel = async (platform: string) => {
    try {
      const res = await omnichannelApi.getConnectUrl(platform);
      if (res.authUrl) {
        window.open(res.authUrl, '_blank', 'width=700,height=750');
      } else {
        alert('Enlace de conexión generado.');
      }
    } catch (err: any) {
      alert(err.message || 'Error conectando canal');
    }
  };

  // Disconnect Channel
  const handleDisconnect = async (accId: number) => {
    if (!confirm('¿Deseas desconectar este canal?')) return;
    try {
      await omnichannelApi.disconnectChannel(accId);
      loadDashboard();
    } catch (e: any) {
      alert(e.message || 'Error desconectando canal');
    }
  };

  // Load AI Settings
  const loadAi = async () => {
    try {
      const res = await omnichannelApi.getAiSettings();
      if (res.ai_settings) {
        setAiSettings({
          ...res.ai_settings,
          can_lookup_orders: !!res.ai_settings.can_lookup_orders,
          can_lookup_tracking: !!res.ai_settings.can_lookup_tracking,
          can_quote_shipping: !!res.ai_settings.can_quote_shipping,
          can_search_products: !!res.ai_settings.can_search_products,
          can_handoff_human: !!res.ai_settings.can_handoff_human,
          can_send_photos: res.ai_settings.can_send_photos !== 0,
          can_create_orders: res.ai_settings.can_create_orders !== 0,
          can_generate_tracking: res.ai_settings.can_generate_tracking !== 0,
          response_delay_seconds: res.ai_settings.response_delay_seconds !== undefined ? Number(res.ai_settings.response_delay_seconds) : 3,
          personality_instructions: res.ai_settings.personality_instructions || '',
          auto_learn_conversations: res.ai_settings.auto_learn_conversations !== 0
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  
  // AI One-Click Auto-Fill with DeepSeek
  const handleAutofillAi = async () => {
    setAutofillingAi(true);
    try {
      const res = await (omnichannelApi as any).autofillAiSettings();
      if (res.ai_settings) {
        const s = res.ai_settings;
        setAiSettings((prev: any) => ({
          ...prev,
          agent_name: s.agent_name || prev.agent_name,
          tone: s.tone || prev.tone,
          language: s.language || prev.language,
          business_info: s.business_info || prev.business_info,
          personality_instructions: s.personality_instructions || prev.personality_instructions,
          sales_contract_text: s.sales_contract_text || prev.sales_contract_text,
          free_shipping_threshold: s.free_shipping_threshold !== undefined ? String(s.free_shipping_threshold) : prev.free_shipping_threshold,
          min_order_amount: s.min_order_amount !== undefined ? String(s.min_order_amount) : prev.min_order_amount,
          response_delay_seconds: s.response_delay_seconds || 3,
          faqs: Array.isArray(s.faqs) && s.faqs.length > 0 ? s.faqs : prev.faqs
        }));
        setSuccessMsg('✨ Configurazione completata con successo dall\'IA analizzando il tuo catalogo e profilo negozio!');
        setTimeout(() => setSuccessMsg(null), 5000);
      }
    } catch (e: any) {
      alert(e.message || 'Error autocompletando con IA');
    } finally {
      setAutofillingAi(false);
    }
  };

  const handleSaveAi = async () => {
    setSavingAi(true);
    try {
      await omnichannelApi.saveAiSettings(aiSettings);
      setSuccessMsg(t.savedSuccess);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (e: any) {
      alert(e.message || 'Error guardando AI');
    } finally {
      setSavingAi(false);
    }
  };

  const handleAddFaq = () => {
    if (!faqQ.trim() || !faqA.trim()) return;
    setAiSettings({
      ...aiSettings,
      faqs: [...(aiSettings.faqs || []), { q: faqQ.trim(), a: faqA.trim() }]
    });
    setFaqQ('');
    setFaqA('');
  };

  const handleRemoveFaq = (idx: number) => {
    const next = [...aiSettings.faqs];
    next.splice(idx, 1);
    setAiSettings({ ...aiSettings, faqs: next });
  };

  // Run AI internal tool test
  const handleTestTool = async (tool: string, args: any) => {
    try {
      const res = await omnichannelApi.testAiTool(tool, args);
      setToolTestResult({ tool, result: res.result });
    } catch (e: any) {
      alert(e.message || 'Error probando herramienta');
    }
  };

  // Load Comments
  const loadComments = async () => {
    try {
      const res = await omnichannelApi.getComments();
      setComments(res.comments || []);
      setCommentRules(res.automation_rules || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleReplyComment = async (commentId: number) => {
    const text = replyTextMap[commentId];
    if (!text?.trim()) return;
    try {
      await omnichannelApi.replyComment(commentId, text.trim());
      setReplyTextMap({ ...replyTextMap, [commentId]: '' });
      loadComments();
    } catch (e: any) {
      alert(e.message || 'Error al responder comentario');
    }
  };

  // Load Plans
  const loadPlans = async () => {
    try {
      const res = await omnichannelApi.getPlans(clientCurrency);
      setPlansData(res);
    } catch (e: any) {
      console.error(e);
      setPlansData({ plans: [], addOns: [], error: e?.message || 'No se pudo cargar el catálogo.' });
    }
  };

  // Handle the only supported activation path: a recurring Polar checkout.
  const handleSubscribe = async (plan: any) => {
    setSubscribingCode(plan.code);
    try {
      if (!plan.checkout_ready) {
        throw new Error('Este plan todavía no está configurado en Polar. El administrador debe asociar su producto recurrente.');
      }
      const pData = await omnichannelApi.createPolarCheckout(plan.id);
      if (!pData.url) throw new Error('Polar no devolvió una URL de checkout.');
      window.location.href = pData.url;
    } catch (e: any) {
      alert(e.message || 'Error activando plan');
    } finally {
      setSubscribingCode(null);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // Polling for live messages in inbox tab
  useEffect(() => {
    if (activeTab === 'inbox') {
      loadInbox();
      const interval = setInterval(loadInbox, 4000);
      return () => clearInterval(interval);
    }
    if (activeTab === 'ai') loadAi();
    if (activeTab === 'comments') loadComments();
    if (activeTab === 'plans') loadPlans();
    if (activeTab === 'team' || activeTab === 'inbox') loadTeam();
  }, [activeTab]);

  const currentPlanCode = data?.subscription?.is_active ? data.subscription.plan_code : null;


  // -------------------------------------------------------------------------
  // 1. DEDICATED FULL-HEIGHT LIVE CHAT WORKSTATION (Inbox Mode)
  // -------------------------------------------------------------------------
  if (activeTab === 'inbox') {
    return (
      <div className="h-[calc(100vh-4.5rem)] md:h-[calc(100vh-5rem)] flex flex-col -m-4 sm:-m-6 lg:-m-8 bg-slate-100 dark:bg-slate-950 select-none overflow-hidden">
        {/* Dedicated Live Chat Header */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 flex items-center justify-between shrink-0 z-20 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                Live Chat Omnicanal
              </span>
            </div>
            <span className="hidden sm:inline text-xs text-slate-300 dark:text-slate-700">|</span>
            <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400">
              WhatsApp • Instagram • Facebook • Telegram
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowNewConvModal(true)}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Chat</span>
            </button>
            <button
              onClick={() => setActiveTab('team')}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5 border border-slate-200 dark:border-slate-800"
            >
              <Users className="w-3.5 h-3.5 text-blue-500" />
              <span className="hidden md:inline">Equipo</span>
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5 border border-slate-200 dark:border-slate-800"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>Configuración</span>
            </button>
          </div>
        </div>

        {/* Live Chat Workstation */}
                <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 overflow-hidden relative select-none">
          
          {/* Main Workspace: Left Inbox Column + Center Chat Stream + Right Info Drawer */}
          <div className="flex-1 flex overflow-hidden relative">

            {/* Left Column: Unified Inbox Sidebar (Collapsible & Mobile Full-screen) */}
            <aside
              className={`transition-all duration-300 ease-in-out border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col z-20 ${
                mobileView === 'chat' ? 'hidden md:flex' : 'flex w-full'
              } ${
                isSidebarCollapsed
                  ? 'md:w-0 md:opacity-0 md:pointer-events-none md:border-r-0'
                  : 'md:w-[350px] lg:w-[380px] md:opacity-100'
              }`}
            >
              {/* Sidebar Header */}
              <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800/80 space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-blue-600" />
                      <span>Bandeja Unificada</span>
                    </h1>
                    {conversations.reduce((acc, curr) => acc + (Number(curr.unread_count) || 0), 0) > 0 && (
                      <span className="relative flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white shadow-sm shadow-blue-500/50 animate-pulse">
                        {conversations.reduce((acc, curr) => acc + (Number(curr.unread_count) || 0), 0)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setSoundEnabled(!soundEnabled)}
                      title={soundEnabled ? 'Silenciar notificaciones' : 'Activar sonido'}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      {soundEnabled ? (
                        <Volume2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <VolumeX className="w-4 h-4 text-rose-500" />
                      )}
                    </button>

                    <button
                      onClick={loadInbox}
                      title="Refrescar conversaciones"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>

                    {/* Desktop Quick Collapse */}
                    <button
                      onClick={() => setIsSidebarCollapsed(true)}
                      title="Ocultar barra lateral"
                      className="hidden md:flex p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <PanelLeftClose className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Fast Search Bar */}
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar cliente, mensaje o teléfono..."
                    className="w-full h-9 pl-9 pr-8 bg-slate-100 dark:bg-slate-800/70 text-xs rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 border border-transparent dark:border-slate-700/50 transition"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Channel Filter Pills with Touch-friendly Horizontal Scroll */}
                <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                  <button
                    onClick={() => setInboxFilter('all')}
                    className={`px-3 py-1 rounded-lg font-medium whitespace-nowrap transition-all ${
                      inboxFilter === 'all'
                        ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/80'
                    }`}
                  >
                    Todos
                  </button>

                  <button
                    onClick={() => setInboxFilter('unread')}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-all ${
                      inboxFilter === 'unread'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/80'
                    }`}
                  >
                    Sin leer
                  </button>

                  <button
                    onClick={() => setInboxFilter('whatsapp')}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap flex items-center space-x-1.5 transition-all ${
                      inboxFilter === 'whatsapp'
                        ? 'bg-[#25D366] text-white shadow-sm shadow-[#25D366]/30'
                        : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40 hover:bg-emerald-100'
                    }`}
                  >
                    {renderPlatformLogo('whatsapp', "w-3.5 h-3.5")}
                    <span>WhatsApp</span>
                  </button>

                  <button
                    onClick={() => setInboxFilter('instagram')}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap flex items-center space-x-1.5 transition-all ${
                      inboxFilter === 'instagram'
                        ? 'bg-gradient-to-r from-purple-600 via-rose-500 to-amber-500 text-white shadow-sm'
                        : 'bg-pink-50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-400 border border-pink-200/50 dark:border-pink-800/40 hover:bg-pink-100'
                    }`}
                  >
                    {renderPlatformLogo('instagram', "w-3.5 h-3.5")}
                    <span>Instagram</span>
                  </button>

                  <button
                    onClick={() => setInboxFilter('facebook')}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap flex items-center space-x-1.5 transition-all ${
                      inboxFilter === 'facebook'
                        ? 'bg-[#0084FF] text-white shadow-sm'
                        : 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/40 hover:bg-blue-100'
                    }`}
                  >
                    {renderPlatformLogo('facebook', "w-3.5 h-3.5")}
                    <span>Messenger</span>
                  </button>

                  <button
                    onClick={() => setInboxFilter('telegram')}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap flex items-center space-x-1.5 transition-all ${
                      inboxFilter === 'telegram'
                        ? 'bg-[#29B6F6] text-white shadow-sm'
                        : 'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 border border-sky-200/50 dark:border-sky-800/40 hover:bg-sky-100'
                    }`}
                  >
                    {renderPlatformLogo('telegram', "w-3.5 h-3.5")}
                    <span>Telegram</span>
                  </button>
                </div>
              </div>

              {/* Conversation List */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                {conversations
                  .filter(c => {
                    const matchesSearch = !searchQuery.trim() ||
                      (c.contact_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (c.last_message || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (c.contact_phone || '').includes(searchQuery);

                    if (!matchesSearch) return false;
                    if (inboxFilter === 'all') return true;
                    if (inboxFilter === 'unread') return (Number(c.unread_count) || 0) > 0;
                    if (inboxFilter === 'whatsapp') return c.platform === 'whatsapp';
                    if (inboxFilter === 'instagram') return c.platform === 'instagram';
                    if (inboxFilter === 'facebook') return ['facebook', 'messenger'].includes(c.platform);
                    if (inboxFilter === 'telegram') return c.platform === 'telegram';
                    return true;
                  })
                  .length === 0 ? (
                  <div className="p-6 text-center space-y-3 my-auto">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white">Bandeja Vacía</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5 max-w-[200px] mx-auto">
                        Sin conversaciones activas. Conecta tus canales o inicia un chat de prueba.
                      </p>
                    </div>
                    <div className="pt-2 space-y-2">
                      <button
                        onClick={() => setShowNewConvModal(true)}
                        className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" /> Iniciar Chat / Prueba
                      </button>
                      <button
                        onClick={() => setActiveTab('channels')}
                        className="w-full py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                      >
                        Conectar Canales
                      </button>
                    </div>
                  </div>
                ) : (
                  conversations
                    .filter(c => {
                      const matchesSearch = !searchQuery.trim() ||
                        (c.contact_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (c.last_message || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (c.contact_phone || '').includes(searchQuery);

                      if (!matchesSearch) return false;
                      if (inboxFilter === 'all') return true;
                      if (inboxFilter === 'unread') return (Number(c.unread_count) || 0) > 0;
                      if (inboxFilter === 'whatsapp') return c.platform === 'whatsapp';
                      if (inboxFilter === 'instagram') return c.platform === 'instagram';
                      if (inboxFilter === 'facebook') return ['facebook', 'messenger'].includes(c.platform);
                      if (inboxFilter === 'telegram') return c.platform === 'telegram';
                      return true;
                    })
                    .map(contact => {
                      const isSelected = selectedConv?.id === contact.id;
                      const isAi = contact.assigned_agent_type === 'ai' || contact.ai_active === 1;
                      const agentName = contact.assigned_agent_name || (isAi ? 'Agente AI' : 'Sin asignar');
                      const initials = (contact.contact_name || 'CL').slice(0, 2).toUpperCase();

                      return (
                        <div
                          key={contact.id}
                          onClick={() => {
                            selectConversation(contact);
                            setMobileView('chat');
                          }}
                          className={`p-3 sm:p-3.5 flex items-start space-x-3 cursor-pointer transition-all duration-200 relative group active:bg-slate-100 dark:active:bg-slate-800 ${
                            isSelected
                              ? 'bg-blue-50/80 dark:bg-slate-800/90 border-l-4 border-blue-600'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          {/* Avatar with Channel Overlay Badge */}
                          <div className="relative shrink-0">
                            <div
                              className="w-11 h-11 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-xs tracking-wider shadow-sm"
                            >
                              {initials}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center shadow ring-2 ring-white dark:ring-slate-900">
                              {renderPlatformLogo(contact.platform, "w-3 h-3")}
                            </div>
                          </div>

                          {/* Conversation details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <span
                                className={`font-semibold text-xs truncate ${
                                  isSelected
                                    ? 'text-blue-950 dark:text-white'
                                    : 'text-slate-800 dark:text-slate-200'
                                }`}
                              >
                                {contact.contact_name || 'Cliente'}
                              </span>
                              <span className="text-[10px] text-slate-400 shrink-0 font-medium ml-1">
                                {contact.last_message_at ? new Date(contact.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'reciente'}
                              </span>
                            </div>

                            {/* Last message snippet */}
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mb-1.5 leading-relaxed">
                              {contact.last_message || 'Nuevo mensaje'}
                            </p>

                            {/* Agent Attending Chip & Unread Bubble */}
                            <div className="flex items-center justify-between">
                              <span
                                className={`inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                                  isAi
                                    ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60'
                                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60'
                                }`}
                              >
                                {isAi ? (
                                  <>
                                    <Bot className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                                    <span>{agentName.split(' ')[0]} (AI)</span>
                                  </>
                                ) : (
                                  <>
                                    <User className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                    <span>{agentName.split(' ')[0]}</span>
                                  </>
                                )}
                              </span>

                              {(Number(contact.unread_count) || 0) > 0 && (
                                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                                  {contact.unread_count}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </aside>

            {/* Center Column: Active Chat Stream */}
            {selectedConv ? (
              <main
                className={`flex-1 flex flex-col bg-slate-50/60 dark:bg-slate-950 relative overflow-hidden transition-all ${
                  mobileView === 'sidebar' ? 'hidden md:flex' : 'flex w-full'
                }`}
              >
                {/* Active Chat Top Header */}
                <div className="h-16 px-3 sm:px-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between z-10 shrink-0">
                  <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                    {/* Mobile Back to Conversations Button */}
                    <button
                      onClick={() => setMobileView('sidebar')}
                      className="md:hidden p-2 -ml-1 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                      title="Volver a la bandeja"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>

                    {/* Collapsed Sidebar Re-open button on Desktop */}
                    {isSidebarCollapsed && (
                      <button
                        onClick={() => setIsSidebarCollapsed(false)}
                        title="Mostrar bandeja de chats"
                        className="hidden md:flex p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                      >
                        <PanelLeft className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </button>
                    )}

                    {/* Customer Avatar & Channel */}
                    <div className="relative shrink-0">
                      <div
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-xs tracking-wider shadow-sm"
                      >
                        {(selectedConv.contact_name || 'CL').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                        {renderPlatformLogo(selectedConv.platform, "w-3 h-3")}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5 sm:space-x-2">
                        <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                          {selectedConv.contact_name || 'Cliente'}
                        </h2>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20 shrink-0" />
                      </div>
                      <div className="flex items-center space-x-1.5 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="capitalize font-medium text-slate-600 dark:text-slate-300">
                          {selectedConv.platform}
                        </span>
                        <span>•</span>
                        <span className="truncate">{selectedConv.contact_phone || selectedConv.contact_id || 'ID: ' + selectedConv.id}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Prominent Attending Agent & Action Controls */}
                  <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0">
                    {/* PROMINENT ATTENDING AGENT BADGE (Atendido por) */}
                    <div
                      onClick={handleQuickHandover}
                      className={`cursor-pointer group flex items-center space-x-2 px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all shadow-xs ${
                        selectedConv.assigned_agent_type === 'ai' || selectedConv.ai_active === 1
                          ? 'bg-purple-50 hover:bg-purple-100/80 dark:bg-purple-950/50 dark:hover:bg-purple-900/50 border-purple-300 dark:border-purple-800'
                          : 'bg-amber-50 hover:bg-amber-100/80 dark:bg-amber-950/50 dark:hover:bg-amber-900/50 border-amber-300 dark:border-amber-800'
                      }`}
                      title="Click para alternar rápidamente entre Inteligencia Artificial y Operador Humano"
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-xs ${
                          selectedConv.assigned_agent_type === 'ai' || selectedConv.ai_active === 1
                            ? 'bg-gradient-to-tr from-purple-600 to-indigo-600'
                            : 'bg-gradient-to-tr from-amber-500 to-orange-600'
                        }`}
                      >
                        {selectedConv.assigned_agent_type === 'ai' || selectedConv.ai_active === 1 ? (
                          <Bot className="w-3.5 h-3.5" />
                        ) : (
                          <User className="w-3.5 h-3.5" />
                        )}
                      </div>

                      <div className="text-left hidden sm:block">
                        <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-400 leading-none">
                          Atendido por
                        </p>
                        <p
                          className={`text-xs font-bold leading-tight ${
                            selectedConv.assigned_agent_type === 'ai' || selectedConv.ai_active === 1
                              ? 'text-purple-700 dark:text-purple-300'
                              : 'text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          {selectedConv.assigned_agent_name || (selectedConv.ai_active === 1 ? 'Agente AI' : 'Sin asignar')}
                        </p>
                      </div>

                      {/* Switch Action Tag */}
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          selectedConv.assigned_agent_type === 'ai' || selectedConv.ai_active === 1
                            ? 'bg-purple-200/70 text-purple-800 dark:bg-purple-800/60 dark:text-purple-200'
                            : 'bg-amber-200/70 text-amber-800 dark:bg-amber-800/60 dark:text-amber-200'
                        }`}
                      >
                        {selectedConv.assigned_agent_type === 'ai' || selectedConv.ai_active === 1 ? '🤖 AI' : '👤 Humano'}
                      </span>
                    </div>

                    {/* Customer Info Drawer Toggle Button */}
                    <button
                      onClick={() => setShowInfoDrawer(!showInfoDrawer)}
                      title="Ver ficha del cliente y agentes"
                      className={`p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                        showInfoDrawer ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400' : ''
                      }`}
                    >
                      <Package className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Message Chat Stream */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 bg-gradient-to-b from-slate-100/40 via-white to-slate-50/60 dark:from-slate-950 dark:via-slate-900/60 dark:to-slate-950">
                  
                  {/* Security Banner badge */}
                  <div className="flex justify-center my-1">
                    <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-200/70 dark:bg-slate-800/80 text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Canal cifrado • Traspaso en vivo asistido</span>
                    </div>
                  </div>

                  {/* Message List Loop */}
                  {messages.map(message => {
                    const isSystem = message.sender_type === 'system' || (message.text_content || '').startsWith('🔔') || (message.text_content || '').startsWith('🤖');
                    if (isSystem) {
                      return (
                        <div key={message.id} className="flex justify-center my-2">
                          <div className="max-w-md px-3.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 text-[11px] sm:text-xs text-center font-medium shadow-xs">
                            {message.text_content}
                          </div>
                        </div>
                      );
                    }

                    const isOutbound = message.direction === 'outbound';

                    return (
                      <div
                        key={message.id}
                        className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                      >
                        {/* Sender Identity Tag for AI vs Human */}
                        {isOutbound && (
                          <div className="flex items-center space-x-1 mb-1 mr-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                            {message.sender_type === 'ai' || (selectedConv.ai_active === 1 && message.sender_name?.includes('AI')) ? (
                              <>
                                <Bot className="w-3 h-3 text-purple-500" />
                                <span>Agente AI</span>
                              </>
                            ) : (
                              <>
                                <User className="w-3 h-3 text-amber-500" />
                                <span>{message.sender_name || selectedConv.assigned_agent_name || 'Agente'}</span>
                              </>
                            )}
                          </div>
                        )}

                        {/* Main Bubble */}
                        <div
                          className={`max-w-[90%] sm:max-w-md lg:max-w-lg p-3 sm:p-3.5 shadow-xs transition-all ${
                            isOutbound
                              ? 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl rounded-br-xs'
                              : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-2xl rounded-bl-xs border border-slate-200/80 dark:border-slate-700/60'
                          }`}
                        >
                          {message.text_content && (
                            <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-line">
                              {message.text_content}
                            </p>
                          )}

                          {/* Interactive SafePay Product Card if message contains listing link */}
                          {(message.text_content || '').includes('marketplace/listing') && (
                            <div className="mt-2.5 p-3 rounded-2xl bg-black/10 dark:bg-white/5 border border-white/15 backdrop-blur-xs space-y-2 text-left">
                              <div className="flex items-center justify-between text-[11px] font-bold">
                                <span className="flex items-center space-x-1 text-emerald-300">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>DoorDrop SafePay</span>
                                </span>
                                <span className="text-[10px] uppercase tracking-wider opacity-80">Garantía Verificada</span>
                              </div>
                              <p className="text-[11px] opacity-90 leading-tight">
                                Transacción protegida con entrega asegurada o reembolso completo.
                              </p>
                              {(() => {
                                const match = (message.text_content || '').match(/https?:\/\/[^\s]+\/marketplace\/listing\/[a-zA-Z0-9_-]+/);
                                const url = match ? match[0] : '#';
                                return (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full py-1.5 px-3 rounded-xl bg-white text-blue-950 hover:bg-blue-50 font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition mt-1 cursor-pointer"
                                  >
                                    <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Ver Producto & Pagar con SafePay</span>
                                    <ExternalLink className="w-3 h-3 text-slate-400" />
                                  </a>
                                );
                              })()}
                            </div>
                          )}

                          {/* Media preview if available */}
                          {message.media_url && (
                            <div className="mt-2 rounded-xl overflow-hidden max-w-xs border border-white/20">
                              <img src={message.media_url} alt="Adjunto" className="w-full h-auto object-cover" />
                            </div>
                          )}

                          {/* Timestamp & Read Status */}
                          <div
                            className={`flex items-center justify-end space-x-1 mt-1 text-[10px] ${
                              isOutbound ? 'text-blue-100/80' : 'text-slate-400'
                            }`}
                          >
                            <span>{message.created_at ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                            {isOutbound && (
                              <span>
                                <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div ref={messagesEndRef} />
                </div>

                {/* Quick Replies Drawer */}
                {showQuickReplies && (
                  <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        <span>Plantillas Rápidas</span>
                      </span>
                      <button
                        onClick={() => setShowQuickReplies(false)}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {[
                        '📦 Tu pedido ya fue despachado y va en camino con nuestro mensajero DoorDrop.',
                        '💳 Aquí tienes el enlace de pago seguro SafePay para completar tu compra.',
                        '📍 Hacemos envíos express en 90 minutos a todo el Gran Santo Domingo.',
                        '🏷️ Te apliqué un cupón especial del 10% de descuento de cortesía: VIP10.'
                      ].map((reply, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setMsgInput(reply);
                            setShowQuickReplies(false);
                          }}
                          className="p-2 text-left text-xs rounded-lg bg-slate-100 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-800 dark:text-slate-200 border border-transparent hover:border-blue-300 dark:hover:border-blue-700 transition"
                        >
                          {reply}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bottom Input Bar */}
                <div className="p-2.5 sm:p-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0 pb-safe">
                  <div className="flex items-end space-x-1.5 sm:space-x-2 bg-slate-100 dark:bg-slate-800/90 rounded-2xl p-1.5 sm:p-2 border border-slate-200/80 dark:border-slate-700/60 focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-500 transition-all">
                    
                    {/* Action Buttons: Clip, Zap */}
                    <div className="flex items-center space-x-0.5 sm:space-x-1 pb-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowQuickReplies(!showQuickReplies)}
                        title="Respuestas rápidas"
                        className={`p-2 rounded-xl transition ${
                          showQuickReplies
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600'
                            : 'text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                        }`}
                      >
                        <Zap className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (catalogProducts.length === 0) loadCatalogProducts();
                          setShowCatalogModal(true);
                        }}
                        title="Catálogo de Productos Marketplace DoorDrop"
                        className={`p-2 rounded-xl transition ${
                          showCatalogModal
                            ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-600'
                            : 'text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                        }`}
                      >
                        <ShoppingBag className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Auto-growing Text Input */}
                    <textarea
                      ref={textareaRef}
                      rows={1}
                      value={msgInput}
                      onChange={e => setMsgInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Escribe un mensaje..."
                      className="flex-1 max-h-28 bg-transparent text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-none py-1.5 px-1"
                    />

                    {/* Send Button */}
                    <button
                      onClick={handleSendMessage}
                      disabled={!msgInput.trim() || sendingMsg}
                      className={`p-2 sm:p-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md flex items-center justify-center transition-all shrink-0 ${
                        msgInput.trim() && !sendingMsg
                          ? 'hover:scale-105 active:scale-95 opacity-100 cursor-pointer'
                          : 'opacity-40 cursor-not-allowed'
                      }`}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </main>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-50/50 dark:bg-slate-950">
                <div className="max-w-sm space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <MessageSquare className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Centro de Mensajería Omnicanal</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Atiende a tus clientes de WhatsApp, Instagram, Facebook y Telegram en un solo lugar con asistencia autónoma de un agente AI o tus operadores humanos.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                    <button
                      onClick={() => setShowNewConvModal(true)}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" /> Iniciar Chat de Prueba
                    </button>
                    <button
                      onClick={() => setActiveTab('channels')}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700/50 transition flex items-center justify-center gap-1.5"
                    >
                      <Share2 className="w-4 h-4 text-blue-500" /> Conectar Canales
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Right Side: Customer Info Drawer & Agent Transfer List */}
            {showInfoDrawer && selectedConv && (
              <>
                {/* Mobile Backdrop for Drawer */}
                <div
                  onClick={() => setShowInfoDrawer(false)}
                  className="fixed inset-0 bg-slate-950/50 z-30 lg:hidden animate-in fade-in"
                />

                <aside className="fixed inset-y-0 right-0 w-80 max-w-[85vw] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col z-40 shadow-2xl lg:static lg:z-10 animate-in slide-in-from-right duration-200">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
                      <UserCheck className="w-4 h-4 text-blue-600" />
                      <span>Ficha & Transferencia</span>
                    </h3>
                    <button
                      onClick={() => setShowInfoDrawer(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
                    {/* SECCIÓN DESTACADA: AGENTE QUE LO ATIENDE */}
                    <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/80 dark:to-slate-800/30 border border-slate-200 dark:border-slate-700 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] text-slate-500 uppercase tracking-wider">
                          Agente Asignado
                        </span>
                        <span className="flex items-center space-x-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>Activo</span>
                        </span>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div
                          className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow"
                        >
                          {selectedConv.assigned_agent_type === 'ai' ? 'AI' : 'OP'}
                        </div>
                        <div>
                          <h5 className="font-bold text-slate-900 dark:text-white text-xs">
                            {selectedConv.assigned_agent_name || (selectedConv.ai_active === 1 ? 'Agente AI' : 'Sin asignar')}
                          </h5>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {selectedConv.assigned_agent_type === 'ai' || selectedConv.ai_active === 1 ? 'Inteligencia Artificial Ventas' : 'Operador Humano'}
                          </p>
                        </div>
                      </div>

                      {/* Agent re-assignment options */}
                      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/60 space-y-1.5">
                        <p className="text-[10px] font-semibold text-slate-400">Transferir a otro miembro del equipo:</p>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {teamMembers.map(agent => (
                            <button
                              key={agent.id || agent.member_id}
                              onClick={() => handleTransfer(agent)}
                              className={`w-full p-1.5 px-2 rounded-lg text-left text-[11px] flex items-center justify-between transition ${
                                selectedConv.assigned_agent_id === (agent.member_id || agent.id)
                                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/60'
                              }`}
                            >
                              <span className="flex items-center space-x-1.5 truncate">
                                {agent.type === 'ai' ? (
                                  <Bot className="w-3 h-3 shrink-0 text-purple-400" />
                                ) : (
                                  <User className="w-3 h-3 shrink-0 text-amber-400" />
                                )}
                                <span className="truncate">{agent.name}</span>
                              </span>
                              <span className="text-[9px] opacity-75 shrink-0 ml-1">
                                {agent.type === 'ai' ? 'Auto AI' : 'Humano'}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Customer Information */}
                    <div className="text-center pt-2">
                      <div
                        className="w-14 h-14 mx-auto rounded-full bg-gradient-to-tr from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-base shadow mb-1.5"
                      >
                        {(selectedConv.contact_name || 'CL').slice(0, 2).toUpperCase()}
                      </div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        {selectedConv.contact_name || 'Cliente'}
                      </h4>
                      <p className="text-[11px] text-slate-400 capitalize">Canal {selectedConv.platform}</p>
                    </div>

                    <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                      <div className="flex items-center space-x-2 text-slate-600 dark:text-slate-400">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{selectedConv.contact_phone || 'Sin número registrado'}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-slate-600 dark:text-slate-400">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{selectedConv.contact_id || 'ID de contacto: ' + selectedConv.id}</span>
                      </div>
                    </div>
                  </div>
                </aside>
              </>
            )}

          </div>
        </div>

        {/* Real Marketplace Catalog Modal */}
        
      {/* --------------------------------------------------------------------- */}
      {/* REAL MARKETPLACE CATALOG MODAL (231+ Real Products) */}
      {/* --------------------------------------------------------------------- */}
      {showCatalogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Catálogo Marketplace DoorDrop</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold">
                      Inventario Real
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Productos reales listos para compartir con foto y generar orden SafePay
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCatalogModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search & Stats Bar */}
            <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between shrink-0">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={e => setCatalogSearch(e.target.value)}
                  placeholder="Buscar por título o SKU..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white placeholder-slate-400"
                />
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-500 w-full sm:w-auto justify-between sm:justify-end">
                <span>
                  {catalogProducts.filter(p => !catalogSearch || p.title.toLowerCase().includes(catalogSearch.toLowerCase()) || p.sku.toLowerCase().includes(catalogSearch.toLowerCase())).length} productos disponibles
                </span>
                <button
                  onClick={loadCatalogProducts}
                  disabled={loadingCatalog}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-white dark:hover:bg-slate-800 transition"
                  title="Recargar catálogo"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingCatalog ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Product Grid */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {loadingCatalog ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500" />
                  <p className="text-xs">Cargando inventario en vivo del marketplace...</p>
                </div>
              ) : catalogProducts.length === 0 ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <ShoppingBag className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs">No hay productos cargados en este momento.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {catalogProducts
                    .filter(p => !catalogSearch || p.title.toLowerCase().includes(catalogSearch.toLowerCase()) || p.sku.toLowerCase().includes(catalogSearch.toLowerCase()))
                    .slice(0, 30)
                    .map(product => (
                      <div
                        key={product.id}
                        className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 hover:border-blue-400 dark:hover:border-blue-600 transition-all flex flex-col justify-between space-y-3 group shadow-xs"
                      >
                        <div className="flex space-x-3">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.title}
                              className="w-16 h-16 rounded-xl object-cover bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                              <ShoppingBag className="w-6 h-6" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-2 leading-snug">
                              {product.title}
                            </h4>
                            <div className="flex items-center space-x-2 mt-1">
                              <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400">
                                {product.price} {product.currency}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                SKU: {product.sku}
                              </span>
                            </div>
                            <div className="flex items-center space-x-1.5 mt-1 text-[10px]">
                              <span className={`px-1.5 py-0.5 rounded font-medium ${product.quantity > 0 ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 text-rose-600'}`}>
                                {product.quantity > 0 ? `${product.quantity} en stock` : 'Agotado'}
                              </span>
                              <span className="text-slate-400 truncate">{product.category}</span>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                          <button
                            onClick={() => handleSendProduct(product)}
                            className="py-1.5 px-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 text-[11px] font-semibold transition flex items-center justify-center gap-1"
                          >
                            <Send className="w-3 h-3" />
                            <span>Enviar Ficha</span>
                          </button>
                          <button
                            onClick={() => handleSendCheckout(product)}
                            className="py-1.5 px-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-[11px] font-bold shadow-xs transition flex items-center justify-center gap-1"
                          >
                            <CreditCard className="w-3 h-3" />
                            <span>SafePay 💳</span>
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}


        {/* New Conversation Modal */}
        
      {/* --------------------------------------------------------------------- */}
      {/* NEW CONVERSATION / LIVE TEST MODAL */}
      {/* --------------------------------------------------------------------- */}
      {showNewConvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Nueva Conversación</h3>
                  <p className="text-xs text-slate-400">Inicia un chat con un cliente o ejecuta una prueba en vivo</p>
                </div>
              </div>
              <button
                onClick={() => setShowNewConvModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nombre del Cliente
                </label>
                <input
                  type="text"
                  value={newConvName}
                  onChange={e => setNewConvName(e.target.value)}
                  placeholder="Ej. Juan Pérez / Cliente VIP"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Teléfono / ID de Contacto
                </label>
                <input
                  type="text"
                  value={newConvPhone}
                  onChange={e => setNewConvPhone(e.target.value)}
                  placeholder="Ej. +1 (809) 555-0123"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Canal de Entrada
                </label>
                <select
                  value={newConvPlatform}
                  onChange={e => setNewConvPlatform(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="whatsapp">WhatsApp Business</option>
                  <option value="instagram">Instagram DM</option>
                  <option value="messenger">Facebook Messenger</option>
                  <option value="telegram">Telegram</option>
                  <option value="web">Web Chat Directo</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mensaje Inicial del Cliente
                </label>
                <textarea
                  rows={2}
                  value={newConvMsg}
                  onChange={e => setNewConvMsg(e.target.value)}
                  placeholder="Ej. Hola, vi sus productos y me gustaría consultar disponibilidad."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewConvModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateConversation}
                  disabled={creatingConv}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md transition flex items-center gap-1.5"
                >
                  {creatingConv ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Crear y Abrir Chat</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="rounded-2xl p-6 bg-gradient-to-r from-blue-900 via-indigo-950 to-purple-950 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-2 border border-blue-400/30">
              <Sparkles className="w-3.5 h-3.5" /> {t.badge}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {t.title}
            </h1>
            <p className="text-sm text-blue-200/80 mt-1 max-w-2xl">
              {t.desc}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('inbox')}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2"
            >
              <MessageSquare className="w-4 h-4" /> Abrir Live Chat
            </button>
            <button
              onClick={() => setActiveTab('plans')}
              className="px-4 py-2 rounded-xl bg-white text-blue-950 hover:bg-blue-50 font-semibold text-sm shadow-md transition-all flex items-center gap-2"
            >
              <Zap className="w-4 h-4 text-amber-500" /> {t.managePlans}
            </button>
            <button
              onClick={loadDashboard}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto mt-6 pt-4 border-t border-white/10 no-scrollbar">
          {[
            { id: 'dashboard', label: t.tabDashboard, icon: Radio },
            { id: 'channels', label: t.tabChannels, icon: Share2 },
            { id: 'inbox', label: t.tabInbox, icon: MessageSquare },
            { id: 'comments', label: t.tabComments, icon: Sliders },
            { id: 'ai', label: t.tabAi, icon: Bot },
            { id: 'publishing', label: t.tabPublishing, icon: Calendar },
            { id: 'team', label: (t as any).tabTeam || 'Equipo & Empleados', icon: Users },
            { id: 'plans', label: t.tabPlans, icon: Zap }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-white text-blue-950 font-bold shadow'
                    : 'text-blue-200 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-blue-600' : ''}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300 flex items-center gap-2 text-sm font-medium">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 1. DASHBOARD VIEW */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Dynamic Wallet & Peak Hour Status Banner */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Wallet Balance Health */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between ${
              data?.metrics?.wallet?.is_blocked
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100'
                : 'bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow ${
                  data?.metrics?.wallet?.is_blocked ? 'bg-rose-600' : 'bg-emerald-600'
                }`}>
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider opacity-75">
                    Saldo DoorDrop Empleado AI
                  </div>
                  <div className="text-lg font-black flex items-center gap-2">
                    {data?.metrics?.wallet?.balance !== undefined ? `${Number(data.metrics.wallet.balance).toFixed(2)} ${data.metrics.wallet.currency || 'EUR'}` : '0.00 EUR'}
                    {data?.metrics?.wallet?.is_blocked ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">
                        BLOQUEADO (Límite -1.00 superado)
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                        Crédito Operativo (Margen hasta -1.00 USD)
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate('/panel/settings')}
                className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 font-bold text-xs shadow-sm border border-gray-200 dark:border-gray-700"
              >
                Recargar Saldo
              </button>
            </div>

            {/* Peak Hours Dynamic Pricing Badge */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between ${
              data?.metrics?.peak_hours?.is_active
                ? 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'
                : 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800 text-blue-950 dark:text-blue-100'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow ${
                  data?.metrics?.peak_hours?.is_active ? 'bg-amber-500' : 'bg-blue-600'
                }`}>
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider opacity-75">
                    Tarifa Horaria Inteligente ({data?.metrics?.peak_hours?.country || 'IT'})
                  </div>
                  <div className="text-sm font-black flex items-center gap-1.5">
                    {data?.metrics?.peak_hours?.is_active ? (
                      <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        🔥 HORA PICO ACTIVA (18:00 - 22:00) • Margen +25%
                      </span>
                    ) : (
                      <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        ⚡ HORARIO ESTÁNDAR • Margen +10%
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] opacity-70">
                    Ajuste dinámico según el huso horario local de tu tienda.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Active Plan Alert */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">{t.activePlan}</span>
                <h3 className="text-base font-black text-gray-900 dark:text-white uppercase">
                  {data?.subscription?.is_active
                    ? (data.subscription.plan_code === 'omni3' ? 'DoorDrop Omni 3 (WhatsApp + IG + FB)' : data.subscription.plan_code === 'duo' ? 'DoorDrop Duo' : 'WhatsApp Dedicated')
                    : 'Sin suscripción Omnicanal activa'}
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-bold text-gray-900 dark:text-white">
                  {data?.subscription?.is_active
                    ? `${data.subscription.currency === 'USD' ? '$' : data.subscription.currency + ' '}${Number(data.subscription.monthly_price || 0).toFixed(2)} / mes`
                    : '—'}
                </div>
                <div className={`text-[11px] font-semibold flex items-center gap-1 justify-end ${data?.subscription?.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${data?.subscription?.is_active ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                  {data?.subscription?.is_active ? 'Activo' : 'Requiere suscripción'}
                </div>
              </div>
              <button
                onClick={() => setActiveTab('plans')}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow"
              >
                Cambiar Plan
              </button>
            </div>
          </div>

          {/* Key Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase">
                <span>{t.activeChannels}</span>
                <Share2 className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-black mt-2 text-gray-900 dark:text-white">
                {data?.metrics?.total_channels || 0} <span className="text-sm font-normal text-gray-400">/ {data?.metrics?.channels_limit ?? 0}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{data?.subscription?.is_active ? 'Canales incluidos en tu plan' : 'Activa un plan para conectar canales'}</p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase">
                <span>{t.conversations}</span>
                <MessageSquare className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-2xl font-black mt-2 text-gray-900 dark:text-white">
                {data?.metrics?.conversations?.total_conversations || 0}
              </div>
              <p className="text-xs text-indigo-500 font-medium mt-1">
                {data?.metrics?.conversations?.total_unread || 0} sin leer
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase">
                <span>{t.processedMessages}</span>
                <Radio className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-black mt-2 text-gray-900 dark:text-white">
                {data?.metrics?.messages?.total_messages || 0}
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                {data?.subscription?.is_active ? t.unlimited : 'Disponible con suscripción activa'}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase">
                <span>{t.aiEmployee}</span>
                <Bot className="w-4 h-4 text-purple-500" />
              </div>
                <div className="text-lg font-bold mt-2 text-gray-900 dark:text-white truncate">
                 {data?.subscription?.is_active ? 'DeepSeek AI' : 'DeepSeek AI bloqueado'}
                </div>
                <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mt-1 flex items-center gap-1">
                 <span className={`w-2 h-2 rounded-full inline-block ${data?.subscription?.is_active ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                 {data?.subscription?.is_active ? '24/7 En línea' : 'Requiere suscripción Polar'}
                </p>
            </div>
          </div>

          {/* Connected Channels List */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t.tabChannels}</h2>
                <button
                  onClick={() => setActiveTab('channels')}
                  className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1"
                >
                  Ver todos <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {data?.accounts?.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
                  <Share2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t.noChannels}</p>
                  <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">{t.noChannelsDesc}</p>
                  <button
                    onClick={() => setActiveTab('channels')}
                    className="mt-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow"
                  >
                    {t.connectFirst}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {data?.accounts?.map((acc: any) => (
                    <div key={acc.id} className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center font-bold text-blue-600 uppercase">
                          {acc.platform.slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900 dark:text-white">
                            {acc.account_name || acc.username || acc.phone_number || acc.platform}
                          </div>
                          <div className="text-xs text-gray-500 capitalize">{acc.platform} • Estado: {acc.status}</div>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                        {t.connected}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AI Assistant Quick Status */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-900/10 via-indigo-900/10 to-blue-900/10 border border-purple-200/50 dark:border-purple-900/50 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 text-xs font-bold uppercase tracking-wider mb-2">
                  <Bot className="w-4 h-4" /> DeepSeek AI DoorDrop
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {data?.subscription?.is_active ? 'Herramientas Conectadas' : 'Capacidades disponibles al activar'}
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {data?.subscription?.is_active
                    ? 'Tu empleado virtual consulta directamente la base de datos de DoorDrop para responder con precisión:'
                    : 'Activa una suscripción Polar para habilitar el empleado virtual y sus herramientas:'}
                </p>
                <div className="space-y-2 mt-4 text-xs font-medium text-gray-700 dark:text-gray-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Búsqueda de órdenes y pedidos
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Consulta de tracking en vivo
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Cotizador de envíos DoorDrop
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Catálogo de productos y stock
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Traspaso a agente humano
                  </div>
                </div>
              </div>

              <button
                onClick={() => setActiveTab('ai')}
                className="mt-6 w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition shadow flex items-center justify-center gap-2"
              >
                <Sliders className="w-4 h-4" /> Personalizar Empleado AI
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 2. CHANNELS MANAGEMENT */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'channels' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t.tabChannels}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Conecta tus canales oficiales mediante OAuth directo para recibir y enviar mensajes sin interrupciones.
              </p>
            </div>
            <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              Límite: {data?.accounts?.length || 0} / {data?.metrics?.channels_limit || 15} canales
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { id: 'whatsapp', name: 'WhatsApp Business', desc: 'Mensajería directa, catálogos y automatización.', badge: 'Recomendado' },
              { id: 'instagram', name: 'Instagram DM', desc: 'Bandeja de directos, historias y comentarios.', badge: 'Popular' },
              { id: 'facebook', name: 'Facebook Messenger', desc: 'Atención a clientes desde tu Fan Page oficial.', badge: 'Meta' },
              { id: 'telegram', name: 'Telegram Bot', desc: 'Atención rápida con bot oficial y canales.', badge: 'Directo' }
            ].map(ch => {
              const connected = data?.accounts?.find((a: any) => a.platform === ch.id);
              return (
                <div key={ch.id} className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                        {ch.badge}
                      </span>
                      {connected && (
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" title="Activo"></span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">{ch.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">{ch.desc}</p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
                    {connected ? (
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> {t.connected}
                        </span>
                        <button
                          onClick={() => handleDisconnect(connected.id)}
                          className="text-xs text-rose-500 hover:text-rose-700 font-semibold"
                        >
                          {t.disconnect}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleConnectChannel(ch.id)}
                        className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> {t.connectChannel}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 3. UNIFIED INBOX - MODERN LIVE CHAT OMNICANAL & TRANSFER */}
      {/* --------------------------------------------------------------------- */}

      {/* --------------------------------------------------------------------- */}
      {/* 3.5. TEAM & EMPLOYEES MANAGEMENT */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" /> Equipo y Empleados (Humanos & Agentes AI)
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Gestiona a tus operadores de atención al cliente y a tus agentes virtuales de ventas. Asigna roles, canales y permisos de transferencia.
              </p>
            </div>
            <button
              onClick={() => setShowAddMemberModal(true)}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-2 shadow self-start md:self-auto"
            >
              <Plus className="w-4 h-4" /> Agregar Miembro
            </button>
          </div>

          {/* Team Members Grid */}
          {teamMembers.length === 0 && !loadingTeam ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-950 dark:to-indigo-950 flex items-center justify-center mb-6 shadow-lg">
                <Users className="w-10 h-10 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Tu equipo está vacío</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6 leading-relaxed">
                Aún no has registrado agentes ni operadores. Agrega miembros para asignar conversaciones, transferir chats y escalar tu atención al cliente.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => { setNewMemberType('human'); setShowAddMemberModal(true); }}
                  className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition flex items-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  <Plus className="w-4 h-4" /> Agregar Operador Humano
                </button>
                <button
                  onClick={() => { setNewMemberType('ai'); setShowAddMemberModal(true); }}
                  className="px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm font-bold transition flex items-center gap-2 shadow-lg shadow-purple-600/20"
                >
                  <Bot className="w-4 h-4" /> Crear Agente Virtual AI
                </button>
              </div>
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
                <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50">
                  <div className="text-2xl mb-1">👤</div>
                  <h4 className="text-xs font-bold text-gray-900 dark:text-white">Operador</h4>
                  <p className="text-[11px] text-gray-500">Atiende chats en vivo, cierra ventas, da soporte</p>
                </div>
                <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50">
                  <div className="text-2xl mb-1">🤖</div>
                  <h4 className="text-xs font-bold text-gray-900 dark:text-white">Agente AI</h4>
                  <p className="text-[11px] text-gray-500">Responde 24/7, vende catálogo, gestiona consultas</p>
                </div>
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
                  <div className="text-2xl mb-1">🔄</div>
                  <h4 className="text-xs font-bold text-gray-900 dark:text-white">Transferir</h4>
                  <p className="text-[11px] text-gray-500">Pasa conversaciones entre humanos y AI</p>
                </div>
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {teamMembers.map(member => (
              <div
                key={member.id || member.member_id}
                className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col justify-between space-y-4 hover:border-blue-300 dark:hover:border-blue-800 transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shadow ${
                        member.type === 'ai'
                          ? 'bg-gradient-to-tr from-purple-600 to-indigo-600'
                          : 'bg-gradient-to-tr from-amber-500 to-orange-600'
                      }`}
                    >
                      {member.initials || (member.name || 'OP').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white">{member.name}</h4>
                      <p className="text-xs text-gray-500">{member.role}</p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      member.type === 'ai'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    }`}
                  >
                    {member.type === 'ai' ? '🤖 Agente AI' : '👤 Humano'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800">
                  {member.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-gray-400" />
                      <span className="truncate">{member.email}</span>
                    </div>
                  )}
                  {member.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      <span>{member.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-gray-400">Estado operativo:</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Online
                    </span>
                  </div>
                </div>

                {member.type === 'human' && (
                  <button
                    onClick={() => handleDeleteMember(member.id || member.member_id)}
                    className="w-full py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-semibold transition"
                  >
                    Desactivar Acceso
                  </button>
                )}
              </div>
            ))}
          </div>
          )}

          {/* Add Member Modal */}
          {showAddMemberModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
              <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-800">
                  <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600" /> Registrar Nuevo Miembro
                  </h3>
                  <button onClick={() => setShowAddMemberModal(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleCreateMember} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Nombre Completo</label>
                    <input
                      type="text"
                      required
                      value={newMemberName}
                      onChange={e => setNewMemberName(e.target.value)}
                      placeholder="Ej. Laura Méndez"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Cargo / Especialidad</label>
                    <input
                      type="text"
                      value={newMemberRole}
                      onChange={e => setNewMemberRole(e.target.value)}
                      placeholder="Ej. Ventas VIP y Cierre"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Tipo de Empleado</label>
                    <select
                      value={newMemberType}
                      onChange={e => setNewMemberType(e.target.value as any)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white"
                    >
                      <option value="human">👤 Operador Humano</option>
                      <option value="ai">🤖 Agente Virtual AI</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      value={newMemberEmail}
                      onChange={e => setNewMemberEmail(e.target.value)}
                      placeholder="laura@empresa.com"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Teléfono / WhatsApp</label>
                    <input
                      type="tel"
                      value={newMemberPhone}
                      onChange={e => setNewMemberPhone(e.target.value)}
                      placeholder="+1 (809) 000-0000"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-800">
                    <button
                      type="button"
                      onClick={() => setShowAddMemberModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow"
                    >
                      Guardar Miembro
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 4. AI EMPLOYEE SETTINGS & KNOWLEDGE */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'ai' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Bot className="w-5 h-5 text-purple-600" /> Dipendente AI — Agente di Vendita Autonomo
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Ispirato all'architettura AI-Sales-agent: dialoga in modo naturale con il cliente, invia foto reali del catalogo, calcola le spese di spedizione per CAP e conclude la vendita generando il link di checkout sicuro.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAutofillAi}
                  disabled={autofillingAi}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md transition flex items-center gap-2 disabled:opacity-50"
                  title="Genera l'intera configurazione analizzando il profilo del negozio e gli articoli del catalogo"
                >
                  <Sparkles className={`w-4 h-4 text-amber-300 ${autofillingAi ? 'animate-spin' : ''}`} />
                  {autofillingAi ? 'Analisi catalogo e generazione...' : '✨ Auto-completa con IA'}
                </button>
                <div className="hidden sm:flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-3.5 py-2 rounded-xl text-xs font-semibold border border-emerald-200 dark:border-emerald-800">
                  <Sparkles className="w-4 h-4 text-emerald-500 animate-pulse" /> DeepSeek V3 Attivo
                </div>
              </div>
            </div>

            {/* Profile & Tone */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Nome Assistente / Venditore</label>
                <input
                  type="text"
                  value={aiSettings.agent_name || ''}
                  onChange={e => setAiSettings({ ...aiSettings, agent_name: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Tono di Voce</label>
                <select
                  value={aiSettings.tone || 'friendly_professional'}
                  onChange={e => setAiSettings({ ...aiSettings, tone: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm focus:ring-2 focus:ring-purple-500"
                >
                  <option value="friendly_professional">Amichevole e Professionale</option>
                  <option value="sales_oriented">Orientato alla Chiusura Vendite</option>
                  <option value="casual">Casual e Diretto</option>
                  <option value="luxury">Lussuoso ed Esclusivo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Lingua Principale</label>
                <select
                  value={aiSettings.language || 'it'}
                  onChange={e => setAiSettings({ ...aiSettings, language: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm focus:ring-2 focus:ring-purple-500"
                >
                  <option value="it">Italiano (Predefinito)</option>
                  <option value="es">Español</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Conoscenza del Negozio & Brand Story
              </label>
              <textarea
                rows={2}
                value={aiSettings.business_info || ''}
                onChange={e => setAiSettings({ ...aiSettings, business_info: e.target.value })}
                placeholder="Siamo una boutique di moda con capi esclusivi e spedizioni rapide 24/48h garantite DoorDrop..."
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* AUTONOMY TOGGLES (kaymen99/AI-Sales-agent integration) */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-600" /> Autonomia e Permessi di Vendita dell'AI
                </h3>
                <p className="text-xs text-gray-500">
                  Decidi quali azioni l'assistente può eseguire in totale autonomia durante la conversazione con il cliente:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Send photos */}
                <label className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-800 transition flex items-start gap-3 cursor-pointer bg-gray-50/50 dark:bg-gray-800/30">
                  <input
                    type="checkbox"
                    checked={aiSettings.can_send_photos !== false && aiSettings.can_send_photos !== 0}
                    onChange={e => setAiSettings({ ...aiSettings, can_send_photos: e.target.checked })}
                    className="mt-1 rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      📸 Inviare Foto Catalogo
                    </span>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Invia le immagini ufficiali ad alta risoluzione dei prodotti direttamente nella chat.
                    </p>
                  </div>
                </label>

                {/* Create orders & checkout */}
                <label className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-800 transition flex items-start gap-3 cursor-pointer bg-gray-50/50 dark:bg-gray-800/30">
                  <input
                    type="checkbox"
                    checked={aiSettings.can_create_orders !== false && aiSettings.can_create_orders !== 0}
                    onChange={e => setAiSettings({ ...aiSettings, can_create_orders: e.target.checked })}
                    className="mt-1 rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      🛍️ Concludere Ordini e Checkout
                    </span>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Raccoglie i dati del cliente, crea l'ordine su DoorDrop e genera il link di pagamento.
                    </p>
                  </div>
                </label>

                {/* Quote shipping by ZIP */}
                <label className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-800 transition flex items-start gap-3 cursor-pointer bg-gray-50/50 dark:bg-gray-800/30">
                  <input
                    type="checkbox"
                    checked={aiSettings.can_quote_shipping !== false && aiSettings.can_quote_shipping !== 0}
                    onChange={e => setAiSettings({ ...aiSettings, can_quote_shipping: e.target.checked })}
                    className="mt-1 rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      📍 Calcolare Spedizioni con CAP
                    </span>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Calcola tariffe e tempi esatti DoorDrop chiedendo il CAP o la città di destinazione.
                    </p>
                  </div>
                </label>

                {/* Search products */}
                <label className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-800 transition flex items-start gap-3 cursor-pointer bg-gray-50/50 dark:bg-gray-800/30">
                  <input
                    type="checkbox"
                    checked={aiSettings.can_search_products !== false && aiSettings.can_search_products !== 0}
                    onChange={e => setAiSettings({ ...aiSettings, can_search_products: e.target.checked })}
                    className="mt-1 rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      🔍 Ricerca Articoli e Stock
                    </span>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Consulta in tempo reale prezzi, varianti, taglie e disponibilità del catalogo.
                    </p>
                  </div>
                </label>

                {/* Generate / Lookup Tracking */}
                <label className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-800 transition flex items-start gap-3 cursor-pointer bg-gray-50/50 dark:bg-gray-800/30">
                  <input
                    type="checkbox"
                    checked={aiSettings.can_generate_tracking !== false && aiSettings.can_generate_tracking !== 0}
                    onChange={e => setAiSettings({ ...aiSettings, can_generate_tracking: e.target.checked })}
                    className="mt-1 rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      📦 Tracciamento Spedizioni
                    </span>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Fornisce lo stato della spedizione o genera codici di tracciamento DoorDrop.
                    </p>
                  </div>
                </label>

                {/* Human handoff */}
                <label className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-800 transition flex items-start gap-3 cursor-pointer bg-gray-50/50 dark:bg-gray-800/30">
                  <input
                    type="checkbox"
                    checked={aiSettings.can_handoff_human !== false && aiSettings.can_handoff_human !== 0}
                    onChange={e => setAiSettings({ ...aiSettings, can_handoff_human: e.target.checked })}
                    className="mt-1 rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      👤 Trasferimento Operatore Umano
                    </span>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Trasferisce la conversazione al team quando il cliente richiede assistenza speciale.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* MERCHANT SALES RULES & POLICIES */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" /> Regole Commerciali e Politiche del Negozio
                </h3>
                <p className="text-xs text-gray-500">
                  Definisci le condizioni con cui l'AI deve concludere gli ordini:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Soglia Spedizione Gratuita (€)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={aiSettings.free_shipping_threshold || '50'}
                    onChange={e => setAiSettings({ ...aiSettings, free_shipping_threshold: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm focus:ring-2 focus:ring-purple-500"
                    placeholder="50.00"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">L'AI ricorderà al cliente di aggiungere articoli per ottenere la spedizione gratis.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Importo Minimo d'Ordine (€)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={aiSettings.min_order_amount || '0'}
                    onChange={e => setAiSettings({ ...aiSettings, min_order_amount: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm focus:ring-2 focus:ring-purple-500"
                    placeholder="0.00"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Importo minimo per cui l'assistente è autorizzato a generare il checkout.</p>
                </div>
              </div>

              {/* Personality and Custom Behavior */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  🎭 Personalità, Stile e Istruzioni di Comportamento Umano
                </label>
                <textarea
                  rows={4}
                  value={aiSettings.personality_instructions || ''}
                  onChange={e => setAiSettings({ ...aiSettings, personality_instructions: e.target.value })}
                  placeholder="Sei una venditrice calda, educata ed empatica. Fai domande mirate su taglie e preferenze, suggerisci abbinamenti e rassicura il cliente sui resi gratuiti..."
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-xs focus:ring-2 focus:ring-purple-500 leading-relaxed font-mono"
                />
                <p className="text-[11px] text-gray-400 mt-1">Definisce come l'assistente si rivolge ai clienti, gestisce i dubbi e costruisce empatia.</p>
              </div>

              {/* Large Terms and Conditions */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  📜 Termini e Condizioni di Vendita, Garanzie e Politica Resi (Contratto di Vendita)
                </label>
                <textarea
                  rows={4}
                  value={aiSettings.sales_contract_text || ''}
                  onChange={e => setAiSettings({ ...aiSettings, sales_contract_text: e.target.value })}
                  placeholder="Spedizioni espresse 24/48 ore con corriere DoorDrop. Spedizione gratuita per ordini superiori a 50€. Reso e sostituzione taglia garantiti entro 14 giorni dall'arrivo..."
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-xs focus:ring-2 focus:ring-purple-500 leading-relaxed font-mono"
                />
                <p className="text-[11px] text-gray-400 mt-1">Queste condizioni contrattuali vengono citate dall'AI per garantire trasparenza e rassicurare il cliente prima del checkout.</p>
              </div>

              {/* Human-like Response Timing & Learning */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/60">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      ⏱️ Tempo di Simulazione Umana (Ritardo di Risposta)
                    </label>
                    <span className="text-xs font-black text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800">
                      {aiSettings.response_delay_seconds || 3} secondi
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={aiSettings.response_delay_seconds || 3}
                    onChange={e => setAiSettings({ ...aiSettings, response_delay_seconds: Number(e.target.value) })}
                    className="w-full accent-purple-600 cursor-pointer"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Simula la lettura e la digitazione umana naturale (3-5s consigliati per evitare risposte istantanee da bot).
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="auto_learn_toggle"
                    checked={aiSettings.auto_learn_conversations !== false && aiSettings.auto_learn_conversations !== 0}
                    onChange={e => setAiSettings({ ...aiSettings, auto_learn_conversations: e.target.checked })}
                    className="mt-1 rounded text-purple-600 focus:ring-purple-500 h-4 w-4 cursor-pointer"
                  />
                  <label htmlFor="auto_learn_toggle" className="cursor-pointer">
                    <span className="text-xs font-bold text-gray-900 dark:text-white block">
                      🧠 Apprendimento e Memoria Conversazionale Attiva
                    </span>
                    <span className="text-[11px] text-gray-400 block mt-0.5">
                      L'AI analizza gli ultimi 14 messaggi cronologici della chat per mantenere il contesto (es. ricorda referenze, taglie e dettagli citati prima).
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* FAQs section */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">{t.faqs}</h3>
              <div className="space-y-2 mb-3">
                {aiSettings.faqs?.map((f: any, i: number) => (
                  <div key={i} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 flex justify-between items-start gap-3">
                    <div className="text-xs">
                      <p className="font-bold text-gray-900 dark:text-white">Q: {f.q}</p>
                      <p className="text-gray-600 dark:text-gray-300 mt-0.5">A: {f.a}</p>
                    </div>
                    <button onClick={() => handleRemoveFaq(i)} className="text-rose-500 hover:text-rose-700 p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Domanda (es. Fate spedizioni a Milano?)"
                  value={faqQ}
                  onChange={e => setFaqQ(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-xs"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Risposta (es. Sì, in 24/48h garantito)"
                    value={faqA}
                    onChange={e => setFaqA(e.target.value)}
                    className="flex-1 px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-xs"
                  />
                  <button
                    onClick={handleAddFaq}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow"
                  >
                    Aggiungi
                  </button>
                </div>
              </div>
            </div>

            {/* AI Tools Live Sandbox Test */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500" /> Prova Herramientas Internas DoorDrop (Simulatore Live)
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleTestTool('quote_shipping', { to_country: 'IT', zip_code: '00185', city: 'Roma' })}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-purple-50 hover:text-purple-600 text-xs font-medium transition"
                >
                  📍 Prova Spedizione (CAP 00185)
                </button>
                <button
                  onClick={() => handleTestTool('search_products', { query: 'reggiseno' })}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-purple-50 hover:text-purple-600 text-xs font-medium transition"
                >
                  🔍 Prova Ricerca Catalogo
                </button>
                <button
                  onClick={() => handleTestTool('send_product_photos', { product_name: 'Reggiseno Morbido' })}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-purple-50 hover:text-purple-600 text-xs font-medium transition"
                >
                  📸 Prova Invio Foto Prodotto
                </button>
                <button
                  onClick={() => handleTestTool('create_order_checkout', {
                    product_name: 'Reggiseno Morbido Róża',
                    buyer_name: 'Cliente Test',
                    buyer_address: 'Via Roma 1',
                    buyer_zip: '00100',
                    buyer_city: 'Roma',
                    buyer_phone: '3331234567'
                  })}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-purple-50 hover:text-purple-600 text-xs font-medium transition"
                >
                  🛍️ Prova Creazione Ordine Checkout
                </button>
                <button
                  onClick={() => handleTestTool('verify_business_rules', {})}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-purple-50 hover:text-purple-600 text-xs font-medium transition"
                >
                  📜 Prova Regole Negozio
                </button>
              </div>

              {toolTestResult && (
                <pre className="mt-3 p-3 rounded-xl bg-gray-900 text-emerald-400 font-mono text-[11px] overflow-x-auto">
                  {JSON.stringify(toolTestResult, null, 2)}
                </pre>
              )}
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={handleSaveAi}
                disabled={savingAi}
                className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs shadow-lg transition flex items-center gap-2"
              >
                <Check className="w-4 h-4" /> {savingAi ? 'Salvataggio...' : 'Salva Impostazioni AI'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'comments' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-500" /> Reglas de Automatización Comment-to-DM
            </h2>
            <p className="text-xs text-gray-500">
              Detecta palabras clave en comentarios de publicaciones ("precio", "info", "envío") y responde públicamente o envía un DM instantáneo.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2">
              <input
                type="text"
                placeholder="Nombre de la regla (ej. Interés en Precio)"
                value={newRuleName}
                onChange={e => setNewRuleName(e.target.value)}
                className="px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-xs"
              />
              <input
                type="text"
                placeholder="Palabras clave separadas por coma (precio, valor, costo)"
                value={newRuleKeywords}
                onChange={e => setNewRuleKeywords(e.target.value)}
                className="px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-xs"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Respuesta pública opcional"
                  value={newRulePublicReply}
                  onChange={e => setNewRulePublicReply(e.target.value)}
                  className="flex-1 px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-xs"
                />
                <button
                  onClick={async () => {
                    if (!newRuleName.trim() || !newRuleKeywords.trim()) return;
                    await omnichannelApi.createCommentRule({
                      name: newRuleName.trim(),
                      platform: 'all',
                      keywords: newRuleKeywords.split(',').map(s => s.trim()).filter(Boolean),
                      public_reply_text: newRulePublicReply.trim() || undefined
                    });
                    setNewRuleName('');
                    setNewRuleKeywords('');
                    setNewRulePublicReply('');
                    loadComments();
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow"
                >
                  Crear Regla
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Comentarios Recibidos</h3>
            {comments.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">No hay comentarios registrados por el momento.</p>
            ) : (
              <div className="space-y-3">
                {comments.map(c => (
                  <div key={c.id} className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-900 dark:text-white">{c.author_name || 'Usuario'}</span>
                      <span className="text-gray-400 uppercase">{c.platform} • {c.reply_status}</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300">"{c.comment_text}"</p>
                    <div className="flex gap-2 pt-2">
                      <input
                        type="text"
                        placeholder="Escribe una respuesta pública..."
                        value={replyTextMap[c.id] || ''}
                        onChange={e => setReplyTextMap({ ...replyTextMap, [c.id]: e.target.value })}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-xs"
                      />
                      <button
                        onClick={() => handleReplyComment(c.id)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow"
                      >
                        Responder
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 6. AUTO-PUBLISHING */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'publishing' && (
        <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-500" /> {t.tabPublishing}
          </h2>
          <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl text-center">
            <Calendar className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">Calendario de Publicaciones Activo</h4>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              Programa tus contenidos multicanal de temporada y ofertas con un solo clic.
            </p>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 7. PLANS & POLAR SUBSCRIPTION */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'plans' && (
        <div className="space-y-6">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white">{t.tabPlans}</h2>
            <p className="text-xs text-gray-500 mt-1">
              Todos los planes incluyen mensajes ilimitados, bandeja unificada y empleado inteligente DeepSeek AI.
            </p>
          </div>

          {plansData?.error && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
              {plansData.error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(plansData?.plans || []).map((p: any) => {
              const isCurrent = currentPlanCode === p.code;
              return (
                <div
                  key={p.code}
                  className={`rounded-3xl p-6 bg-white dark:bg-gray-900 border flex flex-col justify-between relative shadow-lg ${
                    isCurrent
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-emerald-500/10'
                      : p.popular
                      ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-blue-500/10'
                      : 'border-gray-200 dark:border-gray-800'
                  }`}
                >
                  {isCurrent ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-600 text-white font-black text-[10px] uppercase tracking-wider shadow">
                      {t.currentPlanBadge}
                    </span>
                  ) : p.popular ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-600 text-white font-black text-[10px] uppercase tracking-wider shadow">
                      Más Elegido
                    </span>
                  ) : null}

                  <div>
                    <h3 className="text-lg font-black text-gray-900 dark:text-white">{p.name}</h3>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-4xl font-black text-gray-900 dark:text-white">
                        {p.currency === 'USD' ? '$' : `${p.currency} `}{Number(p.price || 0).toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-500">/ mes</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {p.channels_included} canal(es) incluidos. Mensajes ilimitados.
                    </p>

                    <ul className="mt-6 space-y-2.5 text-xs text-gray-700 dark:text-gray-300">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> Bandeja Omnicanal Unificada
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> DeepSeek AI DoorDrop 24/7
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> Cotizador de Envíos Integrado
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> Rastreo de Órdenes en Tiempo Real
                      </li>
                    </ul>
                  </div>

                  <div className="mt-8 space-y-2">
                    <button
                      onClick={() => handleSubscribe(p)}
                      disabled={subscribingCode === p.code || isCurrent || !p.checkout_ready}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs transition shadow-md flex items-center justify-center gap-1.5 ${
                        isCurrent
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 cursor-default'
                          : !p.checkout_ready
                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      {isCurrent ? t.currentPlanBadge : p.checkout_ready ? t.polarCheckout : 'Polar pendiente'}
                    </button>
                    {!isCurrent && !p.checkout_ready && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center">El Super Admin debe asociar el producto recurrente de Polar.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {(!plansData || plansData.plans?.length === 0) && !plansData?.error && (
            <div className="p-8 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 text-center text-xs text-gray-500">
              No hay planes Omnicanal publicados en este momento.
            </div>
          )}

          {/* Add-ons List */}
          <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-3">Módulos & Canales Adicionales</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(plansData?.addOns || []).map((addon: any) => (
                <div key={addon.code} className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 flex justify-between items-center gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white">{addon.name}</h4>
                    <p className="text-[11px] text-gray-500">{addon.description}</p>
                    {!addon.checkout_ready && <p className="text-[10px] text-amber-600 mt-1">Disponible cuando Polar esté configurado.</p>}
                  </div>
                  <span className="font-bold text-sm text-blue-600 whitespace-nowrap">{addon.currency === 'USD' ? '$' : `${addon.currency} `}{Number(addon.price || 0).toFixed(2)} / mes</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
