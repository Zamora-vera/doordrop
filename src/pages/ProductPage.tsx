import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Truck,
  ShieldCheck,
  Heart,
  Share2,
  MapPin,
  Clock,
  Store,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  DollarSign,
  MessageCircle,
  Package,
  AlertCircle,
  X,
  CreditCard,
  Wallet,  Send} from 'lucide-react';
import { api, getAuthToken } from '../lib/api';
import { BrandMark, useBrand } from '../lib/brand';
import { GlobalHeader } from '../components/GlobalHeader';
import { GlobalFooter } from '../components/GlobalFooter';
import { useI18n } from '../lib/i18n';
import { saveGuestChatIntent } from '../lib/marketplaceGuestChat';
import { ShippingTermsConsent } from '../components/ShippingTermsConsent';

export function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { brand } = useBrand();
  const { t, language } = useI18n();

  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImgIndex, setSelectedImgIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);

  // Quote State
  const [destCountry, setDestCountry] = useState('IT');
  const [destZip, setDestZip] = useState('');
  const [destCity, setDestCity] = useState('');
  const [quotes, setQuotes] = useState<any[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [shippingTermsAccepted, setShippingTermsAccepted] = useState(false);

  // Modals State
  const [showCheckout, setShowCheckout] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [offerSuccess, setOfferSuccess] = useState(false);
  const acceptedOfferId = new URLSearchParams(window.location.search).get('offerId') || '';
  const [acceptedOffer, setAcceptedOffer] = useState<any>(null);

  // Chat Modal State
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatMessageText, setChatMessageText] = useState('');
  const [startingChat, setStartingChat] = useState(false);

  // Checkout State
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'paypal'>('wallet');
  const [paypalAvailable, setPaypalAvailable] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [purchaseSuccess, setPurchaseSuccess] = useState<any>(null);

  const isLoggedIn = Boolean(getAuthToken());

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    api.getMarketplaceListing(slug)
      .then(res => {
        setListing(res.listing);
        if (res.listing?.country_code) {
          setDestCountry(res.listing.country_code);
        }
      })
      .catch(() => setListing(null))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!isLoggedIn) {
      setPaypalAvailable(false);
      return;
    }
    api.paypalGetConfig()
      .then((config: any) => setPaypalAvailable(Boolean(config?.enabled && config?.configured)))
      .catch(() => setPaypalAvailable(false));
  }, [isLoggedIn]);

  useEffect(() => {
    if (listing?.id && isLoggedIn) {
      api.getMarketplaceFavoriteStatus(listing.id)
        .then(res => setIsFavorite(Boolean(res.isFavorite)))
        .catch(() => {});
    }
  }, [listing?.id, isLoggedIn]);

  useEffect(() => {
    if (!acceptedOfferId || !isLoggedIn || !listing?.id) {
      setAcceptedOffer(null);
      return;
    }
    api.getMarketplaceOffers()
      .then(res => {
        const match = (res.offers || []).find((offer: any) =>
          String(offer.id) === acceptedOfferId
          && String(offer.listing_id) === String(listing.id)
          && offer.status === 'accepted'
        );
        setAcceptedOffer(match || null);
      })
      .catch(() => setAcceptedOffer(null));
  }, [acceptedOfferId, isLoggedIn, listing?.id]);

  // Load quote automatically when listing is ready
  useEffect(() => {
    if (listing?.id && listing.shipping_available && shippingTermsAccepted) {
      calculateShipping();
    }
  }, [listing?.id, destCountry, shippingTermsAccepted]);

  const calculateShipping = async () => {
    if (!listing?.id || !shippingTermsAccepted) return;
    setQuoting(true);
    setQuoteError('');
    try {
      const res = await api.quoteMarketplaceShipping(listing.id, {
        destCountry,
        destZip: destZip || (destCountry === 'IT' ? '00185' : '28001'),
        destCity: destCity || (destCountry === 'IT' ? 'Roma' : 'Madrid')
      });
      const quoteList = res.quotes || [];
      setQuotes(quoteList);
      if (quoteList.length > 0) {
        setSelectedQuote(quoteList[0]);
      }
    } catch {
      setQuoteError('No se pudo calcular el envío automáticamente.');
    } finally {
      setQuoting(false);
    }
  };

  const toggleFav = async () => {
    if (!isLoggedIn) {
      navigate('/auth/login', { state: { from: window.location.pathname } });
      return;
    }
    try {
      const res = await api.toggleMarketplaceFavorite(listing.id);
      setIsFavorite(res.isFavorite);
    } catch {}
  };

  const handleStartChat = () => {
    setShowChatModal(true);
    if (!chatMessageText) {
      setChatMessageText(language === 'it'
        ? 'Ciao! Sono interessato a questo articolo. È ancora disponibile?'
        : '¡Hola! Me interesa este artículo. ¿Sigue disponible?');
    }
  };

  const handleSendOrSaveChat = async () => {
    const text = chatMessageText.trim();
    if (!text) return;

    if (!isLoggedIn) {
      saveGuestChatIntent({
        listingId: listing.id,
        listingSlug: listing.slug,
        listingTitle: listing.title,
        sellerId: listing.seller_id,
        sellerName: listing?.seller?.display_name || listing?.seller_name || 'DoorDrop Seller',
        message: text,
      });

      navigate('/auth/register', {
        state: {
          from: '/panel/marketplace?tab=messages',
          fromChatIntent: true,
          listingId: listing.id
        }
      });
      return;
    }

    setStartingChat(true);
    try {
      const convRes = await api.startMarketplaceConversation(listing.id);
      const conv = convRes.conversation;
      if (text) {
        await api.sendMarketplaceMessage(conv.id, { body: text });
      }
      navigate(`/panel/marketplace?tab=messages&convId=${conv.id}`);
    } catch (err: any) {
      alert(err.message || 'Error al iniciar la conversación.');
    } finally {
      setStartingChat(false);
    }
  };

  const handleSubmitOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      saveGuestChatIntent({
        listingId: listing.id,
        listingSlug: listing.slug,
        listingTitle: listing.title,
        sellerId: listing.seller_id,
        sellerName: listing?.seller?.display_name || listing?.seller_name || 'DoorDrop Seller',
        message: `Propuesta de oferta: ${offerAmount} ${listing.currency}${offerMessage ? ` — "${offerMessage}"` : ''}`,
      });
      navigate('/auth/register', {
        state: {
          from: '/panel/marketplace?tab=messages',
          fromChatIntent: true,
          listingId: listing.id
        }
      });
      return;
    }
    setSubmittingOffer(true);
    try {
      await api.createMarketplaceOffer({
        listingId: listing.id,
        amount: Number(offerAmount),
        message: offerMessage
      });
      setOfferSuccess(true);
      setTimeout(() => {
        setShowOffer(false);
        setOfferSuccess(false);
        navigate('/panel/marketplace?tab=offers');
      }, 1500);
    } catch (err: any) {
      alert(err.message || 'No se pudo enviar la oferta.');
    } finally {
      setSubmittingOffer(false);
    }
  };

  const handleExecutePurchase = async () => {
    if (!buyerName || !buyerAddress || !destZip || !destCity) {
      setPurchaseError('Por favor completa todos los campos de entrega.');
      return;
    }
    setPurchasing(true);
    setPurchaseError('');

    try {
      const res = await api.createMarketplaceOrder({
        listingId: listing.id,
        offerId: acceptedOffer?.id || undefined,
        shippingPrice: selectedQuote ? selectedQuote.price : 0,
        shippingServiceName: selectedQuote ? selectedQuote.serviceName : 'Envío estándar',
        shippingProviderCode: selectedQuote ? selectedQuote.carrier : 'DoorDrop',
        quoteId: selectedQuote?.id,
        buyerAddress: {
          fullName: buyerName,
          phone: buyerPhone,
          address: buyerAddress,
          city: destCity,
          zipCode: destZip,
          country: destCountry
        },
        paymentMethod
      });

      if (res?.pending && res?.checkoutUrl) {
        window.location.assign(res.checkoutUrl);
        return;
      }
      setPurchaseSuccess(res.order);
    } catch (err: any) {
      setPurchaseError(err.message || 'No se pudo procesar la compra.');
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-dark-950 flex items-center justify-center p-4">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-dark-950 flex flex-col items-center justify-center p-4 text-center">
        <Package className="w-16 h-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-black text-slate-800 dark:text-white mb-2">Producto no disponible</h2>
        <p className="text-slate-500 text-sm mb-6">Esta publicación ha sido vendida o ya no está disponible en el marketplace.</p>
        <Link to="/marketplace" className="px-5 py-2.5 rounded-full bg-blue-600 text-white font-bold text-sm">
          Volver al Marketplace
        </Link>
      </div>
    );
  }

  // A missing original image must remain visible as missing; a stock image
  // would misrepresent the product and hide a provider/catalogue problem.
  const images = listing.images && listing.images.length > 0 ? listing.images : [];
  const currentImg = images[selectedImgIndex]?.url || null;
  const originalPrice = (listing.price_minor / 100).toFixed(2);
  const negotiatedOffer = acceptedOffer?.status === 'accepted'
    && String(acceptedOffer.listing_id) === String(listing.id)
    ? acceptedOffer
    : null;
  const price = ((negotiatedOffer?.amount_minor || listing.price_minor) / 100).toFixed(2);
  const seller = listing.seller;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-950 font-sans text-slate-800 dark:text-slate-100 flex flex-col">
      {/* Global Header */}
      <GlobalHeader />

      {/* Top Breadcrumb Header */}
      <header className="bg-white dark:bg-dark-900 border-b border-slate-200 dark:border-slate-800 py-3.5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Link to="/marketplace" className="hover:text-blue-600 flex items-center gap-1">
              <Store className="w-3.5 h-3.5" />
              <span>Marketplace</span>
            </Link>
            <span>/</span>
            {listing.category && (
              <>
                <Link to={`/marketplace?categoria=${listing.category.slug}`} className="hover:text-blue-600">
                  {listing.category.name}
                </Link>
                <span>/</span>
              </>
            )}
            <span className="text-slate-800 dark:text-white truncate max-w-[200px]">{listing.title}</span>
          </div>

          <Link to="/marketplace" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline">
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>{language === 'it' ? 'Torna ai risultati' : 'Volver a resultados'}</span>
          </Link>
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Image Gallery */}
          <div className="lg:col-span-7 space-y-4">
            {/* Main Stage Image */}
            <div className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-center">
              {currentImg ? (
                <img
                  src={currentImg}
                  alt={listing.title}
                  className="w-full h-full object-contain max-h-[500px]"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
                  <Package className="w-16 h-16" aria-hidden="true" />
                  <span className="text-sm font-semibold">Imagen original no disponible</span>
                </div>
              )}

              {/* Prev / Next controls if multiple images */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setSelectedImgIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-dark-800/80 hover:bg-white text-slate-800 dark:text-white shadow-md backdrop-blur-sm"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setSelectedImgIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-dark-800/80 hover:bg-white text-slate-800 dark:text-white shadow-md backdrop-blur-sm"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}

              {/* Badges */}
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-600 text-white shadow-md">
                  {listing?.description?.includes('MH-') ? (language === 'it' ? 'Spedizione Diretta Fornitore' : 'Envío Directo Proveedor') : (language === 'it' ? 'Spedizione Disponibile' : 'Envío Disponible')}
                </span>
              </div>
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {images.map((img: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImgIndex(idx)}
                    className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 transition-all shrink-0 ${
                      selectedImgIndex === idx
                        ? 'border-blue-600 ring-2 ring-blue-500/30'
                        : 'border-slate-200 dark:border-slate-800 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Description Card */}
            <div className="bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-4">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Descripción del producto</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                {listing.description}
              </p>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block font-medium">{language === 'it' ? 'Condizione' : 'Estado'}</span>
                  <span className="font-bold capitalize">{listing.condition}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">{language === 'it' ? 'Posizione' : 'Ubicación'}</span>
                  <span className="font-bold">{listing.city}, {listing.country_code}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">{language === 'it' ? 'Peso stimato' : 'Peso estimado'}</span>
                  <span className="font-bold">{listing.weight_grams ? `${listing.weight_grams} g` : '1.0 kg'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">{language === 'it' ? 'Dimensioni' : 'Dimensiones'}</span>
                  <span className="font-bold">{listing.length_cm || 20}×{listing.width_cm || 15}×{listing.height_cm || 10} cm</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Buying Box & Shipping Calculator */}
          <div className="lg:col-span-5 space-y-6">
            {/* Price & Main Buy Card */}
            <div className="bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                    {price} {listing.currency}
                  </span>
                  {listing.negotiable === 1 && (
                    <span className="ml-2 inline-block px-2 py-0.5 rounded text-xs font-bold text-amber-700 bg-amber-100 dark:bg-amber-950/60">
                      Precio negociable
                    </span>
                  )}
                </div>
                <button
                  onClick={toggleFav}
                  className={`p-3 rounded-full border transition-all ${
                    isFavorite
                      ? 'border-rose-200 bg-rose-50 text-rose-600 dark:bg-rose-950/40'
                      : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
                </button>
              </div>

              <h1 className="text-xl font-black text-slate-900 dark:text-white leading-snug">
                {listing.title}
              </h1>

              {negotiatedOffer && (
                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-200">
                  <strong>{language === 'it' ? 'Offerta accettata dal venditore.' : 'Oferta aceptada por el vendedor.'}</strong>
                  <span className="block mt-1">
                    {language === 'it' ? 'Il prezzo concordato è applicato a questo acquisto.' : 'El precio acordado se aplicará a esta compra.'}
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                <button
                  onClick={() => setShowCheckout(true)}
                  className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <Truck className="w-5 h-5" />
                  <span>{language === 'it' ? 'Acquista ora' : 'Comprar ahora'}</span>
                </button>

                <div className="grid grid-cols-2 gap-2.5">
                  {listing.negotiable === 1 && (
                    <button
                      onClick={() => setShowOffer(true)}
                      className="py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-blue-500 font-bold text-xs text-slate-700 dark:text-slate-200 hover:bg-blue-50/50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5"
                    >
                      <DollarSign className="w-4 h-4 text-blue-600" />
                      <span>{language === 'it' ? 'Fai un\'offerta' : 'Hacer oferta'}</span>
                    </button>
                  )}
                  <button
                    onClick={handleStartChat}
                    className="py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-blue-500 font-bold text-xs text-slate-700 dark:text-slate-200 hover:bg-blue-50/50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5"
                  >
                    <MessageCircle className="w-4 h-4 text-blue-600" />
                    <span>{language === 'it' ? 'Chiedi al venditore' : 'Preguntar al vendedor'}</span>
                  </button>
                </div>
              </div>

              {/* Protection Banner */}
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="text-xs text-emerald-800 dark:text-emerald-300">
                  <span className="font-bold block">{language === 'it' ? 'Protezione Acquirente DoorDrop' : 'Protección al comprador DoorDrop'}</span>
                  <span>{language === 'it' ? 'Pagamento trattenuto in modo sicuro fino alla ricezione e verifica del pacco.' : 'Pago retenido con seguridad hasta que recibes y verificas tu paquete.'}</span>
                </div>
              </div>
            </div>

            {/* LIVE SHIPPING CALCULATOR / DIRECT SUPPLIER DELIVERY */}
            <div className="bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-blue-600" />
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {listing?.description?.includes('MH-')
                      ? (language === 'it' ? 'Spedizione Diretta dal Fornitore' : 'Envío Directo del Proveedor')
                      : (language === 'it' ? 'Calcolatore di Spedizione' : 'Cotizador de envío')}
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-slate-400">
                  {listing?.description?.includes('MH-')
                    ? (language === 'it' ? 'Tariffe API Fornitore' : 'Tarifas API Proveedor')
                    : (language === 'it' ? 'Tariffe in tempo reale' : 'Tarifas en tiempo real')}
                </span>
              </div>

              <ShippingTermsConsent onAcceptedChange={setShippingTermsAccepted} />

              {/* Destination inputs */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="col-span-1">
                  <label className="text-slate-400 block mb-1 font-medium">{language === 'it' ? 'Paese' : 'País'}</label>
                  <select
                    value={destCountry}
                    onChange={e => setDestCountry(e.target.value)}
                    className="w-full p-2 bg-slate-100 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  >
                    <option value="IT">🇮🇹 Italia</option>
                    <option value="ES">🇪🇸 España</option>
                    <option value="DE">🇩🇪 Alemania</option>
                    <option value="GB">🇬🇧 Reino Unido</option>
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="text-slate-400 block mb-1 font-medium">{language === 'it' ? 'Codice Postale' : 'Código Postal'}</label>
                  <input
                    type="text"
                    value={destZip}
                    onChange={e => setDestZip(e.target.value)}
                    placeholder={destCountry === 'IT' ? '20121' : '28001'}
                    className="w-full p-2 bg-slate-100 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>
                <div className="col-span-1 flex items-end">
                  <button
                    onClick={calculateShipping}
                    disabled={quoting || !shippingTermsAccepted}
                    className="w-full py-2 bg-slate-900 dark:bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    {quoting ? '...' : (language === 'it' ? 'Calcola' : 'Cotizar')}
                  </button>
                </div>
              </div>

              {/* Quotes Options List */}
              {quotes.length > 0 ? (
                <div className="space-y-2 pt-2">
                  {quotes.map((q) => {
                    const isSelected = selectedQuote?.id === q.id;
                    return (
                      <div
                        key={q.id}
                        onClick={() => setSelectedQuote(q)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 ring-1 ring-blue-600'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{q.carrier}</span>
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-100 dark:bg-blue-950 px-1.5 py-0.2 rounded">
                              {q.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">{q.serviceName} • Entrega: {q.deliveryTime}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-black text-slate-900 dark:text-white">
                            {q.price.toFixed(2)} {q.currency}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-2">
                  Introduce tu código postal para ver las agencias de transporte y tarifas exactas.
                </p>
              )}
            </div>

            {/* Seller Info Card */}
            {seller && (
              <div className="bg-white dark:bg-dark-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-sm">
                    {seller.display_name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{seller.display_name}</h4>
                      {seller.verification_level === 'verified' && (
                        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" title="Vendedor Verificado" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      ★ {seller.avg_rating > 0 ? seller.avg_rating.toFixed(1) : 'Nuevo'} ({seller.total_sales} ventas)
                    </p>
                  </div>
                  {seller.slug && (
                    <Link
                      to={`/marketplace/vendedor/${seller.slug}`}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-slate-50"
                    >
                      Ver perfil
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* CHECKOUT MODAL */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-900 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Finalizar compra con DoorDrop</h3>
              <button onClick={() => setShowCheckout(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>

            {purchaseSuccess ? (
              <div className="text-center py-6 space-y-3">
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                <h4 className="text-xl font-black text-slate-900 dark:text-white">¡Compra realizada con éxito!</h4>
                <p className="text-sm text-slate-500">
                  Número de pedido: <span className="font-bold text-slate-900 dark:text-white">{purchaseSuccess.order_number}</span>
                </p>
                <p className="text-xs text-slate-400">
                  El vendedor recibirá la notificación y preparará el envío con DoorDrop. Puedes seguir el estado desde tu panel.
                </p>
                <div className="pt-4 flex gap-3 justify-center">
                  <button
                    onClick={() => navigate('/panel/marketplace?tab=orders')}
                    className="px-6 py-2.5 rounded-full bg-blue-600 text-white font-bold text-xs"
                  >
                    Ver mis pedidos
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {/* Product Summary */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-dark-800 flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-slate-900 dark:text-white line-clamp-1">{listing.title}</h5>
                    <p className="text-slate-400">Transporte: {selectedQuote?.carrier || 'DoorDrop Estándar'}</p>
                  </div>
                  <span className="font-black text-sm">{price} {listing.currency}</span>
                </div>

                {/* Shipping address form */}
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-700 dark:text-slate-200">Dirección de entrega</h4>
                  <div>
                    <label className="block text-slate-400 mb-1">Nombre completo del destinatario</label>
                    <input
                      type="text"
                      value={buyerName}
                      onChange={e => setBuyerName(e.target.value)}
                      placeholder="Ej. Mario Rossi"
                      className="w-full p-2.5 bg-slate-100 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                  <div className={`grid ${paypalAvailable ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                    <div>
                      <label className="block text-slate-400 mb-1">Teléfono</label>
                      <input
                        type="text"
                        value={buyerPhone}
                        onChange={e => setBuyerPhone(e.target.value)}
                        placeholder="+39 340 0000000"
                        className="w-full p-2.5 bg-slate-100 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Ciudad</label>
                      <input
                        type="text"
                        value={destCity}
                        onChange={e => setDestCity(e.target.value)}
                        placeholder="Roma"
                        className="w-full p-2.5 bg-slate-100 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Dirección completa y número</label>
                    <input
                      type="text"
                      value={buyerAddress}
                      onChange={e => setBuyerAddress(e.target.value)}
                      placeholder="Via del Corso 12, Piano 3"
                      className="w-full p-2.5 bg-slate-100 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                </div>

                {/* Payment method selector */}
                <div className="space-y-2 pt-2">
                  <h4 className="font-bold text-slate-700 dark:text-slate-200">Método de pago</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('wallet')}
                      className={`p-3 rounded-xl border flex items-center gap-2 font-bold ${
                        paymentMethod === 'wallet'
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      <Wallet className="w-4 h-4" />
                      <span>Billetera DoorDrop</span>
                    </button>
                    {paypalAvailable && (
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('paypal')}
                        className={`p-3 rounded-xl border flex items-center gap-2 font-bold ${
                          paymentMethod === 'paypal'
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700'
                            : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        <CreditCard className="w-4 h-4" />
                        <span>PayPal / Tarjeta</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Pricing totals breakdown */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-dark-800 space-y-1.5 pt-3">
                  <div className="flex justify-between text-slate-500">
                    <span>Producto</span>
                    <span>{price} {listing.currency}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Envío DoorDrop ({selectedQuote?.carrier || 'Estándar'})</span>
                    <span>{selectedQuote ? selectedQuote.price.toFixed(2) : '0.00'} {listing.currency}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Protección al comprador (2%)</span>
                    <span>{((listing.price_minor * 0.02) / 100).toFixed(2)} {listing.currency}</span>
                  </div>
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between font-black text-sm text-slate-900 dark:text-white">
                    <span>Total a pagar</span>
                    <span>
                      {(
                        Number(price) +
                        (selectedQuote ? selectedQuote.price : 0) +
                        Number(((listing.price_minor * 0.02) / 100).toFixed(2))
                      ).toFixed(2)}{' '}
                      {listing.currency}
                    </span>
                  </div>
                </div>

                {purchaseError && (
                  <p className="p-3 rounded-xl bg-rose-50 text-rose-600 text-xs font-semibold">{purchaseError}</p>
                )}

                <button
                  onClick={handleExecutePurchase}
                  disabled={purchasing}
                  className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-2"
                >
                  {purchasing ? 'Procesando pago seguro...' : 'Confirmar y Pagar'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OFFER MODAL */}
      {showOffer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-900 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Hacer una oferta</h3>
              <button onClick={() => setShowOffer(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>

            {offerSuccess ? (
              <div className="text-center py-6 space-y-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <h4 className="text-base font-black">¡Oferta enviada al vendedor!</h4>
                <p className="text-xs text-slate-400">Recibirás una notificación cuando el vendedor responda.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitOffer} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Precio original: {originalPrice} {listing.currency}</label>
                  <input
                    type="number"
                    step="0.5"
                    value={offerAmount}
                    onChange={e => setOfferAmount(e.target.value)}
                    placeholder={`Tu oferta en ${listing.currency}`}
                    required
                    className="w-full p-3 bg-slate-100 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl font-black text-base"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Mensaje para el vendedor (opcional)</label>
                  <textarea
                    value={offerMessage}
                    onChange={e => setOfferMessage(e.target.value)}
                    placeholder="Ej. Me interesa mucho, ¿podríamos cerrar el trato hoy?"
                    rows={3}
                    className="w-full p-2.5 bg-slate-100 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingOffer}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all"
                >
                  {submittingOffer ? 'Enviando oferta...' : 'Enviar oferta al vendedor'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      
      {/* CHAT WITH SELLER MODAL WITH COOKIE TOKEN PRESERVATION */}
      {showChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-dark-900 w-full max-w-lg rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <MessageCircle className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white">
                  {language === 'it' ? 'Invia un messaggio al venditore' : 'Enviar mensaje al vendedor'}
                </h3>
              </div>
              <button
                onClick={() => setShowChatModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Product snippet */}
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-dark-800 border border-slate-200/60 dark:border-slate-700">
              {listing.images?.[0]?.url ? (
                <img
                  src={listing.images[0].url}
                  alt=""
                  className="w-12 h-12 rounded-xl object-cover border shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl border shrink-0 flex items-center justify-center text-slate-400">
                  <Package className="w-5 h-5" aria-hidden="true" />
                </div>
              )}
              <div className="flex-1 min-w-0 text-xs">
                <h4 className="font-bold text-slate-900 dark:text-white truncate">{listing.title}</h4>
                <p className="text-slate-400">
                  {language === 'it' ? 'Venditore' : 'Vendedor'}: <strong className="text-slate-700 dark:text-slate-300">{listing?.seller?.display_name || listing?.seller_name || 'DoorDrop Seller'}</strong>
                </p>
              </div>
            </div>

            {/* Message textarea */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {language === 'it' ? 'Il tuo messaggio o domanda *' : 'Tu mensaje o pregunta *'}
              </label>
              <textarea
                rows={3}
                value={chatMessageText}
                onChange={e => setChatMessageText(e.target.value)}
                placeholder={language === 'it' ? 'Scrivi la tua domanda al venditore...' : 'Escribe tu pregunta...'}
                className="w-full p-3 bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Quick suggestions */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none text-[11px]">
              {[
                language === 'it' ? 'È ancora disponibile?' : '¿Sigue disponible?',
                language === 'it' ? 'Il prezzo è trattabile?' : '¿Es negociable?',
                language === 'it' ? 'Spedite oggi?' : '¿Pueden enviar hoy?'
              ].map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setChatMessageText(sug)}
                  className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-dark-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-600 dark:text-slate-300 text-[11px] whitespace-nowrap font-medium"
                >
                  {sug}
                </button>
              ))}
            </div>

            {/* Guest cookie reminder banner */}
            {!isLoggedIn && (
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">
                    {language === 'it' ? 'Salvataggio automatico tramite Cookie' : 'Guardado automático en Cookie'}
                  </span>
                  <span>
                    {language === 'it'
                      ? 'Memorizzeremo il tuo messaggio nei cookie sicuri: subito dopo la registrazione o il login verrai portato direttamente nella chat attiva con il venditore!'
                      : 'Guardaremos tu mensaje en una cookie segura: en cuanto te registres o inicies sesión te llevaremos directamente al chat activo con el vendedor.'}
                  </span>
                </div>
              </div>
            )}

            <div className="pt-2 flex gap-2">
              <button
                onClick={handleSendOrSaveChat}
                disabled={startingChat || !chatMessageText.trim()}
                className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {startingChat ? (
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>
                  {isLoggedIn
                    ? (language === 'it' ? 'Invia messaggio ora' : 'Enviar mensaje ahora')
                    : (language === 'it' ? 'Salva messaggio e Registrati / Accedi' : 'Guardar mensaje y Registrarme / Acceder')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Footer */}
      <GlobalFooter />
    </div>
  );
}
