import { motion } from 'framer-motion';

// 3-step explainer. Each step uses a brand colour and reveals on scroll
// with a staggered delay, so the section feels alive rather than static.
const STEPS = [
  {
    n: '01',
    title: 'Scan',
    accent: 'text-hero-cyan',
    border: 'border-hero-cyan/30 hover:border-hero-cyan',
    glow: 'hover:shadow-[0_0_30px_-10px_rgba(93,211,255,0.5)]',
    body: 'Tap your NFC figurine, scan the QR card, or point your camera at the pack. Each item carries a unique signed code.',
  },
  {
    n: '02',
    title: 'Claim',
    accent: 'text-hero-gold',
    border: 'border-hero-gold/30 hover:border-hero-gold',
    glow: 'hover:shadow-hero-gold',
    body: 'Sign in with email, Google, or Phantom. We mint a Solana cNFT to your wallet — gas-light, near-instant, yours forever.',
  },
  {
    n: '03',
    title: 'Play',
    accent: 'text-solana-purple',
    border: 'border-solana-purple/30 hover:border-solana-purple',
    glow: 'hover:shadow-hero-purple',
    body: 'Your collectibles unlock V-DASH characters, BITS rewards, and seasonal events. The figurine is the key.',
  },
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

export default function HowItWorks() {
  return (
    <section className="px-6 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="font-display text-3xl font-semibold md:text-4xl"
        >
          How it works
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-2 max-w-2xl text-slate-400"
        >
          One scan turns a SuperVictor toy into a verifiable on-chain
          collectible — and a key that unlocks gameplay.
        </motion.p>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="mt-10 grid gap-4 md:grid-cols-3"
        >
          {STEPS.map((s) => (
            <motion.div
              key={s.n}
              variants={cardVariants}
              whileHover={{ y: -4 }}
              className={`rounded-2xl border ${s.border} ${s.glow} bg-hero-deep/40 p-6 backdrop-blur transition-all duration-300`}
            >
              <p className={`font-mono text-xs ${s.accent}`}>{s.n}</p>
              <h3 className="mt-2 font-display text-xl font-semibold">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{s.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
