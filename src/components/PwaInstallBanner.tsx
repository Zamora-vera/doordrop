import { useEffect, useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DISMISS_KEY = 'ship24go_pwa_install_dismissed_v1';

export function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    setIsStandalone(Boolean(standalone));
    if (standalone) return;

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 3600 * 1000) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
    if (isIos && isSafari) {
      setIosHint(true);
      setVisible(true);
      return;
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  if (isStandalone || !visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') setVisible(false);
    } catch {}
    setDeferred(null);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[80] md:left-auto md:right-6 md:max-w-md">
      <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 shadow-2xl p-4 flex gap-3 items-start">
        <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-900 dark:text-white">Install DoorDrop App</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            {iosHint
              ? 'On iPhone: tap Share → Add to Home Screen to install the app.'
              : 'Install as an app for faster access to quotes, labels and tracking.'}
          </p>
          <div className="mt-3 flex gap-2">
            {!iosHint && deferred && (
              <button
                type="button"
                onClick={install}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black"
              >
                <Download className="w-3.5 h-3.5" /> Install
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
            >
              Not now
            </button>
          </div>
        </div>
        <button type="button" onClick={dismiss} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
