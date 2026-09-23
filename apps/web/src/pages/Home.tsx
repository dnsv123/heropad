import Hero from '../components/Hero';
import HowItWorks from '../components/HowItWorks';
import CounterKit from '../components/CounterKit';
import ForBusinesses from '../components/ForBusinesses';
import ForWho from '../components/ForWho';
import LandingPricing from '../components/LandingPricing';
import Ecosystem from '../components/Ecosystem';
import { useT, type TranslationKey } from '../i18n';

// Landing, "Counter Editorial". The narrative:
//   the promise, with a real counter photo → four facts, each a number we can
//   stand behind → how it works (three real moments) → what lands on the
//   counter → the blue panel that sells to owners → who it fits → pricing →
//   the universe it belongs to.
//
// No framer-motion: every section renders at rest. A page that is simply
// there feels faster than one that fades itself in.
const FACTS: Array<[TranslationKey, TranslationKey]> = [
  ['strip.1.v', 'strip.1.l'],
  ['strip.2.v', 'strip.2.l'],
  ['strip.3.v', 'strip.3.l'],
  ['strip.4.v', 'strip.4.l'],
];

export default function Home() {
  const { t } = useT();
  return (
    <div className="relative">
      <Hero />

      {/* Four facts about the product, not stats we do not have. */}
      <div className="border-y border-ink/10 bg-paper-2">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 md:grid-cols-4">
          {FACTS.map(([v, l], i) => (
            <div
              key={v}
              className={`min-w-0 px-4 py-5 sm:px-6 md:py-6 ${i % 2 === 1 ? 'border-l border-ink/10' : ''} ${
                i >= 2 ? 'border-t border-ink/10 md:border-t-0' : ''
              } ${i === 2 ? 'md:border-l' : ''}`}
            >
              <dt className="font-display text-[1.7rem] font-bold leading-none tracking-tight text-ink sm:text-3xl">{t(v)}</dt>
              <dd className="mt-1.5 text-[13px] leading-snug text-ink-2 sm:text-sm">{t(l)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <HowItWorks />
      <CounterKit />
      <ForBusinesses />
      <ForWho />
      <LandingPricing />
      <Ecosystem />
    </div>
  );
}
