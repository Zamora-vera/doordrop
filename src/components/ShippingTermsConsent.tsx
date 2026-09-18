import React, { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { resolveShippingTermsLanguage } from './ShippingTermsDocument';

export function ShippingTermsConsent({
  onAcceptedChange
}: {
  onAcceptedChange?: (accepted: boolean) => void;
}) {
  const { language } = useI18n();
  const legalLanguage = resolveShippingTermsLanguage(language);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const copy = legalLanguage === 'it'
    ? {
        label: 'Accetto i Termini e condizioni di DoorDrop Spedizioni.',
        link: 'Leggi i termini di spedizione',
        loading: 'Verifica dell’accettazione…',
        saving: 'Salvataggio dell’accettazione…',
        error: 'Non è stato possibile salvare l’accettazione. Riprova.'
      }
    : legalLanguage === 'en'
      ? {
          label: 'I accept the DoorDrop Shipping Terms and Conditions.',
          link: 'Read shipping terms',
          loading: 'Checking acceptance…',
          saving: 'Saving acceptance…',
          error: 'The acceptance could not be saved. Please try again.'
        }
      : {
          label: 'Acepto los términos y condiciones de DoorDrop Envíos.',
          link: 'Leer términos de envíos',
          loading: 'Comprobando aceptación…',
          saving: 'Guardando aceptación…',
          error: 'No se pudo guardar la aceptación. Inténtalo de nuevo.'
        };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getShippingTerms()
      .then((response: any) => {
        if (cancelled) return;
        const next = Boolean(response?.shipping_terms?.accepted);
        setAccepted(next);
        onAcceptedChange?.(next);
      })
      .catch(() => {
        if (!cancelled) setError(copy.error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [legalLanguage]);

  const handleChange = async (checked: boolean) => {
    setError('');
    if (!checked) {
      setAccepted(false);
      onAcceptedChange?.(false);
      return;
    }
    setSaving(true);
    try {
      await api.acceptShippingTerms({ accepted: true, termsLanguage: legalLanguage });
      setAccepted(true);
      onAcceptedChange?.(true);
    } catch (err: any) {
      setError(err?.message || copy.error);
      setAccepted(false);
      onAcceptedChange?.(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/20 p-4">
      <label className="flex items-start gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
        <input
          type="checkbox"
          checked={accepted}
          disabled={loading || saving}
          onChange={(event) => { void handleChange(event.target.checked); }}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
        />
        <span className="leading-5">
          {loading ? copy.loading : saving ? copy.saving : copy.label}{' '}
          <Link
            to="/shipping/terms"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-black text-blue-700 dark:text-neon-cyan hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            <FileText className="h-3.5 w-3.5" /> {copy.link}
          </Link>
        </span>
      </label>
      {loading && <Loader2 className="mt-2 ml-7 h-3.5 w-3.5 animate-spin text-blue-600" />}
      {error && <p className="mt-2 ml-7 text-xs font-semibold text-rose-600">{error}</p>}
    </div>
  );
}

export default ShippingTermsConsent;
