// Per-page title and description.
// ---------------------------------------------------------------------------
// One HTML file serves every route, so without this every tab said the same
// thing and every shared link previewed the landing. Each route now names
// itself in the tab, in the share card and in the language the visitor is
// reading; the app screens (profile, counter, admin…) also tell crawlers to
// stay out, since they are nothing without a session.
//
// The landing keeps the static tags from index.html for crawlers that do not
// run JavaScript; this only rewrites them once React is up, so the two never
// disagree (the strings are the same, from i18n).

const SITE = 'https://heropad.supervictoruniverse.com';

export interface PageMeta {
  title: string;
  description: string;
  /** Auth-only or private screens: ask crawlers not to index. */
  noindex?: boolean;
}

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string | null): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function applyPageMeta(meta: PageMeta, pathname: string, lang: 'ro' | 'en'): void {
  document.title = meta.title;
  document.documentElement.lang = lang;
  setMeta('meta[name="description"]', 'name', 'description', meta.description);
  setMeta('meta[property="og:title"]', 'property', 'og:title', meta.title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', meta.description);
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', meta.title);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', meta.description);
  setMeta('meta[property="og:locale"]', 'property', 'og:locale', lang === 'ro' ? 'ro_RO' : 'en_US');

  const url = `${SITE}${pathname === '/' ? '/' : pathname}`;
  setMeta('meta[property="og:url"]', 'property', 'og:url', url);

  if (meta.noindex) {
    setMeta('meta[name="robots"]', 'name', 'robots', 'noindex, nofollow');
    setLink('canonical', null);
  } else {
    document.head.querySelector('meta[name="robots"]')?.remove();
    setLink('canonical', url);
  }
}
