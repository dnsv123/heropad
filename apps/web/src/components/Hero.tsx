import { useT } from '../i18n';
import { contactHref, contactIsWhatsApp } from '../lib/contact';
import Pic from './Pic';

// Landing hero, cream and quiet: the premium face owners asked for.
//
// Text first on every screen: an owner in a phone's in-app browser has to
// read the promise and see the button before anything else. The one big
// word ("pierde." / "lose.") is in the brand's blue; the frame stays quiet
// so the owner reads a serious tool, and the character lives in the photo.
//
// The photo is real (the counter at Bătrânu' Sas); the customer's card sits
// on its corner, drawn the way the umbrella site draws HeroPad: blue stamps
// with a white V.
//
// index.html paints this exact block as static HTML before React boots
// (#prehero). Markup and classes are mirrored there — change one, change both.
export default function Hero() {
  const { t } = useT();

  return (
    <section className="relative">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-12 pt-8 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:gap-12 md:pb-16 md:pt-14 lg:pb-20">
        <div className="min-w-0">
          <p className="kicker">{t('hero.eyebrow2')}</p>
          <h1 className="mt-3 text-balance font-display text-[2.15rem] font-bold leading-[1.06] tracking-tight text-ink sm:text-5xl md:mt-4 lg:text-[3.65rem]">
            {t('hero.h1.a')}
            <span className="big-word">{t('hero.h1.b')}</span>
          </h1>
          <p className="mt-5 max-w-[50ch] text-[17px] leading-relaxed text-ink-2 sm:text-lg">{t('hero.lede')}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href={contactHref()}
              target={contactIsWhatsApp() ? '_blank' : undefined}
              rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
              className="pbtn pbtn-blue"
            >
              {t('biz.cta')}
            </a>
            <a href="#pricing" className="pbtn pbtn-white">
              {t('hero.cta.prices')}
            </a>
          </div>
          <p className="mt-4 text-[13px] font-semibold text-ink-3">{t('hero.fine')}</p>
          <p className="mt-6 flex items-center gap-3 text-sm text-ink-2">
            <img
              src="/super-victor-face.webp"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-full border border-ink/10 bg-brand-deep"
            />
            <span>{t('hero.proof')}</span>
          </p>
        </div>

        {/* The photo panel, with the card sticker in its own corner. The
            sticker overlaps the photo, never the text. */}
        <div className="relative mx-auto w-full max-w-[440px] pb-6 pl-2 md:max-w-none md:pb-8 md:pl-6">
          <div className="photo aspect-[4/5]">
            <Pic
              base="/photos/hero-card"
              widths={[480, 720, 960]}
              fallback={720}
              sizes="(min-width: 1024px) 480px, (min-width: 768px) 42vw, min(90vw, 420px)"
              width={1280}
              height={1600}
              eager
              alt="A customer holding their HeroPad card at the counter of Bătrânu' Sas, the SuperVictor figurine beside the till"
            />
          </div>
          <div data-overlay="card" className="absolute bottom-0 left-0 w-[196px] rounded-2xl border border-ink/10 bg-paper-2 p-3.5 shadow-soft sm:w-[214px]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-cognac">{t('hero.card.label')}</p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="truncate text-[13px] font-bold text-ink">Bătrânu' Sas</p>
              <p className="shrink-0 font-display text-lg font-bold leading-none text-ink">
                4<span className="text-[13px] text-ink-3">/5</span>
              </p>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1.5" aria-hidden>
              <span className="stamp stamp-on" />
              <span className="stamp stamp-on" />
              <span className="stamp stamp-on" />
              <span className="stamp stamp-on" />
              <span className="stamp" />
            </div>
            <p className="mt-2 text-[12px] font-semibold text-ink-2">
              {t('hero.card.at', { n: 5 })}{' '}
              <span className="rounded-full bg-sun-soft px-2 py-0.5 font-semibold text-ink">{t('hero.card.reward')}</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
