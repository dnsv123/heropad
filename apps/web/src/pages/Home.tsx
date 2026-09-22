import Hero from '../components/Hero';
import HowItWorks from '../components/HowItWorks';
import CounterKit from '../components/CounterKit';
import ForBusinesses from '../components/ForBusinesses';
import ForWho from '../components/ForWho';
import LandingPricing from '../components/LandingPricing';
import Ecosystem from '../components/Ecosystem';
import { useT } from '../i18n';

// Landing, paper face. The narrative:
//   Hero (the promise, with a real counter photo) → four facts in a strip →
//   how it works (three real moments) → what lands on the counter → the one
//   navy panel that sells to owners → who it fits → pricing → the universe.
//
// No framer-motion: every section renders at rest. A page that is simply
// there feels faster than one that fades itself in.
export default function Home() {
  const { t } = useT();
  return (
    <div className="relative">
      <Hero />

      {/* Four facts. Not stats we do not have — facts about the product. */}
      <div className="border-y border-ink/10 bg-paper-2">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-5 py-4 text-[13px] text-ink-3 sm:px-6">
          <span className="flex items-center gap-2">
            <i className="inline-block h-2 w-2 rounded-full bg-[#14a36a] shadow-[0_0_0_4px_rgba(20,163,106,.15)]" />
            {t('strip.1')}
          </span>
          <span>{t('strip.2')}</span>
          <span>{t('strip.3')}</span>
          <span>{t('strip.4')}</span>
        </div>
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
