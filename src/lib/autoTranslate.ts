import { visibleTextTranslations } from '../lang/visibleText';
import type { Language } from './i18n';

type Lang = Language;
type Dict = Record<string, Partial<Record<Lang, string>>>;

const dictionary = visibleTextTranslations as unknown as Dict;
const originalTextMap = new WeakMap<Text, string>();
let observer: MutationObserver | null = null;
let currentLanguage: Lang = 'es';
let scheduled = 0;

const normalize = (value: string) => String(value || '').replace(/\s+/g, ' ').trim();

function translateValue(value: string, lang: Lang): string {
  const normalized = normalize(value);
  if (!normalized) return value;
  const item = dictionary[normalized];
  if (!item) return value;
  return item[lang] || item.es || value;
}

function translateAttributes(el: Element, lang: Lang) {
  ['placeholder', 'title', 'aria-label'].forEach((attr) => {
    const current = el.getAttribute(attr);
    if (!current) return;
    const originalAttr = `data-i18n-original-${attr}`;
    const original = el.getAttribute(originalAttr) || current;
    if (!el.hasAttribute(originalAttr)) el.setAttribute(originalAttr, original);
    const translated = translateValue(original, lang);
    if (translated !== current) el.setAttribute(attr, translated);
  });
}

function translateTextNode(node: Text, lang: Lang) {
  const raw = node.nodeValue || '';
  const original = originalTextMap.get(node) || raw;
  if (!originalTextMap.has(node)) originalTextMap.set(node, original);
  const translated = translateValue(original, lang);
  if (translated !== raw) node.nodeValue = raw.replace(normalize(raw), translated);
}

function walk(root: Node, lang: Lang) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text, lang);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;

  const el = root as Element;
  if (el instanceof HTMLScriptElement || el instanceof HTMLStyleElement || el instanceof HTMLTextAreaElement) return;
  if (el instanceof Element) translateAttributes(el, lang);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const e = node as Element;
        if (e instanceof HTMLScriptElement || e instanceof HTMLStyleElement || e instanceof HTMLTextAreaElement) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) translateAttributes(node as Element, lang);
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text, lang);
    node = walker.nextNode();
  }
}

function schedule(lang: Lang) {
  if (scheduled) window.clearTimeout(scheduled);
  scheduled = window.setTimeout(() => {
    if (document.body) walk(document.body, lang);
  }, 30);
}

export function applyAutoTranslation(lang: Lang) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  currentLanguage = lang;
  schedule(lang);
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => walk(node, currentLanguage));
      }
      if (mutation.type === 'attributes' && mutation.target) {
        translateAttributes(mutation.target as Element, currentLanguage);
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['placeholder', 'title', 'aria-label']
  });
}
