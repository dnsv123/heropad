import { useEffect, useRef, useState } from 'react';

import { useT } from '../i18n';
import { contactHref, contactIsWhatsApp } from '../lib/contact';
import Pic from './Pic';

/** The one-minute film, in a dialog. Nothing loads until it is opened. */
function VideoDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const close = () => onClose();
    d?.addEventListener('close', close);
    return () => d?.removeEventListener('close', close);
  }, [onClose]);
  const v = lang === 'ro' ? 'ro' : 'en';
  return (
    <dialog
      ref={ref}
      aria-label={t('video.title')}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(92vw,420px)] overflow-visible bg-transparent p-0 backdrop:bg-ink/80 backdrop:backdrop-blur-sm"
    >
      <div className="relative">
        <video
          src={`/video/heropad-world-${v}.mp4`}
          poster={`/video/heropad-world-${v}.webp`}
          controls
          autoPlay
          playsInline
          className="aspect-[9/16] w-full rounded-3xl bg-brand-deep shadow-soft"
        />
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="absolute -top-12 right-0 rounded-full bg-paper-2 px-4 py-2 text-sm font-semibold text-ink"
        >
          {t('video.close')}
        </button>
      </div>
    </dialog>
  );
}

// Landing hero, cream and quiet: the premium face owners asked for.
//
// Text first on every screen: an owner in a phone's in-app browser has to
// read the promise and see the button before anything else. The one big
// word ("pierde." / "lose.") is in the brand's blue; the frame stays quiet
// so the owner reads a serious tool, and the character lives in the photo.
//
// The photo is real (filmed at the counter of Bătrânu' Sas); the card on its
// corner is named "your café", not theirs: we filmed there, the venue is not
// presented as a customer. Stamps carry SuperVictor's silhouette.
//
// index.html paints this exact block as static HTML before React boots
// (#prehero). Markup and classes are mirrored there — change one, change both.
export default function Hero() {
  const { t } = useT();
  const [video, setVideo] = useState(false);

  return (
    <section className="relative">
      {video && <VideoDialog onClose={() => setVideo(false)} />}
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-12 pt-8 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:gap-12 md:pb-16 md:pt-14 lg:pb-20">
        <div className="min-w-0">
          <p className="kicker">{t('hero.eyebrow2')}</p>
          <h1 className="mt-3 text-balance font-display text-[2.15rem] font-bold leading-[1.06] tracking-tight text-ink sm:text-5xl md:mt-4 lg:text-[3.3rem]">
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
            <button type="button" onClick={() => setVideo(true)} className="pbtn pbtn-white">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
                <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z" />
              </svg>
              {t('hero.cta.watch')}
            </button>
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
              alt={t('hero.photo.alt')}
            />
          </div>
          <div data-overlay="card" className="absolute bottom-0 left-0 w-[196px] rounded-2xl border border-ink/10 bg-paper-2 p-3.5 shadow-soft sm:w-[214px]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-cognac">{t('hero.card.label')}</p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="truncate text-[13px] font-bold text-ink">{t('hero.card.venue')}</p>
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
