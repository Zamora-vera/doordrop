import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Headphones,
  Inbox,
  KeyRound,
  LifeBuoy,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Ticket,
  Users,
  Webhook,
  XCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';

type AssistanceTab = 'inbox' | 'tickets' | 'customers' | 'team' | 'channels' | 'agent' | 'knowledge' | 'settings';

const baseLanguage = (value: string) => {
  const normalized = String(value || 'es').toLowerCase();
  if (normalized.startsWith('it')) return 'it';
  if (normalized.startsWith('en')) return 'en';
  if (normalized.startsWith('fr')) return 'fr';
  return 'es';
};

const textByLanguage: Record<string, Record<string, string>> = {
  es: {
    eyebrow: 'OPERACIÓN INTERNA · SUPER ADMIN',
    title: 'Centro de Asistencia AI',
    subtitle: 'Atiende a tus clientes desde tus canales corporativos, con contexto seguro y transferencia al equipo humano.',
    boundary: 'Módulo interno. No administra la reventa de Omnicanal + AI.',
    resale: 'Ir a Omnicanal · Reventa',
    refresh: 'Actualizar',
    inbox: 'Bandeja',
    tickets: 'Tickets',
    customers: 'Clientes identificados',
    team: 'Equipo',
    channels: 'Canales internos',
    agent: 'Agente AI',
    knowledge: 'Base de conocimiento',
    settings: 'Configuración',
    connectedChannels: 'Canales conectados',
    conversations: 'Conversaciones abiertas',
    openTickets: 'Tickets pendientes',
    knowledgeItems: 'Artículos activos',
    notConfigured: 'Pendiente de configuración',
    configured: 'Configurado',
    internalOnly: 'Configuración independiente',
    inboxTitle: 'Bandeja corporativa',
    inboxDescription: 'Conversaciones recibidas en tus canales internos. La identidad se verifica antes de mostrar información privada.',
    searchConversation: 'Buscar contacto o mensaje…',
    noConversations: 'Todavía no hay conversaciones internas.',
    connectToReceive: 'Configura un canal corporativo y el webhook para empezar a recibir mensajes reales.',
    selectConversation: 'Selecciona una conversación',
    conversationHint: 'Puedes responder manualmente, verificar al cliente o transferir el caso a un ticket.',
    internalAgent: 'Consulta al agente interno',
    internalAgentHint: 'Pregunta por envíos, tickets, facturación, marketplace o integraciones. Usa solo el contexto del sistema.',
    askAgent: 'Escribe una consulta para el equipo…',
    send: 'Enviar',
    identify: 'Verificar cliente',
    identifierPlaceholder: 'Correo registrado o código DD-…',
    handoff: 'Pasar a humano',
    handoffHint: 'Requiere identificar al cliente para crear un ticket vinculado.',
    verified: 'Cliente verificado',
    unverified: 'Identidad pendiente',
    ticketCreated: 'Ticket creado',
    noMessages: 'Sin mensajes todavía.',
    channelsTitle: 'Canales corporativos',
    channelsDescription: 'Estos canales pertenecen a DoorDrop y están separados de las cuentas que conectan tus clientes en la reventa.',
    whatsapp: 'WhatsApp corporativo',
    whatsappDescription: 'Conecta el número de asistencia mediante el flujo oficial y escanea el QR desde tu teléfono.',
    instagram: 'Instagram corporativo',
    facebook: 'Facebook corporativo',
    telegram: 'Telegram corporativo',
    email: 'Email corporativo',
    webChat: 'Web Chat corporativo',
    readyLater: 'Integración preparada por separado',
    connectWhatsapp: 'Conectar WhatsApp · QR',
    configureChannels: 'Guardar webhook interno',
    webhookReady: 'Webhook interno configurado',
    webhookMissing: 'Webhook interno pendiente',
    channelKeyMissing: 'Falta la clave propia del proveedor de canales.',
    noChannel: 'Sin conexión',
    agentTitle: 'Agente AI interno',
    agentDescription: 'El agente consulta datos autorizados del ecosistema para asistir al equipo. No comparte la configuración ni la reventa de Omnicanal.',
    aiKeyMissing: 'Falta la clave propia del Centro de Asistencia.',
    aiReady: 'Agente listo para trabajar',
    model: 'Modelo',
    humanHandoff: 'Escalado humano',
    humanHandoffDescription: 'Las solicitudes privadas piden email o código de cliente. Los casos complejos se convierten en tickets vinculados.',
    settingsTitle: 'Configuración aislada',
    settingsDescription: 'Estas credenciales solo se usan en el Centro de Asistencia. No se leen de la configuración pública de Omnicanal.',
    channelProvider: 'Proveedor de canales',
    aiProvider: 'Proveedor de inteligencia',
    apiUrl: 'URL API',
    apiKey: 'Clave API',
    keepExisting: 'Déjalo vacío para conservar la clave actual.',
    webhookSecret: 'Secreto del webhook',
    modelLabel: 'Modelo interno',
    enabled: 'Agente activo',
    defaultLanguage: 'Idioma predeterminado',
    save: 'Guardar configuración',
    saved: 'Configuración guardada.',
    ticketsTitle: 'Tickets del Centro de Asistencia',
    ticketsDescription: 'Tickets creados desde conversaciones internas verificadas.',
    noTickets: 'No hay tickets de asistencia.',
    openSupport: 'Abrir soporte completo',
    customersTitle: 'Clientes identificados',
    customersDescription: 'Solo aparecen contactos vinculados después de verificar su correo o código DoorDrop.',
    noCustomers: 'Todavía no hay clientes identificados.',
    teamTitle: 'Equipo de asistencia',
    teamDescription: 'El Centro usa el equipo real de soporte configurado en Super Admin.',
    manageTeam: 'Gestionar equipo',
    noTeam: 'No hay miembros de soporte configurados.',
    knowledgeTitle: 'Base de conocimiento interna',
    knowledgeDescription: 'Información operativa que el agente puede usar para responder con precisión.',
    articleTitle: 'Título del artículo',
    articleContent: 'Contenido operativo',
    addArticle: 'Agregar artículo',
    noKnowledge: 'No hay artículos activos.',
    loading: 'Cargando…',
    error: 'No se pudo cargar el Centro de Asistencia.',
    retry: 'Reintentar',
    unknown: 'Desconocido',
    date: 'Fecha',
    status: 'Estado',
    contact: 'Contacto',
    subject: 'Asunto',
    language: 'Idioma'
  },
  it: {
    eyebrow: 'OPERAZIONE INTERNA · SUPER ADMIN', title: 'Centro Assistenza AI', subtitle: 'Gestisci i clienti dai tuoi canali aziendali, con contesto sicuro e passaggio al team umano.', boundary: 'Modulo interno. Non gestisce la rivendita di Omnicanal + AI.', resale: 'Vai a Omnicanal · Rivendita', refresh: 'Aggiorna', inbox: 'Posta unificata', tickets: 'Ticket', customers: 'Clienti identificati', team: 'Team', channels: 'Canali interni', agent: 'Agente AI', knowledge: 'Base di conoscenza', settings: 'Configurazione', connectedChannels: 'Canali connessi', conversations: 'Conversazioni aperte', openTickets: 'Ticket pendenti', knowledgeItems: 'Articoli attivi', notConfigured: 'Configurazione necessaria', configured: 'Configurato', internalOnly: 'Configurazione indipendente', inboxTitle: 'Posta aziendale', inboxDescription: 'Conversazioni ricevute nei tuoi canali interni. L’identità viene verificata prima dei dati privati.', searchConversation: 'Cerca contatto o messaggio…', noConversations: 'Non ci sono ancora conversazioni interne.', connectToReceive: 'Configura un canale aziendale e il webhook per ricevere messaggi reali.', selectConversation: 'Seleziona una conversazione', conversationHint: 'Puoi rispondere, verificare il cliente o trasferire il caso a un ticket.', internalAgent: 'Consulta l’agente interno', internalAgentHint: 'Chiedi di spedizioni, ticket, fatturazione, marketplace o integrazioni.', askAgent: 'Scrivi una richiesta per il team…', send: 'Invia', identify: 'Verifica cliente', identifierPlaceholder: 'Email registrata o codice DD-…', handoff: 'Passa a un operatore', handoffHint: 'È necessario verificare il cliente per creare un ticket collegato.', verified: 'Cliente verificato', unverified: 'Identità da verificare', ticketCreated: 'Ticket creato', noMessages: 'Nessun messaggio.', channelsTitle: 'Canali aziendali', channelsDescription: 'Questi canali appartengono a DoorDrop e sono separati dagli account dei clienti.', whatsapp: 'WhatsApp aziendale', whatsappDescription: 'Collega il numero di assistenza tramite il flusso ufficiale e scansiona il QR.', instagram: 'Instagram aziendale', facebook: 'Facebook aziendale', telegram: 'Telegram aziendale', email: 'Email aziendale', webChat: 'Web Chat aziendale', readyLater: 'Integrazione preparata separatamente', connectWhatsapp: 'Collega WhatsApp · QR', configureChannels: 'Salva webhook interno', webhookReady: 'Webhook interno configurato', webhookMissing: 'Webhook interno da configurare', channelKeyMissing: 'Manca la chiave del provider dei canali.', noChannel: 'Non connesso', agentTitle: 'Agente AI interno', agentDescription: 'Consulta i dati autorizzati per assistere il team. Non condivide la configurazione della rivendita.', aiKeyMissing: 'Manca la chiave del Centro Assistenza.', aiReady: 'Agente pronto', model: 'Modello', humanHandoff: 'Passaggio umano', humanHandoffDescription: 'Le richieste private richiedono email o codice cliente; i casi complessi diventano ticket.', settingsTitle: 'Configurazione isolata', settingsDescription: 'Queste credenziali sono usate solo dal Centro Assistenza.', channelProvider: 'Provider canali', aiProvider: 'Provider IA', apiUrl: 'URL API', apiKey: 'Chiave API', keepExisting: 'Lascia vuoto per mantenere la chiave attuale.', webhookSecret: 'Segreto webhook', modelLabel: 'Modello interno', enabled: 'Agente attivo', defaultLanguage: 'Lingua predefinita', save: 'Salva configurazione', saved: 'Configurazione salvata.', ticketsTitle: 'Ticket del Centro Assistenza', ticketsDescription: 'Ticket creati da conversazioni interne verificate.', noTickets: 'Nessun ticket di assistenza.', openSupport: 'Apri supporto completo', customersTitle: 'Clienti identificati', customersDescription: 'Sono mostrati solo i contatti verificati.', noCustomers: 'Nessun cliente identificato.', teamTitle: 'Team assistenza', teamDescription: 'Il Centro usa il team reale di supporto configurato nel Super Admin.', manageTeam: 'Gestisci team', noTeam: 'Nessun membro configurato.', knowledgeTitle: 'Base di conoscenza interna', knowledgeDescription: 'Informazioni operative che l’agente può usare.', articleTitle: 'Titolo articolo', articleContent: 'Contenuto operativo', addArticle: 'Aggiungi articolo', noKnowledge: 'Nessun articolo attivo.', loading: 'Caricamento…', error: 'Impossibile caricare il Centro Assistenza.', retry: 'Riprova', unknown: 'Sconosciuto', date: 'Data', status: 'Stato', contact: 'Contatto', subject: 'Oggetto', language: 'Lingua'
  },
  en: {
    eyebrow: 'INTERNAL OPERATION · SUPER ADMIN', title: 'AI Assistance Center', subtitle: 'Support customers from your corporate channels with a secure context and human handoff.', boundary: 'Internal module. It does not manage Omnichannel + AI resale.', resale: 'Go to Omnichannel · Resale', refresh: 'Refresh', inbox: 'Inbox', tickets: 'Tickets', customers: 'Identified customers', team: 'Team', channels: 'Internal channels', agent: 'AI agent', knowledge: 'Knowledge base', settings: 'Settings', connectedChannels: 'Connected channels', conversations: 'Open conversations', openTickets: 'Pending tickets', knowledgeItems: 'Active articles', notConfigured: 'Needs configuration', configured: 'Configured', internalOnly: 'Independent configuration', inboxTitle: 'Corporate inbox', inboxDescription: 'Conversations received on your internal channels. Identity is verified before private data is shown.', searchConversation: 'Search contact or message…', noConversations: 'There are no internal conversations yet.', connectToReceive: 'Configure a corporate channel and webhook to receive real messages.', selectConversation: 'Select a conversation', conversationHint: 'You can reply, verify the customer or hand the case to a ticket.', internalAgent: 'Ask the internal agent', internalAgentHint: 'Ask about shipments, tickets, billing, marketplace or integrations using system context only.', askAgent: 'Write a request for the team…', send: 'Send', identify: 'Verify customer', identifierPlaceholder: 'Registered email or DD-… code', handoff: 'Hand off to human', handoffHint: 'Customer verification is required to create a linked ticket.', verified: 'Customer verified', unverified: 'Identity pending', ticketCreated: 'Ticket created', noMessages: 'No messages yet.', channelsTitle: 'Corporate channels', channelsDescription: 'These channels belong to DoorDrop and are separate from customer resale accounts.', whatsapp: 'Corporate WhatsApp', whatsappDescription: 'Connect the support number through the official flow and scan the QR from your phone.', instagram: 'Corporate Instagram', facebook: 'Corporate Facebook', telegram: 'Corporate Telegram', email: 'Corporate email', webChat: 'Corporate Web Chat', readyLater: 'Separate integration prepared', connectWhatsapp: 'Connect WhatsApp · QR', configureChannels: 'Save internal webhook', webhookReady: 'Internal webhook configured', webhookMissing: 'Internal webhook pending', channelKeyMissing: 'The private channel provider key is missing.', noChannel: 'Not connected', agentTitle: 'Internal AI agent', agentDescription: 'The agent uses authorized ecosystem data to assist the team. It does not share resale configuration.', aiKeyMissing: 'The private Assistance Center key is missing.', aiReady: 'Agent ready', model: 'Model', humanHandoff: 'Human handoff', humanHandoffDescription: 'Private requests ask for an email or customer code; complex cases become linked tickets.', settingsTitle: 'Isolated configuration', settingsDescription: 'These credentials are used only by the Assistance Center.', channelProvider: 'Channel provider', aiProvider: 'AI provider', apiUrl: 'API URL', apiKey: 'API key', keepExisting: 'Leave blank to keep the current key.', webhookSecret: 'Webhook secret', modelLabel: 'Internal model', enabled: 'Agent enabled', defaultLanguage: 'Default language', save: 'Save configuration', saved: 'Configuration saved.', ticketsTitle: 'Assistance Center tickets', ticketsDescription: 'Tickets created from verified internal conversations.', noTickets: 'No assistance tickets.', openSupport: 'Open full support', customersTitle: 'Identified customers', customersDescription: 'Only contacts verified by email or DoorDrop code appear here.', noCustomers: 'No identified customers yet.', teamTitle: 'Assistance team', teamDescription: 'The Center uses the real support team configured in Super Admin.', manageTeam: 'Manage team', noTeam: 'No support members configured.', knowledgeTitle: 'Internal knowledge base', knowledgeDescription: 'Operational information the agent can use for accurate answers.', articleTitle: 'Article title', articleContent: 'Operational content', addArticle: 'Add article', noKnowledge: 'No active articles.', loading: 'Loading…', error: 'The Assistance Center could not be loaded.', retry: 'Retry', unknown: 'Unknown', date: 'Date', status: 'Status', contact: 'Contact', subject: 'Subject', language: 'Language'
  },
  fr: {
    eyebrow: 'OPÉRATION INTERNE · SUPER ADMIN', title: 'Centre d’assistance IA', subtitle: 'Accompagnez les clients depuis vos canaux d’entreprise avec un contexte sécurisé et un relais humain.', boundary: 'Module interne. Il ne gère pas la revente Omnicanal + AI.', resale: 'Aller à Omnicanal · Revente', refresh: 'Actualiser', inbox: 'Boîte de réception', tickets: 'Tickets', customers: 'Clients identifiés', team: 'Équipe', channels: 'Canaux internes', agent: 'Agent IA', knowledge: 'Base de connaissances', settings: 'Configuration', connectedChannels: 'Canaux connectés', conversations: 'Conversations ouvertes', openTickets: 'Tickets en attente', knowledgeItems: 'Articles actifs', notConfigured: 'Configuration requise', configured: 'Configuré', internalOnly: 'Configuration indépendante', inboxTitle: 'Boîte de réception', inboxDescription: 'Conversations reçues sur vos canaux internes. L’identité est vérifiée avant les données privées.', searchConversation: 'Rechercher un contact ou message…', noConversations: 'Aucune conversation interne pour le moment.', connectToReceive: 'Configurez un canal d’entreprise et le webhook pour recevoir de vrais messages.', selectConversation: 'Sélectionnez une conversation', conversationHint: 'Répondez, vérifiez le client ou transmettez le cas à un ticket.', internalAgent: 'Interroger l’agent interne', internalAgentHint: 'Demandez des informations sur les envois, tickets, factures, marketplace ou intégrations.', askAgent: 'Écrivez une demande pour l’équipe…', send: 'Envoyer', identify: 'Vérifier le client', identifierPlaceholder: 'Email enregistré ou code DD-…', handoff: 'Transmettre à un humain', handoffHint: 'La vérification du client est requise pour créer un ticket lié.', verified: 'Client vérifié', unverified: 'Identité à vérifier', ticketCreated: 'Ticket créé', noMessages: 'Aucun message.', channelsTitle: 'Canaux d’entreprise', channelsDescription: 'Ces canaux appartiennent à DoorDrop et sont séparés des comptes de revente clients.', whatsapp: 'WhatsApp d’entreprise', whatsappDescription: 'Connectez le numéro d’assistance via le flux officiel et scannez le QR.', instagram: 'Instagram d’entreprise', facebook: 'Facebook d’entreprise', telegram: 'Telegram d’entreprise', email: 'Email d’entreprise', webChat: 'Web Chat d’entreprise', readyLater: 'Intégration séparée préparée', connectWhatsapp: 'Connecter WhatsApp · QR', configureChannels: 'Enregistrer le webhook interne', webhookReady: 'Webhook interne configuré', webhookMissing: 'Webhook interne en attente', channelKeyMissing: 'La clé privée du fournisseur de canaux est manquante.', noChannel: 'Non connecté', agentTitle: 'Agent IA interne', agentDescription: 'L’agent utilise les données autorisées de l’écosystème pour aider l’équipe, sans partager la configuration de revente.', aiKeyMissing: 'La clé privée du Centre d’assistance est manquante.', aiReady: 'Agent prêt', model: 'Modèle', humanHandoff: 'Relais humain', humanHandoffDescription: 'Les demandes privées exigent un email ou un code client; les cas complexes deviennent des tickets.', settingsTitle: 'Configuration isolée', settingsDescription: 'Ces identifiants sont utilisés uniquement par le Centre d’assistance.', channelProvider: 'Fournisseur de canaux', aiProvider: 'Fournisseur IA', apiUrl: 'URL API', apiKey: 'Clé API', keepExisting: 'Laissez vide pour conserver la clé actuelle.', webhookSecret: 'Secret webhook', modelLabel: 'Modèle interne', enabled: 'Agent actif', defaultLanguage: 'Langue par défaut', save: 'Enregistrer la configuration', saved: 'Configuration enregistrée.', ticketsTitle: 'Tickets du Centre d’assistance', ticketsDescription: 'Tickets créés depuis des conversations internes vérifiées.', noTickets: 'Aucun ticket d’assistance.', openSupport: 'Ouvrir le support complet', customersTitle: 'Clients identifiés', customersDescription: 'Seuls les contacts vérifiés par email ou code DoorDrop apparaissent.', noCustomers: 'Aucun client identifié.', teamTitle: 'Équipe d’assistance', teamDescription: 'Le Centre utilise l’équipe réelle configurée dans le Super Admin.', manageTeam: 'Gérer l’équipe', noTeam: 'Aucun membre configuré.', knowledgeTitle: 'Base de connaissances interne', knowledgeDescription: 'Informations opérationnelles utilisables par l’agent.', articleTitle: 'Titre de l’article', articleContent: 'Contenu opérationnel', addArticle: 'Ajouter un article', noKnowledge: 'Aucun article actif.', loading: 'Chargement…', error: 'Impossible de charger le Centre d’assistance.', retry: 'Réessayer', unknown: 'Inconnu', date: 'Date', status: 'Statut', contact: 'Contact', subject: 'Objet', language: 'Langue'
  }
};

const formatDate = (value: unknown, language: string) => {
  if (!value) return '—';
  try { return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : language === 'fr' ? 'fr-FR' : language === 'it' ? 'it-IT' : 'es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(String(value))); } catch { return String(value); }
};

const statusClass = (status: string) => {
  const value = String(status || '').toLowerCase();
  if (['connected', 'active', 'online', 'open', 'verified'].includes(value)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (['needs_human', 'pending', 'unverified'].includes(value)) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (['closed', 'failed', 'inactive'].includes(value)) return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
};

function MetricCard({ icon: Icon, label, value, tone = 'blue' }: { icon: any; label: string; value: number; tone?: string }) {
  const tones: Record<string, string> = { blue: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', violet: 'bg-violet-50 text-violet-600' };
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-slate-900">{value}</p></div><div className={`rounded-xl p-3 ${tones[tone] || tones.blue}`}><Icon className="h-5 w-5" /></div></div></div>;
}

export default function AdminAssistanceCenter() {
  const { language: i18nLanguage } = useI18n();
  const language = baseLanguage(i18nLanguage);
  const c = textByLanguage[language] || textByLanguage.es;
  const [tab, setTab] = useState<AssistanceTab>('inbox');
  const [overview, setOverview] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [agentMessages, setAgentMessages] = useState<any[]>([]);
  const [agentConversationId, setAgentConversationId] = useState<string | undefined>();
  const [agentInput, setAgentInput] = useState('');
  const [replyInput, setReplyInput] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [settingsForm, setSettingsForm] = useState<any>({});
  const [articleForm, setArticleForm] = useState({ title: '', content: '', language: 'es' });

  const loadAll = async () => {
    setLoading(true); setError('');
    try {
      const [overviewRes, settingsRes, channelsRes, conversationsRes, ticketsRes, customersRes, teamRes, knowledgeRes] = await Promise.all([
        api.getAdminAssistanceOverview(), api.getAdminAssistanceSettings(), api.getAdminAssistanceChannels(), api.getAdminAssistanceConversations(), api.getAdminAssistanceTickets(), api.getAdminAssistanceCustomers(), api.getAdminAssistanceTeam(), api.getAdminAssistanceKnowledge()
      ]);
      setOverview(overviewRes.overview || null); setSettings(settingsRes.settings || null); setSettingsForm({ ...(settingsRes.settings || {}), ai_api_key: '', zernio_api_key: '' });
      setChannels(channelsRes.channels || []); setConversations(conversationsRes.conversations || []); setTickets(ticketsRes.tickets || []); setCustomers(customersRes.customers || []); setTeam(teamRes.team || []); setKnowledge(knowledgeRes.knowledge || []);
    } catch (e: any) { setError(e?.message || c.error); } finally { setLoading(false); }
  };

  useEffect(() => { void loadAll(); }, []);

  const selectConversation = async (conversation: any) => {
    setSelectedConversation(conversation); setMessages([]); setIdentifier(''); setNotice('');
    try { const response = await api.getAdminAssistanceMessages(conversation.id); setSelectedConversation(response.conversation || conversation); setMessages(response.messages || []); } catch (e: any) { setError(e?.message || c.error); }
  };

  const sendAgentMessage = async () => {
    const message = agentInput.trim(); if (!message || busy) return;
    setBusy('agent'); setError('');
    try { const response = await api.adminAssistanceChat(message, language, agentConversationId); setAgentMessages((current) => [...current, { direction: 'inbound', text_content: message }, { direction: 'outbound', text_content: response.response, sender_name: `DoorDrop AI · ${response.model || ''}` }]); setAgentConversationId(response.conversationId); setAgentInput(''); } catch (e: any) { setError(e?.message || c.error); } finally { setBusy(''); }
  };

  const sendReply = async () => {
    if (!selectedConversation || !replyInput.trim() || busy) return;
    setBusy('reply'); setError('');
    try { await api.sendAdminAssistanceMessage(selectedConversation.id, replyInput.trim()); setReplyInput(''); await selectConversation(selectedConversation); } catch (e: any) { setError(e?.message || c.error); } finally { setBusy(''); }
  };

  const verifyCustomer = async () => {
    if (!selectedConversation || !identifier.trim() || busy) return;
    setBusy('identify'); setError('');
    try { const response = await api.identifyAdminAssistanceConversation(selectedConversation.id, identifier.trim()); setNotice(`${c.verified}: ${response.customer?.name || response.customer?.email || ''}`); await selectConversation(selectedConversation); await loadAll(); } catch (e: any) { setError(e?.message || c.error); } finally { setBusy(''); }
  };

  const handoff = async () => {
    if (!selectedConversation || busy) return;
    setBusy('handoff'); setError('');
    try { const response = await api.handoffAdminAssistanceConversation(selectedConversation.id); setNotice(`${c.ticketCreated}: ${response.ticket?.subject || response.ticket?.id || ''}`); await selectConversation(selectedConversation); await loadAll(); } catch (e: any) { setError(e?.message || c.error); } finally { setBusy(''); }
  };

  const connectWhatsapp = async () => {
    if (busy) return;
    setBusy('connect'); setError('');
    try { const response = await api.connectAdminAssistanceChannel('whatsapp', language); if (response.authUrl) window.open(response.authUrl, '_blank', 'noopener,noreferrer'); setNotice(c.connectWhatsapp); await loadAll(); } catch (e: any) { setError(e?.message || c.error); } finally { setBusy(''); }
  };

  const ensureWebhook = async () => {
    setBusy('webhook'); setError('');
    try { const response = await api.ensureAdminAssistanceWebhook(); setNotice(response.url ? `${c.webhookReady}: ${response.url}` : c.webhookReady); await loadAll(); } catch (e: any) { setError(e?.message || c.error); } finally { setBusy(''); }
  };

  const saveSettings = async () => {
    setBusy('settings'); setError(''); setNotice('');
    try { await api.saveAdminAssistanceSettings({ ...settingsForm, ai_api_key: settingsForm.ai_api_key?.trim() || undefined, zernio_api_key: settingsForm.zernio_api_key?.trim() || undefined }); setNotice(c.saved); const response = await api.getAdminAssistanceSettings(); setSettings(response.settings || null); setSettingsForm({ ...(response.settings || {}), ai_api_key: '', zernio_api_key: '' }); await loadAll(); } catch (e: any) { setError(e?.message || c.error); } finally { setBusy(''); }
  };

  const addArticle = async () => {
    if (!articleForm.title.trim() || !articleForm.content.trim() || busy) return;
    setBusy('article'); setError('');
    try { await api.createAdminAssistanceKnowledge(articleForm); setArticleForm({ title: '', content: '', language }); setNotice(c.saved); const response = await api.getAdminAssistanceKnowledge(); setKnowledge(response.knowledge || []); await loadAll(); } catch (e: any) { setError(e?.message || c.error); } finally { setBusy(''); }
  };

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase(); if (!query) return conversations;
    return conversations.filter((item) => [item.contact_name, item.contact_phone, item.contact_email, item.last_message, item.platform].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [conversations, search]);

  const tabs: Array<{ id: AssistanceTab; label: string; icon: any }> = [
    { id: 'inbox', label: c.inbox, icon: Inbox }, { id: 'tickets', label: c.tickets, icon: Ticket }, { id: 'customers', label: c.customers, icon: Users }, { id: 'team', label: c.team, icon: Headphones }, { id: 'channels', label: c.channels, icon: MessageCircle }, { id: 'agent', label: c.agent, icon: Bot }, { id: 'knowledge', label: c.knowledge, icon: CircleHelp }, { id: 'settings', label: c.settings, icon: Settings }
  ];

  const renderInbox = () => <div className="grid min-h-[620px] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:grid-cols-[330px_minmax(0,1fr)]">
    <section className="border-b border-slate-200 xl:border-b-0 xl:border-r">
      <div className="border-b border-slate-200 p-4"><h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><Inbox className="h-5 w-5 text-blue-600" />{c.inboxTitle}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{c.inboxDescription}</p><div className="relative mt-4"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={c.searchConversation} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400" /></div></div>
      <div className="max-h-[520px] overflow-y-auto">{filteredConversations.map((conversation) => <button key={conversation.id} onClick={() => void selectConversation(conversation)} className={`flex w-full items-start gap-3 border-b border-slate-100 p-4 text-left transition hover:bg-blue-50 ${selectedConversation?.id === conversation.id ? 'bg-blue-50' : ''}`}><div className="mt-0.5 rounded-xl bg-blue-100 p-2 text-blue-700"><MessageCircle className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-bold text-slate-900">{conversation.contact_name || 'Contacto'}</p><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClass(conversation.identity_status)}`}>{conversation.identity_status === 'verified' ? c.verified : c.unverified}</span></div><p className="mt-1 truncate text-xs text-slate-500">{conversation.last_message || c.noMessages}</p><p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">{conversation.platform} · {formatDate(conversation.last_message_at || conversation.created_at, language)}</p></div><ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300" /></button>)}{!filteredConversations.length && <div className="p-8 text-center"><MessagesSquare className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-600">{c.noConversations}</p><p className="mt-2 text-xs leading-5 text-slate-400">{c.connectToReceive}</p></div>}</div>
    </section>
    <section className="flex min-h-[620px] flex-col bg-slate-50/70">
      {selectedConversation ? <><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-5"><div><div className="flex items-center gap-2"><h3 className="text-lg font-black text-slate-900">{selectedConversation.contact_name || 'Contacto'}</h3><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(selectedConversation.identity_status)}`}>{selectedConversation.identity_status === 'verified' ? c.verified : c.unverified}</span></div><p className="mt-1 text-xs text-slate-500">{selectedConversation.contact_phone || selectedConversation.contact_email || c.unknown} · {selectedConversation.platform}</p></div><div className="flex flex-wrap gap-2"><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={c.identifierPlaceholder} className="w-52 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" /><button disabled={busy === 'identify'} onClick={() => void verifyCustomer()} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />{c.identify}</button><button disabled={busy === 'handoff' || selectedConversation.identity_status !== 'verified'} onClick={() => void handoff()} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><LifeBuoy className="h-4 w-4" />{c.handoff}</button></div></div><div className="flex-1 space-y-3 overflow-y-auto p-5">{messages.length ? messages.map((message) => <div key={message.id || `${message.created_at}-${message.text_content}`} className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${message.direction === 'outbound' ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}><p className="whitespace-pre-wrap leading-6">{message.text_content}</p><p className={`mt-2 text-[10px] ${message.direction === 'outbound' ? 'text-blue-100' : 'text-slate-400'}`}>{message.sender_name || message.sender_type} · {formatDate(message.created_at, language)}</p></div></div>) : <p className="py-20 text-center text-sm text-slate-400">{c.noMessages}</p>}</div><div className="border-t border-slate-200 bg-white p-4"><div className="flex gap-2"><textarea value={replyInput} onChange={(event) => setReplyInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendReply(); } }} placeholder={c.askAgent} className="min-h-12 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400" /><button disabled={!replyInput.trim() || busy === 'reply'} onClick={() => void sendReply()} className="self-end rounded-xl bg-blue-600 p-3 text-white disabled:opacity-50"><Send className="h-5 w-5" /></button></div><p className="mt-2 text-[11px] text-slate-400">{c.handoffHint}</p></div></> : <div className="flex flex-1 flex-col p-5"><div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-violet-50 p-6"><div className="flex items-start gap-3"><div className="rounded-xl bg-blue-600 p-3 text-white"><Bot className="h-6 w-6" /></div><div><h3 className="text-xl font-black text-slate-900">{c.internalAgent}</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{c.internalAgentHint}</p></div></div></div><div className="mt-5 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5">{agentMessages.length ? agentMessages.map((message, index) => <div key={`${index}-${message.text_content}`} className={`flex ${message.direction === 'outbound' ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${message.direction === 'outbound' ? 'border border-slate-200 bg-slate-50 text-slate-800' : 'bg-blue-600 text-white'}`}><p className="whitespace-pre-wrap leading-6">{message.text_content}</p><p className={`mt-2 text-[10px] ${message.direction === 'outbound' ? 'text-slate-400' : 'text-blue-100'}`}>{message.sender_name || (message.direction === 'outbound' ? c.agent : 'Super Admin')}</p></div></div>) : <div className="flex h-full min-h-56 items-center justify-center text-center text-sm text-slate-400"><div><Bot className="mx-auto h-10 w-10 text-blue-300" /><p className="mt-3">{c.conversationHint}</p></div></div>}</div><div className="mt-4 flex gap-2"><textarea value={agentInput} onChange={(event) => setAgentInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendAgentMessage(); } }} placeholder={c.askAgent} className="min-h-12 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-400" /><button disabled={!agentInput.trim() || busy === 'agent'} onClick={() => void sendAgentMessage()} className="self-end rounded-xl bg-blue-600 p-3 text-white disabled:opacity-50"><Send className="h-5 w-5" /></button></div></div>}
    </section>
  </div>;

  const renderChannels = () => { const cards = [{ platform: 'whatsapp', title: c.whatsapp, description: c.whatsappDescription, icon: Phone }, { platform: 'instagram', title: c.instagram, description: c.readyLater, icon: MessageCircle }, { platform: 'facebook', title: c.facebook, description: c.readyLater, icon: MessageCircle }, { platform: 'telegram', title: c.telegram, description: c.readyLater, icon: MessageCircle }, { platform: 'email', title: c.email, description: c.readyLater, icon: MessagesSquare }, { platform: 'web_chat', title: c.webChat, description: c.readyLater, icon: MessageCircle }]; return <div className="space-y-5"><div><h2 className="text-2xl font-black text-slate-900">{c.channelsTitle}</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">{c.channelsDescription}</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{cards.map((card) => { const connected = channels.find((item) => item.platform === card.platform); const Icon = card.icon; return <div key={card.platform} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div className="rounded-xl bg-blue-50 p-3 text-blue-600"><Icon className="h-5 w-5" /></div><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(connected?.status || 'pending')}`}>{connected ? connected.status : c.noChannel}</span></div><h3 className="mt-4 font-black text-slate-900">{card.title}</h3><p className="mt-1 min-h-10 text-sm leading-5 text-slate-500">{card.description}</p>{connected?.phoneNumber && <p className="mt-3 text-xs font-bold text-slate-700">{connected.phoneNumber}</p>}{card.platform === 'whatsapp' ? <button onClick={() => void connectWhatsapp()} disabled={busy === 'connect'} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}{c.connectWhatsapp}</button> : <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-center text-xs font-bold text-slate-500">{c.readyLater}</div>}</div>; })}</div><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><p className="font-black text-slate-900">{overview?.webhookConfigured ? c.webhookReady : c.webhookMissing}</p><p className="mt-1 text-xs text-slate-500">https://doordrop.lat/api/webhooks/assistance-zernio</p></div><button onClick={() => void ensureWebhook()} disabled={busy === 'webhook'} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><Webhook className="h-4 w-4" />{c.configureChannels}</button></div></div>; };

  const renderSettings = () => <div className="max-w-4xl space-y-5"><div><h2 className="text-2xl font-black text-slate-900">{c.settingsTitle}</h2><p className="mt-1 text-sm text-slate-500">{c.settingsDescription}</p></div><div className="grid gap-5 md:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-xl bg-blue-50 p-3 text-blue-600"><Webhook className="h-5 w-5" /></div><div><h3 className="font-black text-slate-900">{c.channelProvider}</h3><p className="text-xs text-slate-500">{c.internalOnly}</p></div></div><label className="mt-5 block text-xs font-bold uppercase tracking-wide text-slate-500">{c.apiUrl}<input value={settingsForm.zernio_api_url || ''} onChange={(event) => setSettingsForm({ ...settingsForm, zernio_api_url: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400" /></label><label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-500">{c.apiKey}<input type="password" autoComplete="new-password" value={settingsForm.zernio_api_key || ''} onChange={(event) => setSettingsForm({ ...settingsForm, zernio_api_key: event.target.value })} placeholder={settings?.zernio_api_configured ? '••••••••  ' + c.keepExisting : c.channelKeyMissing} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400" /></label><label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-500">{c.webhookSecret}<input type="password" autoComplete="new-password" value={settingsForm.zernio_webhook_secret || ''} onChange={(event) => setSettingsForm({ ...settingsForm, zernio_webhook_secret: event.target.value })} placeholder={settings?.zernio_webhook_configured ? '••••••••  ' + c.keepExisting : 'Se genera al activar el webhook'} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400" /></label></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-xl bg-violet-50 p-3 text-violet-600"><KeyRound className="h-5 w-5" /></div><div><h3 className="font-black text-slate-900">{c.aiProvider}</h3><p className="text-xs text-slate-500">{c.internalOnly}</p></div></div><label className="mt-5 block text-xs font-bold uppercase tracking-wide text-slate-500">{c.apiUrl}<input value={settingsForm.ai_api_url || ''} onChange={(event) => setSettingsForm({ ...settingsForm, ai_api_url: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400" /></label><label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-500">{c.apiKey}<input type="password" autoComplete="new-password" value={settingsForm.ai_api_key || ''} onChange={(event) => setSettingsForm({ ...settingsForm, ai_api_key: event.target.value })} placeholder={settings?.ai_api_configured ? '••••••••  ' + c.keepExisting : c.aiKeyMissing} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400" /></label><label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-500">{c.modelLabel}<input value={settingsForm.ai_model || ''} onChange={(event) => setSettingsForm({ ...settingsForm, ai_model: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400" /></label><label className="mt-4 flex items-center gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={settingsForm.ai_enabled !== false} onChange={(event) => setSettingsForm({ ...settingsForm, ai_enabled: event.target.checked })} className="h-4 w-4 accent-blue-600" />{c.enabled}</label></div></div><div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" /><p className="text-sm leading-6 text-blue-900">{c.settingsDescription}</p></div></div><button onClick={() => void saveSettings()} disabled={busy === 'settings'} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{c.save}</button></div>;

  const renderAgent = () => <div className="max-w-4xl space-y-5"><div><h2 className="text-2xl font-black text-slate-900">{c.agentTitle}</h2><p className="mt-1 text-sm text-slate-500">{c.agentDescription}</p></div><div className="grid gap-5 md:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><div className={`rounded-xl p-3 ${overview?.aiConfigured ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{overview?.aiConfigured ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}</div><div><h3 className="font-black text-slate-900">{overview?.aiConfigured ? c.aiReady : c.aiKeyMissing}</h3><p className="mt-1 text-xs text-slate-500">{c.model}: {settings?.ai_model || 'deepseek-chat'}</p></div></div><button onClick={() => setTab('settings')} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"><Settings className="h-4 w-4" />{c.settings}</button></div><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-xl bg-amber-50 p-3 text-amber-600"><LifeBuoy className="h-6 w-6" /></div><div><h3 className="font-black text-slate-900">{c.humanHandoff}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{c.humanHandoffDescription}</p></div></div><Link to="/admin/tickets" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><Ticket className="h-4 w-4" />{c.openSupport}</Link></div></div></div>;

  const renderTable = (items: any[], empty: string, columns: Array<{ label: string; render: (item: any) => React.ReactNode }>) => <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{columns.map((column) => <th key={column.label} className="px-5 py-4 font-bold">{column.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{items.map((item, index) => <tr key={item.id || item.conversation_id || item.user_id || index} className="hover:bg-slate-50">{columns.map((column) => <td key={column.label} className="px-5 py-4 align-top">{column.render(item)}</td>)}</tr>)}</tbody>{!items.length && <tbody><tr><td colSpan={columns.length} className="px-5 py-12 text-center text-sm text-slate-400">{empty}</td></tr></tbody>}</table></div>;

  const renderKnowledge = () => <div className="space-y-5"><div><h2 className="text-2xl font-black text-slate-900">{c.knowledgeTitle}</h2><p className="mt-1 text-sm text-slate-500">{c.knowledgeDescription}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="grid gap-3 md:grid-cols-[1fr_140px]"><input value={articleForm.title} onChange={(event) => setArticleForm({ ...articleForm, title: event.target.value })} placeholder={c.articleTitle} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400" /><select value={articleForm.language} onChange={(event) => setArticleForm({ ...articleForm, language: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400"><option value="es">Español</option><option value="it">Italiano</option><option value="en">English</option><option value="fr">Français</option></select></div><textarea value={articleForm.content} onChange={(event) => setArticleForm({ ...articleForm, content: event.target.value })} placeholder={c.articleContent} className="mt-3 min-h-28 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400" /><button onClick={() => void addArticle()} disabled={busy === 'article'} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" />{c.addArticle}</button></div><div className="grid gap-4 md:grid-cols-2">{knowledge.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><h3 className="font-black text-slate-900">{item.title}</h3><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase text-blue-700">{item.language}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.content}</p><p className="mt-4 text-[10px] uppercase tracking-wide text-slate-400">{formatDate(item.updated_at, language)}</p></article>)}{!knowledge.length && <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">{c.noKnowledge}</div>}</div></div>;

  const renderContent = () => {
    if (tab === 'inbox') return renderInbox();
    if (tab === 'channels') return renderChannels();
    if (tab === 'settings') return renderSettings();
    if (tab === 'agent') return renderAgent();
    if (tab === 'knowledge') return renderKnowledge();
    if (tab === 'tickets') return <div className="space-y-5"><div><h2 className="text-2xl font-black text-slate-900">{c.ticketsTitle}</h2><p className="mt-1 text-sm text-slate-500">{c.ticketsDescription}</p></div>{renderTable(tickets, c.noTickets, [{ label: c.subject, render: (item) => <div><p className="font-bold text-slate-900">{item.subject}</p><p className="mt-1 max-w-xl text-xs text-slate-500">{item.description}</p></div> }, { label: c.contact, render: (item) => <div><p className="font-bold text-slate-800">{item.customer_name || c.unknown}</p><p className="text-xs text-slate-500">{item.customer_email || '—'}</p></div> }, { label: c.status, render: (item) => <span className={`rounded-full border px-2 py-1 text-xs font-bold ${statusClass(item.status)}`}>{item.status}</span> }, { label: c.date, render: (item) => <span className="text-xs text-slate-500">{formatDate(item.created_at, language)}</span> }])}</div>;
    if (tab === 'customers') return <div className="space-y-5"><div><h2 className="text-2xl font-black text-slate-900">{c.customersTitle}</h2><p className="mt-1 text-sm text-slate-500">{c.customersDescription}</p></div>{renderTable(customers, c.noCustomers, [{ label: c.contact, render: (item) => <div><p className="font-bold text-slate-900">{item.name || item.contact_name || c.unknown}</p><p className="text-xs text-slate-500">{item.email || item.contact_email || '—'}</p></div> }, { label: 'Código', render: (item) => <span className="font-mono text-xs font-bold text-blue-700">{item.client_code || '—'}</span> }, { label: 'Canal', render: (item) => <span className="text-xs text-slate-600">{item.platform}</span> }, { label: c.language, render: (item) => <span className="text-xs uppercase text-slate-600">{item.detected_language}</span> }, { label: c.date, render: (item) => <span className="text-xs text-slate-500">{formatDate(item.updated_at, language)}</span> }])}</div>;
    if (tab === 'team') return <div className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-black text-slate-900">{c.teamTitle}</h2><p className="mt-1 text-sm text-slate-500">{c.teamDescription}</p></div><Link to="/admin/staff" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"><Users className="h-4 w-4" />{c.manageTeam}</Link></div>{renderTable(team, c.noTeam, [{ label: c.contact, render: (item) => <div><p className="font-bold text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{item.email}</p></div> }, { label: 'Rol', render: (item) => <span className="text-xs text-slate-600">{item.title || 'Support'}</span> }, { label: c.status, render: (item) => <span className={`rounded-full border px-2 py-1 text-xs font-bold ${statusClass(item.status)}`}>{item.status}</span> }, { label: c.date, render: (item) => <span className="text-xs text-slate-500">{formatDate(item.lastLoginAt, language)}</span> }])}</div>;
    return null;
  };

  return <div className="min-h-full bg-slate-50 px-4 py-5 md:px-8 md:py-8"><div className="mx-auto max-w-[1500px] space-y-6"><div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-violet-900 p-6 text-white shadow-xl md:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">{c.eyebrow}</p><h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">{c.title}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-blue-100 md:text-base">{c.subtitle}</p><div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-cyan-100"><ShieldCheck className="h-4 w-4" />{c.boundary}</div></div><div className="flex flex-wrap gap-2"><Link to="/admin/omnichannel" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-900 hover:bg-blue-50"><ExternalLink className="h-4 w-4" />{c.resale}</Link><button onClick={() => void loadAll()} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/15"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{c.refresh}</button></div></div></div>{error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span className="flex items-center gap-2"><XCircle className="h-4 w-4" />{error}</span><button onClick={() => void loadAll()} className="font-bold underline">{c.retry}</button></div>}{notice && <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{notice}</div>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard icon={MessageCircle} label={c.connectedChannels} value={overview?.activeChannels || 0} tone="emerald" /><MetricCard icon={Inbox} label={c.conversations} value={overview?.openConversations || 0} tone="blue" /><MetricCard icon={Ticket} label={c.openTickets} value={overview?.openTickets || 0} tone="amber" /><MetricCard icon={CircleHelp} label={c.knowledgeItems} value={overview?.knowledgeItems || 0} tone="violet" /></div><div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${tab === id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}><Icon className="h-4 w-4" />{label}</button>)}</div>{loading && !overview ? <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-sm text-slate-500"><Loader2 className="mx-auto h-7 w-7 animate-spin text-blue-600" /><p className="mt-3">{c.loading}</p></div> : renderContent()}</div></div>;
}
