import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { availableLanguages, Language, useI18n } from '../lib/i18n';
import { languageFlagUrl } from '../lib/countries';

export const LanguageSelector = ({ compact = true }: { compact?: boolean }) => {
  const { language, setLanguage } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = availableLanguages.find((l) => l.code === language) || availableLanguages[0];

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-white/80 dark:bg-dark-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-100 hover:border-blue-300 dark:hover:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-neon-cyan/20 cursor-pointer"
        aria-label="Idioma"
      >
        <img
          src={languageFlagUrl(current.code, 'flat', 24)}
          alt={current.short}
          className="w-5 h-3.5 object-cover rounded-sm shadow-sm"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <span>{compact ? current.short : current.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 min-w-[12rem] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-800 shadow-xl overflow-hidden">
          {availableLanguages.map((item) => {
            const active = item.code === language;
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => {
                  setLanguage(item.code as Language);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors ${
                  active ? 'bg-blue-50/70 dark:bg-blue-500/15 font-bold' : 'font-medium'
                } text-gray-800 dark:text-gray-100`}
              >
                <img
                  src={languageFlagUrl(item.code, 'flat', 32)}
                  alt={item.short}
                  className="w-6 h-4 object-cover rounded-sm shadow-sm"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <span className="flex-1">{compact ? `${item.short} · ${item.label}` : item.label}</span>
                {active ? <span className="text-blue-600 text-xs">✓</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
