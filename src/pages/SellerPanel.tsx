import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  Store,
  ShoppingBag,
  PlusCircle,
  Package,
  Layers,
  MessageCircle,
  DollarSign,
  Truck,
  TrendingUp,
  Settings,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  Heart,
  ChevronRight,
  Upload,
  Trash2,
  Edit,
  ExternalLink,
  Search,
  Sparkles,
  ArrowRight,
  Send,
  X,
  Clock,
  User,
  MapPin,
  CreditCard,
  Check,
  RefreshCw
} from 'lucide-react';
import { api } from '../lib/api';
import { loadGuestChatIntent, clearGuestChatIntent } from '../lib/marketplaceGuestChat';
import { useI18n } from '../lib/i18n';

export function SellerPanel({ profile, onProfileUpdated }: any) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, language } = useI18n();

  // Primary Tab: 'buyer' | 'seller' | 'messages'
  const currentTab = searchParams.get('tab') || 'buyer';
  const subTab = searchParams.get('sub') || 'dashboard';

  // Core Data
  const [sellerProfile, setSellerProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string>('');

  // ---------------------------------------------------------------------------
  // Buyer Area State
  // ---------------------------------------------------------------------------
  const [buyerOrders, setBuyerOrders] = useState<any[]>([]);
  const [loadingBuyerOrders, setLoadingBuyerOrders] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any>(null);

  // ---------------------------------------------------------------------------
  // Seller Area State
  // ---------------------------------------------------------------------------
  const [myListings, setMyListings] = useState<any[]>([]);
  const [sellerOrders, setSellerOrders] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  // Onboarding
  const [onboardingForm, setOnboardingForm] = useState({
    displayName: profile?.name || '',
    description: '',
    country: profile?.country || 'IT',
    city: profile?.city || '',
    zipCode: profile?.postal_code || '',
    address: profile?.address || '',
    phone: profile?.phone || '',
    sellerType: 'individual' as 'individual' | 'business',
    termsAccepted: false
  });
  const [submittingOnboarding, setSubmittingOnboarding] = useState(false);
  const [onboardingError, setOnboardingError] = useState('');

  // Listing Form
  const [listingForm, setListingForm] = useState({
    title: '',
    description: '',
    categoryId: '',
    condition: 'like_new',
    price: '',
    currency: profile?.currency || 'EUR',
    countryCode: profile?.country || 'IT',
    city: '',
    postalCode: '',
    weightGrams: '1000',
    lengthCm: '20',
    widthCm: '15',
    heightCm: '10',
    negotiable: true,
    shippingAvailable: true,
    pickupAvailable: false,
    imageUrls: [] as string[]
  });
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // ---------------------------------------------------------------------------
  // Chat & Messaging State
  // ---------------------------------------------------------------------------
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConv, setActiveConv] = useState<any>(null);
  const [convMessages, setConvMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Initial Load & Guest Chat Token Handler
  // ---------------------------------------------------------------------------
  useEffect(() => {
    initData();
  }, []);

  const initData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadSellerData(),
        loadBuyerOrders(),
        loadConversations()
      ]);
      // Check if guest chat intent is waiting to be resumed
      await handleResumeGuestChat();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleResumeGuestChat = async () => {
    const intent = loadGuestChatIntent();
    if (!intent || !intent.listingId) return;

    try {
      // 1. Create or fetch existing conversation with seller
      const res = await api.startMarketplaceConversation(intent.listingId);
      const conv = res.conversation;

      // 2. If guest typed a message, send it automatically
      if (intent.message && intent.message.trim()) {
        await api.sendMarketplaceMessage(conv.id, { body: intent.message.trim() });
      }

      // 3. Clear the cookie & localStorage intent
      clearGuestChatIntent();

      // 4. Switch to messages tab and activate conversation
      setSearchParams({ tab: 'messages', convId: conv.id });
      await loadConversations(conv.id);

      setToastMessage(language === 'it' 
        ? 'Messaggio inviato con successo al venditore! La tua chat è attiva.' 
        : '¡Mensaje enviado al vendedor! Tu chat está activo.');
      setTimeout(() => setToastMessage(''), 7000);
    } catch (err: any) {
      console.error('Failed to auto-resume guest chat:', err);
      clearGuestChatIntent();
    }
  };

  // Reload data when active tab changes
  useEffect(() => {
    if (currentTab === 'buyer') {
      loadBuyerOrders();
    } else if (currentTab === 'seller' || ['dashboard', 'listings', 'publish', 'orders', 'offers'].includes(currentTab)) {
      if (sellerProfile) {
        if (subTab === 'listings') loadMyListings();
        if (subTab === 'orders') loadSellerOrders();
        if (subTab === 'offers') loadOffers();
      }
    } else if (currentTab === 'messages') {
      loadConversations();
    }
  }, [currentTab, subTab, sellerProfile]);

  // Polling for chat messages if user is in 'messages' tab and has an active conversation
  useEffect(() => {
    if (currentTab !== 'messages' || !activeConv) return;
    const interval = setInterval(() => {
      fetchMessagesSilently(activeConv.id);
    }, 6000);
    return () => clearInterval(interval);
  }, [currentTab, activeConv]);

  // Scroll to bottom of chat when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [convMessages]);

  const loadSellerData = async () => {
    try {
      const [profileRes, statsRes, catRes] = await Promise.all([
        api.getMarketplaceSellerProfile().catch(() => ({ profile: null })),
        api.getMarketplaceSellerDashboard().catch(() => ({ stats: null })),
        api.getMarketplaceCategories(language || 'it').catch(() => ({ categories: [] }))
      ]);

      setSellerProfile(profileRes.profile);
      setStats(statsRes.stats);
      setCategories(catRes.categories || []);

      if (profileRes.profile) {
        setListingForm(prev => ({
          ...prev,
          city: profileRes.profile.city || '',
          postalCode: profileRes.profile.zip_code || '',
          countryCode: profileRes.profile.country || 'IT'
        }));
      }
    } catch {
      setSellerProfile(null);
    }
  };

  const loadBuyerOrders = async () => {
    setLoadingBuyerOrders(true);
    try {
      const res = await api.getMarketplaceOrders('buyer');
      setBuyerOrders(res.orders || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBuyerOrders(false);
    }
  };

  const loadSellerOrders = async () => {
    try {
      const res = await api.getMarketplaceOrders('seller');
      setSellerOrders(res.orders || []);
    } catch {}
  };

  const loadMyListings = async () => {
    try {
      const res = await api.getMarketplaceSellerListings();
      setMyListings(res.listings || []);
    } catch {}
  };

  const loadOffers = async () => {
    try {
      const res = await api.getMarketplaceOffers();
      setOffers(res.offers || []);
    } catch {}
  };

  const loadConversations = async (targetConvId?: string) => {
    try {
      const res = await api.getMarketplaceConversations();
      const list = res.conversations || [];
      setConversations(list);

      const requestedId = targetConvId || searchParams.get('convId');
      if (requestedId) {
        const found = list.find((c: any) => c.id === requestedId);
        if (found) {
          selectConversation(found);
          return;
        }
      }
      if (list.length > 0 && !activeConv) {
        selectConversation(list[0]);
      }
    } catch {}
  };

  const selectConversation = async (conv: any) => {
    setActiveConv(conv);
    try {
      const res = await api.getMarketplaceMessages(conv.id);
      setConvMessages(res.messages || []);
    } catch {}
  };

  const fetchMessagesSilently = async (convId: string) => {
    try {
      const res = await api.getMarketplaceMessages(convId);
      if (res.messages && res.messages.length !== convMessages.length) {
        setConvMessages(res.messages);
      }
    } catch {}
  };

  const handleSendMessage = async (e?: React.FormEvent, directText?: string) => {
    if (e) e.preventDefault();
    const textToSend = (directText || newMessage).trim();
    if (!activeConv || !textToSend) return;

    setSendingMessage(true);
    try {
      const res = await api.sendMarketplaceMessage(activeConv.id, { body: textToSend });
      setConvMessages(prev => [...prev, res.message]);
      if (!directText) setNewMessage('');
      // update last message in conversation list
      setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, last_message: textToSend } : c));
    } catch (err: any) {
      alert(language === 'it' ? 'Errore durante l\'invio del messaggio' : 'Error al enviar mensaje');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleStartChatForListing = async (listingId: string) => {
    try {
      const res = await api.startMarketplaceConversation(listingId);
      const conv = res.conversation;
      setSearchParams({ tab: 'messages', convId: conv.id });
      await loadConversations(conv.id);
    } catch (err: any) {
      alert(err.message || 'No se pudo abrir el chat');
    }
  };

  const handleRespondOffer = async (offerId: string, status: 'accepted' | 'rejected') => {
    try {
      await api.respondMarketplaceOffer(offerId, { status });
      loadOffers();
    } catch (err: any) {
      alert(err.message || 'No se pudo responder a la oferta.');
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardingForm.displayName.trim()) {
      setOnboardingError(language === 'it' ? 'Inserisci il nome del tuo negozio o profilo.' : 'Por favor introduce tu nombre o el de tu tienda.');
      return;
    }
    if (!onboardingForm.termsAccepted) {
      setOnboardingError(language === 'it' ? 'Devi accettare le condizioni di vendita.' : 'Debes aceptar las condiciones para vender.');
      return;
    }

    setSubmittingOnboarding(true);
    setOnboardingError('');
    try {
      const res = await api.becomeMarketplaceSeller(onboardingForm);
      setSellerProfile(res.profile);
      if (onProfileUpdated) onProfileUpdated();
      setSearchParams({ tab: 'seller', sub: 'dashboard' });
      await loadSellerData();
      setToastMessage(language === 'it' ? 'Profilo venditore attivato con successo!' : '¡Perfil de vendedor activado con éxito!');
      setTimeout(() => setToastMessage(''), 5000);
    } catch (err: any) {
      setOnboardingError(err.message || 'No se pudo completar el registro.');
    } finally {
      setSubmittingOnboarding(false);
    }
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const base64 = event.target?.result as string;
        const res = await api.uploadMarketplaceImage({ imageBase64: base64, filename: file.name });
        setListingForm(prev => ({
          ...prev,
          imageUrls: [...prev.imageUrls, res.url]
        }));
      } catch (err: any) {
        alert('Error: ' + (err.message || 'Error al subir imagen'));
      } finally {
        setUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePublishListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishing(true);
    try {
      await api.createMarketplaceListing({
        ...listingForm,
        priceMinor: Math.round(Number(listingForm.price) * 100),
        weightGrams: Number(listingForm.weightGrams),
        lengthCm: Number(listingForm.lengthCm),
        widthCm: Number(listingForm.widthCm),
        heightCm: Number(listingForm.heightCm)
      });
      setPublishSuccess(true);
      setTimeout(() => {
        setPublishSuccess(false);
        setSearchParams({ tab: 'seller', sub: 'listings' });
        loadMyListings();
      }, 1500);
    } catch (err: any) {
      alert(err.message || 'No se pudo publicar el producto.');
    } finally {
      setPublishing(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      await api.updateMarketplaceListingStatus(id, nextStatus);
      loadMyListings();
    } catch {}
  };

  const handleDeleteListing = async (id: string) => {
    const msg = language === 'it' ? 'Sei sicuro di voler eliminare questo articolo?' : '¿Seguro que deseas eliminar esta publicación?';
    if (!confirm(msg)) return;
    try {
      await api.deleteMarketplaceListing(id);
      loadMyListings();
    } catch {}
  };

  // Switch Primary Tab helper
  const switchPrimaryTab = (tabName: 'buyer' | 'seller' | 'messages') => {
    if (tabName === 'seller') {
      setSearchParams({ tab: 'seller', sub: 'dashboard' });
    } else {
      setSearchParams({ tab: tabName });
    }
  };

  // Determine current active primary tab
  const primaryTab = ['seller', 'dashboard', 'listings', 'publish', 'orders', 'offers'].includes(currentTab)
    ? 'seller'
    : currentTab === 'messages'
    ? 'messages'
    : 'buyer';

  const sellerSubTab = ['dashboard', 'listings', 'publish', 'orders', 'offers'].includes(currentTab)
    ? currentTab
    : subTab;

  const filteredConversations = conversations.filter(c => {
    if (!chatSearch.trim()) return true;
    const q = chatSearch.toLowerCase();
    const otherName = (c.buyer_id === profile?.id ? c.seller_name : c.buyer_name) || '';
    const title = c.listing_title || '';
    return otherName.toLowerCase().includes(q) || title.toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="p-16 flex flex-col justify-center items-center gap-3">
        <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full" />
        <span className="text-xs font-bold text-slate-400">
          {language === 'it' ? 'Caricamento Marketplace DoorDrop...' : 'Cargando Marketplace DoorDrop...'}
        </span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Toast notification banner if triggered */}
      {toastMessage && (
        <div className="p-4 rounded-2xl bg-emerald-600 text-white font-bold text-xs sm:text-sm shadow-xl flex items-center justify-between gap-3 animate-bounce">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage('')} className="p-1 hover:bg-white/20 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          TOP HEADER: MARKETPLACE UNIFIED HUB
         ===================================================================== */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold uppercase tracking-wider backdrop-blur-sm border border-blue-400/30">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{language === 'it' ? 'Ecosistema Unificato DoorDrop' : 'Ecosistema Unificado DoorDrop'}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            {language === 'it' ? 'Marketplace: Compra, Vendi & Spedisci' : 'Marketplace: Compra, Vende y Envía'}
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            {language === 'it'
              ? 'Tutto in un unico account: monitora i tuoi acquisti con corriere espresso, gestisci il tuo negozio da venditore e comunica direttamente in chat con acquirenti e venditori.'
              : 'Todo en una sola cuenta: monitorea tus compras con transportistas integrados, gestiona tu tienda y chatea directamente con compradores y vendedores.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 z-10 self-stretch md:self-auto justify-end">
          <Link
            to="/marketplace"
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition-all flex items-center gap-1.5"
          >
            <ShoppingBag className="w-4 h-4 text-amber-300" />
            <span>{language === 'it' ? 'Esplora Catalogo' : 'Explorar Catálogo'}</span>
          </Link>
          <button
            onClick={() => {
              if (sellerProfile) {
                setSearchParams({ tab: 'seller', sub: 'publish' });
              } else {
                setSearchParams({ tab: 'seller' });
              }
            }}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-lg transition-all flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{language === 'it' ? 'Vendi un Prodotto' : 'Vender Producto'}</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          PRIMARY 3-PILL SWITCHER: ÁREA COMPRADOR | ÁREA VENDEDOR | CHAT
         ===================================================================== */}
      <div className="bg-white dark:bg-dark-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          onClick={() => switchPrimaryTab('buyer')}
          className={`py-3.5 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all ${
            primaryTab === 'buyer'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-800'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>{language === 'it' ? '🛍️ Area Compratore' : '🛍️ Área Comprador'}</span>
          {buyerOrders.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${primaryTab === 'buyer' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'}`}>
              {buyerOrders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => switchPrimaryTab('seller')}
          className={`py-3.5 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all ${
            primaryTab === 'seller'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-800'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>{language === 'it' ? '🏪 Area Venditore' : '🏪 Área Vendedor'}</span>
          {sellerProfile ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500 text-white font-bold">
              {language === 'it' ? 'Attivo' : 'Activo'}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-bold">
              {language === 'it' ? 'Gratis' : 'Gratis'}
            </span>
          )}
        </button>

        <button
          onClick={() => switchPrimaryTab('messages')}
          className={`py-3.5 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all ${
            primaryTab === 'messages'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-800'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          <span>{language === 'it' ? '💬 Chat & Messaggi' : '💬 Chat y Mensajes'}</span>
          {conversations.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${primaryTab === 'messages' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-dark-700 text-slate-700 dark:text-slate-300'}`}>
              {conversations.length}
            </span>
          )}
        </button>
      </div>

      {/* =====================================================================
          PRIMARY SECTION 1: ÁREA COMPRADOR (I MIEI ACQUISTI & SPEDIZIONI)
         ===================================================================== */}
      {primaryTab === 'buyer' && (
        <div className="space-y-6 animate-fade-in">
          {/* Buyer KPI metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-3xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400">
                {language === 'it' ? 'Ordini Acquistati' : 'Compras Realizadas'}
              </span>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {buyerOrders.length}
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400">
                {language === 'it' ? 'In Preparazione' : 'En Preparación'}
              </span>
              <p className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">
                {buyerOrders.filter(o => o.status === 'paid' || o.status === 'processing').length}
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400">
                {language === 'it' ? 'In Spedizione' : 'En Tránsito'}
              </span>
              <p className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
                {buyerOrders.filter(o => o.status === 'shipped').length}
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400">
                {language === 'it' ? 'Consegnati' : 'Entregados'}
              </span>
              <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {buyerOrders.filter(o => o.status === 'delivered').length}
              </p>
            </div>
          </div>

          {/* Guarantee Banner */}
          <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-blue-600 shrink-0" />
              <div>
                <h4 className="font-bold text-xs sm:text-sm text-blue-950 dark:text-blue-200">
                  {language === 'it' ? 'Protezione Acquirente DoorDrop 100% Attiva' : 'Protección al Comprador DoorDrop 100% Activa'}
                </h4>
                <p className="text-[11px] text-blue-800 dark:text-blue-300">
                  {language === 'it'
                    ? 'Il pagamento al venditore viene sbloccato solo dopo che hai ricevuto e verificato il pacco.'
                    : 'El pago al vendedor se libera únicamente cuando recibes y verificas tu paquete.'}
                </p>
              </div>
            </div>
            <Link
              to="/marketplace"
              className="hidden sm:inline-flex px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs whitespace-nowrap hover:bg-blue-700 transition-colors"
            >
              {language === 'it' ? 'Nuovo Acquisto' : 'Nueva Compra'}
            </Link>
          </div>

          {/* Orders List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-blue-600" />
                <span>{language === 'it' ? 'I miei Ordini di Acquisto' : 'Mis Órdenes de Compra'}</span>
              </h3>
              <button
                onClick={loadBuyerOrders}
                className="text-xs font-bold text-slate-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{language === 'it' ? 'Aggiorna' : 'Actualizar'}</span>
              </button>
            </div>

            {loadingBuyerOrders ? (
              <div className="p-12 text-center text-xs text-slate-400">
                <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2" />
                {language === 'it' ? 'Caricamento ordini...' : 'Cargando órdenes...'}
              </div>
            ) : buyerOrders.length === 0 ? (
              <div className="bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-4 shadow-sm">
                <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 mx-auto">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h4 className="text-base font-black text-slate-900 dark:text-white">
                    {language === 'it' ? 'Non hai ancora effettuato acquisti' : 'Aún no has realizado compras'}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {language === 'it'
                      ? 'Trova occasioni incredibili tra migliaia di articoli garantiti con spedizione rapida DoorDrop.'
                      : 'Encuentra grandes ofertas con envío seguro y garantizado por DoorDrop.'}
                  </p>
                </div>
                <Link
                  to="/marketplace"
                  className="inline-flex px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all items-center gap-2"
                >
                  <Search className="w-4 h-4" />
                  <span>{language === 'it' ? 'Esplora il Marketplace' : 'Explorar el Marketplace'}</span>
                </Link>
              </div>
            ) : (
              <div className="bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-sm">
                {buyerOrders.map(order => {
                  const cover = order.listing_image_url || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=200&q=80';
                  const totalFormatted = (order.total_amount_minor / 100).toFixed(2);
                  const shippingFormatted = (order.shipping_amount_minor / 100).toFixed(2);

                  return (
                    <div key={order.id} className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 hover:bg-slate-50/50 dark:hover:bg-dark-800/40 transition-colors">
                      <div className="flex items-start gap-4">
                        <img
                          src={cover}
                          alt=""
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shrink-0 shadow-sm"
                        />
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-500">#{order.order_number}</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              order.status === 'delivered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' :
                              order.status === 'shipped' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' :
                              order.status === 'paid' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300' :
                              'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}>
                              {order.status === 'delivered' ? (language === 'it' ? 'Consegnato' : 'Entregado') :
                               order.status === 'shipped' ? (language === 'it' ? 'In Transito' : 'En Tránsito') :
                               order.status === 'paid' ? (language === 'it' ? 'Pagato • In preparazione' : 'Pagado • En preparación') :
                               order.status}
                            </span>
                          </div>

                          <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">
                            {order.listing_title}
                          </h4>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span>{language === 'it' ? 'Venditore' : 'Vendedor'}: <strong className="text-slate-700 dark:text-slate-300">{order.seller_name}</strong></span>
                            <span>•</span>
                            <span>{language === 'it' ? 'Corriere' : 'Transporte'}: <strong className="text-blue-600">{order.shipping_service_name || 'DoorDrop Express'}</strong></span>
                            <span>•</span>
                            <span className="font-black text-slate-900 dark:text-white">{totalFormatted} {order.currency}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 self-end md:self-center w-full md:w-auto justify-end">
                        <button
                          onClick={() => handleStartChatForListing(order.listing_id)}
                          className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-dark-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5 transition-colors"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-blue-600" />
                          <span>{language === 'it' ? 'Chat col Venditore' : 'Chat con Vendedor'}</span>
                        </button>

                        <Link
                          to={`/panel/shipments`}
                          className="px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center gap-1.5 transition-colors"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>{language === 'it' ? 'Traccia Spedizione' : 'Seguir Envío'}</span>
                        </Link>

                        <button
                          onClick={() => setSelectedOrderDetail(order)}
                          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-600 text-xs font-bold"
                          title="Dettagli ordine"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          PRIMARY SECTION 2: ÁREA VENDEDOR (IL MIO NEGOZIO & VENDITE)
         ===================================================================== */}
      {primaryTab === 'seller' && (
        <div className="space-y-6 animate-fade-in">
          {/* If NOT registered as seller yet: Show Onboarding Banner & Form */}
          {!sellerProfile ? (
            <div className="space-y-8">
              <div className="bg-gradient-to-br from-blue-700 via-indigo-700 to-blue-900 rounded-3xl p-8 sm:p-12 text-white shadow-xl relative overflow-hidden">
                <div className="max-w-2xl space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-blue-100 text-xs font-bold uppercase tracking-wider backdrop-blur-sm border border-white/20">
                    <Store className="w-3.5 h-3.5 text-amber-300" />
                    <span>{language === 'it' ? 'Diventa Venditore DoorDrop' : 'Conviértete en Vendedor'}</span>
                  </div>
                  <h2 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
                    {language === 'it'
                      ? 'Vendi i tuoi prodotti con etichette di spedizione automatiche e pagamento garantito.'
                      : 'Publica tus productos y llega a compradores utilizando el ecosistema logístico de DoorDrop.'}
                  </h2>
                  <p className="text-blue-100 text-xs sm:text-sm leading-relaxed">
                    {language === 'it'
                      ? 'Nessun canone mensile né costi fissi. L\'acquirente acquista, tu ricevi l\'etichetta di spedizione già pronta per il corriere e i fondi vengono accreditati sul tuo saldo.'
                      : 'Sin comisiones abusivas. Cotización de transporte automática, etiquetas instantáneas y protección garantizada en cada venta.'}
                  </p>
                </div>
              </div>

              {/* Benefits Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-800 space-y-2 shadow-sm">
                  <Truck className="w-6 h-6 text-blue-600" />
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    {language === 'it' ? 'Logistica Automatica' : 'Logística DoorDrop'}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {language === 'it'
                      ? 'Il sistema calcola il miglior corriere e genera l\'etichetta di trasporto senza che tu debba fare nulla.'
                      : 'Tus compradores eligen el transportista y tú recibes la etiqueta lista para imprimir.'}
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-800 space-y-2 shadow-sm">
                  <ShieldCheck className="w-6 h-6 text-emerald-600" />
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    {language === 'it' ? 'Incasso Garantito 100%' : 'Cobro Seguro'}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {language === 'it'
                      ? 'L\'importo viene congelato in escrow alla conferma dell\'ordine: mai più truffe o ritiri a vuoto.'
                      : 'Garantizamos el pago del comprador antes de que prepares y entregues el paquete.'}
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-800 space-y-2 shadow-sm">
                  <Sparkles className="w-6 h-6 text-indigo-600" />
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    {language === 'it' ? 'Account Unificato' : 'Una Sola Cuenta'}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {language === 'it'
                      ? 'Usa la stessa password e lo stesso pannello DoorDrop sia per comprare che per vendere.'
                      : 'Tu misma cuenta de DoorDrop sirve para enviar y vender. Sin contraseñas extra.'}
                  </p>
                </div>
              </div>

              {/* Onboarding Activation Form */}
              <div className="bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    {language === 'it' ? 'Attiva il tuo profilo venditore in 1 minuto' : 'Completa tu perfil para empezar a vender'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {language === 'it' ? 'Configura il tuo nome pubblico e l\'indirizzo per il ritiro dei pacchi.' : 'Solo te tomará 1 minuto activar tu panel de vendedor.'}
                  </p>
                </div>

                {onboardingError && (
                  <div className="p-3.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{onboardingError}</span>
                  </div>
                )}

                <form onSubmit={handleOnboardingSubmit} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        {language === 'it' ? 'Nome pubblico o Negozio *' : 'Nombre público de vendedor / Tienda *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={onboardingForm.displayName}
                        onChange={e => setOnboardingForm(prev => ({ ...prev, displayName: e.target.value }))}
                        placeholder="Es. Mario Rossi o Vintage Shop"
                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        {language === 'it' ? 'Tipo di venditore *' : 'Tipo de vendedor *'}
                      </label>
                      <select
                        value={onboardingForm.sellerType}
                        onChange={e => setOnboardingForm(prev => ({ ...prev, sellerType: e.target.value as any }))}
                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-semibold"
                      >
                        <option value="individual">{language === 'it' ? 'Privato / Venditore occasionale' : 'Particular / Ocasional'}</option>
                        <option value="business">{language === 'it' ? 'Azienda / Professionista' : 'Empresa / Profesional'}</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        {language === 'it' ? 'Paese *' : 'País *'}
                      </label>
                      <select
                        value={onboardingForm.country}
                        onChange={e => setOnboardingForm(prev => ({ ...prev, country: e.target.value }))}
                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-semibold"
                      >
                        <option value="IT">🇮🇹 Italia</option>
                        <option value="ES">🇪🇸 España</option>
                        <option value="DE">🇩🇪 Deutschland</option>
                        <option value="FR">🇫🇷 France</option>
                        <option value="GB">🇬🇧 United Kingdom</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        {language === 'it' ? 'Città *' : 'Ciudad *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={onboardingForm.city}
                        onChange={e => setOnboardingForm(prev => ({ ...prev, city: e.target.value }))}
                        placeholder="Es. Milano"
                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        {language === 'it' ? 'CAP (Codice Postale) *' : 'Código Postal (ZIP) *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={onboardingForm.zipCode}
                        onChange={e => setOnboardingForm(prev => ({ ...prev, zipCode: e.target.value }))}
                        placeholder="Es. 20121"
                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        {language === 'it' ? 'Indirizzo di ritiro pacchi *' : 'Dirección de recogida *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={onboardingForm.address}
                        onChange={e => setOnboardingForm(prev => ({ ...prev, address: e.target.value }))}
                        placeholder="Via, numero civico, piano"
                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        {language === 'it' ? 'Telefono di contatto *' : 'Teléfono de contacto *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={onboardingForm.phone}
                        onChange={e => setOnboardingForm(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="+39 340 0000000"
                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-semibold"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={onboardingForm.termsAccepted}
                        onChange={e => setOnboardingForm(prev => ({ ...prev, termsAccepted: e.target.checked }))}
                        className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <span className="text-xs text-slate-600 dark:text-slate-400 leading-snug">
                        {language === 'it'
                          ? 'Accetto le condizioni per i venditori DoorDrop, gli standard di spedizione e l\'impegno a preparare i pacchi venduti entro 48 ore.'
                          : 'Acepto las condiciones para vendedores de DoorDrop, los estándares de envío y el compromiso de despachar los pedidos confirmados en 48 horas.'}
                      </span>
                    </label>
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={submittingOnboarding}
                      className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      {submittingOnboarding
                        ? (language === 'it' ? 'Attivazione in corso...' : 'Activando...')
                        : (language === 'it' ? 'Attiva subito il mio Negozio' : 'Convertirme en vendedor')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            /* ACTIVE SELLER: Full Vendor Dashboard */
            <div className="space-y-6">
              {/* Seller Sub-Navigation Pills */}
              <div className="bg-slate-100 dark:bg-dark-800/60 p-1.5 rounded-2xl flex gap-1 overflow-x-auto scrollbar-none">
                {[
                  { key: 'dashboard', label: language === 'it' ? 'Panoramica' : 'Resumen', icon: TrendingUp },
                  { key: 'listings', label: language === 'it' ? 'I miei Articoli' : 'Mis publicaciones', icon: Package },
                  { key: 'publish', label: language === 'it' ? '+ Nuovo Articolo' : '+ Publicar producto', icon: PlusCircle },
                  { key: 'orders', label: language === 'it' ? 'Vendite Ricevute' : 'Ventas y Envíos', icon: Truck },
                  { key: 'offers', label: language === 'it' ? 'Offerte Ricevute' : 'Ofertas', icon: DollarSign }
                ].map(tab => {
                  const active = sellerSubTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setSearchParams({ tab: 'seller', sub: tab.key })}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                        active
                          ? 'bg-white dark:bg-dark-900 text-blue-600 dark:text-blue-400 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-dark-900/50'
                      }`}
                    >
                      <tab.icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* 1. SELLER DASHBOARD */}
              {sellerSubTab === 'dashboard' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-5 rounded-3xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                      <span className="text-xs font-bold text-slate-400">{language === 'it' ? 'Articoli Attivi' : 'Publicaciones Activas'}</span>
                      <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">{stats?.active_listings || 0}</p>
                    </div>
                    <div className="p-5 rounded-3xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                      <span className="text-xs font-bold text-slate-400">{language === 'it' ? 'Vendite Completate' : 'Ventas Completadas'}</span>
                      <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">{stats?.total_sales_count || 0}</p>
                    </div>
                    <div className="p-5 rounded-3xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                      <span className="text-xs font-bold text-slate-400">{language === 'it' ? 'Offerte Ricevute' : 'Ofertas Pendientes'}</span>
                      <p className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">{stats?.pending_offers || 0}</p>
                    </div>
                    <div className="p-5 rounded-3xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                      <span className="text-xs font-bold text-slate-400">{language === 'it' ? 'Valutazione Venditore' : 'Valoración'}</span>
                      <p className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">★ {Number(sellerProfile?.avg_rating || 5.0).toFixed(1)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 rounded-3xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                      <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center justify-between">
                        <span>{language === 'it' ? 'Scorciatoie Rapide' : 'Acciones rápidas'}</span>
                        <Sparkles className="w-4 h-4 text-blue-600" />
                      </h3>
                      <div className="grid grid-cols-2 gap-3 text-xs font-bold">
                        <button
                          onClick={() => setSearchParams({ tab: 'seller', sub: 'publish' })}
                          className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 flex flex-col items-center justify-center gap-2 text-center"
                        >
                          <PlusCircle className="w-6 h-6" />
                          <span>{language === 'it' ? 'Pubblica un articolo' : 'Publicar nuevo producto'}</span>
                        </button>
                        <button
                          onClick={() => setSearchParams({ tab: 'seller', sub: 'orders' })}
                          className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 flex flex-col items-center justify-center gap-2 text-center"
                        >
                          <Truck className="w-6 h-6" />
                          <span>{language === 'it' ? 'Gestisci spedizioni' : 'Gestionar envíos pendientes'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-6 rounded-3xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                      <h3 className="text-sm font-black text-slate-900 dark:text-white">
                        {language === 'it' ? 'Info Venditore DoorDrop' : 'Estado del Vendedor'}
                      </h3>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dark-800">
                          <span className="text-slate-500">{language === 'it' ? 'Negozio pubblico' : 'Tienda pública'}</span>
                          <Link to={`/marketplace/vendedor/${sellerProfile.slug}`} target="_blank" className="font-bold text-blue-600 flex items-center gap-1">
                            <span>{sellerProfile.display_name}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dark-800">
                          <span className="text-slate-500">{language === 'it' ? 'Ritiro pacchi da' : 'Ubicación de despacho'}</span>
                          <span className="font-bold">{sellerProfile.city}, {sellerProfile.country}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. SELLER LISTINGS */}
              {sellerSubTab === 'listings' && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      {language === 'it' ? 'I miei Articoli Pubblicati' : 'Mis productos publicados'}
                    </h3>
                    <button
                      onClick={() => setSearchParams({ tab: 'seller', sub: 'publish' })}
                      className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center gap-1"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>{language === 'it' ? 'Nuovo Articolo' : 'Nuevo producto'}</span>
                    </button>
                  </div>

                  {myListings.length === 0 ? (
                    <div className="text-center py-16 bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 space-y-3">
                      <Package className="w-12 h-12 text-slate-300 mx-auto" />
                      <h4 className="text-base font-black text-slate-900 dark:text-white">
                        {language === 'it' ? 'Non hai ancora pubblicato nessun articolo' : 'Aún no has publicado ningún producto'}
                      </h4>
                      <button
                        onClick={() => setSearchParams({ tab: 'seller', sub: 'publish' })}
                        className="px-5 py-2.5 rounded-full bg-blue-600 text-white font-bold text-xs"
                      >
                        {language === 'it' ? 'Pubblica ora' : 'Publicar producto'}
                      </button>
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
                      {myListings.map(item => {
                        const cover = item.images?.[0]?.url || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=200&q=80';
                        const price = (item.price_minor / 100).toFixed(2);
                        return (
                          <div key={item.id} className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-dark-800/50 transition-colors">
                            <div className="flex items-center gap-4">
                              <img src={cover} alt="" className="w-16 h-16 rounded-2xl object-cover border shrink-0" />
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-sm text-slate-900 dark:text-white">{price} {item.currency}</span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    item.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                                    item.status === 'sold' ? 'bg-purple-100 text-purple-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>
                                    {item.status === 'active' ? (language === 'it' ? 'Attivo' : 'Activo') :
                                     item.status === 'sold' ? (language === 'it' ? 'Venduto' : 'Vendido') :
                                     (language === 'it' ? 'Pausato' : 'Pausado')}
                                  </span>
                                </div>
                                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{item.title}</h4>
                                <p className="text-[11px] text-slate-400">
                                  {item.city} • {item.view_count || 0} {language === 'it' ? 'visite' : 'visitas'} • {item.favorite_count || 0} {language === 'it' ? 'preferiti' : 'favoritos'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center">
                              <Link
                                to={`/marketplace/producto/${item.slug || item.id}`}
                                target="_blank"
                                className="p-2 rounded-xl border hover:bg-slate-100 text-slate-600 text-xs font-bold"
                                title="Vedi online"
                              >
                                <Eye className="w-4 h-4" />
                              </Link>
                              <button
                                onClick={() => handleToggleStatus(item.id, item.status)}
                                className="px-3 py-1.5 rounded-xl border text-xs font-bold text-slate-700 hover:bg-slate-100"
                              >
                                {item.status === 'active' ? (language === 'it' ? 'Metti in pausa' : 'Pausar') : (language === 'it' ? 'Attiva' : 'Activar')}
                              </button>
                              <button
                                onClick={() => handleDeleteListing(item.id)}
                                className="p-2 rounded-xl border hover:bg-rose-50 text-rose-600"
                                title="Elimina"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 3. SELLER PUBLISH FORM */}
              {sellerSubTab === 'publish' && (
                <div className="max-w-3xl mx-auto bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-10 shadow-sm space-y-6 animate-fade-in">
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white">
                      {language === 'it' ? 'Pubblica un articolo in vendita' : 'Publicar un producto para la venta'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {language === 'it' ? 'Compila i dettagli e imposta le dimensioni per la spedizione DoorDrop.' : 'Introduce los datos del producto y configura el envío con DoorDrop.'}
                    </p>
                  </div>

                  {publishSuccess && (
                    <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-700 text-sm font-bold flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      <span>{language === 'it' ? 'Articolo pubblicato con successo!' : '¡Producto publicado con éxito!'}</span>
                    </div>
                  )}

                  <form onSubmit={handlePublishListing} className="space-y-6 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        {language === 'it' ? 'Titolo dell\'articolo *' : 'Título del producto *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={listingForm.title}
                        onChange={e => setListingForm(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Es. Fotocamera Sony Alpha 7 IV - Come nuova con obiettivo"
                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-semibold"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                          {language === 'it' ? 'Categoria' : 'Categoría'}
                        </label>
                        <select
                          value={listingForm.categoryId}
                          onChange={e => setListingForm(prev => ({ ...prev, categoryId: e.target.value }))}
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-semibold"
                        >
                          <option value="">{language === 'it' ? 'Seleziona una categoria' : 'Selecciona una categoría'}</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.icon} {c.translated_name || c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                          {language === 'it' ? 'Condizione articolo *' : 'Estado del producto *'}
                        </label>
                        <select
                          value={listingForm.condition}
                          onChange={e => setListingForm(prev => ({ ...prev, condition: e.target.value }))}
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-semibold"
                        >
                          <option value="new">{language === 'it' ? 'Nuovo con cartellino / sigillato' : 'Nuevo con etiqueta'}</option>
                          <option value="like_new">{language === 'it' ? 'Come nuovo (perfetto)' : 'Como nuevo'}</option>
                          <option value="excellent">{language === 'it' ? 'Ottime condizioni' : 'Excelente estado'}</option>
                          <option value="good">{language === 'it' ? 'Buone condizioni' : 'Buen estado'}</option>
                          <option value="used">{language === 'it' ? 'Usato con normali segni' : 'Usado'}</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                          {language === 'it' ? 'Prezzo di vendita *' : 'Precio *'}
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={listingForm.price}
                            onChange={e => setListingForm(prev => ({ ...prev, price: e.target.value }))}
                            placeholder="49.00"
                            className="w-full p-3 rounded-xl bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-black text-base"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-slate-400">{listingForm.currency}</span>
                        </div>
                      </div>
                      <div className="flex items-center pt-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={listingForm.negotiable}
                            onChange={e => setListingForm(prev => ({ ...prev, negotiable: e.target.checked }))}
                            className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                          />
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {language === 'it' ? 'Prezzo trattabile' : 'Precio negociable'}
                          </span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        {language === 'it' ? 'Descrizione dettagliata *' : 'Descripción detallada *'}
                      </label>
                      <textarea
                        required
                        rows={4}
                        value={listingForm.description}
                        onChange={e => setListingForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder={language === 'it' ? 'Descrivi il prodotto: marca, caratteristiche, accessori inclusi, motivo della vendita...' : 'Describe el producto con precisión...'}
                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 font-semibold"
                      />
                    </div>

                    {/* Dimensions for DoorDrop Logistics */}
                    <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 space-y-3">
                      <div className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-200">
                        <Truck className="w-4 h-4 text-blue-600" />
                        <span>{language === 'it' ? 'Dimensioni pacco per preventivo corriere DoorDrop' : 'Dimensiones para cotización de envío DoorDrop'}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label className="block text-slate-500 mb-1">{language === 'it' ? 'Peso (g)' : 'Peso (gr)'}</label>
                          <input
                            type="number"
                            value={listingForm.weightGrams}
                            onChange={e => setListingForm(prev => ({ ...prev, weightGrams: e.target.value }))}
                            className="w-full p-2.5 rounded-xl bg-white dark:bg-dark-800 border font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 mb-1">{language === 'it' ? 'Lunghezza (cm)' : 'Largo (cm)'}</label>
                          <input
                            type="number"
                            value={listingForm.lengthCm}
                            onChange={e => setListingForm(prev => ({ ...prev, lengthCm: e.target.value }))}
                            className="w-full p-2.5 rounded-xl bg-white dark:bg-dark-800 border font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 mb-1">{language === 'it' ? 'Larghezza (cm)' : 'Ancho (cm)'}</label>
                          <input
                            type="number"
                            value={listingForm.widthCm}
                            onChange={e => setListingForm(prev => ({ ...prev, widthCm: e.target.value }))}
                            className="w-full p-2.5 rounded-xl bg-white dark:bg-dark-800 border font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 mb-1">{language === 'it' ? 'Altezza (cm)' : 'Alto (cm)'}</label>
                          <input
                            type="number"
                            value={listingForm.heightCm}
                            onChange={e => setListingForm(prev => ({ ...prev, heightCm: e.target.value }))}
                            className="w-full p-2.5 rounded-xl bg-white dark:bg-dark-800 border font-bold"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Photos upload */}
                    <div className="space-y-3">
                      <label className="block font-bold text-slate-700 dark:text-slate-300">
                        {language === 'it' ? 'Fotografie del prodotto' : 'Imágenes del producto'}
                      </label>
                      <div className="flex flex-wrap gap-3">
                        {listingForm.imageUrls.map((url, idx) => (
                          <div key={idx} className="relative w-24 h-24 rounded-2xl overflow-hidden border">
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setListingForm(prev => ({ ...prev, imageUrls: prev.imageUrls.filter((_, i) => i !== idx) }))}
                              className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {listingForm.imageUrls.length < 8 && (
                          <label className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:text-blue-600 transition-colors">
                            <Upload className="w-6 h-6 mb-1" />
                            <span className="text-[10px] font-bold">{uploadingImage ? '...' : (language === 'it' ? '+ Foto' : '+ Foto')}</span>
                            <input type="file" accept="image/*" onChange={handleImageFileChange} className="hidden" />
                          </label>
                        )}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={publishing}
                      className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      {publishing ? (language === 'it' ? 'Pubblicazione in corso...' : 'Publicando...') : (language === 'it' ? 'Pubblica subito sul Marketplace' : 'Publicar producto en el Marketplace')}
                    </button>
                  </form>
                </div>
              )}

              {/* 4. SELLER ORDERS (SALES) */}
              {sellerSubTab === 'orders' && (
                <div className="space-y-4 animate-fade-in">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {language === 'it' ? 'Vendite e Spedizioni ai Clienti' : 'Ventas y Envíos'}
                  </h3>

                  {sellerOrders.length === 0 ? (
                    <div className="text-center py-16 bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 space-y-2">
                      <Truck className="w-12 h-12 text-slate-300 mx-auto" />
                      <h4 className="text-base font-black text-slate-900 dark:text-white">
                        {language === 'it' ? 'Nessuna vendita ancora registrata' : 'No hay ventas registradas todavía'}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {language === 'it' ? 'Appena un acquirente ordina un tuo articolo, riceverai una notifica e l\'etichetta di spedizione qui.' : 'Cuando un comprador adquiera un artículo, aparecerá aquí.'}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                      {sellerOrders.map(order => (
                        <div key={order.id} className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-900 dark:text-white">#{order.order_number}</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700">
                                {order.status}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{order.listing_title}</p>
                            <p className="text-[11px] text-slate-400">
                              {language === 'it' ? 'Acquirente' : 'Comprador'}: {order.buyer_name} • {(order.total_amount_minor / 100).toFixed(2)} {order.currency}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500">{order.shipping_service_name || 'DoorDrop Express'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 5. SELLER OFFERS */}
              {sellerSubTab === 'offers' && (
                <div className="space-y-4 animate-fade-in">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {language === 'it' ? 'Proposte di Prezzo Ricevute' : 'Ofertas recibidas y enviadas'}
                  </h3>

                  {offers.length === 0 ? (
                    <div className="text-center py-16 bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
                      <DollarSign className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                      <h4 className="text-base font-black text-slate-900 dark:text-white">
                        {language === 'it' ? 'Nessuna proposta pendente' : 'No tienes ofertas pendientes'}
                      </h4>
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                      {offers.map(offer => (
                        <div key={offer.id} className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-base text-slate-900 dark:text-white">
                                {(offer.amount_minor / 100).toFixed(2)} {offer.currency}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                offer.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
                                offer.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {offer.status}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{offer.listing_title}</p>
                            <p className="text-[11px] text-slate-400">
                              Da: {offer.buyer_name} {offer.message ? `• "${offer.message}"` : ''}
                            </p>
                          </div>

                          {offer.status === 'pending' && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleRespondOffer(offer.id, 'accepted')}
                                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm"
                              >
                                {language === 'it' ? 'Accetta Offerta' : 'Aceptar'}
                              </button>
                              <button
                                onClick={() => handleRespondOffer(offer.id, 'rejected')}
                                className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 text-xs font-bold"
                              >
                                {language === 'it' ? 'Rifiuta' : 'Rechazar'}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          PRIMARY SECTION 3: CHAT & MESSAGGISTICA (REAL-TIME MESSENGER)
         ===================================================================== */}
      {primaryTab === 'messages' && (
        <div className="bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 h-[650px] flex overflow-hidden shadow-xl animate-fade-in">
          {/* Left Column: Conversations List */}
          <div className="w-full sm:w-80 md:w-96 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-blue-600" />
                  <span>{language === 'it' ? 'Messaggi & Trattative' : 'Conversaciones'}</span>
                </h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-dark-800 text-slate-500">
                  {conversations.length}
                </span>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={chatSearch}
                  onChange={e => setChatSearch(e.target.value)}
                  placeholder={language === 'it' ? 'Cerca per utente o articolo...' : 'Buscar conversación...'}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                  <MessageCircle className="w-8 h-8 text-slate-300 mx-auto" />
                  <p>{language === 'it' ? 'Nessuna conversazione attiva.' : 'No hay mensajes.'}</p>
                </div>
              ) : (
                filteredConversations.map(conv => {
                  const isMeBuyer = conv.buyer_id === profile?.id;
                  const counterpartyName = isMeBuyer ? conv.seller_name : conv.buyer_name;
                  const roleBadge = isMeBuyer
                    ? (language === 'it' ? 'Venditore' : 'Vendedor')
                    : (language === 'it' ? 'Acquirente' : 'Comprador');
                  const cover = conv.listing_image_url || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=120&q=80';
                  const isSelected = activeConv?.id === conv.id;

                  return (
                    <div
                      key={conv.id}
                      onClick={() => selectConversation(conv)}
                      className={`p-3.5 cursor-pointer transition-all flex items-start gap-3 ${
                        isSelected
                          ? 'bg-blue-50/80 dark:bg-blue-950/40 border-l-4 border-blue-600'
                          : 'hover:bg-slate-50 dark:hover:bg-dark-800/60'
                      }`}
                    >
                      <img
                        src={cover}
                        alt=""
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h5 className="font-black text-xs text-slate-900 dark:text-white truncate">
                            {counterpartyName || (language === 'it' ? 'Utente DoorDrop' : 'Usuario DoorDrop')}
                          </h5>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-dark-700 text-slate-500">
                            {roleBadge}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-blue-600 truncate mt-0.5">
                          {conv.listing_title}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {conv.last_message || (language === 'it' ? 'Chat avviata' : 'Conversación iniciada')}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Active Chat Stream */}
          <div className="hidden sm:flex flex-1 flex-col justify-between bg-slate-50/50 dark:bg-dark-950/40">
            {activeConv ? (
              <>
                {/* Active Chat Header */}
                <div className="p-4 bg-white dark:bg-dark-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-3">
                    <img
                      src={activeConv.listing_image_url || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=120&q=80'}
                      alt=""
                      className="w-11 h-11 rounded-xl object-cover border shrink-0"
                    />
                    <div>
                      <h4 className="font-black text-xs sm:text-sm text-slate-900 dark:text-white line-clamp-1">
                        {activeConv.listing_title}
                      </h4>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <span>{language === 'it' ? 'Trattativa con' : 'Chat con'}</span>
                        <strong className="text-slate-800 dark:text-slate-200">
                          {activeConv.buyer_id === profile?.id ? activeConv.seller_name : activeConv.buyer_name}
                        </strong>
                        {activeConv.listing_price_minor && (
                          <>
                            <span>•</span>
                            <span className="text-blue-600 font-bold">
                              {(activeConv.listing_price_minor / 100).toFixed(2)} {activeConv.listing_currency || 'EUR'}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      to={`/marketplace/producto/${activeConv.listing_slug || activeConv.listing_id}`}
                      target="_blank"
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1"
                    >
                      <span>{language === 'it' ? 'Vedi Annuncio' : 'Ver Producto'}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>

                {/* Messages History */}
                <div className="p-4 flex-1 overflow-y-auto space-y-3">
                  {convMessages.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      {language === 'it' ? 'Non ci sono ancora messaggi in questa trattativa. Scrivi il primo messaggio!' : 'No hay mensajes. ¡Escribe el primero!'}
                    </div>
                  ) : (
                    convMessages.map(msg => {
                      const isMe = msg.sender_id === profile?.id;
                      const isSystem = msg.message_type === 'system' || msg.message_type === 'offer';

                      if (isSystem) {
                        return (
                          <div key={msg.id} className="flex justify-center my-2">
                            <div className="max-w-md p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs font-medium shadow-xs text-center">
                              <Sparkles className="w-3.5 h-3.5 inline mr-1 text-amber-600" />
                              {msg.body}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          <div className={`max-w-md p-3.5 rounded-2xl text-xs font-medium shadow-xs leading-relaxed ${
                            isMe
                              ? 'bg-blue-600 text-white rounded-br-xs'
                              : 'bg-white dark:bg-dark-800 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 rounded-bl-xs'
                          }`}>
                            {msg.body}
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 px-1">
                            {isMe ? (language === 'it' ? 'Tu' : 'Tú') : msg.sender_name}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Quick Suggestion Chips */}
                <div className="px-4 py-2 bg-white/70 dark:bg-dark-900/70 border-t border-slate-100 dark:border-slate-800 flex gap-2 overflow-x-auto scrollbar-none text-[11px]">
                  {[
                    language === 'it' ? 'È ancora disponibile?' : '¿Sigue disponible?',
                    language === 'it' ? 'Spedite con corriere espresso?' : '¿Hacen envíos express?',
                    language === 'it' ? 'Il prezzo è trattabile?' : '¿El precio es negociable?',
                    language === 'it' ? 'Perfetto, confermo!' : '¡Excelente, trato hecho!'
                  ].map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(undefined, suggestion)}
                      className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-dark-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-600 dark:text-slate-300 hover:text-blue-600 whitespace-nowrap transition-colors font-medium"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>

                {/* Send Message Input */}
                <form onSubmit={e => handleSendMessage(e)} className="p-3 bg-white dark:bg-dark-900 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder={language === 'it' ? 'Scrivi un messaggio per la trattativa...' : 'Escribe tu mensaje...'}
                    className="flex-1 p-3 bg-slate-100 dark:bg-dark-800 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={sendingMessage || !newMessage.trim()}
                    className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
                <MessageCircle className="w-12 h-12 text-slate-300" />
                <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">
                  {language === 'it' ? 'Nessuna conversazione selezionata' : 'Ninguna conversación seleccionada'}
                </h4>
                <p className="text-xs max-w-sm">
                  {language === 'it'
                    ? 'Seleziona una trattativa dalla colonna sinistra per leggere i messaggi o rispondere al venditore o acquirente.'
                    : 'Selecciona una conversación de la columna izquierda para leer y responder mensajes.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          ORDER DETAILS MODAL (IF CLICKED FROM BUYER LIST)
         ===================================================================== */}
      {selectedOrderDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-dark-900 w-full max-w-lg rounded-3xl p-6 space-y-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-sm text-slate-900 dark:text-white">
                  {language === 'it' ? 'Dettagli Spedizione & Ordine' : 'Detalles de Envío y Orden'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrderDetail(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-dark-800 space-y-1">
                <span className="font-bold text-slate-400">{language === 'it' ? 'Articolo Acquistato' : 'Producto'}</span>
                <p className="font-black text-sm text-slate-900 dark:text-white">{selectedOrderDetail.listing_title}</p>
                <p className="text-slate-500">#{selectedOrderDetail.order_number}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-dark-800">
                  <span className="font-bold text-slate-400 block mb-0.5">{language === 'it' ? 'Totale Pagato' : 'Total'}</span>
                  <span className="font-black text-blue-600 text-sm">
                    {(selectedOrderDetail.total_amount_minor / 100).toFixed(2)} {selectedOrderDetail.currency}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-dark-800">
                  <span className="font-bold text-slate-400 block mb-0.5">{language === 'it' ? 'Metodo Pagamento' : 'Método'}</span>
                  <span className="font-bold uppercase text-slate-700 dark:text-slate-300">
                    {selectedOrderDetail.payment_method}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 text-blue-900 dark:text-blue-200">
                <span className="font-bold block mb-1">
                  {language === 'it' ? 'Corriere Assegnato' : 'Transportista'}
                </span>
                <p className="font-medium">
                  {selectedOrderDetail.shipping_service_name || 'DoorDrop Express Logistics'}
                </p>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <Link
                to="/panel/shipments"
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs text-center"
              >
                {language === 'it' ? 'Traccia nel Pannello Spedizioni' : 'Ver en Envíos'}
              </Link>
              <button
                onClick={() => setSelectedOrderDetail(null)}
                className="px-5 py-3 rounded-xl bg-slate-100 dark:bg-dark-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                {language === 'it' ? 'Chiudi' : 'Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
