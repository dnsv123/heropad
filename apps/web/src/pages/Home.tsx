import { motion } from 'framer-motion';

import Hero from '../components/Hero';
import HowItWorks from '../components/HowItWorks';
import ForBusinesses from '../components/ForBusinesses';
import Ecosystem from '../components/Ecosystem';

// Landing narrative, Power-Pass-first:
//   Hero (the promise) → How it works (customer journey) → For businesses
//   (the sales section the gold CTA scrolls to) → Ecosystem (SuperVictor
//   universe doors: Hall of Heroes, Shop, Comic, V-DASH, Claim).
export default function Home() {
  return (
    <div className="relative">
      <Hero />
      <HowItWorks />

      {/* Decorative floating mascot — desktop only, subtle. */}
      <motion.img
        src="/super-victor-fly-1.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute right-4 top-[62%] hidden h-32 w-auto opacity-90 drop-shadow-[0_10px_40px_rgba(93,211,255,0.3)] lg:block xl:right-12 xl:h-40"
        initial={{ opacity: 0, x: 30 }}
        whileInView={{ opacity: 0.95, x: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />

      <ForBusinesses />
      <Ecosystem />
    </div>
  );
}
