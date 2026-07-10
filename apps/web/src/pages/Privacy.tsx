// /privacy — Privacy notice for HeroPad.
// Adapted from the SuperVictor Universe master privacy policy (March 2026).
// This page covers what's specific to HeroPad's data flow (Privy auth, Solana
// wallet linkage, Helius DAS reads, BITS ledger). For the full SVU master
// policy spanning all products, link to supervictornft.com/privacy.

const SECTIONS = [
  {
    title: '1. Who we are',
    body: `HeroPad is a service operated by SVU Journey SRL (SuperVictor Universe), with
    registered office in Romania. The SuperVictor character and V-mark are EUIPO-registered
    trademarks (filing 019287298). For privacy questions: privacy@supervictornft.com.`,
  },
  {
    title: '2. What we collect',
    body: `When you use HeroPad we collect: (a) authentication identifiers from Privy —
    email address, Google OAuth subject, or wallet address depending on how you sign in;
    (b) your Solana wallet public address(es); (c) claim events and BITS transactions
    (timestamp, code, asset id) stored in our Supabase database hosted in EU (Frankfurt);
    (d) anonymous device telemetry from Privy (locale, last login). We do NOT collect
    private keys — those stay in Privy's MPC custody or your external wallet.`,
  },
  {
    title: '3. How we use it',
    body: `We use this data to: provide the claim & mint flow; prevent double-claims;
    award and account for BITS rewards; show you your collection; secure the service
    against abuse (rate limiting, anti-fraud). We do NOT sell or share with advertisers.`,
  },
  {
    title: '4. Where it lives',
    body: `Authentication state: Privy (US, EU sub-processors). Database: Supabase
    (Frankfurt, EU). Solana on-chain data: public, decentralized, by definition not under
    our control. Service hosting: Vercel (frontend, EU edge) + Railway (backend, US West).`,
  },
  {
    title: '5. Your rights (GDPR)',
    body: `You can request access, correction, deletion, or export of your data at any
    time by emailing privacy@supervictornft.com. We will respond within 30 days. Note:
    on-chain data (your cNFTs, transaction signatures) is immutable by design — we can
    delete the bond between your wallet and your account, but we cannot remove records
    from the Solana blockchain.`,
  },
  {
    title: '6. Cookies & local storage',
    body: `HeroPad uses local browser storage only for: keeping you logged in (Privy
    session token), remembering your preferences (theme, last visited page), and
    Service Worker offline cache. No third-party advertising cookies.`,
  },
  {
    title: '7. Children',
    body: `HeroPad is family-friendly but the wallet & cNFT functionality requires that
    the account holder be of legal age in their jurisdiction (typically 18+). Parents/
    guardians can claim figurines on behalf of minors using their own wallet.`,
  },
  {
    title: '8. Changes',
    body: `If we materially change this policy we will notify users via email (where
    available) and prominently on the site. Effective date of this version: 7 May 2026.`,
  },
];

export default function Privacy() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16 md:py-20">
      <p className="text-xs uppercase tracking-[0.3em] text-hero-cyan">Legal</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight md:text-5xl">
        Privacy Notice
      </h1>
      <p className="mt-3 text-sm text-slate-500">Effective 7 May 2026 · v1.0</p>

      <div className="mt-10 space-y-7">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <h2 className="font-display text-lg font-semibold text-hero-cyan">
              {s.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{s.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-10 text-xs text-slate-500">
        This notice covers HeroPad specifically. For the broader SuperVictor Universe
        privacy policy spanning V-DASH and other products, see{' '}
        <a
          href="https://supervictornft.com/privacy-policy.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-hero-cyan hover:text-hero-gold"
        >
          supervictornft.com/privacy-policy
        </a>
        .
      </p>
    </section>
  );
}
