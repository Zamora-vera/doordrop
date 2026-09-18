import React, { useEffect, useState } from 'react';
import { FileText, Loader2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { resolveGlobalTermsLanguage } from './GlobalTermsDocument';

export function GlobalTermsGate() {
  const { language } = useI18n();
  const legalLanguage = resolveGlobalTermsLanguage(language);
  const [state, setState] = useState<'loading' | 'required' | 'accepted' | 'error'>('loading');
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const copy = legalLanguage === 'it'
    ? { title: 'Accetta i Termini e Condizioni Globali', description: 'Prima di continuare a utilizzare DoorDrop, leggi e accetta i termini che regolano Marketplace, Omnicanale e Spedizioni.', label: 'Accetto i Termini e Condizioni Globali di DoorDrop.', link: 'Leggi i termini globali', loading: 'Verifica dell’accettazione…', saving: 'Salvataggio dell’accettazione…', error: 'Non è stato possibile verificare o salvare l’accettazione. Riprova.' }
    : legalLanguage === 'en'
      ? { title: 'Accept the DoorDrop Global Terms', description: 'Before continuing to use DoorDrop, read and accept the terms governing Marketplace, Omnichannel and Shipping.', label: 'I accept the DoorDrop Global Terms and Conditions.', link: 'Read global terms', loading: 'Checking acceptance…', saving: 'Saving acceptance…', error: 'The acceptance could not be checked or saved. Please try again.' }
      : { title: 'Acepta los Términos y Condiciones Globales', description: 'Antes de continuar utilizando DoorDrop, lee y acepta los términos que regulan Marketplace, Omnicanal y Envíos.', label: 'Acepto los Términos y Condiciones Globales de DoorDrop.', link: 'Leer términos globales', loading: 'Comprobando aceptación…', saving: 'Guardando aceptación…', error: 'No se pudo comprobar o guardar la aceptación. Inténtalo de nuevo.' };
  const load = () => {
    setState('loading'); setError('');
    api.getGlobalTerms().then((response: any) => setState(response?.global_terms?.accepted ? 'accepted' : 'required')).catch(() => { setState('error'); setError(copy.error); });
  };
  useEffect(() => { load(); }, [legalLanguage]);
  const accept = async () => {
    setSaving(true); setError('');
    try { await api.acceptGlobalTerms({ accepted: true, termsLanguage: legalLanguage }); setState('accepted'); } catch (err: any) { setError(err?.message || copy.error); } finally { setSaving(false); }
  };
  if (state === 'accepted') return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="global-terms-title">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-dark-900">
        <div className="border-b border-slate-100 p-6 dark:border-slate-800"><div className="flex items-start gap-3"><div className="rounded-2xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-950/30 dark:text-neon-cyan"><ShieldCheck className="h-6 w-6" /></div><div><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-neon-cyan">DoorDrop</p><h2 id="global-terms-title" className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{copy.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.description}</p></div></div></div>
        <div className="space-y-4 p-6">
          {state === 'loading' && <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {copy.loading}</div>}
          {state === 'error' && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">{error}</div>}
          {state === 'required' && <><Link to="/global-terms" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-black text-blue-700 hover:underline dark:text-neon-cyan"><FileText className="h-4 w-4" /> {copy.link}</Link><label className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm font-semibold text-slate-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-slate-200"><input type="checkbox" disabled={saving} onChange={(event) => { if (event.target.checked) void accept(); }} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600" /><span>{saving ? copy.saving : copy.label}</span></label></>}
          {error && state === 'required' && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        </div>
        {state === 'error' && <div className="flex justify-end border-t border-slate-100 p-6 dark:border-slate-800"><button type="button" onClick={load} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700">Reintentar</button></div>}
      </div>
    </div>
  );
}
export default GlobalTermsGate;
