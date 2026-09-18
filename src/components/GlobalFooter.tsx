import React from 'react';
import { Link } from 'react-router-dom';
import {
  Store,
  Truck,
  ShieldCheck,
  Package,
  HelpCircle,
  FileText,
  Mail,
  Heart
} from 'lucide-react';
import { BrandMark, useBrand } from '../lib/brand';
import { useI18n } from '../lib/i18n';

export const GlobalFooter: React.FC = () => {
  const { t, language } = useI18n();
  const { brand } = useBrand();
  const footerLanguage = language.startsWith('it') ? 'it' : language.startsWith('en') ? 'en' : language.startsWith('fr') ? 'fr' : 'es';
  const footerText = {
    es: {
      multiTitle: 'Envíos Multi-Carrier', multiDesc: 'Correos, SEUR, DHL, UPS, Poste Italiane y más.',
      buyerTitle: 'Protección al Comprador 100%', buyerDesc: 'Pagos en depósito de garantía hasta verificar el artículo.',
      marketplaceTitle: 'Marketplace Integrado', marketplaceDesc: 'Vende gratis con etiquetas generadas al instante.',
      accountTitle: 'Cuenta Unificada', accountDesc: 'Usa la misma cuenta para enviar paquetes y vender productos.',
      sell: 'Empezar a vender en el Marketplace', logistics: 'Logística', quote: 'Cotizador Express', tracking: 'Seguimiento de Envíos', history: 'Historial de Envíos', ecommerce: 'Integración E-commerce', omni: 'Omnicanal + AI',
      marketplaceProducts: 'Catálogo Completo', marketplaceShipping: 'Con Envíos DoorDrop', marketplaceSeller: 'Panel de Vendedor', marketplaceMessages: 'Mensajes y Ofertas', account: 'Mi Cuenta', dashboard: 'Panel de Cliente', wallet: 'Billetera y Saldo', support: 'Soporte y Tickets', register: 'Registrarse Gratis', terms: 'Términos', globalTerms: 'Términos globales', omniTerms: 'Términos del Omnicanal', privacy: 'Privacidad', rights: 'Todos los derechos reservados.'
    },
    it: {
      multiTitle: 'Spedizioni Multi-Corriere', multiDesc: 'Poste Italiane, SDA, BRT, DHL, UPS, Correos e SEUR.',
      buyerTitle: 'Protezione Acquirente 100%', buyerDesc: 'I pagamenti vengono rilasciati solo dopo la consegna del pacco.',
      marketplaceTitle: 'Compravendita Sicura', marketplaceDesc: 'Vendi gratis con etichette generate automaticamente.',
      accountTitle: 'Account Unificato', accountDesc: 'Usa lo stesso account per inviare pacchi e vendere prodotti.',
      sell: 'Inizia a vendere sul Marketplace', logistics: 'Spedizioni', quote: 'Preventivo Espresso', tracking: 'Traccia Pacco', history: 'Storico Spedizioni', ecommerce: 'Integrazione E-commerce', omni: 'Omnicanale + AI',
      marketplaceProducts: 'Tutti i Prodotti', marketplaceShipping: 'Con Spedizione DoorDrop', marketplaceSeller: 'Hub del Venditore', marketplaceMessages: 'Messaggi & Trattative', account: 'Mio Account', dashboard: 'Dashboard Cliente', wallet: 'Portafoglio & Ricarica', support: 'Assistenza & Ticket', register: 'Registrati Gratis', terms: 'Termini di Servizio', globalTerms: 'Termini globali', omniTerms: 'Termini Omnicanale', privacy: 'Informativa Privacy', rights: 'Tutti i diritti riservati.'
    },
    en: {
      multiTitle: 'Multi-carrier shipping', multiDesc: 'Correos, SEUR, DHL, UPS, Poste Italiane and more.',
      buyerTitle: '100% buyer protection', buyerDesc: 'Payments stay protected until the item is verified.',
      marketplaceTitle: 'Integrated Marketplace', marketplaceDesc: 'Sell with shipping labels generated instantly.',
      accountTitle: 'Unified account', accountDesc: 'Use one account to ship packages and sell products.',
      sell: 'Start selling on the Marketplace', logistics: 'Logistics', quote: 'Express quote', tracking: 'Shipment tracking', history: 'Shipment history', ecommerce: 'E-commerce integration', omni: 'Omnichannel + AI',
      marketplaceProducts: 'Full catalog', marketplaceShipping: 'With DoorDrop shipping', marketplaceSeller: 'Seller panel', marketplaceMessages: 'Messages and offers', account: 'My account', dashboard: 'Customer panel', wallet: 'Wallet and balance', support: 'Support and tickets', register: 'Register for free', terms: 'Terms of service', globalTerms: 'Global terms', omniTerms: 'Omnichannel terms', privacy: 'Privacy', rights: 'All rights reserved.'
    },
    fr: {
      multiTitle: 'Expéditions multi-transporteurs', multiDesc: 'Correos, SEUR, DHL, UPS, Poste Italiane et plus.',
      buyerTitle: 'Protection acheteur à 100 %', buyerDesc: 'Les paiements restent protégés jusqu’à la vérification de l’article.',
      marketplaceTitle: 'Marketplace intégré', marketplaceDesc: 'Vendez avec des étiquettes d’expédition générées instantanément.',
      accountTitle: 'Compte unifié', accountDesc: 'Un seul compte pour expédier des colis et vendre des produits.',
      sell: 'Commencer à vendre sur le Marketplace', logistics: 'Logistique', quote: 'Devis express', tracking: 'Suivi des expéditions', history: 'Historique des expéditions', ecommerce: 'Intégration e-commerce', omni: 'Omnicanal + IA',
      marketplaceProducts: 'Catalogue complet', marketplaceShipping: 'Avec expédition DoorDrop', marketplaceSeller: 'Espace vendeur', marketplaceMessages: 'Messages et offres', account: 'Mon compte', dashboard: 'Espace client', wallet: 'Portefeuille et solde', support: 'Support et tickets', register: 'Créer un compte gratuitement', terms: 'Conditions de service', globalTerms: 'Conditions globales', omniTerms: 'Conditions Omnicanal', privacy: 'Confidentialité', rights: 'Tous droits réservés.'
    }
  }[footerLanguage];

  return (
    <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-dark-900 text-slate-500 dark:text-slate-400 text-xs">
      {/* Upper features strip */}
      <div className="border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-dark-950/40 py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h5 className="font-bold text-slate-900 dark:text-white text-xs">
                {footerText.multiTitle}
              </h5>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {footerText.multiDesc}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h5 className="font-bold text-slate-900 dark:text-white text-xs">
                {footerText.buyerTitle}
              </h5>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {footerText.buyerDesc}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h5 className="font-bold text-slate-900 dark:text-white text-xs">
                {footerText.marketplaceTitle}
              </h5>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {footerText.marketplaceDesc}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h5 className="font-bold text-slate-900 dark:text-white text-xs">
                {footerText.accountTitle}
              </h5>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {footerText.accountDesc}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main sitemap */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand info */}
          <div className="col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <BrandMark iconClassName="w-7 h-7 rounded-lg" textClassName="text-base font-black text-slate-900 dark:text-white" />
            </div>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
              {t('footer_desc') || (language === 'it' 
                ? 'Ecosistema completo di logistica espressa e marketplace decentralizzato con protezione per acquirenti e venditori in tutta Europa.'
                : 'Ecosistema completo de logística express y marketplace con protección integral para compradores y vendedores en toda Europa.')}
            </p>
            <div className="pt-2 flex items-center gap-3 text-xs font-bold text-blue-600">
              <Link to="/panel/marketplace" className="hover:underline flex items-center gap-1">
                <Store className="w-3.5 h-3.5" />
                <span>{footerText.sell}</span>
              </Link>
            </div>
          </div>

          {/* Logistics links */}
          <div className="space-y-2.5">
            <h6 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
              {footerText.logistics}
            </h6>
            <ul className="space-y-1.5">
              <li><Link to="/panel/quote" className="hover:text-blue-600">{footerText.quote}</Link></li>
              <li><Link to="/tracking" className="hover:text-blue-600">{footerText.tracking}</Link></li>
              <li><Link to="/panel/shipments" className="hover:text-blue-600">{footerText.history}</Link></li>
              <li><Link to="/panel/stores" className="hover:text-blue-600">{footerText.ecommerce}</Link></li>
              <li><Link to="/omnichannel" className="hover:text-blue-600">{footerText.omni}</Link></li>
            </ul>
          </div>

          {/* Marketplace links */}
          <div className="space-y-2.5">
            <h6 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">Marketplace</h6>
            <ul className="space-y-1.5">
              <li><Link to="/marketplace" className="hover:text-blue-600">{footerText.marketplaceProducts}</Link></li>
              <li><Link to="/marketplace?envio=1" className="hover:text-blue-600">{footerText.marketplaceShipping}</Link></li>
              <li><Link to="/panel/marketplace" className="hover:text-blue-600">{footerText.marketplaceSeller}</Link></li>
              <li><Link to="/panel/marketplace?tab=messages" className="hover:text-blue-600">{footerText.marketplaceMessages}</Link></li>
            </ul>
          </div>

          {/* Account links */}
          <div className="space-y-2.5">
            <h6 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
              {footerText.account}
            </h6>
            <ul className="space-y-1.5">
              <li><Link to="/panel" className="hover:text-blue-600">{footerText.dashboard}</Link></li>
              <li><Link to="/panel/settings" className="hover:text-blue-600">{footerText.wallet}</Link></li>
              <li><Link to="/panel/tickets" className="hover:text-blue-600">{footerText.support}</Link></li>
              <li><Link to="/auth/register" className="hover:text-blue-600">{footerText.register}</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
          <p>© {new Date().getFullYear()} DoorDrop. {t('footer_rights') || footerText.rights}</p>
          <div className="flex gap-4">
            <Link to="/global-terms" className="hover:text-slate-600 dark:hover:text-slate-200">{footerText.globalTerms}</Link>
            <Link to="/terms" className="hover:text-slate-600 dark:hover:text-slate-200">{footerText.terms}</Link>
            <Link to="/omnichannel/terms" className="hover:text-slate-600 dark:hover:text-slate-200">{footerText.omniTerms}</Link>
            <Link to="/privacy" className="hover:text-slate-600 dark:hover:text-slate-200">{footerText.privacy}</Link>
            <Link to="/cookies" className="hover:text-slate-600 dark:hover:text-slate-200">Cookies</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
