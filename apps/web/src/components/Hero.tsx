import { useT } from '../i18n';
import { contactHref, contactIsWhatsApp } from '../lib/contact';

// Landing hero, paper face. The promise as the headline, a real photo from a
// real counter as the proof, the customer card in a small navy tile on top
// of it. No mascot here: he is in the header and in the sales panel below.
//
// The photo is the LCP element. It paints the instant it arrives (preloaded
// from index.html with the same srcset), nothing starts at opacity 0.
//
// index.html paints this exact block as static HTML before React boots
// (#prehero). Markup and classes are mirrored there — change one, change both.
export default function Hero() {
  const { t } = useT();

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 py-10 sm:px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-10 md:py-16 lg:py-20">
        <div className="order-2 min-w-0 text-center md:order-1 md:text-left">
          <p className="eyebrow-brass">{t('hero.eyebrow2')}</p>
          <h1 className="mt-3 text-balance font-display text-[2.1rem] font-bold leading-[1.04] tracking-tight text-ink sm:text-5xl md:mt-4 lg:text-6xl">
            {t('hero.h1.a')}
            <span className="text-brass">{t('hero.h1.b')}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[52ch] text-base text-ink-2 sm:text-lg md:mx-0 md:mt-5">
            {t('hero.lede')}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 md:justify-start">
            <a
              href={contactHref()}
              target={contactIsWhatsApp() ? '_blank' : undefined}
              rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
              className="btn btn-brass"
            >
              {t('biz.cta')}
            </a>
            <a href="#pricing" className="btn btn-line">
              {t('hero.cta.prices')}
            </a>
          </div>
          <p className="mt-6 flex items-center justify-center gap-3 text-sm text-ink-3 md:justify-start">
            <img
              src="/super-victor-pfp.webp"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-full border border-ink/10 bg-white"
            />
            <span>{t('hero.proof')}</span>
          </p>
        </div>

        {/* The photo, with the card tile. aspect-ratio + width/height keep
            the box stable before the image lands: CLS 0. */}
        <div className="order-1 mx-auto w-full max-w-[420px] md:order-2 md:max-w-none">
          <div className="photo aspect-[4/5]">
            <img
              src="/photos/hero-card-720.webp"
              srcSet="/photos/hero-card-480.webp 480w, /photos/hero-card-720.webp 720w, /photos/hero-card-960.webp 960w"
              sizes="(min-width: 1024px) 520px, (min-width: 768px) 46vw, min(92vw, 420px)"
              width={1280}
              height={1600}
              alt="A customer holding their HeroPad card at the counter of Bătrânu' Sas, the SuperVictor figurine beside the till"
              decoding="async"
            />
            <div className="absolute bottom-4 left-4 w-[164px] rounded-2xl bg-hero-deep/95 p-3 text-left text-white shadow-[0_20px_40px_-20px_rgba(10,27,58,.6)] backdrop-blur sm:w-[178px] sm:p-3.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-hero-cyan">{t('hero.card.label')}</p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-300">Bătrânu' Sas</p>
              <p className="tnum mt-1.5 font-display text-[26px] font-bold leading-none">
                4<span className="text-[15px] text-slate-400">/5</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hero-navy2">
                <div className="h-full w-4/5 rounded-full bg-brass-2" />
              </div>
              <p className="mt-2 text-[10px] font-semibold text-brass-2">🎁 {t('hero.card.reward')}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
