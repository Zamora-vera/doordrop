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
                {language === 'it' ? 'Spedizioni Multi-Corriere' : 'Envíos Multi-Carrier'}
              </h5>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {language === 'it' ? 'Poste Italiane, SDA, BRT, DHL, UPS, Correos e SEUR.' : 'Correos, SEUR, DHL, UPS, Poste Italiane y más.'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h5 className="font-bold text-slate-900 dark:text-white text-xs">
                {language === 'it' ? 'Protezione Acquirente 100%' : 'Protección al Comprador 100%'}
              </h5>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {language === 'it' ? 'I pagamenti vengono rilasciati solo dopo la consegna del pacco.' : 'Pagos en depósito de garantía hasta verificar el artículo.'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h5 className="font-bold text-slate-900 dark:text-white text-xs">
                {language === 'it' ? 'Compravendita Sicura' : 'Marketplace Integrado'}
              </h5>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {language === 'it' ? 'Vendi gratis con etichette generate automaticamente.' : 'Vende gratis con etiquetas generadas al instante.'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h5 className="font-bold text-slate-900 dark:text-white text-xs">
                {language === 'it' ? 'Account Unificato' : 'Cuenta Unificada'}
              </h5>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {language === 'it' ? 'Usa lo stesso account per inviare pacchi e vendere prodotti.' : 'Usa la misma cuenta para enviar paquetes y vender productos.'}
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
                <span>{language === 'it' ? 'Inizia a vendere sul Marketplace' : 'Empezar a vender en el Marketplace'}</span>
              </Link>
            </div>
          </div>

          {/* Logistics links */}
          <div className="space-y-2.5">
            <h6 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
              {language === 'it' ? 'Spedizioni' : 'Logística'}
            </h6>
            <ul className="space-y-1.5">
              <li><Link to="/panel/quote" className="hover:text-blue-600">{language === 'it' ? 'Preventivo Espresso' : 'Cotizador Express'}</Link></li>
              <li><Link to="/tracking" className="hover:text-blue-600">{language === 'it' ? 'Traccia Pacco' : 'Seguimiento de Envíos'}</Link></li>
              <li><Link to="/panel/shipments" className="hover:text-blue-600">{language === 'it' ? 'Storico Spedizioni' : 'Historial de Envíos'}</Link></li>
              <li><Link to="/panel/stores" className="hover:text-blue-600">{language === 'it' ? 'Integrazione E-commerce' : 'Integración E-commerce'}</Link></li>
            </ul>
          </div>

          {/* Marketplace links */}
          <div className="space-y-2.5">
            <h6 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">Marketplace</h6>
            <ul className="space-y-1.5">
              <li><Link to="/marketplace" className="hover:text-blue-600">{language === 'it' ? 'Tutti i Prodotti' : 'Catálogo Completo'}</Link></li>
              <li><Link to="/marketplace?envio=1" className="hover:text-blue-600">{language === 'it' ? 'Con Spedizione DoorDrop' : 'Con Envíos DoorDrop'}</Link></li>
              <li><Link to="/panel/marketplace" className="hover:text-blue-600">{language === 'it' ? 'Hub del Venditore' : 'Panel de Vendedor'}</Link></li>
              <li><Link to="/panel/marketplace?tab=messages" className="hover:text-blue-600">{language === 'it' ? 'Messaggi & Trattative' : 'Mensajes y Ofertas'}</Link></li>
            </ul>
          </div>

          {/* Account links */}
          <div className="space-y-2.5">
            <h6 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
              {language === 'it' ? 'Mio Account' : 'Mi Cuenta'}
            </h6>
            <ul className="space-y-1.5">
              <li><Link to="/panel" className="hover:text-blue-600">{language === 'it' ? 'Dashboard Cliente' : 'Panel de Cliente'}</Link></li>
              <li><Link to="/panel/settings" className="hover:text-blue-600">{language === 'it' ? 'Portafoglio & Ricarica' : 'Billetera y Saldo'}</Link></li>
              <li><Link to="/panel/tickets" className="hover:text-blue-600">{language === 'it' ? 'Assistenza & Ticket' : 'Soporte y Tickets'}</Link></li>
              <li><Link to="/auth/register" className="hover:text-blue-600">{language === 'it' ? 'Registrati Gratis' : 'Registrarse Gratis'}</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
          <p>© {new Date().getFullYear()} DoorDrop. {t('footer_rights') || (language === 'it' ? 'Tutti i diritti riservati.' : 'Todos los derechos reservados.')}</p>
          <div className="flex gap-4">
            <Link to="/terms" className="hover:text-slate-600 dark:hover:text-slate-200">{language === 'it' ? 'Termini di Servizio' : 'Términos'}</Link>
            <Link to="/privacy" className="hover:text-slate-600 dark:hover:text-slate-200">{language === 'it' ? 'Informativa Privacy' : 'Privacidad'}</Link>
            <Link to="/cookies" className="hover:text-slate-600 dark:hover:text-slate-200">Cookies</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
