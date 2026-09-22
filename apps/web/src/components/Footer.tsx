import { useLocation } from 'react-router-dom';

import { useT } from '../i18n';

// Footer — corporate identification + legal line + small links. Two faces,
// like the header: paper on the landing, navy everywhere else.
export default function Footer() {
  const year = new Date().getFullYear();
  const { t } = useT();
  const paper = useLocation().pathname === '/';

  const c = paper
    ? { wrap: 'border-ink/10 bg-paper', text: 'text-ink-3', link: 'text-ink-2 hover:text-ink', dim: 'text-ink-3/60' }
    : { wrap: 'border-white/[0.06] bg-hero-deep', text: 'text-slate-400', link: 'text-slate-300 hover:text-white', dim: 'text-slate-600' };

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
            © {year}{' '}
            <a href="https://supervictornft.com" target="_blank" rel="noopener noreferrer" className={`transition ${c.link}`}>
              SuperVictor Universe
            </a>
            . {t('f.tagline')}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
          <a href="/privacy" className={`transition ${c.link}`}>{t('f.privacy')}</a>
          <a href="/terms" className={`transition ${c.link}`}>{t('f.terms')}</a>
          <a href="https://supervictor.shop" target="_blank" rel="noopener noreferrer" className={`transition ${c.link}`}>Shop</a>
          <a href="https://supervictornft.com" target="_blank" rel="noopener noreferrer" className={`transition ${c.link}`}>Hall of Heroes</a>
          <a href="https://x.com/SVictorUniverse" target="_blank" rel="noopener noreferrer" className={`transition ${c.link}`}>X</a>
          <span className={c.dim}>v1.1</span>
        </div>
      </div>

      {/* ANPC: the two consumer-dispute badges Romanian law expects on any
          site that sells. SAL = the national alternative-resolution body,
          SOL = the EU online-dispute platform. Both open in a new tab. */}
      <div className={`mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3 px-5 pb-6 sm:px-6 md:justify-end ${c.text}`}>
        <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener noreferrer" aria-label="ANPC — Soluționarea alternativă a litigiilor">
          <img src="/brand/anpc-sal.webp" alt="ANPC SAL" width={636} height={160} loading="lazy" className="h-[40px] w-auto" />
        </a>
        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" aria-label="Soluționarea online a litigiilor">
          <img src="/brand/anpc-sol.svg" alt="SOL" width={212} height={53} loading="lazy" className="h-[40px] w-auto" />
        </a>
      </div>
    </footer>
  );
}
