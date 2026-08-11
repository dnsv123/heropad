import { motion } from 'framer-motion';

// "Why Solana" pitch — three short value props, with the first card decorated
// by the Diamond Hands illustration as a Web3-native visual cue.
const POINTS = [
  {
    title: 'Compressed NFTs',
    body: '$0.0001 per mint at scale. We can issue cNFTs with every figurine without breaking unit economics.',
    accent: 'text-hero-cyan',
    border: 'border-hero-cyan/20 hover:border-hero-cyan/60',
    illustration: '/diamond-hands.webp',
  },
  {
    title: 'Sub-second finality',
    body: 'A claim feels like a Web2 form submit, not a blockchain transaction. The kid does not wait, the parent does not blink.',
    accent: 'text-hero-gold',
    border: 'border-hero-gold/20 hover:border-hero-gold/60',
    illustration: null,
  },
  {
    title: 'Mobile-native wallets',
    body: 'Phantom, Solflare, and Privy embedded wallets all work on phones. The QR-on-pack flow is a phone-first flow.',
    accent: 'text-solana-purple',
    border: 'border-solana-purple/20 hover:border-solana-purple/60',
    illustration: null,
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

export default function WhySolana() {
  return (
    <section className="border-t border-hero-blue/10 px-6 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="font-display text-3xl font-semibold md:text-4xl"
        >
          Why Solana
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-2 max-w-2xl text-slate-400"
        >
          cNFTs make per-toy minting economically viable at scale. Solana makes
          the claim feel instant.
        </motion.p>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="mt-10 grid gap-6 md:grid-cols-3"
        >
          {POINTS.map((p) => (
            <motion.div
              key={p.title}
              variants={cardVariants}
              whileHover={{ y: -4 }}
              className={`relative rounded-2xl border ${p.border} bg-hero-deep/40 p-6 transition-all duration-300 ${p.illustration ? 'pr-20' : ''}`}
            >
              {/* Small character emblem in the top-right of the card.
                  Sized + positioned so it never overlaps the copy. */}
              {p.illustration && (
                <div className="absolute right-3 top-3">
                  <div className="relative h-14 w-14">
                    <div
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-hero-cyan/25 blur-xl"
                    />
                    <img
                      src={p.illustration}
                      alt=""
                      aria-hidden
                      className="relative h-full w-full object-contain drop-shadow-[0_4px_12px_rgba(93,211,255,0.4)]"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              )}
              <h3 className={`relative font-display text-lg font-semibold ${p.accent}`}>
                {p.title}
              </h3>
              <p className="relative mt-3 text-sm leading-relaxed text-slate-400">
                {p.body}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
