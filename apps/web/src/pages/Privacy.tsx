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
    body: `(a) Account identifiers via Privy — your email or Google account, and your
    Solana wallet address. Your account email is held by Privy on our behalf; we store a
    copy only if you opt in to our newsletter. (b) Loyalty activity in our own database:
    which partner venue gave you a stamp and when, rewards you redeemed, your 6-character
    loyalty code, and short-lived reward codes. This includes a record of which venues you
    visited and on which days. (c) BITS transactions and claim events (timestamp, code,
    asset id). We never collect or see private keys — those stay in Privy's MPC custody or
    in your own wallet.`,
  },
  {
    title: '3. How we use it, and on what legal basis',
    body: `To run the loyalty service — award and track stamps, prevent double-redemption,
    mint your trophies, show your collection — on the basis of our contract with you
    (GDPR Art. 6(1)(b)). To keep the service secure and fraud-free (rate limits, audit of
    merchant actions), on the basis of our legitimate interest (Art. 6(1)(f)). To send you
    news and offers ONLY if you separately opt in, on the basis of consent (Art. 6(1)(a))
    — you can withdraw it any time, and doing so never affects your stamps. We do not sell
    your data or share it with advertisers.`,
  },
  {
    title: '4. What partner venues see — and what they never see',
    body: `Cafés and other partner venues using HeroPad NEVER see your email, name, wallet
    or any personal identifier. They see your anonymous 6-character code and aggregate
    counts (how many customers, how many stamps, repeat rate). We are the data controller;
    venues act only through our interface.`,
  },
  {
    title: '5. Where it lives',
    body: `Authentication: Privy (our processor). Database: Supabase (Frankfurt, EU).
    Blockchain reads and asset images: Helius (their servers see your wallet address and,
    when images load, your IP). Hosting: Vercel (frontend) + Railway (backend). Solana
    on-chain data is public and decentralized by design.`,
  },
  {
    title: '6. How long we keep it',
    body: `Loyalty activity is kept while your account exists, so your card and history
    stay accurate. One-time reward codes are purged 30 days after issue. Newsletter consent
    records are kept as long as the consent lasts, plus 3 years as proof. If you ask us to
    erase your account we delete your loyalty data immediately (see below).`,
  },
  {
    title: '7. Your rights (GDPR)',
    body: `You can request access, correction, deletion or export of your data any time at
    privacy@supervictornft.com — tell us your 6-character loyalty code so we can find you.
    We respond within 30 days; export is delivered as a machine-readable file. Note that
    on-chain items (your cNFTs and their transactions) are immutable by design: we delete
    the link between your wallet and your account, but records already on the Solana
    blockchain cannot be removed by anyone. You may also complain to ANSPDCP, the Romanian
    data protection authority.`,
  },
  {
    title: '8. Cookies & local storage',
    body: `HeroPad uses local browser storage only for things that are strictly necessary:
    keeping you logged in (Privy session), your language choice, and offline caching. No
    advertising cookies and no third-party trackers.`,
  },
  {
    title: '9. Children',
    body: `HeroPad is family-friendly but the wallet & cNFT functionality requires that
    the account holder be of legal age in their jurisdiction (typically 18+). Parents/
    guardians can claim figurines on behalf of minors using their own wallet.`,
  },
  {
    title: '10. Changes',
    body: `If we materially change this policy we will notify users via email (where
    available) and prominently on the site. Effective date of this version: 4 August 2026.`,
  },
];

export default function Privacy() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16 md:py-20">
      <p className="text-xs uppercase tracking-[0.3em] text-hero-cyan">Legal</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight md:text-5xl">
        Privacy Notice
      </h1>
      <p className="mt-3 text-sm text-slate-500">Effective 4 August 2026 · v2.0</p>

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
