import { normalizeSupportLanguage, SUPPORT_WHATSAPP_NUMBER, getSupportWhatsAppUrl } from '../lib/supportContact';

type Lang = 'es' | 'en' | 'it' | 'fr';

const getLang = (): Lang => {
  const raw = String(
    localStorage.getItem('ship24go_lang') ||
    localStorage.getItem('ship24go_language') ||
    localStorage.getItem('enviox_lang') ||
    document.documentElement.lang ||
    'es'
  ).toLowerCase();

  if (raw.startsWith('en')) return 'en';
  if (raw.startsWith('it')) return 'it';
  if (raw.startsWith('fr')) return 'fr';
  return normalizeSupportLanguage(raw);
};

const labels: Record<Lang, any> = {
  es: {
    title: 'Canales oficiales de atención',
    desc: 'También puedes contactarnos por WhatsApp o redes oficiales según tu país.',
    whatsapp: 'Atención por WhatsApp',
    global: 'Facebook global',
    italy: 'Facebook Italia',
    usa: 'Facebook Estados Unidos',
    spain: 'Facebook España',
    instagram: 'Instagram oficial',
    open: 'Abrir',
    whatsappText: 'Hola DoorDrop, necesito ayuda con un envío.'
  },
  en: {
    title: 'Official support channels',
    desc: 'You can also contact us by WhatsApp or through the official social channels for your country.',
    whatsapp: 'WhatsApp support',
    global: 'Global Facebook',
    italy: 'Facebook Italy',
    usa: 'Facebook United States',
    spain: 'Facebook Spain',
    instagram: 'Official Instagram',
    open: 'Open',
    whatsappText: 'Hello DoorDrop, I need help with a shipment.'
  },
  it: {
    title: 'Canali ufficiali di assistenza',
    desc: 'Puoi contattarci anche tramite WhatsApp o tramite i canali social ufficiali del tuo paese.',
    whatsapp: 'Assistenza WhatsApp',
    global: 'Facebook globale',
    italy: 'Facebook Italia',
    usa: 'Facebook Stati Uniti',
    spain: 'Facebook Spagna',
    instagram: 'Instagram ufficiale',
    open: 'Apri',
    whatsappText: 'Ciao DoorDrop, ho bisogno di assistenza con una spedizione.'
  },
  fr: {
    title: 'Canaux officiels d’assistance',
    desc: 'Vous pouvez aussi nous contacter par WhatsApp ou via les réseaux officiels de votre pays.',
    whatsapp: 'Assistance WhatsApp',
    global: 'Facebook global',
    italy: 'Facebook Italie',
    usa: 'Facebook États-Unis',
    spain: 'Facebook Espagne',
    instagram: 'Instagram officiel',
    open: 'Ouvrir',
    whatsappText: 'Bonjour DoorDrop, j’ai besoin d’aide avec un envoi.'
  }
};

const channels = (l: any) => [
  {
    icon: '💬',
    title: l.whatsapp,
    subtitle: SUPPORT_WHATSAPP_NUMBER,
    href: getSupportWhatsAppUrl(getLang()),
    className: 'from-emerald-500 to-green-600'
  }
];

const shouldShow = () => {
  const path = window.location.pathname || '';
  return path === '/panel/tickets' || path.includes('/panel/tickets');
};

const removeBlock = () => {
  document.getElementById('ship24go-support-channels')?.remove();
};

const findMount = () => {
  const paragraphs = Array.from(document.querySelectorAll('p'));
  const supportIntro = paragraphs.find((p) => {
    const text = (p.textContent || '').toLowerCase();
    return text.includes('soporte inteligente') ||
      text.includes('smart support') ||
      text.includes('supporto intelligente') ||
      text.includes('assistance intelligente') ||
      text.includes('intelligenter unterstützung') ||
      text.includes('智能支持');
  });

  if (supportIntro?.parentElement) return supportIntro.parentElement;

  const main = document.querySelector('main') || document.querySelector('[role="main"]');
  return main || document.body;
};

const render = () => {
  if (!shouldShow()) {
    removeBlock();
    return;
  }

  const lang = getLang();
  const l = labels[lang] || labels.es;
  const existing = document.getElementById('ship24go-support-channels');
  if (existing) return;

  const mount = findMount();
  if (!mount) return;

  const section = document.createElement('section');
  section.id = 'ship24go-support-channels';
  section.className = 'mt-6 rounded-3xl border border-blue-100 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm p-5 md:p-6';

  const cards = channels(l).map((item) => `
    <a href="${item.href}" target="_blank" rel="noreferrer"
      class="group rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:bg-white dark:hover:bg-slate-800 transition-all p-4 flex items-center gap-3">
      <span class="w-11 h-11 rounded-2xl bg-gradient-to-br ${item.className} text-white flex items-center justify-center font-black text-lg shadow-sm">${item.icon}</span>
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-black text-slate-900 dark:text-white">${item.title}</span>
        <span class="block text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">${item.subtitle}</span>
      </span>
      <span class="text-xs font-black text-blue-600 dark:text-cyan-300 group-hover:translate-x-0.5 transition-transform">${l.open}</span>
    </a>
  `).join('');

  section.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-4">
      <div>
        <p class="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-cyan-300">DoorDrop</p>
        <h3 class="text-lg md:text-xl font-black text-slate-950 dark:text-white">${l.title}</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">${l.desc}</p>
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      ${cards}
    </div>
  `;

  mount.insertAdjacentElement('afterend', section);
};

const patchHistory = () => {
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;

  history.pushState = function (...args) {
    const result = originalPush.apply(this, args as any);
    setTimeout(render, 100);
    return result;
  };

  history.replaceState = function (...args) {
    const result = originalReplace.apply(this, args as any);
    setTimeout(render, 100);
    return result;
  };

  window.addEventListener('popstate', () => setTimeout(render, 100));
};

if (typeof window !== 'undefined') {
  patchHistory();
  window.addEventListener('load', render);
  document.addEventListener('DOMContentLoaded', render);
  window.addEventListener('ship24go:language-changed', () => {
    removeBlock();
    setTimeout(render, 100);
  });

  const observer = new MutationObserver(() => render());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  let tries = 0;
  const timer = window.setInterval(() => {
    render();
    tries++;
    if (tries > 30) window.clearInterval(timer);
  }, 300);
}

export {};
