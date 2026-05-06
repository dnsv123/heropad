import { motion } from 'framer-motion';

import Hero from '../components/Hero';
import HowItWorks from '../components/HowItWorks';
import WhySolana from '../components/WhySolana';

// Single-scroll landing narrative.
// "Floating Victor" is a small flying-pose mascot positioned between the
// "How it works" and "Why Solana" sections — adds personality without
// stealing focus. Hidden on small screens to keep the mobile flow clean.
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
        className="pointer-events-none absolute right-4 top-[68%] hidden h-32 w-auto opacity-90 drop-shadow-[0_10px_40px_rgba(93,211,255,0.3)] lg:block xl:right-12 xl:h-40"
        initial={{ opacity: 0, x: 30 }}
        whileInView={{ opacity: 0.95, x: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        animate={{ y: [0, -14, 0] }}
        style={{
          // The keyframe Y animation should run continuously, but framer-motion
          // can't compose two `animate` props. We use the `style` for a CSS
          // float fallback when the entrance has finished.
        }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />

      <WhySolana />
    </div>
  );
}
