import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';

import ClaimFlow from '../components/ClaimFlow';

// /claim is the landing page for QR / NFC redirects. The URL carries the claim
// code as ?c=ABC; we read it here and hand it down to the flow component.
//
// Design: split layout with copy + (eventual) input on the left and the
// boxing-pose SuperVictor on the right as the energy mascot. On mobile the
// mascot is small and sits above the copy — same idea as Hero.
export default function Claim() {
  const [params] = useSearchParams();
  const code = params.get('c') ?? null;

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero-glow" />

      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 py-12 md:flex-row md:gap-12 md:py-20">
        {/* Mascot — flying pose: communicates "claim & soar".
            Soft cyan glow underneath so the character pops on the dark bg. */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative order-first w-full max-w-[200px] flex-shrink-0 md:order-last md:max-w-sm md:flex-1"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 mx-auto h-full w-full rounded-full bg-hero-cyan/15 blur-3xl"
          />
          <motion.img
            src="/super-victor-fly-1.png"
            alt="Super Victor — ready to claim"
            className="relative w-full object-contain drop-shadow-[0_15px_50px_rgba(93,211,255,0.4)]"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </motion.div>

        {/* Copy + flow column. */}
        <div className="flex-1">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-xs uppercase tracking-[0.3em] text-hero-cyan"
          >
            Claim flow
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-3 font-display text-3xl font-semibold md:text-4xl"
          >
            Claim your hero
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-3 max-w-lg text-slate-400"
          >
            Scanned a figurine, card, or pack? Drop the code below and we'll
            mint your Solana cNFT in one step.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="mt-8"
          >
            <ClaimFlow initialCode={code} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
