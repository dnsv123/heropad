// /terms — Terms of Service for HeroPad, v2.0 (22 September 2026).
//
// Two audiences in one document: customers (who never pay) and venues (who
// subscribe). Bilingual like the privacy notice, for the same reason: the
// pilot serves Romanian consumers and cafés, and a legal text they cannot
// read is not a legal text. The two language versions live side by side so
// drift is visible.
//
// Vocabulary discipline: trophies are collectible digital items recorded on
// the Solana network. They are not sold by us, not priced, and carry no
// monetary value. BITS are loyalty points in our database, not a token.

import { useT } from '../i18n';

interface Section {
  title: string;
  body: string;
}

const SECTIONS_EN: Section[] = [
  {
    title: '1. Who we are and what HeroPad is',
    body: `HeroPad is a digital loyalty service operated by SVU Journey SRL, Sibiu,
    Romania ("we"). A participating venue (a café, bakery, barber shop or similar)
    offers its customers a stamp card on their phone. The venue grants stamps at the
    counter; a full card earns the reward the venue has defined, plus a collectible
    SuperVictor trophy. Customers use HeroPad free of charge. Venues pay a subscription
    (section 9 onwards).`,
  },
  {
    title: '2. Your account',
    body: `You sign in with an email address or a Google account through Privy, our
    authentication provider. You must be of legal age in your country (typically 18)
    or use HeroPad under the supervision of a parent or guardian. You are responsible
    for the login method that controls your account. Your account is personal and not
    transferable.`,
  },
  {
    title: '3. Stamps, rewards and codes',
    body: `Stamps are granted only by the venue's staff at the counter; you cannot grant
    them yourself. The number of stamps per card and the reward are set by each venue
    and may change for future cards. To collect a reward you generate a one-time code on
    your phone, valid for five minutes, which the venue validates. Stamps and rewards
    have no cash value, cannot be exchanged for money, and are not transferable between
    accounts or venues. A venue may correct a stamp granted by mistake on the same day.`,
  },
  {
    title: '4. Trophies',
    body: `When you complete a card you receive a collectible digital trophy recorded on
    the Solana network, in a wallet that Privy creates and manages for you at sign-in.
    Trophies are loyalty mementos: we do not sell them, price them, buy them back or
    operate a marketplace for them, and they carry no monetary value. Because the
    Solana network is public, a trophy record cannot be deleted once written. Issuing a
    trophy depends on network availability and on daily limits we set to protect the
    service; if a trophy cannot be issued at the moment of your reward, your reward is
    not affected and the trophy may be issued later.`,
  },
  {
    title: '5. BITS points and the rewards shelf',
    body: `BITS are loyalty points kept in our database. You earn them with stamps,
    completed cards and referrals, and you can spend them on items from the rewards
    shelf, collected at a participating venue with a six-character code that stays valid
    for fourteen days. Unused codes expire and the points return to you. BITS have no
    cash value, cannot be bought, sold or transferred, and we may adjust how they are
    earned for the future. They are not a currency, a token or a financial instrument.`,
  },
  {
    title: '6. Your wallet',
    body: `The wallet that holds your trophies is created and managed by Privy. We never
    see or hold your private key, and we cannot recover it for you. You may export the
    key from your Profile screen; from that moment its safekeeping is entirely your
    responsibility. Losing access to your login method may mean losing access to the
    wallet.`,
  },
  {
    title: '7. Intellectual property',
    body: `The SuperVictor character, the V-mark and all artwork remain the exclusive
    property of SVU Journey SRL (EUIPO trademark 019287298). A trophy grants you a
    personal, non-exclusive licence to display its artwork. It grants no right to
    reproduce, adapt or commercially use the character. Venue names and logos shown on
    a card belong to the respective venue.`,
  },
  {
    title: '8. Acceptable use',
    body: `You agree not to: attempt to grant yourself stamps, forge or replay codes,
    abuse the service beyond reasonable use, impersonate another person or venue,
    interfere with the service or its security, or use HeroPad for any unlawful
    purpose. We may suspend accounts that do.`,
  },
  {
    title: '9. Venues: subscription and plans',
    body: `A venue subscribes to a plan (Starter, Branded, Growth or Chain) at the price
    published on our website at the time of signature, in lei, plus any add-ons ordered.
    The plan includes unlimited customers and the number of staff accounts stated. Prices
    for existing subscriptions change only with thirty days' written notice. A free
    pilot period, where offered, is stated in the venue's contract.`,
  },
  {
    title: '10. Venues: billing, payment and cancellation',
    body: `Monthly plans are invoiced monthly and may be cancelled at any time, with no
    penalty, effective at the end of the paid month. Annual plans are invoiced once a
    year for ten months' fee and cover twelve months of service. Annual plans come
    with a thirty-day money-back guarantee: a venue that cancels within thirty days of
    its first annual invoice receives a full refund, no questions asked, and keeps the
    figurine. Invoices are issued as electronic invoices (e-Factura) and are payable by
    bank transfer within fourteen days. Physical items (figurine, display, pins) are
    provided as stated in the plan; the figurine remains our property and is returned
    if the subscription ends, unless the contract says otherwise.`,
  },
  {
    title: '11. Venues: your obligations and your data',
    body: `The venue grants stamps honestly, hands over the rewards it has defined, and
    uses the staff accounts only for its own staff. The venue never receives customers'
    names, emails or wallet addresses; it sees anonymous six-character codes and
    aggregate figures. The venue is responsible for the reward it promises and for its
    own consumer obligations. We are the data controller for customer data; the venue
    acts through our interface only.`,
  },
  {
    title: '12. Availability and changes',
    body: `We aim to keep HeroPad available at all times but do not guarantee
    uninterrupted service. We may change features, add or retire plans, and update these
    terms; material changes are announced on the site and, for venues, by email at
    least thirty days in advance. Continued use after that date means acceptance.`,
  },
  {
    title: '13. Liability',
    body: `HeroPad is provided as is. To the extent permitted by law, SVU Journey SRL is
    not liable for indirect or consequential loss, for loss caused by a compromised
    login method, by third-party services (Privy, Solana network, hosting providers) or
    by a venue's failure to hand over a reward. Nothing in these terms limits rights
    that consumer protection law gives you and that cannot be waived.`,
  },
  {
    title: '14. Disputes, governing law, ANPC',
    body: `These terms are governed by Romanian law. Consumers may use the alternative
    dispute resolution procedure of ANPC (anpc.ro, SAL) or the EU online dispute
    resolution platform (ec.europa.eu/consumers/odr); links are in the footer. Failing
    an amicable solution, disputes go to the competent courts in Sibiu, Romania, unless
    mandatory law in your country of residence provides otherwise.`,
  },
  {
    title: '15. Contact',
    body: `SVU Journey SRL, Sibiu, Romania. Terms and venue contracts:
    legal@supervictornft.com. Privacy: privacy@supervictornft.com. Support:
    support@supervictornft.com.`,
  },
];

const SECTIONS_RO: Section[] = [
  {
    title: '1. Cine suntem și ce este HeroPad',
    body: `HeroPad este un serviciu de fidelizare digitală operat de SVU Journey SRL,
    Sibiu, România („noi"). Un local partener (cafenea, brutărie, frizerie sau similar)
    le oferă clienților un card de fidelitate pe telefon. Localul acordă bonusuri la
    tejghea; cardul plin aduce recompensa stabilită de local, plus un trofeu de colecție
    SuperVictor. Clienții folosesc HeroPad gratuit. Localurile plătesc un abonament
    (secțiunile 9 și următoarele).`,
  },
  {
    title: '2. Contul tău',
    body: `Te conectezi cu o adresă de email sau cu un cont Google, prin Privy,
    furnizorul nostru de autentificare. Trebuie să ai vârsta legală din țara ta (de
    regulă 18 ani) sau să folosești HeroPad sub supravegherea unui părinte sau tutore.
    Ești responsabil pentru metoda de conectare care controlează contul tău. Contul este
    personal și nu poate fi transferat.`,
  },
  {
    title: '3. Bonusuri, recompense și coduri',
    body: `Bonusurile sunt acordate exclusiv de personalul localului, la tejghea; nu ți
    le poți acorda singur. Numărul de bonusuri pe card și recompensa sunt stabilite de
    fiecare local și pot fi schimbate pentru cardurile viitoare. Pentru a-ți lua
    recompensa generezi un cod unic pe telefonul tău, valabil cinci minute, pe care
    localul îl validează. Bonusurile și recompensele nu au valoare în bani, nu pot fi
    schimbate în bani și nu se transferă între conturi sau localuri. Un local poate
    corecta în aceeași zi un bonus acordat din greșeală.`,
  },
  {
    title: '4. Trofeele',
    body: `Când completezi un card primești un trofeu digital de colecție, înregistrat
    în rețeaua Solana, într-un portofel pe care Privy îl creează și îl administrează
    pentru tine la conectare. Trofeele sunt amintiri de fidelitate: nu le vindem, nu le
    stabilim un preț, nu le răscumpărăm și nu operăm o piață pentru ele; nu au valoare
    în bani. Rețeaua Solana fiind publică, înregistrarea unui trofeu nu poate fi ștearsă
    după ce a fost scrisă. Emiterea unui trofeu depinde de disponibilitatea rețelei și
    de limite zilnice pe care le stabilim pentru protejarea serviciului; dacă un trofeu
    nu poate fi emis în momentul recompensei, recompensa ta nu este afectată, iar
    trofeul poate fi emis ulterior.`,
  },
  {
    title: '5. Punctele BITS și raftul de premii',
    body: `BITS sunt puncte de fidelitate păstrate în baza noastră de date. Le câștigi
    cu bonusuri, carduri completate și recomandări, și le poți folosi pentru obiecte
    de pe raftul de premii, ridicate de la un local partener cu un cod de șase
    caractere valabil paisprezece zile. Codurile nefolosite expiră și punctele îți
    revin. BITS nu au valoare în bani, nu pot fi cumpărate, vândute sau transferate, iar
    modul în care se câștigă poate fi ajustat pentru viitor. Nu sunt o monedă, un token
    sau un instrument financiar.`,
  },
  {
    title: '6. Portofelul tău',
    body: `Portofelul în care stau trofeele tale este creat și administrat de Privy. Noi
    nu vedem și nu deținem niciodată cheia ta privată și nu o putem recupera pentru
    tine. Poți exporta cheia din ecranul Profil; din acel moment, păstrarea ei în
    siguranță este exclusiv responsabilitatea ta. Pierderea accesului la metoda de
    conectare poate însemna pierderea accesului la portofel.`,
  },
  {
    title: '7. Proprietate intelectuală',
    body: `Personajul SuperVictor, marca V și toată grafica rămân proprietatea exclusivă
    a SVU Journey SRL (marcă EUIPO 019287298). Un trofeu îți acordă o licență personală,
    neexclusivă, de a afișa grafica lui. Nu acordă niciun drept de reproducere,
    adaptare sau folosire comercială a personajului. Numele și siglele localurilor
    afișate pe un card aparțin localului respectiv.`,
  },
  {
    title: '8. Utilizare acceptabilă',
    body: `Te obligi să nu: încerci să îți acorzi singur bonusuri, să falsifici sau să
    refolosești coduri, să abuzezi de serviciu dincolo de o utilizare rezonabilă, să te
    dai drept altă persoană sau alt local, să afectezi serviciul sau securitatea lui,
    ori să folosești HeroPad în scopuri ilegale. Putem suspenda conturile care fac asta.`,
  },
  {
    title: '9. Localuri: abonament și planuri',
    body: `Un local se abonează la un plan (Starter, Branded, Growth sau Chain) la
    prețul publicat pe site la data semnării, în lei, plus eventualele opțiuni
    suplimentare comandate. Planul include clienți nelimitați și numărul de conturi de
    angajat menționat. Prețurile abonamentelor existente se modifică doar cu un preaviz
    scris de treizeci de zile. O perioadă de pilot gratuit, acolo unde este oferită,
    este menționată în contractul localului.`,
  },
  {
    title: '10. Localuri: facturare, plată și reziliere',
    body: `Planurile lunare se facturează lunar și pot fi reziliate oricând, fără
    penalități, cu efect la sfârșitul lunii plătite. Planurile anuale se facturează o
    dată pe an, la valoarea a zece luni de abonament, și acoperă douăsprezece luni de
    serviciu. Planurile anuale au garanție de treizeci de zile: un local care reziliază
    în treizeci de zile de la prima factură anuală primește banii înapoi integral, fără
    întrebări, și păstrează figurina. Facturile se emit ca facturi electronice
    (e-Factura) și se plătesc prin transfer bancar în paisprezece zile. Obiectele fizice
    (figurină, vitrină, pinuri) se livrează conform planului; figurina rămâne
    proprietatea noastră și se returnează la încetarea abonamentului, dacă în contract
    nu se prevede altfel.`,
  },
  {
    title: '11. Localuri: obligațiile tale și datele',
    body: `Localul acordă bonusurile cu bună-credință, predă recompensele pe care le-a
    stabilit și folosește conturile de angajat doar pentru propriul personal. Localul nu
    primește niciodată numele, emailurile sau adresele de portofel ale clienților; vede
    coduri anonime de șase caractere și cifre agregate. Localul răspunde pentru
    recompensa promisă și pentru propriile obligații față de consumatori. Noi suntem
    operatorul datelor clienților; localul acționează exclusiv prin interfața noastră.`,
  },
  {
    title: '12. Disponibilitate și modificări',
    body: `Ne străduim să menținem HeroPad disponibil permanent, dar nu garantăm
    funcționarea neîntreruptă. Putem schimba funcții, adăuga sau retrage planuri și
    actualiza acești termeni; modificările importante se anunță pe site și, pentru
    localuri, prin email cu cel puțin treizeci de zile înainte. Folosirea în continuare
    după acea dată înseamnă acceptare.`,
  },
  {
    title: '13. Răspundere',
    body: `HeroPad este furnizat ca atare. În limitele legii, SVU Journey SRL nu răspunde
    pentru pierderi indirecte sau subsecvente, pentru pierderi cauzate de o metodă de
    conectare compromisă, de servicii terțe (Privy, rețeaua Solana, furnizorii de
    găzduire) sau de nepredarea unei recompense de către un local. Nimic din acești
    termeni nu limitează drepturile pe care ți le dă legislația de protecție a
    consumatorului și la care nu se poate renunța.`,
  },
  {
    title: '14. Litigii, legea aplicabilă, ANPC',
    body: `Acești termeni sunt guvernați de legea română. Consumatorii pot apela la
    procedura de soluționare alternativă a litigiilor a ANPC (anpc.ro, SAL) sau la
    platforma europeană de soluționare online a litigiilor (ec.europa.eu/consumers/odr);
    linkurile sunt în subsolul site-ului. În lipsa unei soluții amiabile, litigiile se
    judecă de instanțele competente din Sibiu, România, dacă legea imperativă din țara
    ta de reședință nu prevede altfel.`,
  },
  {
    title: '15. Contact',
    body: `SVU Journey SRL, Sibiu, România. Termeni și contracte cu localurile:
    legal@supervictornft.com. Confidențialitate: privacy@supervictornft.com. Suport:
    support@supervictornft.com.`,
  },
];

const COPY = {
  en: { eyebrow: 'Legal', heading: 'Terms of Service', effective: 'Effective 22 September 2026 · v2.0' },
  ro: { eyebrow: 'Juridic', heading: 'Termeni și condiții', effective: 'În vigoare din 22 septembrie 2026 · v2.0' },
} as const;

export default function Terms() {
  const { lang } = useT();
  const sections = lang === 'ro' ? SECTIONS_RO : SECTIONS_EN;
  const copy = COPY[lang];

  return (
    <section className="mx-auto max-w-3xl px-6 py-16 md:py-20">
      <p className="eyebrow">{copy.eyebrow}</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight md:text-5xl">{copy.heading}</h1>
      <p className="mt-3 text-sm text-slate-500">{copy.effective}</p>

      <div className="mt-10 space-y-7">
        {sections.map((s) => (
          <div key={s.title}>
            <h2 className="font-display text-lg font-semibold text-white">{s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
