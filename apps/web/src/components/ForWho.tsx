import { useT } from '../i18n';
import { Art } from './Pic';

// Landing → who it fits. The mechanics are identical everywhere; only the
// pose, the threshold and the reward change, which is exactly the message.
// SuperVictor in each trade's pose is the character at work: the thing no
// competitor can copy, and the start of the proliferation plan (every trade,
// then every venue, gets its own hero).
export default function ForWho() {
  const { t } = useT();

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
    <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 md:pt-24">
      <div className="max-w-[62ch]">
        <h2 className="caption">{t('fw.caption')}</h2>
        <p className="mt-5 text-balance font-display text-3xl font-bold leading-[1.08] tracking-tight text-ink md:text-[2.4rem]">
          {t('fw.title')}
        </p>
        <p className="mt-3 text-base text-ink-2 md:text-lg">{t('fw.sub')}</p>
      </div>
      <ul className="mt-9 grid grid-cols-2 gap-3 min-[420px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-6 md:gap-4">
        {verticals.map(([img, label]) => (
          <li
            key={img}
            className="panel-quiet min-w-0 p-3 text-center transition hover:-translate-x-px hover:-translate-y-px hover:shadow-panel-sm"
          >
            <Art
              src={`/venues/${img}.webp`}
              alt=""
              width={320}
              height={320}
              className="mx-auto aspect-square w-full max-w-[112px] object-contain"
            />
            <span className="mt-2 block text-[13px] font-semibold leading-tight text-ink">{label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm text-ink-3">{t('fw.more')}</p>
    </section>
  );
}
