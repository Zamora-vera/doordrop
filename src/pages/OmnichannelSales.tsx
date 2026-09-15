import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  Camera,
  Check,
  ChevronDown,
  Globe2,
  Headphones,
  MessageCircle,
  Package,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Zap,
} from 'lucide-react';
import { GlobalFooter } from '../components/GlobalFooter';
import { GlobalHeader } from '../components/GlobalHeader';
import { useI18n } from '../lib/i18n';
import { omnichannelApi } from '../lib/omnichannelApi';
import { getSupportWhatsAppUrl } from '../lib/supportContact';
import { useBrand } from '../lib/brand';
import './OmnichannelSales.css';

type MarketingLanguage = 'es' | 'it' | 'en' | 'fr';

type CatalogPlan = {
  id: string | number;
  code?: string;
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  billing_interval?: string;
  channels_included?: number;
  included_platforms?: unknown;
  features?: unknown;
  checkout_ready?: boolean;
  popular?: boolean;
};

type CatalogAddon = {
  id: string | number;
  code?: string;
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  billing_interval?: string;
  checkout_ready?: boolean;
};

const copy: Record<MarketingLanguage, {
  nav: string;
  badge: string;
  liveStatus: string;
  handoffBadge: string;
  heroTitle: string;
  heroAccent: string;
  heroDescription: string;
  primaryCta: string;
  secondaryCta: string;
  supportCta: string;
  liveCatalog: string;
  liveCatalogDesc: string;
  channelsTitle: string;
  channelsDescription: string;
  channelLabels: string[];
  unifiedTitle: string;
  unifiedDescription: string;
  unifiedPoints: string[];
  seePanel: string;
  flowEyebrow: string;
  flowTitle: string;
  flowDescription: string;
  flowSteps: Array<{ title: string; description: string }>;
  aiTitle: string;
  aiEyebrow: string;
  aiDescription: string;
  aiPoints: string[];
  plansEyebrow: string;
  plansTitle: string;
  plansDescription: string;
  monthly: string;
  billingIn: string;
  loadingPlans: string;
  plansError: string;
  refreshPlans: string;
  startPlan: string;
  accountRequired: string;
  popular: string;
  channels: string;
  included: string;
  addonsTitle: string;
  addonsDescription: string;
  faqEyebrow: string;
  faqTitle: string;
  faq: Array<{ question: string; answer: string }>;
  finalTitle: string;
  finalDescription: string;
  finalCta: string;
  finalSupport: string;
  marketplaceBadge: string;
  marketplaceTitle: string;
  marketplaceDescription: string;
  euroNote: string;
  noFeatures: string;
}> = {
  es: {
    nav: 'Omnicanal + AI',
    badge: 'Ventas y atención conectadas',
    liveStatus: 'Operaciones activas',
    handoffBadge: 'AI + traspaso humano',
    heroTitle: 'Convierte cada conversación en',
    heroAccent: 'una venta que llega a destino.',
    heroDescription: 'WhatsApp, Instagram, Facebook y Telegram en un solo centro de operaciones, con AI, Marketplace y envíos DoorDrop conectados.',
    primaryCta: 'Ver planes',
    secondaryCta: 'Crear cuenta gratis',
    supportCta: 'Hablar con asistencia',
    liveCatalog: 'Planes reales de DoorDrop',
    liveCatalogDesc: 'Precios y disponibilidad cargados desde el catálogo activo. Elige tu plan y activa tus canales en pocos minutos.',
    channelsTitle: 'Todos tus canales. Una sola operación.',
    channelsDescription: 'Responde, vende y organiza cada contacto sin saltar entre aplicaciones. Tu equipo trabaja con el contexto completo del cliente.',
    channelLabels: ['WhatsApp', 'Instagram', 'Facebook', 'Telegram'],
    unifiedTitle: 'Una bandeja para cada conversación importante',
    unifiedDescription: 'Unifica mensajes, pedidos, etiquetas y seguimiento en un espacio preparado para crecer con tu negocio.',
    unifiedPoints: ['Historial de cliente y pedido en contexto', 'Etiquetas, filtros y notas internas para el equipo', 'AI disponible para responder y ordenar la conversación'],
    seePanel: 'Conocer el panel',
    flowEyebrow: 'Flujo conectado',
    flowTitle: 'Del mensaje al envío, sin perder el contexto',
    flowDescription: 'DoorDrop conecta la atención comercial con el Marketplace y la logística para que tu equipo pueda cerrar operaciones desde el mismo flujo.',
    flowSteps: [
      { title: 'Llega el mensaje', description: 'El cliente escribe desde su canal favorito.' },
      { title: 'AI entiende', description: 'Identifica intención, producto y necesidad de envío.' },
      { title: 'Tu equipo decide', description: 'AI responde o transfiere con todo el historial.' },
      { title: 'La venta se entrega', description: 'Producto, cotización y seguimiento en DoorDrop.' },
    ],
    aiTitle: 'AI cuando acelera. Humanos cuando importan.',
    aiEyebrow: 'Empleado AI',
    aiDescription: 'El empleado AI usa el contexto del negocio y del cliente. Cuando una situación necesita criterio humano, la conversación pasa al equipo sin empezar de cero.',
    aiPoints: ['Respuestas basadas en FAQs y conocimiento del negocio', 'Memoria del hilo, pedido y seguimiento', 'Traspaso claro a un agente humano'],
    plansEyebrow: 'Planes omnicanal',
    plansTitle: 'Empieza con el canal que más vende para ti',
    plansDescription: 'Elige el nivel de cobertura y añade canales cuando el negocio crezca.',
    monthly: 'mes',
    billingIn: 'Facturación en',
    loadingPlans: 'Cargando planes activos…',
    plansError: 'No pudimos cargar el catálogo en este momento.',
    refreshPlans: 'Reintentar',
    startPlan: 'Comenzar',
    accountRequired: 'Requiere cuenta',
    popular: 'Más elegido',
    channels: 'canales incluidos',
    included: 'Incluye',
    addonsTitle: 'Amplía cuando lo necesites',
    addonsDescription: 'Complementos activos del catálogo para automatizar más operaciones.',
    faqEyebrow: 'Preguntas frecuentes',
    faqTitle: 'Todo claro antes de comenzar',
    faq: [
      { question: '¿Tengo que contratar todos los canales?', answer: 'No. Puedes empezar con el plan que mejor encaje con tu operación y ampliar canales más adelante desde el panel.' },
      { question: '¿La página permite pagar directamente?', answer: 'La página muestra el catálogo real. Para contratar, primero debes crear una cuenta o iniciar sesión; después completarás la suscripción de forma segura.' },
      { question: '¿El AI reemplaza a mi equipo?', answer: 'No. El AI acelera las respuestas y puede transferir la conversación a un agente humano con el contexto completo.' },
      { question: '¿Puedo conectarlo con mis productos y envíos?', answer: 'Sí. El flujo omnicanal está diseñado para trabajar con el Marketplace, las cotizaciones y las operaciones de envío de DoorDrop.' },
    ],
    finalTitle: 'Haz que cada canal trabaje para tu negocio',
    finalDescription: 'Empieza con una cuenta DoorDrop y lleva tus conversaciones, ventas y envíos a un solo lugar.',
    finalCta: 'Crear cuenta gratis',
    finalSupport: 'Necesito orientación',
    marketplaceBadge: 'DoorDrop Marketplace',
    marketplaceTitle: 'Del mensaje a la venta y al envío, en el mismo flujo',
    marketplaceDescription: 'Conecta tus conversaciones con los productos del Marketplace, calcula el envío y continúa la operación sin cambiar de contexto.',
    euroNote: 'Precios claros, facturación mensual en EUR y activación segura.',
    noFeatures: 'Consulta las funciones incluidas en el panel.',
  },
  it: {
    nav: 'Omnicanale + AI',
    badge: 'Vendite e assistenza connesse',
    liveStatus: 'Operazioni attive',
    handoffBadge: 'AI + passaggio umano',
    heroTitle: 'Trasforma ogni conversazione in',
    heroAccent: 'una vendita che arriva a destinazione.',
    heroDescription: 'WhatsApp, Instagram, Facebook e Telegram in un unico centro operativo, con AI, Marketplace e spedizioni DoorDrop connessi.',
    primaryCta: 'Vedi i piani',
    secondaryCta: 'Crea account gratis',
    supportCta: 'Parla con l’assistenza',
    liveCatalog: 'Piani reali DoorDrop',
    liveCatalogDesc: 'Prezzi e disponibilità vengono caricati dal catalogo attivo. Scegli il piano e attiva i tuoi canali in pochi minuti.',
    channelsTitle: 'Tutti i tuoi canali. Un’unica operatività.',
    channelsDescription: 'Rispondi, vendi e organizza ogni contatto senza passare da un’app all’altra. Il tuo team lavora con tutto il contesto del cliente.',
    channelLabels: ['WhatsApp', 'Instagram', 'Facebook', 'Telegram'],
    unifiedTitle: 'Una casella per ogni conversazione importante',
    unifiedDescription: 'Unisci messaggi, ordini, etichette e tracking in uno spazio pronto a crescere con il tuo business.',
    unifiedPoints: ['Storico cliente e ordine sempre nel contesto', 'Etichette, filtri e note interne per il team', 'AI disponibile per rispondere e organizzare la conversazione'],
    seePanel: 'Scopri il pannello',
    flowEyebrow: 'Flusso connesso',
    flowTitle: 'Dal messaggio alla spedizione, senza perdere il contesto',
    flowDescription: 'DoorDrop collega l’assistenza commerciale al Marketplace e alla logistica, così il team può chiudere le operazioni nello stesso flusso.',
    flowSteps: [
      { title: 'Arriva il messaggio', description: 'Il cliente scrive dal suo canale preferito.' },
      { title: 'L’AI comprende', description: 'Riconosce intenzione, prodotto e necessità di spedizione.' },
      { title: 'Il team decide', description: 'L’AI risponde o trasferisce con tutto lo storico.' },
      { title: 'La vendita parte', description: 'Prodotto, preventivo e tracking in DoorDrop.' },
    ],
    aiTitle: 'AI quando accelera. Persone quando conta.',
    aiEyebrow: 'Dipendente AI',
    aiDescription: 'L’agente AI usa il contesto dell’attività e del cliente. Quando serve il giudizio umano, la conversazione passa al team senza ripartire da zero.',
    aiPoints: ['Risposte basate su FAQ e conoscenza dell’attività', 'Memoria del thread, ordine e tracking', 'Passaggio chiaro a un operatore umano'],
    plansEyebrow: 'Piani omnicanale',
    plansTitle: 'Inizia dal canale che vende di più per te',
    plansDescription: 'Scegli la copertura giusta e aggiungi canali quando il business cresce.',
    monthly: 'mese',
    billingIn: 'Fatturazione in',
    loadingPlans: 'Caricamento dei piani attivi…',
    plansError: 'Non è stato possibile caricare il catalogo.',
    refreshPlans: 'Riprova',
    startPlan: 'Inizia',
    accountRequired: 'Account richiesto',
    popular: 'Più scelto',
    channels: 'canali inclusi',
    included: 'Include',
    addonsTitle: 'Espandi quando ti serve',
    addonsDescription: 'Componenti aggiuntivi attivi per automatizzare più operazioni.',
    faqEyebrow: 'Domande frequenti',
    faqTitle: 'Tutto chiaro prima di iniziare',
    faq: [
      { question: 'Devo attivare tutti i canali?', answer: 'No. Inizia con il piano più adatto alla tua attività e aggiungi altri canali dal pannello quando ne avrai bisogno.' },
      { question: 'Posso pagare direttamente da questa pagina?', answer: 'Qui mostriamo il catalogo reale. Per acquistare devi creare un account o accedere; l’abbonamento viene completato in sicurezza.' },
      { question: 'L’AI sostituisce il mio team?', answer: 'No. L’AI accelera le risposte e può trasferire la conversazione a un operatore umano con tutto il contesto.' },
      { question: 'Posso collegarlo a prodotti e spedizioni?', answer: 'Sì. Il flusso omnicanale è pensato per lavorare con Marketplace, preventivi e spedizioni DoorDrop.' },
    ],
    finalTitle: 'Fai lavorare ogni canale per il tuo business',
    finalDescription: 'Inizia con un account DoorDrop e porta conversazioni, vendite e spedizioni in un unico spazio.',
    finalCta: 'Crea account gratis',
    finalSupport: 'Ho bisogno di aiuto',
    marketplaceBadge: 'DoorDrop Marketplace',
    marketplaceTitle: 'Dal messaggio alla vendita e alla spedizione, nello stesso flusso',
    marketplaceDescription: 'Collega le conversazioni ai prodotti del Marketplace, calcola la spedizione e continua l’operazione senza perdere il contesto.',
    euroNote: 'Prezzi chiari, fatturazione mensile in EUR e attivazione sicura.',
    noFeatures: 'Scopri tutte le funzioni incluse dal pannello.',
  },
  en: {
    nav: 'Omnichannel + AI',
    badge: 'Connected sales and support',
    liveStatus: 'Live operations',
    handoffBadge: 'AI + human handoff',
    heroTitle: 'Turn every conversation into',
    heroAccent: 'a sale that reaches its destination.',
    heroDescription: 'WhatsApp, Instagram, Facebook and Telegram in one operations hub, with AI, Marketplace and DoorDrop shipping connected.',
    primaryCta: 'View plans',
    secondaryCta: 'Create a free account',
    supportCta: 'Talk to support',
    liveCatalog: 'Real DoorDrop plans',
    liveCatalogDesc: 'Prices and availability come from the active catalog. Choose a plan and activate your channels in minutes.',
    channelsTitle: 'Every channel. One operation.',
    channelsDescription: 'Reply, sell and organize every contact without jumping between apps. Your team works with the customer’s full context.',
    channelLabels: ['WhatsApp', 'Instagram', 'Facebook', 'Telegram'],
    unifiedTitle: 'One inbox for every important conversation',
    unifiedDescription: 'Bring messages, orders, labels and tracking together in a workspace built to grow with your business.',
    unifiedPoints: ['Customer and order history in context', 'Labels, filters and internal team notes', 'AI ready to answer and organize conversations'],
    seePanel: 'Explore the panel',
    flowEyebrow: 'Connected workflow',
    flowTitle: 'From message to shipment, without losing context',
    flowDescription: 'DoorDrop connects commercial support with Marketplace and logistics so your team can close the operation in one flow.',
    flowSteps: [
      { title: 'A message arrives', description: 'The customer writes from their preferred channel.' },
      { title: 'AI understands', description: 'It identifies intent, product and shipping needs.' },
      { title: 'Your team decides', description: 'AI replies or hands off with the full history.' },
      { title: 'The sale ships', description: 'Product, quote and tracking stay in DoorDrop.' },
    ],
    aiTitle: 'AI when it speeds things up. People when it matters.',
    aiEyebrow: 'AI employee',
    aiDescription: 'The AI employee uses business and customer context. When human judgment is needed, the conversation moves to your team without starting over.',
    aiPoints: ['Answers grounded in FAQs and business knowledge', 'Thread, order and tracking memory', 'Clear handoff to a human agent'],
    plansEyebrow: 'Omnichannel plans',
    plansTitle: 'Start with the channel that sells most for you',
    plansDescription: 'Choose the right coverage and add channels as your business grows.',
    monthly: 'month',
    billingIn: 'Billed in',
    loadingPlans: 'Loading active plans…',
    plansError: 'We could not load the catalog right now.',
    refreshPlans: 'Try again',
    startPlan: 'Get started',
    accountRequired: 'Account required',
    popular: 'Most chosen',
    channels: 'channels included',
    included: 'Includes',
    addonsTitle: 'Expand when you need to',
    addonsDescription: 'Active catalog add-ons to automate more operations.',
    faqEyebrow: 'Frequently asked questions',
    faqTitle: 'Everything clear before you start',
    faq: [
      { question: 'Do I need to activate every channel?', answer: 'No. Start with the plan that fits your operation and add more channels later from the panel.' },
      { question: 'Can I pay directly from this page?', answer: 'This page shows the real catalog. To subscribe, create an account or sign in; the subscription is then completed securely.' },
      { question: 'Does AI replace my team?', answer: 'No. AI speeds up replies and can hand the conversation to a human agent with the full context.' },
      { question: 'Can I connect it to products and shipments?', answer: 'Yes. The omnichannel flow is designed to work with the DoorDrop Marketplace, quotes and shipping operations.' },
    ],
    finalTitle: 'Make every channel work for your business',
    finalDescription: 'Create a DoorDrop account and bring conversations, sales and shipping into one place.',
    finalCta: 'Create a free account',
    finalSupport: 'I need guidance',
    marketplaceBadge: 'DoorDrop Marketplace',
    marketplaceTitle: 'From conversation to sale and shipment, in one flow',
    marketplaceDescription: 'Connect conversations to Marketplace products, calculate shipping and keep the operation moving without losing context.',
    euroNote: 'Clear pricing, monthly billing in EUR and secure activation.',
    noFeatures: 'See all included features inside the panel.',
  },
  fr: {
    nav: 'Omnicanal + IA',
    badge: 'Ventes et assistance connectées',
    liveStatus: 'Opérations actives',
    handoffBadge: 'IA + transfert humain',
    heroTitle: 'Transformez chaque conversation en',
    heroAccent: 'une vente qui arrive à destination.',
    heroDescription: 'WhatsApp, Instagram, Facebook et Telegram dans un seul centre opérationnel, avec IA, Marketplace et expéditions DoorDrop connectés.',
    primaryCta: 'Voir les offres',
    secondaryCta: 'Créer un compte gratuit',
    supportCta: 'Parler au support',
    liveCatalog: 'Offres DoorDrop réelles',
    liveCatalogDesc: 'Les prix et la disponibilité proviennent du catalogue actif. Choisissez une offre et activez vos canaux en quelques minutes.',
    channelsTitle: 'Tous vos canaux. Une seule opération.',
    channelsDescription: 'Répondez, vendez et organisez chaque contact sans passer d’une application à l’autre. Votre équipe dispose du contexte complet du client.',
    channelLabels: ['WhatsApp', 'Instagram', 'Facebook', 'Telegram'],
    unifiedTitle: 'Une boîte de réception pour chaque conversation importante',
    unifiedDescription: 'Réunissez messages, commandes, étiquettes et suivi dans un espace conçu pour accompagner votre croissance.',
    unifiedPoints: ['Historique client et commande dans le contexte', 'Étiquettes, filtres et notes internes pour l’équipe', 'IA disponible pour répondre et organiser les conversations'],
    seePanel: 'Découvrir le panneau',
    flowEyebrow: 'Parcours connecté',
    flowTitle: 'Du message à l’expédition, sans perdre le contexte',
    flowDescription: 'DoorDrop relie l’assistance commerciale au Marketplace et à la logistique afin que votre équipe puisse finaliser l’opération dans un seul flux.',
    flowSteps: [
      { title: 'Le message arrive', description: 'Le client écrit depuis son canal préféré.' },
      { title: 'L’IA comprend', description: 'Elle identifie l’intention, le produit et le besoin d’expédition.' },
      { title: 'Votre équipe décide', description: 'L’IA répond ou transfère avec tout l’historique.' },
      { title: 'La vente est expédiée', description: 'Produit, devis et suivi restent dans DoorDrop.' },
    ],
    aiTitle: 'L’IA quand elle accélère. L’humain quand c’est essentiel.',
    aiEyebrow: 'Employé IA',
    aiDescription: 'L’employé IA utilise le contexte de votre activité et du client. Lorsqu’un jugement humain est nécessaire, la conversation est transférée à votre équipe sans repartir de zéro.',
    aiPoints: ['Réponses basées sur les FAQ et les connaissances métier', 'Mémoire du fil, de la commande et du suivi', 'Transfert clair vers un agent humain'],
    plansEyebrow: 'Offres omnicanales',
    plansTitle: 'Commencez par le canal le plus utile pour vous',
    plansDescription: 'Choisissez la couverture adaptée et ajoutez des canaux au rythme de votre activité.',
    monthly: 'mois',
    billingIn: 'Facturation en',
    loadingPlans: 'Chargement des offres actives…',
    plansError: 'Le catalogue ne peut pas être chargé pour le moment.',
    refreshPlans: 'Réessayer',
    startPlan: 'Commencer',
    accountRequired: 'Compte requis',
    popular: 'Le plus choisi',
    channels: 'canaux inclus',
    included: 'Comprend',
    addonsTitle: 'Ajoutez des options quand vous en avez besoin',
    addonsDescription: 'Des compléments actifs pour automatiser davantage vos opérations.',
    faqEyebrow: 'Questions fréquentes',
    faqTitle: 'Tout comprendre avant de commencer',
    faq: [
      { question: 'Dois-je activer tous les canaux ?', answer: 'Non. Commencez avec l’offre adaptée à votre activité et ajoutez d’autres canaux depuis le panneau lorsque vous en avez besoin.' },
      { question: 'Puis-je payer directement depuis cette page ?', answer: 'Cette page affiche le catalogue réel. Pour souscrire, créez un compte ou connectez-vous ; l’abonnement est ensuite finalisé en toute sécurité.' },
      { question: 'L’IA remplace-t-elle mon équipe ?', answer: 'Non. L’IA accélère les réponses et peut transférer la conversation à un agent humain avec tout le contexte.' },
      { question: 'Puis-je le relier aux produits et aux expéditions ?', answer: 'Oui. Le parcours omnicanal est conçu pour fonctionner avec le Marketplace, les devis et les opérations d’expédition DoorDrop.' },
    ],
    finalTitle: 'Faites travailler chaque canal pour votre activité',
    finalDescription: 'Créez un compte DoorDrop et réunissez conversations, ventes et expéditions au même endroit.',
    finalCta: 'Créer un compte gratuit',
    finalSupport: 'J’ai besoin d’aide',
    marketplaceBadge: 'DoorDrop Marketplace',
    marketplaceTitle: 'De la conversation à la vente et à l’expédition, dans un seul flux',
    marketplaceDescription: 'Reliez les conversations aux produits du Marketplace, calculez l’expédition et poursuivez l’opération sans perdre le contexte.',
    euroNote: 'Prix clairs, facturation mensuelle en EUR et activation sécurisée.',
    noFeatures: 'Consultez toutes les fonctions incluses dans le panneau.',
  },
};

const normalizeLanguage = (value: string): MarketingLanguage => {
  const short = String(value || '').trim().toLowerCase().slice(0, 2);
  return short === 'it' || short === 'en' || short === 'fr' ? short : 'es';
};

const localeFor = (language: MarketingLanguage) => ({ es: 'es-ES', it: 'it-IT', en: 'en-GB', fr: 'fr-FR' }[language]);

const asList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    } catch {
      return value.split(/[|,]/).map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
};

const channelIcon = (platform: string) => {
  const value = platform.toLowerCase();
  if (value.includes('instagram')) return <Camera className="h-5 w-5" />;
  if (value.includes('facebook')) return <Share2 className="h-5 w-5" />;
  if (value.includes('telegram')) return <Send className="h-5 w-5" />;
  return <MessageCircle className="h-5 w-5" />;
};

const channelClass = (platform: string) => {
  const value = platform.toLowerCase();
  if (value.includes('instagram')) return 'bg-gradient-to-br from-fuchsia-500 to-orange-400';
  if (value.includes('facebook')) return 'bg-blue-600';
  if (value.includes('telegram')) return 'bg-cyan-500';
  return 'bg-emerald-500';
};

const displayChannel = (platform: string) => {
  const value = platform.toLowerCase();
  if (value.includes('instagram')) return 'Instagram';
  if (value.includes('facebook')) return 'Facebook';
  if (value.includes('telegram')) return 'Telegram';
  if (value.includes('whatsapp')) return 'WhatsApp';
  return platform;
};

const formatPrice = (value: unknown, currency: unknown, language: MarketingLanguage) => {
  const price = Number(value || 0);
  const code = String(currency || 'EUR').toUpperCase();
  try {
    return new Intl.NumberFormat(localeFor(language), { style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
  } catch {
    return `${code} ${price.toFixed(2)}`;
  }
};

const PlanCard = ({ plan, content, language }: { plan: CatalogPlan; content: typeof copy.es; language: MarketingLanguage }) => {
  const features = asList(plan.features);
  const platforms = asList(plan.included_platforms);
  const price = formatPrice(plan.price, plan.currency, language);
  return (
    <article className={`relative flex h-full flex-col rounded-[2rem] border p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_26px_80px_rgba(37,99,235,0.16)] ${plan.popular ? 'border-blue-500 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white'}`}>
      {plan.popular && <div className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">{content.popular}</div>}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[11px] font-black uppercase tracking-[0.18em] ${plan.popular ? 'text-cyan-300' : 'text-blue-600 dark:text-cyan-300'}`}>{plan.code || 'DoorDrop'}</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight">{plan.name || 'DoorDrop Omnichannel'}</h3>
        </div>
        <div className={`rounded-2xl p-3 ${plan.popular ? 'bg-white/10 text-cyan-300' : 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-cyan-300'}`}><Zap className="h-5 w-5" /></div>
      </div>
      <p className={`mt-4 min-h-[3.5rem] text-sm leading-relaxed ${plan.popular ? 'text-slate-300' : 'text-slate-600 dark:text-slate-400'}`}>{plan.description || content.noFeatures}</p>
      <div className="mt-6 flex items-end gap-2">
        <span className="text-4xl font-black tracking-tight">{price}</span>
        <span className={`mb-1 text-sm ${plan.popular ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>/ {content.monthly}</span>
      </div>
      <div className={`mt-5 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${plan.popular ? 'bg-white/10 text-slate-200' : 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
        <Globe2 className="h-4 w-4 text-cyan-500" />
        {Number(plan.channels_included || platforms.length || 0)} {content.channels}
      </div>
      {platforms.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {platforms.map((platform) => <span key={platform} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${plan.popular ? 'border-white/15 bg-white/10 text-slate-200' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>{channelIcon(platform)}{displayChannel(platform)}</span>)}
        </div>
      )}
      <div className="mt-6 border-t border-current/10 pt-5">
        <p className={`mb-3 text-xs font-black uppercase tracking-[0.16em] ${plan.popular ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>{content.included}</p>
        <ul className="space-y-2.5">
          {(features.length ? features : [content.noFeatures]).slice(0, 7).map((feature) => <li key={feature} className={`flex items-start gap-2 text-sm ${plan.popular ? 'text-slate-200' : 'text-slate-600 dark:text-slate-300'}`}><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{feature}</li>)}
        </ul>
      </div>
      <Link to="/auth/register" className={`mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition ${plan.popular ? 'bg-white text-slate-950 hover:bg-cyan-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
        {content.startPlan}<ArrowRight className="h-4 w-4" />
      </Link>
      <p className={`mt-3 text-center text-[11px] ${plan.popular ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>{content.accountRequired}</p>
    </article>
  );
};

export default function OmnichannelSales() {
  const { language } = useI18n();
  const { brand, loading: brandLoading } = useBrand();
  const marketingLanguage = normalizeLanguage(language);
  const content = copy[marketingLanguage];
  const supportHref = getSupportWhatsAppUrl(marketingLanguage);
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [addOns, setAddOns] = useState<CatalogAddon[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [plansError, setPlansError] = useState('');

  const loadPlans = async () => {
    setLoadingPlans(true);
    setPlansError('');
    try {
      const response = await omnichannelApi.getPlans('EUR');
      setPlans(Array.isArray(response?.plans) ? response.plans : []);
      setAddOns(Array.isArray(response?.addOns) ? response.addOns : []);
    } catch (error: any) {
      setPlans([]);
      setAddOns([]);
      setPlansError(error?.message || content.plansError);
    } finally {
      setLoadingPlans(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    document.title = `${content.nav} | ${brand.siteName || 'DoorDrop'}`;
    const description = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = content.heroDescription;
  }, [brand.siteName, brandLoading, content.heroDescription, content.nav]);

  const channelCards = useMemo(() => [
    { label: content.channelLabels[0], icon: <MessageCircle className="h-6 w-6" />, tone: 'from-emerald-400 to-green-600' },
    { label: content.channelLabels[1], icon: <Camera className="h-6 w-6" />, tone: 'from-fuchsia-500 via-rose-500 to-orange-400' },
    { label: content.channelLabels[2], icon: <Share2 className="h-6 w-6" />, tone: 'from-blue-500 to-indigo-600' },
    { label: content.channelLabels[3], icon: <Send className="h-6 w-6" />, tone: 'from-cyan-400 to-sky-600' },
  ], [content.channelLabels]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white">
      <GlobalHeader showSearch={false} />

      <main>
        <section className="relative isolate overflow-hidden bg-white dark:bg-slate-950">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_12%,rgba(59,130,246,0.18),transparent_34%),radial-gradient(circle_at_12%_48%,rgba(6,182,212,0.12),transparent_30%)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:pb-24 lg:pt-20">
            <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-300"><Sparkles className="h-4 w-4" />{content.badge}</div>
              <h1 className="mt-6 text-5xl font-black leading-[0.98] tracking-[-0.05em] text-slate-950 dark:text-white sm:text-6xl lg:text-7xl">{content.heroTitle} <span className="bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-500 bg-clip-text text-transparent">{content.heroAccent}</span></h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">{content.heroDescription}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#plans" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700">{content.primaryCta}<ArrowRight className="h-4 w-4" /></a>
                <Link to="/auth/register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white">{content.secondaryCta}</Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs font-bold text-slate-500 dark:text-slate-400"><span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" />{content.liveCatalog}</span><span className="inline-flex items-center gap-2"><Globe2 className="h-4 w-4 text-blue-500" />{content.billingIn} EUR</span></div>
            </div>

            <div className="relative mx-auto w-full max-w-2xl lg:ml-auto">
              <div className="absolute -inset-8 rounded-[3rem] bg-blue-500/10 blur-3xl" />
              <div className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white/70 p-2 shadow-[0_30px_100px_rgba(37,99,235,0.2)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/60">
                <img src="/marketing/omnichannel/hero.png" alt="DoorDrop omnichannel sales and shipping" className="h-auto w-full rounded-[1.55rem] object-cover" />
                <div className="absolute left-6 top-6 flex items-center gap-2 rounded-full border border-white/70 bg-white/90 px-3 py-2 text-xs font-black text-slate-800 shadow-lg dark:border-slate-700 dark:bg-slate-900/90 dark:text-white"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />{content.liveStatus}</div>
                <div className="absolute bottom-7 right-7 flex items-center gap-2 rounded-2xl border border-white/70 bg-slate-950/90 px-3 py-2 text-xs font-black text-white shadow-xl"><Bot className="h-4 w-4 text-cyan-300" />{content.handoffBadge}</div>
              </div>
              <div className="omni-orbit omni-orbit-one" />
              <div className="omni-orbit omni-orbit-two" />
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-4 py-5 sm:grid-cols-4 sm:px-6 lg:px-8">
            {channelCards.map((channel) => <div key={channel.label} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white ${channel.tone}`}>{channel.icon}</span>{channel.label}</div>)}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="order-2 lg:order-1">
              <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-2 shadow-[0_24px_80px_rgba(15,23,42,0.1)] dark:border-slate-700 dark:bg-slate-900"><img src="/marketing/omnichannel/unified-inbox.png" alt="DoorDrop unified omnichannel inbox" loading="lazy" className="w-full rounded-[1.5rem]" /></div>
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-cyan-300">{content.nav}</p>
              <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">{content.channelsTitle}</h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-600 dark:text-slate-300">{content.channelsDescription}</p>
              <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"><h3 className="text-2xl font-black text-slate-950 dark:text-white">{content.unifiedTitle}</h3><p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{content.unifiedDescription}</p><ul className="mt-5 space-y-3">{content.unifiedPoints.map((point) => <li key={point} className="flex items-start gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300"><Check className="h-3.5 w-3.5" /></span>{point}</li>)}</ul><Link to="/panel/omnichannel" className="mt-6 inline-flex items-center gap-2 text-sm font-black text-blue-600 hover:text-blue-700 dark:text-cyan-300">{content.seePanel}<ArrowRight className="h-4 w-4" /></Link></div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-slate-950 py-20 text-white lg:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(6,182,212,0.2),transparent_35%),radial-gradient(circle_at_90%_80%,rgba(37,99,235,0.24),transparent_36%)]" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">{content.flowEyebrow}</p><h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">{content.flowTitle}</h2><p className="mt-5 text-lg leading-relaxed text-slate-300">{content.flowDescription}</p></div>
            <div className="relative mt-14 grid gap-4 md:grid-cols-4">{content.flowSteps.map((step, index) => <div key={step.title} className="relative rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-sm"><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 text-xl font-black text-white shadow-lg shadow-cyan-500/20">0{index + 1}</div><h3 className="text-lg font-black">{step.title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-300">{step.description}</p>{index < content.flowSteps.length - 1 && <ArrowRight className="absolute -right-4 top-12 z-10 hidden h-7 w-7 rounded-full bg-slate-950 p-1 text-cyan-300 md:block" />}</div>)}</div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-cyan-300">{content.aiEyebrow}</p><h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">{content.aiTitle}</h2><p className="mt-5 text-lg leading-relaxed text-slate-600 dark:text-slate-300">{content.aiDescription}</p><div className="mt-8 grid gap-3">{content.aiPoints.map((point) => <div key={point} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><Bot className="h-5 w-5 shrink-0 text-blue-600 dark:text-cyan-300" />{point}</div>)}</div></div>
            <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-2 shadow-[0_24px_80px_rgba(15,23,42,0.1)] dark:border-slate-700 dark:bg-slate-900"><img src="/marketing/omnichannel/ai-human-handoff.png" alt="DoorDrop AI employee transferring a customer conversation to a human agent" loading="lazy" className="w-full rounded-[1.5rem]" /></div>
          </div>
        </section>

        <section id="plans" className="scroll-mt-20 bg-slate-100/80 py-20 dark:bg-slate-900/60 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-cyan-300">{content.plansEyebrow}</p><h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">{content.plansTitle}</h2><p className="mt-5 text-lg leading-relaxed text-slate-600 dark:text-slate-300">{content.plansDescription}</p><p className="mt-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><ShieldCheck className="h-4 w-4 text-emerald-500" />{content.euroNote}</p></div>
            {loadingPlans && <div className="mt-12 grid gap-6 md:grid-cols-3"><div className="h-[34rem] animate-pulse rounded-[2rem] bg-white dark:bg-slate-800" /><div className="h-[34rem] animate-pulse rounded-[2rem] bg-white dark:bg-slate-800" /><div className="h-[34rem] animate-pulse rounded-[2rem] bg-white dark:bg-slate-800" /></div>}
            {!loadingPlans && plansError && <div className="mx-auto mt-12 max-w-xl rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center text-sm font-bold text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"><p>{content.plansError}</p><button type="button" onClick={loadPlans} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700">{content.refreshPlans}<ArrowRight className="h-4 w-4" /></button></div>}
            {!loadingPlans && !plansError && plans.length === 0 && <div className="mx-auto mt-12 max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{content.plansError}</div>}
            {!loadingPlans && !plansError && plans.length > 0 && <div className="mt-12 grid gap-6 lg:grid-cols-3">{plans.map((plan) => <div key={plan.id}><PlanCard plan={plan} content={content} language={marketingLanguage} /></div>)}</div>}
            {!loadingPlans && !plansError && addOns.length > 0 && <div className="mt-12"><div className="mx-auto max-w-2xl text-center"><h3 className="text-2xl font-black text-slate-950 dark:text-white">{content.addonsTitle}</h3><p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{content.addonsDescription}</p></div><div className="mx-auto mt-6 grid max-w-5xl gap-4 sm:grid-cols-3">{addOns.map((addon) => <div key={addon.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-slate-900 dark:text-white">{addon.name || addon.code}</p><p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{addon.description}</p></div><Sparkles className="h-5 w-5 shrink-0 text-fuchsia-500" /></div><p className="mt-4 text-lg font-black text-blue-600 dark:text-cyan-300">{formatPrice(addon.price, addon.currency, marketingLanguage)} <span className="text-xs font-bold text-slate-500">/ {content.monthly}</span></p></div>)}</div></div>}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-2 shadow-[0_24px_80px_rgba(15,23,42,0.1)] dark:border-slate-700 dark:bg-slate-900"><img src="/marketing/omnichannel/marketplace-shipping.png" alt="DoorDrop Marketplace connected to shipping" loading="lazy" className="w-full rounded-[1.5rem]" /></div>
            <div><div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-black text-blue-700 dark:bg-blue-400/10 dark:text-cyan-300"><Store className="h-4 w-4" />{content.marketplaceBadge}</div><h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">{content.marketplaceTitle}</h2><p className="mt-5 text-lg leading-relaxed text-slate-600 dark:text-slate-300">{content.marketplaceDescription}</p><div className="mt-7 flex flex-wrap gap-3"><Link to="/marketplace" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700">Marketplace<ArrowRight className="h-4 w-4" /></Link><Link to="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white">{marketingLanguage === 'it' ? 'Preventivo' : marketingLanguage === 'en' ? 'Get a quote' : marketingLanguage === 'fr' ? 'Obtenir un devis' : 'Calcular envío'}<ArrowRight className="h-4 w-4" /></Link></div></div>
          </div>
        </section>

        <section className="bg-white py-20 dark:bg-slate-950 lg:py-28"><div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8"><div className="text-center"><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-cyan-300">{content.faqEyebrow}</p><h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">{content.faqTitle}</h2></div><div className="mt-10 space-y-3">{content.faq.map((item) => <details key={item.question} className="group rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-900"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-black text-slate-900 marker:hidden dark:text-white"><span>{item.question}</span><ChevronDown className="h-5 w-5 shrink-0 text-blue-600 transition group-open:rotate-180 dark:text-cyan-300" /></summary><p className="max-w-3xl pr-8 pt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{item.answer}</p></details>)}</div></div></section>

        <section className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-950 py-20 text-white lg:py-24"><div className="absolute -right-20 -top-32 h-96 w-96 rounded-full bg-cyan-400/20 blur-3xl" /><div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 shadow-xl backdrop-blur"><Headphones className="h-8 w-8 text-cyan-200" /></div><h2 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">{content.finalTitle}</h2><p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-blue-100">{content.finalDescription}</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Link to="/auth/register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-black text-blue-700 hover:bg-blue-50">{content.finalCta}<ArrowRight className="h-4 w-4" /></Link><a href={supportHref} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 py-3 text-sm font-black text-white hover:bg-white/15"><MessageCircle className="h-4 w-4" />{content.finalSupport}</a></div><p className="mt-6 text-xs font-bold text-blue-200">{content.liveCatalogDesc}</p></div></section>
      </main>
      <GlobalFooter />
    </div>
  );
}
