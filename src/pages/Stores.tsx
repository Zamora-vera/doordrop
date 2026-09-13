import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Store, ExternalLink, CheckCircle2, ShoppingBag, ShoppingCart, RefreshCw, AlertTriangle, PackageCheck, Truck, Link2, Search, Pencil, X, Save, Send } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';

const PLATFORM_CARDS = [
  { name: 'Shopify', hint: 'Pedidos, clientes y direcciones.', icon: ShoppingBag, className: 'from-emerald-500 to-lime-500' },
  { name: 'WooCommerce', hint: 'Tiendas WordPress conectadas.', icon: ShoppingCart, className: 'from-purple-600 to-fuchsia-500' },
  { name: 'PrestaShop', hint: 'Ventas europeas y multitienda.', icon: Store, className: 'from-cyan-500 to-blue-600' },
  { name: 'Wix', hint: 'Órdenes listas para enviar.', icon: ShoppingBag, className: 'from-slate-800 to-slate-600' },
  { name: 'Mercado Libre', hint: 'Marketplace y ecommerce.', icon: PackageCheck, className: 'from-yellow-400 to-amber-500' },
  { name: 'Amazon / eBay', hint: 'Alto volumen y seguimiento.', icon: Truck, className: 'from-orange-500 to-red-500' },
];

const emptyAddress = {
  name: '', phone: '', email: '', address1: '', address2: '', city: '', state: '', postalCode: '', country: ''
};

const STORES_COPY: Record<string, any> = {
  es: {
    eyebrow: 'Tiendas ecommerce', title: 'Conecta tu tienda y crea etiquetas', subtitle: '{c.subtitle}',
    refresh: 'Actualizar', connectStore: 'Conectar tienda', connectedOk: 'Tienda conectada correctamente. Ya puedes sincronizar pedidos.', retry: 'No fue posible conectar la tienda. Intenta nuevamente.',
    preparingConnection: 'No se pudo preparar la conexión.', synced: 'Pedidos sincronizados correctamente.', syncFailed: 'No fue posible sincronizar los pedidos.', pauseConfirm: '¿Deseas pausar esta tienda? Podrás conectarla nuevamente cuando quieras.', paused: 'Tienda pausada correctamente.', pauseFailed: 'No se pudo pausar la tienda.',
    reviewAddress: 'Revisa la dirección antes de crear el envío.', shipmentPrepFailed: 'No se pudo preparar el envío.', trackingUpdated: 'Tracking actualizado en la tienda.', trackingFailed: 'No fue posible actualizar el tracking en la tienda.', addressSaved: 'Dirección guardada correctamente.', addressSaveFailed: 'No se pudo guardar la dirección.',
    importedOrders: 'Pedidos importados', importedHint: 'Listos para cotizar y generar label.', addressAlerts: 'Direcciones por revisar', addressHint: 'Evita retrasos antes de comprar etiquetas.', shipmentsCreated: 'Envíos creados', shipmentsHint: 'Pedidos vinculados a DoorDrop.',
    oneConnection: 'Una conexión, muchas plataformas', oneConnectionDesc: '{c.oneConnectionDesc}', step: 'Paso', steps: ['Conectar tienda', 'Sincronizar pedidos', 'Crear label y devolver tracking'],
    connectedStores: 'Tiendas conectadas', connectedStoresDesc: 'Administra canales y sincronización.', noStores: 'No hay tiendas conectadas todavía.', firstStore: 'Conectar primera tienda', loadingStores: 'Cargando tiendas...', connected: 'Conectada', pausedLabel: 'Pausada', orders: 'Pedidos', alerts: 'Alertas', shipments: 'Envíos',
    ecommerceOrders: 'Pedidos ecommerce', ecommerceOrdersDesc: 'Crea envíos sólo cuando la dirección esté lista.', all: 'Todos', needsReview: 'Por revisar', ready: 'Listos', sync: 'Sincronizar', pause: 'Pausar', selectStore: 'Selecciona o conecta una tienda para ver pedidos.', loadingOrders: 'Cargando pedidos...', noOrders: 'No hay pedidos para mostrar.', noOrdersDesc: 'Sincroniza la tienda para importar pedidos recientes.',
    addressPending: 'Dirección pendiente', cityPending: 'Ciudad pendiente', countryPending: 'País pendiente', customer: 'Cliente', addressReview: 'Revisar dirección', readyLabel: 'Lista', shipmentCreated: 'Envío creado', address: 'Dirección', createShipment: 'Crear envío', tracking: 'Tracking', fixAddress: 'Corregir dirección', fixAddressDesc: 'Completa los datos para preparar el envío sin retrasos.', cancel: 'Cancelar', saveAddress: 'Guardar dirección',
    fields: { name: 'Destinatario', phone: 'Teléfono', email: 'Correo', address1: 'Dirección', address2: 'Apartamento / referencia', city: 'Ciudad', state: 'Provincia / estado', postalCode: 'Código postal', country: 'País ISO, ejemplo IT' }, connect: 'Conectar'
  },
  en: { title: 'Connect your store and create labels', subtitle: 'Import orders from your sales channels, review addresses and prepare shipments with the same DoorDrop professional flow.', refresh: 'Refresh', connectStore: 'Connect store', retry: 'We could not connect the store. Please try again.', connectedOk: 'Store connected successfully. You can now sync orders.', importedOrders: 'Imported orders', addressAlerts: 'Addresses to review', shipmentsCreated: 'Shipments created', oneConnection: 'One connection, many platforms', oneConnectionDesc: 'Customers connect their store from the panel. DoorDrop imports orders, validates shipping data and creates labels with your active providers.', connectedStores: 'Connected stores', noStores: 'No connected stores yet.', ecommerceOrders: 'E-commerce orders', noOrders: 'No orders to show.', noOrdersDesc: 'Sync the store to import recent orders.', sync: 'Sync', pause: 'Pause', connect: 'Connect', addressReview: 'Review address', readyLabel: 'Ready', shipmentCreated: 'Shipment created', address: 'Address', createShipment: 'Create shipment', tracking: 'Tracking', fixAddress: 'Correct address', cancel: 'Cancel', saveAddress: 'Save address' },
  it: { title: 'Collega il negozio e crea etichette', subtitle: 'Importa ordini dai canali di vendita, verifica gli indirizzi e prepara spedizioni con il flusso professionale di DoorDrop.', refresh: 'Aggiorna', connectStore: 'Collega negozio', retry: 'Non è stato possibile collegare il negozio. Riprova.', connectedOk: 'Negozio collegato correttamente. Ora puoi sincronizzare gli ordini.', importedOrders: 'Ordini importati', addressAlerts: 'Indirizzi da verificare', shipmentsCreated: 'Spedizioni create', oneConnection: 'Una connessione, molte piattaforme', oneConnectionDesc: 'Il cliente collega gratis il negozio dal pannello. DoorDrop importa gli ordini, verifica gli indirizzi e crea etichette con i provider attivi.', connectedStores: 'Negozi collegati', noStores: 'Non ci sono negozi collegati.', ecommerceOrders: 'Ordini ecommerce', noOrders: 'Non ci sono ordini da mostrare.', noOrdersDesc: 'Sincronizza il negozio per importare gli ordini recenti.', sync: 'Sincronizza', pause: 'Pausa', connect: 'Collega', addressReview: 'Verifica indirizzo', readyLabel: 'Pronto', shipmentCreated: 'Spedizione creata', address: 'Indirizzo', createShipment: 'Crea spedizione', tracking: 'Tracking', fixAddress: 'Correggi indirizzo', cancel: 'Annulla', saveAddress: 'Salva indirizzo' },
  fr: { title: 'Connectez votre boutique et créez des étiquettes', subtitle: 'Importez les commandes, vérifiez les adresses et préparez les envois avec le flux professionnel DoorDrop.', refresh: 'Actualiser', connectStore: 'Connecter la boutique', retry: 'Impossible de connecter la boutique. Réessayez.', connectedOk: 'Boutique connectée correctement. Vous pouvez synchroniser les commandes.', importedOrders: 'Commandes importées', addressAlerts: 'Adresses à vérifier', shipmentsCreated: 'Envois créés', oneConnection: 'Une connexion, plusieurs plateformes', connectedStores: 'Boutiques connectées', noStores: 'Aucune boutique connectée.', ecommerceOrders: 'Commandes ecommerce', noOrders: 'Aucune commande à afficher.', sync: 'Synchroniser', pause: 'Mettre en pause', connect: 'Connecter', addressReview: 'Vérifier adresse', readyLabel: 'Prête', createShipment: 'Créer envoi', tracking: 'Suivi', fixAddress: 'Corriger adresse', cancel: 'Annuler', saveAddress: 'Enregistrer adresse' },
  de: { title: 'Shop verbinden und Labels erstellen', subtitle: 'Importiere Bestellungen, prüfe Adressen und erstelle Sendungen mit DoorDrop.', refresh: 'Aktualisieren', connectStore: 'Shop verbinden', retry: 'Der Shop konnte nicht verbunden werden. Bitte erneut versuchen.', connectedOk: 'Shop erfolgreich verbunden. Bestellungen können synchronisiert werden.', importedOrders: 'Importierte Bestellungen', addressAlerts: 'Adressen prüfen', shipmentsCreated: 'Erstellte Sendungen', oneConnection: 'Eine Verbindung, viele Plattformen', connectedStores: 'Verbundene Shops', noStores: 'Noch keine Shops verbunden.', ecommerceOrders: 'E-Commerce-Bestellungen', noOrders: 'Keine Bestellungen vorhanden.', sync: 'Synchronisieren', pause: 'Pausieren', connect: 'Verbinden', addressReview: 'Adresse prüfen', readyLabel: 'Bereit', createShipment: 'Sendung erstellen', tracking: 'Tracking', fixAddress: 'Adresse korrigieren', cancel: 'Abbrechen', saveAddress: 'Adresse speichern' },
  zh: { title: '连接店铺并创建面单', subtitle: '导入销售渠道订单、检查地址并使用 DoorDrop 流程准备发货。', refresh: '刷新', connectStore: '连接店铺', retry: '无法连接店铺，请重试。', connectedOk: '店铺连接成功。现在可以同步订单。', importedOrders: '已导入订单', addressAlerts: '待检查地址', shipmentsCreated: '已创建运单', oneConnection: '一个连接，多种平台', connectedStores: '已连接店铺', noStores: '暂无已连接店铺。', ecommerceOrders: '电商订单', noOrders: '暂无订单。', sync: '同步', pause: '暂停', connect: '连接', addressReview: '检查地址', readyLabel: '就绪', createShipment: '创建运单', tracking: '追踪', fixAddress: '修正地址', cancel: '取消', saveAddress: '保存地址' },
  ht: { title: 'Konekte boutik ou epi kreye etikèt', subtitle: 'Enpòte kòmand, verifye adrès yo epi prepare anvwa ak DoorDrop.', refresh: 'Mizajou', connectStore: 'Konekte boutik', retry: 'Nou pa t kapab konekte boutik la. Eseye ankò.', connectedOk: 'Boutik la konekte kòrèkteman. Ou ka senkronize kòmand yo.', importedOrders: 'Kòmand enpòte', addressAlerts: 'Adrès pou verifye', shipmentsCreated: 'Anvwa kreye', oneConnection: 'Yon koneksyon, anpil platfòm', connectedStores: 'Boutik konekte', noStores: 'Pa gen boutik konekte ankò.', ecommerceOrders: 'Kòmand ecommerce', noOrders: 'Pa gen kòmand pou montre.', sync: 'Senkronize', pause: 'Poze', connect: 'Konekte', addressReview: 'Verifye adrès', readyLabel: 'Pare', createShipment: 'Kreye anvwa', tracking: 'Swivi', fixAddress: 'Korije adrès', cancel: 'Anile', saveAddress: 'Sove adrès' }
};

const getStoresCopy = (language: string) => ({ ...STORES_COPY.es, ...(STORES_COPY[language] || STORES_COPY[String(language || '').slice(0, 2)] || {}) });

export const Stores = () => {
  const { language } = useI18n();
  const c = getStoresCopy(language);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState('');
  const [orderFilter, setOrderFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const [addressOrder, setAddressOrder] = useState<any>(null);
  const [addressForm, setAddressForm] = useState<any>(emptyAddress);

  const selectedStore = stores.find((store) => store.id === selectedStoreId) || stores[0];

  const loadStores = async () => {
    setLoading(true);
    try {
      const res = await api.getStores();
      const list = res.stores || [];
      setStores(list);
      if (!selectedStoreId && list.length) setSelectedStoreId(list[0].id);
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async (storeId = selectedStoreId, filter = orderFilter) => {
    if (!storeId) return;
    setOrdersLoading(true);
    try {
      const res = await api.getStoreOrders(storeId, filter === 'all' ? '' : filter);
      setOrders(res.orders || []);
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => { loadStores(); }, []);

  useEffect(() => {
    if (searchParams.get('connected') === '1') setNotice(c.connectedOk);
    if (searchParams.get('status') === 'retry') setNotice(c.retry);
  }, [searchParams]);

  useEffect(() => {
    if (selectedStoreId) loadOrders(selectedStoreId, orderFilter);
  }, [selectedStoreId, orderFilter]);

  const connectEcart = async () => {
    setConnecting(true);
    setNotice('');
    try {
      const res = await api.getEcartConnectUrl();
      window.location.href = res.url;
    } catch (e: any) {
      setNotice(e.message || c.preparingConnection);
      setConnecting(false);
    }
  };

  const syncStore = async (storeId: string) => {
    setSyncing(storeId);
    setNotice('');
    try {
      const res = await api.syncStoreOrders(storeId, 150);
      setNotice(res.message || c.synced);
      await loadStores();
      await loadOrders(storeId, orderFilter);
    } catch (e: any) {
      setNotice(e.message || c.syncFailed);
    } finally {
      setSyncing('');
    }
  };

  const disconnectStore = async (storeId: string) => {
    const ok = window.confirm(c.pauseConfirm);
    if (!ok) return;
    try {
      await api.disconnectStore(storeId);
      setNotice(c.paused);
      await loadStores();
    } catch (e: any) {
      setNotice(e.message || c.pauseFailed);
    }
  };

  const createShipmentFromOrder = async (order: any) => {
    if (order.addressQuality === 'needs_review') {
      openAddressEditor(order);
      setNotice(c.reviewAddress);
      return;
    }
    try {
      const res = await api.getStoreOrderPrefill(order.id);
      navigate('/panel/quote', { state: { prefill: res.prefill } });
    } catch (e: any) {
      setNotice(e.message || c.shipmentPrepFailed);
    }
  };

  const pushFulfillment = async (order: any) => {
    try {
      const res = await api.pushStoreOrderFulfillment(order.id);
      setNotice(res.message || c.trackingUpdated);
      await loadOrders(selectedStoreId, orderFilter);
    } catch (e: any) {
      setNotice(e.message || c.trackingFailed);
    }
  };

  const openAddressEditor = (order: any) => {
    setAddressOrder(order);
    setAddressForm({
      name: order.shipping?.name || order.customerName || '',
      phone: order.shipping?.phone || order.customerPhone || '',
      email: order.customerEmail || '',
      address1: order.shipping?.address1 || '',
      address2: order.shipping?.address2 || '',
      city: order.shipping?.city || '',
      state: order.shipping?.state || '',
      postalCode: order.shipping?.postalCode || '',
      country: order.shipping?.country || ''
    });
  };

  const saveAddress = async () => {
    if (!addressOrder) return;
    try {
      const res = await api.updateStoreOrderAddress(addressOrder.id, addressForm);
      setNotice(res.message || c.addressSaved);
      setAddressOrder(null);
      await loadOrders(selectedStoreId, orderFilter);
      await loadStores();
    } catch (e: any) {
      setNotice(e.message || c.addressSaveFailed);
    }
  };

  const totals = stores.reduce((acc, store) => ({
    orders: acc.orders + Number(store.ordersCount || 0),
    alerts: acc.alerts + Number(store.addressAlerts || 0),
    shipments: acc.shipments + Number(store.shipmentsCount || 0),
  }), { orders: 0, alerts: 0, shipments: 0 });

  return (
    <div className="py-2 md:py-4 space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600 dark:text-neon-cyan">{c.eyebrow}</p>
          <h1 className="font-display text-3xl md:text-4xl font-black text-gray-900 dark:text-white mt-2">{c.title}</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-3 max-w-3xl">
            {c.subtitle}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={loadStores} className="px-4 py-2.5 rounded-xl bg-white dark:bg-dark-900 border border-gray-200 dark:border-gray-800 font-bold flex items-center gap-2 text-gray-700 dark:text-gray-200">
            <RefreshCw className="w-4 h-4" /> {c.refresh}
          </button>
          <button onClick={connectEcart} disabled={connecting} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-700 disabled:bg-gray-300 flex items-center gap-2">
            {connecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />} {c.connectStore}
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 p-4 text-sm font-bold text-blue-800 dark:text-blue-200">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-5 border border-gray-200 dark:border-gray-800">
          <p className="text-xs font-black uppercase tracking-wider text-gray-400">{c.importedOrders}</p>
          <p className="text-3xl font-black text-gray-900 dark:text-white mt-2">{totals.orders}</p>
          <p className="text-xs text-gray-500 mt-1">{c.importedHint}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-gray-200 dark:border-gray-800">
          <p className="text-xs font-black uppercase tracking-wider text-gray-400">{c.addressAlerts}</p>
          <p className={`text-3xl font-black mt-2 ${totals.alerts ? 'text-amber-600' : 'text-emerald-600'}`}>{totals.alerts}</p>
          <p className="text-xs text-gray-500 mt-1">{c.addressHint}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-gray-200 dark:border-gray-800">
          <p className="text-xs font-black uppercase tracking-wider text-gray-400">{c.shipmentsCreated}</p>
          <p className="text-3xl font-black text-gray-900 dark:text-white mt-2">{totals.shipments}</p>
          <p className="text-xs text-gray-500 mt-1">{c.shipmentsHint}</p>
        </div>
      </div>

      <div className="bg-gradient-to-br from-slate-900 to-blue-950 rounded-3xl p-6 md:p-8 text-white overflow-hidden relative">
        <div className="relative z-10 max-w-4xl">
          <h2 className="text-2xl font-black mb-2">{c.oneConnection}</h2>
          <p className="text-blue-100 text-sm md:text-base">
            {c.oneConnectionDesc}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
            {c.steps.map((step: string, index: number) => (
              <div key={step} className="rounded-2xl bg-white/10 border border-white/10 p-4">
                <p className="text-xs font-black text-cyan-200">{c.step} {index + 1}</p>
                <p className="font-black mt-1">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {PLATFORM_CARDS.map(({ name, hint, icon: Icon, className }) => (
          <div key={name} className="glass-panel p-5 rounded-2xl border border-gray-200 dark:border-gray-800 flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${className} flex items-center justify-center text-white shadow-lg`}>
              <Icon className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h3 className="font-black text-gray-900 dark:text-white">{name}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>
            </div>
            <button onClick={connectEcart} disabled={connecting} className="px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-black hover:bg-blue-50 dark:hover:bg-blue-950/20">
              Conectar
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-4 glass-panel rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <div>
              <h2 className="font-black text-gray-900 dark:text-white">{c.connectedStores}</h2>
              <p className="text-xs text-gray-500 mt-1">{c.connectedStoresDesc}</p>
            </div>
            <span className="text-xs font-black px-3 py-1.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded-full flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> {stores.filter((s) => s.status === 'connected').length}
            </span>
          </div>
          {loading ? (
            <div className="p-10 text-center text-gray-500">{c.loadingStores}</div>
          ) : stores.length === 0 ? (
            <div className="p-10 text-center">
              <Store className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="font-bold text-gray-600 dark:text-gray-300">{c.noStores}</p>
              <button onClick={connectEcart} className="mt-5 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-black">{c.firstStore}</button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {stores.map((store) => (
                <button key={store.id} onClick={() => setSelectedStoreId(store.id)} className={`w-full text-left p-5 transition-colors ${selectedStore?.id === store.id ? 'bg-blue-50 dark:bg-blue-950/20' : 'hover:bg-gray-50 dark:hover:bg-dark-800/50'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-gray-900 dark:text-white">{store.storeName || store.platform}</p>
                      <p className="text-sm text-gray-500 mt-1">{store.platform}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${store.status === 'connected' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {store.status === 'connected' ? c.connected : c.pausedLabel}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                    <div className="rounded-xl bg-white/70 dark:bg-dark-900/50 p-2"><p className="font-black text-gray-900 dark:text-white">{store.ordersCount || 0}</p><p className="text-[10px] text-gray-500 font-bold">{c.orders}</p></div>
                    <div className="rounded-xl bg-white/70 dark:bg-dark-900/50 p-2"><p className="font-black text-amber-600">{store.addressAlerts || 0}</p><p className="text-[10px] text-gray-500 font-bold">{c.alerts}</p></div>
                    <div className="rounded-xl bg-white/70 dark:bg-dark-900/50 p-2"><p className="font-black text-gray-900 dark:text-white">{store.shipmentsCount || 0}</p><p className="text-[10px] text-gray-500 font-bold">{c.shipments}</p></div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="xl:col-span-8 glass-panel rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="font-black text-gray-900 dark:text-white">{c.ecommerceOrders}</h2>
              <p className="text-xs text-gray-500 mt-1">{c.ecommerceOrdersDesc}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {['all', 'needs_review', 'ready'].map((filter) => (
                <button key={filter} onClick={() => setOrderFilter(filter)} className={`px-3 py-2 rounded-xl text-xs font-black ${orderFilter === filter ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-dark-800 text-gray-600 dark:text-gray-300'}`}>
                  {filter === 'all' ? c.all : filter === 'needs_review' ? c.needsReview : c.ready}
                </button>
              ))}
              {selectedStore && (
                <button onClick={() => syncStore(selectedStore.id)} disabled={syncing === selectedStore.id} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-2 disabled:bg-gray-300">
                  <RefreshCw className={`w-4 h-4 ${syncing === selectedStore.id ? 'animate-spin' : ''}`} /> {c.sync}
                </button>
              )}
              {selectedStore && (
                <button onClick={() => disconnectStore(selectedStore.id)} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-dark-800 text-gray-600 dark:text-gray-300 text-xs font-black">{c.pause}</button>
              )}
            </div>
          </div>

          {!selectedStore ? (
            <div className="p-12 text-center text-gray-500">{c.selectStore}</div>
          ) : ordersLoading ? (
            <div className="p-12 text-center text-gray-500">{c.loadingOrders}</div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center">
              <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="font-bold text-gray-600 dark:text-gray-300">{c.noOrders}</p>
              <p className="text-sm text-gray-500 mt-1">{c.noOrdersDesc}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {orders.map((order) => (
                <div key={order.id} className="p-5">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-gray-900 dark:text-white">#{order.orderNumber || order.externalOrderId}</p>
                        <span className="text-xs font-black px-2.5 py-1 rounded-full bg-gray-100 dark:bg-dark-800 text-gray-600 dark:text-gray-300">{order.ecommerce}</span>
                        {order.addressQuality === 'needs_review' ? (
                          <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {c.addressReview}</span>
                        ) : (
                          <span className="text-xs font-black px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {c.readyLabel}</span>
                        )}
                        {order.shipmentId && <span className="text-xs font-black px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1"><Link2 className="w-3.5 h-3.5" /> {c.shipmentCreated}</span>}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 font-bold">{order.customerName || order.shipping?.name || c.customer} · {order.shipping?.city || c.cityPending} · {order.shipping?.country || c.countryPending}</p>
                      <p className="text-xs text-gray-500 mt-1 truncate">{order.shipping?.address1 || c.addressPending} {order.shipping?.postalCode ? `· ${order.shipping.postalCode}` : ''}</p>
                      {order.addressAlerts?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {order.addressAlerts.map((alert: string) => <span key={alert} className="text-[11px] font-bold bg-amber-50 text-amber-700 px-2 py-1 rounded-lg">{alert}</span>)}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button onClick={() => openAddressEditor(order)} className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-dark-800 text-gray-700 dark:text-gray-200 text-xs font-black flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> {c.address}</button>
                      <button onClick={() => createShipmentFromOrder(order)} disabled={Boolean(order.shipmentId)} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-black disabled:bg-gray-300 flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> {c.createShipment}</button>
                      {order.shipmentId && <button onClick={() => pushFulfillment(order)} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> {c.tracking}</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {addressOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-900 rounded-3xl max-w-3xl w-full border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-gray-900 dark:text-white">{c.fixAddress}</h3>
                <p className="text-xs text-gray-500 mt-1">{c.fixAddressDesc}</p>
              </div>
              <button onClick={() => setAddressOrder(null)} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-dark-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                ['name', c.fields.name], ['phone', c.fields.phone], ['email', c.fields.email], ['address1', c.fields.address1], ['address2', c.fields.address2], ['city', c.fields.city], ['state', c.fields.state], ['postalCode', c.fields.postalCode], ['country', c.fields.country]
              ].map(([key, label]) => (
                <div key={key} className={key === 'address1' || key === 'address2' ? 'md:col-span-2' : ''}>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">{label}</label>
                  <input value={addressForm[key] || ''} onChange={(e) => setAddressForm((prev: any) => ({ ...prev, [key]: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
              <button onClick={() => setAddressOrder(null)} className="px-5 py-3 rounded-xl bg-gray-100 dark:bg-dark-800 text-gray-700 dark:text-gray-200 font-black">{c.cancel}</button>
              <button onClick={saveAddress} className="px-5 py-3 rounded-xl bg-blue-600 text-white font-black flex items-center gap-2"><Save className="w-4 h-4" /> {c.saveAddress}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
