import {mountNavigation} from './navigation.js';
import {english} from './translations.js';

export type Language = 'vi' | 'en';
const key = 'rubik.language';
function readLanguage(): Language {
  const requested = new URLSearchParams(location.search).get('lang');
  if (requested === 'en' || requested === 'vi') return requested;
  try { return localStorage.getItem(key) === 'en' ? 'en' : 'vi'; } catch { return 'vi'; }
}
export const language = readLanguage();
export function t(text: string): string {
  return language === 'en' ? english[text] ?? text : text;
}

// Translate the static document once. Dynamic UI uses t() at its render sites;
// user names, algorithms and saved data never pass through this document walk.
function mountLanguage(): void {
  mountNavigation(language==='en');
  document.documentElement.lang = language;
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest('script, style')) continue;
    node.textContent = t(node.textContent ?? '');
  }
  for (const element of document.querySelectorAll('*')) {
    for (const attribute of ['aria-label', 'title', 'placeholder', 'content']) {
      const value = element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, t(value));
    }
  }
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const target = new URL(link.href, location.href);
    if (target.origin === location.origin && !target.hash) {
      target.searchParams.set('lang', language);
      link.href = target.href;
    }
  }
  const header = document.querySelector('header');
  if (!header) return;
  const menu = document.createElement('details');
  menu.className = 'language-menu';
  const summary = document.createElement('summary');
  summary.textContent = language === 'vi' ? 'Ngôn ngữ' : 'Language';
  menu.append(summary);
  const choices = document.createElement('div');
  choices.className = 'language-choices';
  for (const [value, label] of [['vi', 'Tiếng Việt'], ['en', 'English']] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.lang = value;
    button.textContent = label;
    button.setAttribute('aria-pressed', String(language === value));
    button.onclick = () => {
      if (language === value) { menu.open = false; return; }
      // A navigation rebuilds all UI in the selected language, including dialogs.
      // Keep the URL fallback so selection works when browser storage is blocked.
      try { localStorage.setItem(key, value); } catch { /* URL fallback below */ }
      const url = new URL(location.href);
      url.searchParams.set('lang', value);
      location.assign(url.href);
    };
    choices.append(button);
  }
  menu.append(choices);
  header.append(menu);
  document.addEventListener('click', event => {
    if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { menu.open = false; summary.focus(); }
  });
}
mountLanguage();
