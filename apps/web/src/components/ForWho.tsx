import { useT } from '../i18n';

// Landing → who it fits. The mechanics are identical everywhere; only the
// pose, the threshold and the reward change — which is exactly the message.
export default function ForWho() {
  const { t } = useT();

  // The mascot in each vertical's pose — Valentin's commissioned art, 320px
  // transparent WebPs (~24KB each, lazy, below the fold). This grid is the
  // thing no competitor can copy.
  const verticals: Array<[string, string]> = [
    ['cafenea', t('fw.v1')],
    ['gelaterie', t('fw.v2')],
    ['cofetarie', t('fw.v3')],
    ['brutarie', t('fw.v4')],
    ['pizzerie', t('fw.v5')],
    ['frizerie', t('fw.v6')],
    ['salon', t('fw.v7')],
    ['fitness', t('fw.v8')],
    ['food-truck', t('fw.v9')],
    ['librarie-cafenea', t('fw.v10')],
    ['ceainarie', t('fw.v11')],
    ['petshop', t('fw.v12')],
  ];

  return (
    <section className="mx-auto max-w-6xl px-5 py-14 sm:px-6 md:py-20">
      <div className="mx-auto max-w-[60ch] text-center">
        <h2 className="text-balance font-display text-3xl font-bold leading-[1.08] tracking-tight text-ink md:text-4xl">
          {t('fw.title')}
        </h2>
        <p className="mt-3 text-base text-ink-2">{t('fw.sub')}</p>
      </div>
      <div className="mt-8 grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 md:grid-cols-6">
        {verticals.map(([img, label]) => (
          <div key={img} className="pcard min-w-0 p-2.5 text-center sm:p-3">
            <img
              src={`/venues/${img}.webp`}
              alt={label}
              width={320}
              height={320}
              loading="lazy"
              decoding="async"
              className="mx-auto aspect-square w-full max-w-[120px] object-contain"
            />
            <span className="mt-1.5 block text-[12px] leading-tight text-ink-2 sm:text-[13px]">{label}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-ink-3">{t('fw.more')}</p>
    </section>
  );
}
