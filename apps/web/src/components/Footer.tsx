import { Link, useLocation } from 'react-router-dom';

import { useT } from '../i18n';

// Footer. Two faces, like the header.
//
// Landing: the family's ink footer (same as supervictoruniverse.com): who we
// are, where to go, the company's legal identity, the ANPC badges Romanian
// law expects on a site that sells, and the trade-mark line.
// App screens: the quiet navy line it always was.
const COMPANY = 'SVU Journey SRL · Str. Iuliu Maniu 2H, Șelimbăr, Sibiu · CUI 47892453 · J2023000609321';

function Anpc() {
  // SAL = the national alternative-resolution body, SOL = the EU online-
  // dispute platform. On a white chip so they read on any ground.
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3">
      <a
        href="https://anpc.ro/ce-este-sal/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="ANPC — Soluționarea alternativă a litigiilor"
        className="rounded-md bg-white p-1"
      >
        <img src="/brand/anpc-sal.webp" alt="ANPC SAL" width={636} height={160} loading="lazy" className="h-[36px] w-auto" />
      </a>
      <a
        href="https://ec.europa.eu/consumers/odr"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Soluționarea online a litigiilor"
        className="rounded-md bg-white p-1"
      >
        <img src="/brand/anpc-sol.svg" alt="SOL" width={212} height={53} loading="lazy" className="h-[36px] w-auto" />
      </a>
    </div>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();
  const { t } = useT();
  const paper = useLocation().pathname === '/';

  if (paper) {
    const col = 'mb-3 text-[12px] font-extrabold uppercase tracking-[0.14em] text-paper';
    const a = 'text-paper/75 transition hover:text-white hover:underline';
    return (
      <footer className="mt-16 bg-ink text-sm text-paper/75">
        <div className="mx-auto grid max-w-6xl gap-x-6 gap-y-9 px-4 pb-8 pt-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
          <div className="flex min-w-0 items-start gap-3">
            <img
              src="/super-victor-face.webp"
              alt=""
              width={40}
              height={40}
              loading="lazy"
              className="h-10 w-10 shrink-0 rounded-full border-2 border-paper/80 bg-brand-deep"
            />
            <div className="min-w-0">
              <p className="font-display text-lg font-bold text-paper">
                Hero<span className="text-brand-amber">Pad</span>
              </p>
              <p className="mt-1 max-w-[30ch] text-paper/70">{t('f.tagline')}</p>
            </div>
          </div>
          <div>
            <p className={col}>{t('f.col.product')}</p>
            <ul className="grid gap-1.5">
              <li><a href="#pricing" className={a}>{t('nav.pricing')}</a></li>
              <li><Link to="/rewards" className={a}>{t('f.rewards')}</Link></li>
              <li><Link to="/passport" className={a}>{t('f.passport')}</Link></li>
              <li><Link to="/business" className={a}>{t('f.counter')}</Link></li>
            </ul>
          </div>
          <div>
            <p className={col}>{t('f.col.universe')}</p>
            <ul className="grid gap-1.5">
              <li><a href="https://supervictoruniverse.com" target="_blank" rel="noopener noreferrer" className={a}>SuperVictor Universe</a></li>
              <li><a href="https://supervictornft.com" target="_blank" rel="noopener noreferrer" className={a}>Hall of Heroes</a></li>
              <li><a href="https://supervictor.shop" target="_blank" rel="noopener noreferrer" className={a}>Shop</a></li>
              <li><a href="https://x.com/SVictorUniverse" target="_blank" rel="noopener noreferrer" className={a}>X</a></li>
            </ul>
          </div>
          <div>
            <p className={col}>{t('f.col.company')}</p>
            <ul className="grid gap-1.5">
              <li><a href="mailto:partner@supervictornft.com" className={`${a} break-all`}>partner@supervictornft.com</a></li>
              <li><a href="mailto:support@supervictornft.com" className={`${a} break-all`}>support@supervictornft.com</a></li>
              <li><Link to="/terms" className={a}>{t('f.terms')}</Link></li>
              <li><Link to="/privacy" className={a}>{t('f.privacy')}</Link></li>
            </ul>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl flex-col gap-4 border-t border-paper/15 px-4 pb-9 pt-5 sm:px-6 md:flex-row md:items-center md:justify-between">
          <p className="text-[12.5px] leading-relaxed text-paper/60 md:max-w-[64ch]">
            © {year} {COMPANY}. {t('f.tm')}
          </p>
          <Anpc />
        </div>
      </footer>
    );
  }

  const c = { wrap: 'border-white/[0.06] bg-hero-deep', text: 'text-slate-400', link: 'text-slate-300 hover:text-white', dim: 'text-slate-600' };

  return (
    <footer className={`mt-20 border-t ${c.wrap}`}>
      <div className={`mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-8 text-sm sm:px-6 md:flex-row md:justify-between ${c.text}`}>
        <div className="flex min-w-0 items-center gap-3 text-center md:text-left">
          <img
            src="/brand/supervictor-logo.webp"
            alt="SuperVictor Universe"
            width={512}
            height={489}
            loading="lazy"
            className="h-9 w-auto shrink-0 object-contain"
          />
          <span>
            © {year} SVU Journey SRL. {t('f.tagline')}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
          <a href="/privacy" className={`transition ${c.link}`}>{t('f.privacy')}</a>
          <a href="/terms" className={`transition ${c.link}`}>{t('f.terms')}</a>
          <a href="https://supervictor.shop" target="_blank" rel="noopener noreferrer" className={`transition ${c.link}`}>Shop</a>
          <a href="https://supervictornft.com" target="_blank" rel="noopener noreferrer" className={`transition ${c.link}`}>Hall of Heroes</a>
          <a href="https://x.com/SVictorUniverse" target="_blank" rel="noopener noreferrer" className={`transition ${c.link}`}>X</a>
          <span className={c.dim}>v1.2</span>
        </div>
      </div>
      <div className={`mx-auto flex max-w-6xl justify-center px-5 pb-6 sm:px-6 md:justify-end ${c.text}`}>
        <Anpc />
      </div>
    </footer>
  );
}
