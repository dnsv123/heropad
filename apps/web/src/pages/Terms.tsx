// /terms — Terms of Service for HeroPad.
// Mirrors the structure of the SuperVictor Universe master ToS, focused on
// the HeroPad-specific surface: claim mechanics, cNFT ownership, BITS, and
// secondary-market resale.

const SECTIONS = [
  {
    title: '1. Service description',
    body: `HeroPad lets you claim a Solana compressed NFT (cNFT) by scanning a unique
    code printed on, embedded in, or shipped with a SuperVictor Universe physical
    product. Each code is one-time-use and cryptographically signed by us. The cNFT
    represents a verifiable digital twin of that physical artefact.`,
  },
  {
    title: '2. Eligibility',
    body: `By using HeroPad you confirm you are of legal age in your jurisdiction
    (typically 18+) or are using the service under the supervision of a parent or
    legal guardian. You agree to provide accurate information when prompted by the
    Privy authentication flow.`,
  },
  {
    title: '3. What you receive',
    body: `On a successful claim you receive: (a) a Solana cNFT minted to the wallet
    address you provide; (b) a balance of in-app BITS tokens accounted off-chain in
    our database; (c) any seasonal perks or unlocks bound to that collectible. The
    cNFT is yours to keep, transfer, or sell on any compatible marketplace.`,
  },
  {
    title: '4. Intellectual property',
    body: `The SuperVictor character, V-mark, and all artwork remain the exclusive
    intellectual property of SVU Journey SRL (EUIPO trademark filing 019287298).
    Owning a HeroPad cNFT grants you a personal, non-exclusive, non-transferable
    licence to display the artwork in connection with the specific token you own.
    It does NOT grant rights to commercial reproduction, derivative works, or
    re-printing of the character outside that single token.`,
  },
  {
    title: '5. Royalties on resale',
    body: `Each HeroPad cNFT carries a 5% creator royalty enforced by participating
    Solana marketplaces. Some marketplaces offer royalty-optional listings; in those
    cases the royalty is at the buyer's discretion. We reserve the right to adjust
    royalty parameters for future drops.`,
  },
  {
    title: '6. Wallet & key custody',
    body: `If you sign in with email or Google, an embedded Solana wallet is
    provisioned for you by Privy using Multi-Party Computation. SVU does not have
    access to your private key. You are responsible for securing the login method
    that controls your embedded wallet (e.g. your email account). You may export
    your private key at any time from the Profile screen.`,
  },
  {
    title: '7. Acceptable use',
    body: `You agree NOT to: attempt to forge, brute-force, or reverse-engineer
    claim codes; abuse the API beyond reasonable rate limits; impersonate other
    users; sell counterfeit physical products bearing our trademarks; or use
    HeroPad to launder, fund, or facilitate illegal activity.`,
  },
  {
    title: '8. Disclaimer',
    body: `HeroPad is provided "as is". The current deployment runs on Solana DEVNET
    for the duration of the Solana Frontier hackathon submission. cNFTs minted on
    devnet have no monetary value and may be subject to chain resets. Mainnet launch
    will be announced separately and any data migration policy disclosed in advance.`,
  },
  {
    title: '9. Liability',
    body: `To the maximum extent permitted by applicable law, SVU Journey SRL shall
    not be liable for indirect, incidental, or consequential damages arising from
    your use of HeroPad, including loss of access due to compromised authentication
    methods, blockchain network outages, or third-party marketplace decisions.`,
  },
  {
    title: '10. Governing law',
    body: `These terms are governed by the laws of Romania. Disputes will be resolved
    in the competent courts of Bucharest, Romania, unless otherwise required by
    mandatory consumer protection law in your country of residence.`,
  },
  {
    title: '11. Contact',
    body: `Questions about these terms: legal@supervictornft.com. Privacy questions:
    privacy@supervictornft.com. General support: support@supervictornft.com.`,
  },
];

export default function Terms() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16 md:py-20">
      <p className="text-xs uppercase tracking-[0.3em] text-hero-cyan">Legal</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight md:text-5xl">
        Terms of Service
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
    </section>
  );
}
