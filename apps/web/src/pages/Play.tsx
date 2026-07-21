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
    body: 'The heroes you collect through HeroPad become wearable skins in V-DASH. Equip your collection and switch outfits between runs.',
    image: '/super-victor-fly-1.png',
    accent: 'text-hero-cyan',
    border: 'border-hero-cyan/30',
  },
  {
    title: 'Hero Gear',
    body: 'Helmets, armor, pets and more — collectible gear for your hero. In the works; more news when it’s ready.',
    image: '/super-victor-boxing.png',
    accent: 'text-hero-gold',
    border: 'border-hero-gold/30',
  },
  {
    title: 'BITS Rewards',
    body: 'Earn BITS across the SuperVictor Universe — loyalty trophies included — and spend them on drops, upgrades and seasonal events.',
    image: '/diamond-hands.png',
    accent: 'text-solana-purple',
    border: 'border-solana-purple/30',
  },
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
            The flagship game of the SuperVictor Universe — live and playable
            today. Your HeroPad heroes and loyalty trophies will plug right
            into it.
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
              V-DASH is a fast-paced action runner where SuperVictor and his
              allies battle through dimensions of the SuperVictor Universe.
              Existing players already have a roster of heroes, skins, and pets.
            </p>
            <p className="mt-3 text-slate-400">
              <span className="font-medium text-hero-cyan">
                With HeroPad,
              </span>{' '}
              the heroes and trophies you collect in the real world — figurines,
              cards, café loyalty — become part of your V-DASH identity: skins,
              BITS and seasonal drops.
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

        {/* Closing CTA */}
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-slate-400">
            Ready to build your hero collection?
          </p>
          <Link
            to="/claim"
            className="rounded-full bg-hero-gold px-8 py-3 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright"
          >
            Start your collection →
          </Link>
        </div>
      </div>
    </section>
  );
}
