import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { useI18n } from '../lib/i18n';

export const GLOBAL_TERMS_VERSION = '1.0';
export type GlobalTermsLanguage = 'es' | 'it' | 'en';

export function resolveGlobalTermsLanguage(language?: string): GlobalTermsLanguage {
  const normalized = String(language || '').toLowerCase().slice(0, 2);
  return normalized === 'es' || normalized === 'it' || normalized === 'en' ? normalized : 'en';
}

const labels: Record<GlobalTermsLanguage, { title: string; intro: string; back: string; fallback: string; loading: string; error: string; }> = {
  es: { title: 'Términos y Condiciones Globales de DoorDrop', intro: 'Consulta la versión vigente de las condiciones generales y específicas de los servicios DoorDrop.', back: 'Volver a DoorDrop', fallback: 'Tu idioma actual no tiene una traducción legal publicada todavía. Mostramos la versión en inglés.', loading: 'Cargando términos globales…', error: 'No se pudieron cargar los términos globales. Intenta nuevamente más tarde.' },
  it: { title: 'Termini e Condizioni Globali di DoorDrop', intro: 'Consulta la versione vigente delle condizioni generali e specifiche dei servizi DoorDrop.', back: 'Torna a DoorDrop', fallback: 'La tua lingua attuale non ha ancora una traduzione legale pubblicata. Mostriamo la versione inglese.', loading: 'Caricamento dei termini globali…', error: 'Non è stato possibile caricare i termini globali. Riprova più tardi.' },
  en: { title: 'DoorDrop Global Terms and Conditions', intro: 'Read the current general and service-specific terms that apply to DoorDrop services.', back: 'Back to DoorDrop', fallback: 'A legal translation is not published for your current language yet. We are showing the English version.', loading: 'Loading global terms…', error: 'The global terms could not be loaded. Please try again later.' }
};

function escapeHtml(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function inlineMarkdown(value: string): string { return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }
function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const output: string[] = []; let paragraph: string[] = []; let listType: 'ul' | 'ol' | null = null;
  const closeList = () => { if (listType) { output.push('</' + listType + '>'); listType = null; } };
  const flushParagraph = () => { if (paragraph.length) { output.push('<p>' + paragraph.map(inlineMarkdown).join('<br />') + '</p>'); paragraph = []; } };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushParagraph(); closeList(); continue; }
    const heading = trimmed.match(/^(#{2,3})\s+(.+)$/);
    if (heading) { flushParagraph(); closeList(); const level = heading[1].length; output.push('<h' + level + '>' + inlineMarkdown(heading[2]) + '</h' + level + '>'); continue; }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) { flushParagraph(); if (listType !== 'ul') { closeList(); output.push('<ul>'); listType = 'ul'; } output.push('<li>' + inlineMarkdown(bullet[1]) + '</li>'); continue; }
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) { flushParagraph(); if (listType !== 'ol') { closeList(); output.push('<ol>'); listType = 'ol'; } output.push('<li>' + inlineMarkdown(ordered[1]) + '</li>'); continue; }
    closeList(); paragraph.push(trimmed);
  }
  flushParagraph(); closeList(); return output.join('');
}

export function GlobalTermsDocument({ language, compact = false }: { language?: string; compact?: boolean; }) {
  const { language: currentLanguage } = useI18n();
  const requestedLanguage = language || currentLanguage;
  const legalLanguage = resolveGlobalTermsLanguage(requestedLanguage);
  const copy = labels[legalLanguage];
  const [markdown, setMarkdown] = useState(''); const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false; setMarkdown(''); setError(false);
    fetch('/legal/global-terms/' + legalLanguage + '.md', { cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error('global-terms-load-failed'); return response.text(); })
      .then(text => { if (!cancelled) setMarkdown(text.replace(/<!--[\s\S]*?-->/g, '')); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [legalLanguage]);
  const html = useMemo(() => markdownToHtml(markdown), [markdown]);
  const isFallback = !['es', 'it', 'en'].includes(String(requestedLanguage || '').toLowerCase().slice(0, 2));
  return (
    <section className={compact ? 'w-full' : 'min-h-screen bg-slate-50 dark:bg-dark-900 py-8 sm:py-14 px-4'}>
      <div className={compact ? 'w-full' : 'max-w-4xl mx-auto'}>
        {!compact && <div className="mb-6 flex items-center justify-between gap-4"><Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700"><ArrowLeft className="w-4 h-4" /> {copy.back}</Link><span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500"><FileText className="w-4 h-4" /> Version 1.0</span></div>}
        <div className="rounded-3xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 shadow-sm p-6 sm:p-10">
          {!compact && <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">{copy.title}</h1>}
          {!compact && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{copy.intro}</p>}
          {isFallback && <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 p-3 text-sm"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{copy.fallback}</span></div>}
          {error ? <div className="mt-8 rounded-xl bg-rose-50 text-rose-700 p-4 text-sm font-semibold">{copy.error}</div> : !markdown ? <div className="mt-8 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> {copy.loading}</div> : <article className="terms-document mt-8 text-sm leading-7 text-slate-700 dark:text-slate-300 [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-slate-900 [&_h2]:dark:text-white [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-black [&_h3]:text-slate-900 [&_h3]:dark:text-white [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:pl-1 [&_p]:mb-4" dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
      </div>
    </section>
  );
}
export default GlobalTermsDocument;
