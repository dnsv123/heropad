// /privacy — Privacy notice for HeroPad.
// Adapted from the SuperVictor Universe master privacy policy (March 2026).
// This page covers what's specific to HeroPad's data flow (Privy auth, Solana
// wallet linkage, Helius DAS reads, BITS ledger). For the full SVU master
// policy spanning all products, link to supervictornft.com/privacy.
//
// Bilingual by law, not by preference: the pilot serves Romanian consumers, and
// GDPR requires the notice to be intelligible and in clear, plain language for
// its audience (Art. 12(1)). The sections live here rather than in i18n.tsx —
// they are long-form legal prose, not UI strings, and keeping the two language
// versions side by side is what makes it obvious when one drifts from the other.

import { useT } from '../i18n';

interface Section {
  title: string;
  body: string;
}

const SECTIONS_EN: Section[] = [
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
    asset id). (d) Optionally, if you choose to provide it in your Profile: your birthday
    as day and month only — never the year. A venue you visit on that day sees only a
    "today is their birthday" indicator, never the date; you can delete it at any time.
    We never collect or see private keys — those stay in Privy's MPC custody or
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
    counts (how many customers, how many stamps, repeat rate). A venue can also review the
    log of its OWN transactions — the stamps and rewards it gave, with the time and the
    anonymous code — the way any till receipt history works. It is limited to that venue:
    a venue never sees your activity at any other venue. We are the data controller;
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

const SECTIONS_RO: Section[] = [
  {
    title: '1. Cine suntem',
    body: `HeroPad este un serviciu operat de SVU Journey SRL (SuperVictor Universe), cu
    sediul în România. Personajul SuperVictor și marca V sunt mărci înregistrate EUIPO
    (depunerea 019287298). Pentru întrebări legate de confidențialitate:
    privacy@supervictornft.com.`,
  },
  {
    title: '2. Ce date colectăm',
    body: `(a) Identificatori de cont prin Privy — adresa ta de email sau contul Google și
    adresa portofelului tău Solana. Emailul contului este păstrat de Privy în numele
    nostru; noi stocăm o copie doar dacă îți dai acordul explicit pentru newsletter.
    (b) Activitatea de fidelizare, în baza noastră de date: ce local partener ți-a acordat
    o ștampilă și când, recompensele revendicate, codul tău de fidelitate de 6 caractere și
    codurile temporare de recompensă. Aceasta include istoricul localurilor pe care le-ai
    vizitat și în ce zile. (c) Tranzacțiile BITS și evenimentele de revendicare (moment,
    cod, identificatorul activului). Nu colectăm și nu vedem niciodată chei private —
    acestea rămân în custodia MPC a Privy sau în portofelul tău.`,
  },
  {
    title: '3. Cum le folosim și pe ce temei legal',
    body: `Pentru a furniza serviciul de fidelizare — acordarea și evidența ștampilelor,
    prevenirea revendicării duble, emiterea trofeelor, afișarea colecției tale — în temeiul
    contractului cu tine (art. 6 alin. (1) lit. (b) GDPR). Pentru menținerea securității și
    prevenirea fraudei (limitări de frecvență, auditul acțiunilor comerciantului), în
    temeiul interesului nostru legitim (art. 6 alin. (1) lit. (f)). Pentru a-ți trimite
    noutăți și oferte DOAR dacă îți dai acordul separat, în temeiul consimțământului
    (art. 6 alin. (1) lit. (a)) — îl poți retrage oricând, iar retragerea nu îți afectează
    niciodată ștampilele. Nu vindem datele tale și nu le partajăm cu agenți de publicitate.`,
  },
  {
    title: '4. Ce văd localurile partenere — și ce nu văd niciodată',
    body: `Cafenelele și celelalte localuri partenere care folosesc HeroPad NU văd
    niciodată emailul, numele, portofelul sau vreun alt identificator personal al tău. Ele
    văd doar codul tău anonim de 6 caractere și cifre agregate (câți clienți, câte
    ștampile, rata de revenire). Un local își poate consulta și registrul PROPRIILOR
    tranzacții — ștampilele și recompensele pe care le-a acordat, cu ora și codul anonim —
    la fel ca istoricul bonurilor de la orice casă de marcat. Acesta este limitat la
    localul respectiv: un local nu vede niciodată activitatea ta la alte localuri. Noi
    suntem operatorul de date; localurile acționează exclusiv prin interfața noastră.`,
  },
  {
    title: '5. Unde sunt stocate',
    body: `Autentificare: Privy (împuternicitul nostru). Bază de date: Supabase (Frankfurt,
    UE). Citiri blockchain și imaginile activelor: Helius (serverele lor văd adresa
    portofelului tău și, la încărcarea imaginilor, adresa ta IP). Găzduire: Vercel
    (frontend) + Railway (backend). Datele înscrise on-chain pe Solana sunt publice și
    descentralizate prin însăși natura lor.`,
  },
  {
    title: '6. Cât timp le păstrăm',
    body: `Activitatea de fidelizare este păstrată cât timp contul tău există, pentru ca
    fișa și istoricul tău să rămână corecte. Codurile de recompensă de unică folosință sunt
    șterse la 30 de zile de la emitere. Dovezile de consimțământ pentru newsletter sunt
    păstrate pe durata consimțământului, plus 3 ani ca probă. Dacă ne ceri ștergerea
    contului, îți ștergem imediat datele de fidelizare (vezi mai jos).`,
  },
  {
    title: '7. Drepturile tale (GDPR)',
    body: `Poți solicita oricând accesul, rectificarea, ștergerea sau portarea datelor tale
    la privacy@supervictornft.com — menționează codul tău de fidelitate de 6 caractere ca
    să te putem identifica. Răspundem în cel mult 30 de zile; exportul este livrat într-un
    format care poate fi citit automat. Reține că elementele înscrise on-chain (cNFT-urile
    tale și tranzacțiile lor) sunt imuabile prin natura tehnologiei: ștergem legătura
    dintre portofelul tău și contul tău, însă înregistrările aflate deja pe blockchain-ul
    Solana nu pot fi eliminate de nimeni. Ai de asemenea dreptul de a depune o plângere la
    ANSPDCP, autoritatea română de supraveghere a prelucrării datelor cu caracter personal.`,
  },
  {
    title: '8. Cookie-uri și stocare locală',
    body: `HeroPad folosește stocarea locală din browser exclusiv pentru elemente strict
    necesare: menținerea sesiunii tale (Privy), limba aleasă și memorarea pentru
    funcționarea offline. Fără cookie-uri de publicitate și fără urmăritori terți.`,
  },
  {
    title: '9. Minori',
    body: `HeroPad este potrivit pentru întreaga familie, însă funcționalitatea de portofel
    și cNFT necesită ca titularul contului să aibă vârsta legală din jurisdicția sa (de
    regulă 18 ani). Părinții și tutorii pot revendica figurine în numele minorilor,
    folosind propriul portofel.`,
  },
  {
    title: '10. Modificări',
    body: `Dacă modificăm substanțial această politică, vom anunța utilizatorii prin email
    (unde este disponibil) și vizibil pe site. Data intrării în vigoare a acestei versiuni:
    4 august 2026.`,
  },
];

const COPY = {
  en: {
    eyebrow: 'Legal',
    heading: 'Privacy Notice',
    effective: 'Effective 4 August 2026 · v2.0',
    footer: 'This notice covers HeroPad specifically. For the broader SuperVictor Universe privacy policy spanning V-DASH and other products, see',
  },
  ro: {
    eyebrow: 'Juridic',
    heading: 'Politica de confidențialitate',
    effective: 'În vigoare din 4 august 2026 · v2.0',
    footer: 'Această notă privește HeroPad în mod specific. Pentru politica de confidențialitate a întregului univers SuperVictor, care acoperă V-DASH și celelalte produse, vezi',
  },
} as const;

export default function Privacy() {
  const { lang } = useT();
  const sections = lang === 'ro' ? SECTIONS_RO : SECTIONS_EN;
  const copy = COPY[lang];

  return (
    <section className="mx-auto max-w-3xl px-6 py-16 md:py-20">
      <p className="text-xs uppercase tracking-[0.3em] text-hero-cyan">{copy.eyebrow}</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight md:text-5xl">
        {copy.heading}
      </h1>
      <p className="mt-3 text-sm text-slate-500">{copy.effective}</p>

      <div className="mt-10 space-y-7">
        {sections.map((s) => (
          <div key={s.title}>
            <h2 className="font-display text-lg font-semibold text-hero-cyan">
              {s.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{s.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-10 text-xs text-slate-500">
        {copy.footer}{' '}
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
