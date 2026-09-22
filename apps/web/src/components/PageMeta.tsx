import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { useT, type TranslationKey } from '../i18n';
import { applyPageMeta } from '../lib/pageMeta';

// Names every route in the tab and the share card, in the visitor's language.
// Lives once in App; a page with a better name (the venue's own card) sets
// its own after its data arrives, and that later write wins.

const ROUTES: Array<{
  match: (p: string) => boolean;
  title: TranslationKey;
  description: TranslationKey;
  noindex?: boolean;
}> = [
  { match: (p) => p === '/', title: 'pt.home', description: 'pt.home.d' },
  { match: (p) => p.startsWith('/loyalty'), title: 'pt.loyalty.any', description: 'pt.app.d' },
  { match: (p) => p === '/profile', title: 'pt.profile', description: 'pt.app.d', noindex: true },
  // Both are in the sitemap: the catalogue and the passport tiers read fine
  // without a session, only the balances need one.
  { match: (p) => p === '/passport', title: 'pt.passport', description: 'pt.passport.d' },
  { match: (p) => p === '/rewards', title: 'pt.rewards', description: 'pt.rewards.d' },
  { match: (p) => p === '/business', title: 'pt.business', description: 'pt.app.d', noindex: true },
  { match: (p) => p === '/admin', title: 'pt.admin', description: 'pt.app.d', noindex: true },
  { match: (p) => p === '/partner', title: 'pt.partner', description: 'pt.app.d', noindex: true },
  { match: (p) => p === '/claim', title: 'pt.claim', description: 'pt.claim.d' },
  { match: (p) => p === '/v-dash', title: 'pt.vdash', description: 'pt.vdash.d' },
  { match: (p) => p === '/privacy', title: 'pt.privacy', description: 'pt.privacy.d' },
  { match: (p) => p === '/terms', title: 'pt.terms', description: 'pt.terms.d' },
];

export default function PageMeta() {
  const { pathname } = useLocation();
  const { t, lang } = useT();

  useEffect(() => {
    const r = ROUTES.find((x) => x.match(pathname)) ?? ROUTES[0];
    applyPageMeta(
      { title: t(r.title), description: t(r.description), noindex: r.noindex },
      pathname,
      lang
    );
  }, [pathname, lang, t]);

  return null;
}
