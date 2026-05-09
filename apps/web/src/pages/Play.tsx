import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

// /v-dash — V-DASH cross-product preview page.
// ---------------------------------------------
// Goal: tell the story that HeroPad is the Solana entry point of the
// SuperVictor Universe, and that V-DASH (the existing game on MultiversX)
// is the gameplay layer where these cNFTs become useful.
//
// Scope for hackathon: zero game runtime integration. Pure marketing page
// with screenshots, narrative, and a CTA to play V-DASH externally.

const FEATURES = [
  {
    title: 'Hero Skins',
    body: 'Each Super Victor cNFT minted via HeroPad becomes a wearable skin in V-DASH. Equip your collection, switch outfits between runs, show your Genesis edition.',
    image: '/super-victor-fly-1.png',
    accent: 'text-hero-cyan',
    border: 'border-hero-cyan/30',
  },
  {
    title: 'Hero Gear (Chapter 2)',
    body: 'Helmets, armor, gloves, weapons, amulets, pets — all tradeable Solana cNFTs. Combine 3 badge fragments to forge a Season Emblem. Stat bonuses in PvE.',
    image: '/super-victor-boxing.png',
    accent: 'text-hero-gold',
    border: 'border-hero-gold/30',
  },
  {
    title: 'BITS Rewards',
    body: 'Play V-DASH, earn BITS. Spend BITS to upgrade gear, claim limited drops, enter seasonal tournaments. Cross-product economy across the SuperVictor Universe.',
    image: '/diamond-hands.png',
    accent: 'text-solana-purple',
    border: 'border-solana-purple/30',
  },
];

const ROADMAP = [
  { label: '✅ Live now',          body: 'V-DASH playable on MultiversX · HeroPad cNFT mint on Solana devnet' },
  { label: 'Q3 2026',              body: 'HeroPad mainnet launch · marketplace integration' },
  { label: 'Q3 – Q4 2026',         body: 'V-DASH Chapter 2 — Hall of Heroes integration · cross-chain skins MultiversX + Solana' },
  { label: 'Q4 2026 – Q1 2027',    body: 'First 100 NFC figurines shipped · early-adopter drops via Shopify' },
  { label: '2027',                 body: 'V-DASH season passes · figurine partnerships · Solana-native game mode' },
];

export default function Play() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero-glow" />

      <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center md:text-left"
        >
          <p className="text-xs uppercase tracking-[0.3em] text-hero-cyan">
            Cross-product
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight md:text-6xl">
            <span className="bg-gradient-to-r from-hero-gold via-hero-gold-bright to-hero-cyan bg-clip-text text-transparent">
              V-DASH
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-300 md:mx-0">
            The flagship game of SuperVictor Universe. Live on MultiversX since
            2024 — coming to Solana with HeroPad cNFT integration in Chapter 2.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 md:justify-start">
            <a
              href="https://supervictornft.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-hero-gold px-6 py-3 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright"
            >
              Play V-DASH ↗
            </a>
            <span className="rounded-full border border-solana-purple/40 bg-solana-purple/5 px-4 py-3 text-sm text-solana-purple">
              Chapter 2 on Solana — 2026
            </span>
          </div>
        </motion.div>

        {/* Featured banner — large character + side copy */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="mt-16 grid items-center gap-10 rounded-3xl border border-hero-blue/25 bg-hero-deep/60 p-6 md:grid-cols-2 md:p-10"
        >
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-3xl bg-hero-cyan/10 blur-2xl"
            />
            <motion.img
              src="/super-victor.png"
              alt="V-DASH gameplay"
              className="relative mx-auto w-full max-w-sm object-contain drop-shadow-[0_15px_40px_rgba(93,211,255,0.3)]"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <div>
            <h2 className="font-display text-3xl font-semibold">
              Your hero. Your gear. Your run.
            </h2>
            <p className="mt-3 text-slate-400">
              V-DASH is a fast-paced action runner where Super Victor and his
              allies battle through dimensions of the SuperVictor Universe.
              Existing players already have a roster of heroes, skins, and pets.
            </p>
            <p className="mt-3 text-slate-400">
              <span className="font-medium text-hero-cyan">
                With HeroPad,
              </span>{' '}
              every physical figurine, scan card, or product pack you collect
              in the real world becomes an in-game asset on Solana — providing
              skins, BITS multipliers, and seasonal drops in V-DASH.
            </p>
          </div>
        </motion.div>

        {/* Feature triplet */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.12 } },
          }}
          className="mt-16 grid gap-5 md:grid-cols-3"
        >
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              variants={{
                hidden: { opacity: 0, y: 24 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
              whileHover={{ y: -4 }}
              className={`relative flex flex-col gap-4 rounded-2xl border ${f.border} bg-hero-deep/40 p-6 transition`}
            >
              <div className="relative h-32 overflow-hidden rounded-xl bg-gradient-to-br from-hero-blue/20 via-hero-deep to-hero-deep">
                <img
                  src={f.image}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full object-contain p-2"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <div>
                <h3 className={`font-display text-lg font-semibold ${f.accent}`}>
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {f.body}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Roadmap timeline */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="mt-16 rounded-3xl border border-hero-blue/20 bg-hero-deep/40 p-6 md:p-10"
        >
          <h2 className="font-display text-2xl font-semibold md:text-3xl">
            Roadmap
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            HeroPad is step one. The wider SuperVictor Universe scales out from
            here.
          </p>

          <ol className="mt-8 space-y-5">
            {ROADMAP.map((item) => (
              <li
                key={item.label}
                className="flex flex-col gap-1 border-l-2 border-hero-blue/30 pl-5 md:flex-row md:items-baseline md:gap-6"
              >
                <span className="shrink-0 font-mono text-xs uppercase tracking-wider text-hero-cyan">
                  {item.label}
                </span>
                <span className="text-sm text-slate-300">{item.body}</span>
              </li>
            ))}
          </ol>
        </motion.div>

        {/* Closing CTA */}
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-slate-400">
            Ready to build your hero collection?
          </p>
          <Link
            to="/claim"
            className="rounded-full bg-hero-gold px-8 py-3 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright"
          >
            Claim your first cNFT →
          </Link>
        </div>
      </div>
    </section>
  );
}
