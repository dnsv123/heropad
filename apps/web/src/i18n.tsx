/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getItem, setItem } from './services/storageService';

// Lightweight i18n — no libraries.
// ---------------------------------------------------------------------------
// Default language: auto-detected from the phone/browser (ro → Romanian,
// anything else → English). A manual RO/EN switch in the header overrides it
// and is remembered via storageService. Missing keys fall back to English.
// Params: t('key', { n: 3 }) replaces {n} in the string.

export type Lang = 'ro' | 'en';

const en = {
  // --- Header / nav ---
  'nav.home': 'Home',
  'nav.claim': 'Claim',
  'nav.vdash': 'V-DASH',
  'nav.profile': 'Profile',
  'nav.login': 'Login',
  'nav.loading': 'Loading…',
  'nav.logout': 'Logout',
  // --- Landing: hero ---
  'hero.eyebrow': 'Loyalty customers actually love',
  'hero.subtitle':
    'Power Pass turns every visit to your favorite café into a superhero charge-up — nothing to install. A full card earns the reward plus a collectible trophy that is truly yours.',
  'hero.cta.business': 'For businesses',
  'hero.cta.scan': 'I scanned a QR code',
  'hero.project': 'A SuperVictor Universe project.',
  // --- Landing: how it works ---
  'how.title': 'How Power Pass works',
  'how.s1.t': 'Scan',
  'how.s1.d': 'Scan the QR at the counter — you are in within ~10 seconds with your Google account.',
  'how.s2.t': 'Charge',
  'how.s2.d': 'Every purchase, the staff taps +1 — SuperVictor charges up live on your phone.',
  'how.s3.t': 'Reward',
  'how.s3.d': 'Card full? Claim the venue’s reward, validated with a one-time code.',
  'how.s4.t': 'Collect',
  'how.s4.d': 'A SuperVictor Trophy is minted into your collection. Yours to keep, forever.',
  // --- Landing: for businesses ---
  'biz.title': 'For cafés & local businesses',
  'biz.sub': 'A loyalty system your customers actually use — and numbers you can finally see.',
  'biz.b1.t': 'Customers who come back',
  'biz.b1.d': 'Visible progress plus a reward within reach pulls people back to you, not the café across the street.',
  'biz.b2.t': 'Real numbers, live',
  'biz.b2.d': 'Unique customers, repeat rate, rewards given — in your own dashboard.',
  'biz.b3.t': 'Fraud-proof by design',
  'biz.b3.d': 'Stamps granted only from your counter; redemptions need one-time codes that expire in 5 minutes.',
  'biz.b4.t': 'Zero GDPR headaches',
  'biz.b4.d': 'You never see customers’ emails or personal data — only anonymous counts.',
  'biz.pricing': 'Free 2-month pilot · then from 99 lei/month',
  'biz.cta': 'Book a free demo',
  // --- Landing: ecosystem ---
  'eco.title': 'Part of the SuperVictor Universe',
  'eco.sub': 'HeroPad is one gateway into a growing universe of heroes, games and collectibles.',
  'eco.hall.t': 'Hall of Heroes',
  'eco.hall.d': 'Quests, XP, badges and the community hub.',
  'eco.shop.t': 'Shop',
  'eco.shop.d': 'Figurines, apparel and physical heroes.',
  'eco.comic.t': 'Comic Book',
  'eco.comic.d': 'The origin story — in print.',
  'eco.vdash.t': 'V-DASH',
  'eco.vdash.d': 'Play the endless runner with your heroes.',
  'eco.claim.t': 'Claim a hero',
  'eco.claim.d': 'Got a figurine or card? Claim its digital twin.',
  // --- Loyalty page (customer) ---
  'loy.eyebrow': '⚡ Power Pass',
  'loy.full.title': '⚡ Full power — your reward is ready!',
  'loy.full.btn': 'Claim reward — get my code',
  'loy.full.generating': 'Generating…',
  'loy.full.note':
    '⏱ Tap this at the counter — the code works for 5 minutes only and the staff redeems it on the spot. (Generated it too early? Just tap again for a fresh one.)',
  'loy.code.label': 'Reward code — tell it to the staff',
  'loy.code.expires': 'One-time use · expires in',
  'loy.code.show': 'Show it to the staff right now. Expired? Tap “Claim reward” again — you lose nothing.',
  'loy.celebrate.title': '🎉 Reward redeemed — enjoy!',
  'loy.celebrate.body': 'Your card restarted, and a SuperVictor Trophy was minted to your collection —',
  'loy.celebrate.link': 'see it in your Profile',
  'loy.celebrate.tail': '. Extra stamps carry over automatically.',
  'loy.login.hint': 'Login once to start collecting — takes ~10 seconds.',
  'loy.login.btn': 'Login to collect stamps',
  'loy.yourcode': 'Your code — show it at the counter',
  'loy.stats': '☕ {total} stamps lifetime · 🎫 {cards} {cardsWord} completed',
  'loy.card.one': 'card',
  'loy.card.many': 'cards',
  'loy.loading': 'Loading your card…',
  'loy.wallet.missing':
    '⚠ Your trophy vault couldn’t be set up in this browser — private/incognito mode blocks it. Open this page once in a normal window: stamps stay safe, and trophies will mint automatically from then on.',
  'loy.footnote': 'Stamps are granted by the venue at purchase and appear here live.',
  // --- Power meter ---
  'meter.full': '⚡ Full power — reward unlocked!',
  'meter.more.one': '1 more stamp to your reward',
  'meter.more.many': '{n} more stamps to your reward',
  'meter.seelevels': 'See all power levels',
  'meter.gallery.title': 'SuperVictor power levels',
  'meter.gallery.sub': 'Every stamp charges him up — you are at level {n}.',
  'meter.gallery.close': 'Keep charging ⚡',
  'meter.alt': 'SuperVictor charging up — tap to see all levels',
  // --- Business page (merchant) ---
  'b.sub': 'Merchant counter · grant & redeem stamps',
  'b.code.label': 'Customer code (6 characters)',
  'b.find': 'Find',
  'b.login.hint': 'Log in with the merchant account for {name}.',
  'b.login.btn': 'Merchant login',
  'b.claim.hint': 'This venue has no merchant yet. Claim it with this account (validation setup).',
  'b.claim.btn': 'Become merchant of this venue',
  'b.claim.busy': 'Claiming…',
  'b.notmerchant': 'This account is not the merchant of {name}.',
  'b.switch': 'Switch account',
  'b.coffees': 'Coffees bought:',
  'b.minus.note': '−1 = correction (removes the last stamp from today)',
  'b.cardfull': '⚡ Card full! Ask the customer to tap “Claim reward” on their phone and tell you the 6-character reward code:',
  'b.redeem': 'Redeem',
  'b.settings': '⚙️ Campaign settings',
  'b.settings.hide': 'Hide campaign settings',
  'b.set.required': 'Stamps needed for a reward (3–30)',
  'b.set.reward': 'The reward (what the customer gets)',
  'b.set.save': 'Save settings',
  'b.set.note': 'Changes apply instantly on customers’ phones. Existing stamps are kept.',
  'b.stats': '📊 Venue stats',
  'b.stats.hide': 'Hide venue stats',
  'b.stats.unique': 'Unique customers',
  'b.stats.30': 'Stamps · 30 days',
  'b.stats.rewards': 'Rewards given',
  'b.stats.repeat': 'Repeat rate',
  'b.stats.daily': 'Daily stamps',
  'b.stats.starting': 'Starting',
  'b.stats.halfway': 'Halfway',
  'b.stats.almost': 'Almost! 🔥',
  'b.stats.full': 'Card full',
  'b.stats.pii': 'Counts only — no personal data is ever shown or stored here.',
  'b.footer': 'Merchant-only. Every grant is attributed to your account for audit.',
  'b.n.granted': '+{n} → now {s}/{r}',
  'b.n.corrected': 'Corrected: −1 stamp → now {s}/{r}',
  'b.n.redeemed.trophy': '🎉 Reward redeemed + SuperVictor Trophy minted to the customer! Hand it over.',
  'b.n.redeemed': '🎉 Reward redeemed — hand it over!',
  'b.n.askcode': 'Ask the customer for their 6-character reward code.',
  'b.n.saved': 'Saved: reward at {n} stamps — “{label}”. Applies instantly.',
  'b.n.nothing': 'Nothing to save — fill in at least one field.',
  // --- Profile ---
  'p.title': 'Your profile',
  'p.login.hint': 'Sign in to see your wallet, BITS balance, and collectibles.',
  'p.login.btn': 'Login to continue',
  'acct.label': 'Account',
  'acct.joined': 'Joined',
  'acct.link.email': '+ Link email',
  'acct.link.google': '+ Link Google',
  'acct.link.wallet': '+ Link external wallet',
  'pp.explainer':
    'Your hero cards at partner venues. Every purchase charges SuperVictor — a full card earns a free reward, a SuperVictor Trophy minted into your collection, and BITS.',
  'pp.error': 'Could not load your Power Pass.',
  'pp.loading': 'Loading…',
  'pp.empty.pre': 'No hero cards yet. Scan the Power Pass QR at a partner café and your first card starts automatically —',
  'pp.empty.link': 'try Café Victor',
  'pp.tile.stamps': '☕ Stamps',
  'pp.tile.rewards': '🎁 Rewards claimed',
  'pp.tile.trophies': '🏆 Trophies minted',
  'pp.taphint': 'Tap any card for details ↑',
  'pp.sheet.stamps': '☕ Your stamps — {n} lifetime',
  'pp.stamps.n': '{n} stamps',
  'pp.current': 'Current card: {s}/{r}',
  'pp.sheet.rewards': '🎁 Rewards claimed — {n}',
  'pp.rewards.empty': 'None yet — fill a card to claim your first free reward.',
  'pp.reward.generic': 'Free reward',
  'pp.stampsword': 'stamps',
  'pp.sheet.trophies': '🏆 SuperVictor Trophies — {n}',
  'pp.trophies.empty': 'No trophies yet — each completed card mints one into your collection.',
  'pp.close': 'Close',
  'col.title': 'Your collection',
  'col.sub': 'Digital collectibles owned by your account — claimed heroes and SuperVictor Trophies.',
  'w.section': 'Solana wallets',
  'w.copy': 'Copy address',
  'w.copied': 'Copied!',
  'w.export': 'Export key',
  'w.exporting': 'Opening…',
  'w.secured': 'Secured by your login',
  'w.youhold': 'You hold the keys',
  'w.loading': 'Loading wallet…',
  'w.create.hint':
    'You don’t have a Solana wallet yet. Create one in a click — Privy secures it with your login, no seed phrase to write down.',
  'w.create.btn': 'Create my Solana wallet',
  'w.create.busy': 'Creating…',
} as const;

const ro: Record<TranslationKey, string> = {
  'nav.home': 'Acasă',
  'nav.claim': 'Revendică',
  'nav.vdash': 'V-DASH',
  'nav.profile': 'Profil',
  'nav.login': 'Conectare',
  'nav.loading': 'Se încarcă…',
  'nav.logout': 'Ieșire',
  'hero.eyebrow': 'Fidelizare pe care clienții chiar o iubesc',
  'hero.subtitle':
    'Power Pass transformă fiecare vizită la cafeneaua ta preferată într-o încărcare de supererou — fără nicio aplicație de instalat. Cardul plin îți aduce recompensa plus un trofeu de colecție care e cu adevărat al tău.',
  'hero.cta.business': 'Pentru afaceri',
  'hero.cta.scan': 'Am scanat un cod QR',
  'hero.project': 'Un proiect SuperVictor Universe.',
  'how.title': 'Cum funcționează Power Pass',
  'how.s1.t': 'Scanezi',
  'how.s1.d': 'Scanezi QR-ul de la casă — intri în ~10 secunde cu contul Google.',
  'how.s2.t': 'Încarci',
  'how.s2.d': 'La fiecare cumpărătură, personalul apasă +1 — SuperVictor se încarcă live pe telefonul tău.',
  'how.s3.t': 'Primești',
  'how.s3.d': 'Card plin? Îți iei recompensa localului, validată cu un cod unic.',
  'how.s4.t': 'Colecționezi',
  'how.s4.d': 'Un Trofeu SuperVictor intră în colecția ta. Al tău, pentru totdeauna.',
  'biz.title': 'Pentru cafenele și afaceri locale',
  'biz.sub': 'Un sistem de fidelizare pe care clienții chiar îl folosesc — și cifre pe care în sfârșit le vezi.',
  'biz.b1.t': 'Clienți care revin',
  'biz.b1.d': 'Progresul vizibil plus recompensa aproape îi aduc înapoi la tine, nu la cafeneaua de vizavi.',
  'biz.b2.t': 'Cifre reale, live',
  'biz.b2.d': 'Clienți unici, rată de revenire, recompense date — în dashboard-ul tău.',
  'biz.b3.t': 'Anti-fraudă din construcție',
  'biz.b3.d': 'Bonusurile se dau doar de la casa ta; răscumpărările cer coduri unice care expiră în 5 minute.',
  'biz.b4.t': 'Zero bătăi de cap cu GDPR',
  'biz.b4.d': 'Nu vezi niciodată emailurile sau datele personale ale clienților — doar cifre anonime.',
  'biz.pricing': 'Pilot gratuit 2 luni · apoi de la 99 lei/lună',
  'biz.cta': 'Programează un demo gratuit',
  'eco.title': 'Parte din SuperVictor Universe',
  'eco.sub': 'HeroPad e una dintre porțile către un univers în creștere de eroi, jocuri și colecții.',
  'eco.hall.t': 'Hall of Heroes',
  'eco.hall.d': 'Misiuni, XP, insigne și centrul comunității.',
  'eco.shop.t': 'Magazin',
  'eco.shop.d': 'Figurine, haine și eroi fizici.',
  'eco.comic.t': 'Benzi desenate',
  'eco.comic.d': 'Povestea originilor — tipărită.',
  'eco.vdash.t': 'V-DASH',
  'eco.vdash.d': 'Joacă endless runner-ul cu eroii tăi.',
  'eco.claim.t': 'Revendică un erou',
  'eco.claim.d': 'Ai o figurină sau un card? Revendică-i geamănul digital.',
  'loy.eyebrow': '⚡ Power Pass',
  'loy.full.title': '⚡ Energie maximă — recompensa ta e gata!',
  'loy.full.btn': 'Revendică recompensa — ia-ți codul',
  'loy.full.generating': 'Se generează…',
  'loy.full.note':
    '⏱ Apasă AICI, LA CASĂ — codul funcționează doar 5 minute, iar personalul îl validează pe loc. (L-ai generat prea devreme? Apasă din nou pentru unul proaspăt.)',
  'loy.code.label': 'Codul recompensei — spune-l la casă',
  'loy.code.expires': 'O singură folosință · expiră în',
  'loy.code.show': 'Arată-l la casă chiar acum. A expirat? Apasă din nou „Revendică recompensa" — nu pierzi nimic.',
  'loy.celebrate.title': '🎉 Recompensă revendicată — poftă bună!',
  'loy.celebrate.body': 'Cardul tău a repornit, iar un Trofeu SuperVictor a fost creat în colecția ta —',
  'loy.celebrate.link': 'vezi-l în Profil',
  'loy.celebrate.tail': '. Bonusurile în plus se reportează automat.',
  'loy.login.hint': 'Conectează-te o dată ca să începi să colecționezi — durează ~10 secunde.',
  'loy.login.btn': 'Conectare pentru a colecta bonusuri',
  'loy.yourcode': 'Codul tău — arată-l la casă',
  'loy.stats': '☕ {total} bonusuri în total · 🎫 {cards} {cardsWord} completate',
  'loy.card.one': 'card',
  'loy.card.many': 'carduri',
  'loy.loading': 'Îți încărcăm cardul…',
  'loy.wallet.missing':
    '⚠ Seiful tău de trofee nu a putut fi creat în acest browser — modul privat/incognito îl blochează. Deschide pagina o dată într-o fereastră normală: bonusurile rămân în siguranță, iar trofeele se vor crea automat de atunci încolo.',
  'loy.footnote': 'Bonusurile sunt acordate de local la cumpărare și apar aici live.',
  'meter.full': '⚡ Energie maximă — recompensă deblocată!',
  'meter.more.one': 'Încă 1 bonus până la recompensă',
  'meter.more.many': 'Încă {n} bonusuri până la recompensă',
  'meter.seelevels': 'Vezi toate nivelurile de putere',
  'meter.gallery.title': 'Nivelurile de putere SuperVictor',
  'meter.gallery.sub': 'Fiecare bonus îl încarcă — tu ești la nivelul {n}.',
  'meter.gallery.close': 'Continuă încărcarea ⚡',
  'meter.alt': 'SuperVictor se încarcă — atinge ca să vezi toate nivelurile',
  'b.sub': 'Casa localului · acordă și validează bonusuri',
  'b.code.label': 'Codul clientului (6 caractere)',
  'b.find': 'Caută',
  'b.login.hint': 'Conectează-te cu contul de merchant pentru {name}.',
  'b.login.btn': 'Conectare merchant',
  'b.claim.hint': 'Localul nu are încă un cont de merchant. Revendică-l cu acest cont (setup de validare).',
  'b.claim.btn': 'Devino merchantul acestui local',
  'b.claim.busy': 'Se revendică…',
  'b.notmerchant': 'Acest cont nu este merchantul localului {name}.',
  'b.switch': 'Schimbă contul',
  'b.coffees': 'Cafele cumpărate:',
  'b.minus.note': '−1 = corecție (șterge ultimul bonus de azi)',
  'b.cardfull': '⚡ Card plin! Roagă clientul să apese „Revendică recompensa" pe telefonul lui și să-ți spună codul de 6 caractere:',
  'b.redeem': 'Validează',
  'b.settings': '⚙️ Setările campaniei',
  'b.settings.hide': 'Ascunde setările',
  'b.set.required': 'Bonusuri necesare pentru recompensă (3–30)',
  'b.set.reward': 'Recompensa (ce primește clientul)',
  'b.set.save': 'Salvează setările',
  'b.set.note': 'Modificările se aplică instant pe telefoanele clienților. Bonusurile existente se păstrează.',
  'b.stats': '📊 Statistici local',
  'b.stats.hide': 'Ascunde statisticile',
  'b.stats.unique': 'Clienți unici',
  'b.stats.30': 'Bonusuri · 30 zile',
  'b.stats.rewards': 'Recompense date',
  'b.stats.repeat': 'Rată de revenire',
  'b.stats.daily': 'Bonusuri pe zi',
  'b.stats.starting': 'La început',
  'b.stats.halfway': 'La jumătate',
  'b.stats.almost': 'Aproape! 🔥',
  'b.stats.full': 'Card plin',
  'b.stats.pii': 'Doar cifre — nicio dată personală nu apare sau se stochează aici.',
  'b.footer': 'Doar pentru merchant. Fiecare bonus acordat e înregistrat pe contul tău, pentru audit.',
  'b.n.granted': '+{n} → acum {s}/{r}',
  'b.n.corrected': 'Corectat: −1 bonus → acum {s}/{r}',
  'b.n.redeemed.trophy': '🎉 Recompensă validată + Trofeu SuperVictor creat pentru client! Înmânează-i-o.',
  'b.n.redeemed': '🎉 Recompensă validată — înmânează-i-o!',
  'b.n.askcode': 'Cere clientului codul de recompensă de 6 caractere.',
  'b.n.saved': 'Salvat: recompensă la {n} bonusuri — „{label}". Se aplică instant.',
  'b.n.nothing': 'Nimic de salvat — completează măcar un câmp.',
  'p.title': 'Profilul tău',
  'p.login.hint': 'Conectează-te ca să-ți vezi portofelul, BITS și colecția.',
  'p.login.btn': 'Conectare',
  'acct.label': 'Cont',
  'acct.joined': 'Membru din',
  'acct.link.email': '+ Leagă email',
  'acct.link.google': '+ Leagă Google',
  'acct.link.wallet': '+ Leagă wallet extern',
  'pp.explainer':
    'Cardurile tale de erou la localurile partenere. Fiecare cumpărătură îl încarcă pe SuperVictor — un card plin aduce o recompensă gratuită, un Trofeu SuperVictor creat în colecția ta și BITS.',
  'pp.error': 'Nu am putut încărca Power Pass-ul tău.',
  'pp.loading': 'Se încarcă…',
  'pp.empty.pre': 'Niciun card de erou încă. Scanează QR-ul Power Pass la un local partener și primul card pornește automat —',
  'pp.empty.link': 'încearcă Café Victor',
  'pp.tile.stamps': '☕ Bonusuri',
  'pp.tile.rewards': '🎁 Recompense',
  'pp.tile.trophies': '🏆 Trofee create',
  'pp.taphint': 'Atinge un card pentru detalii ↑',
  'pp.sheet.stamps': '☕ Bonusurile tale — {n} în total',
  'pp.stamps.n': '{n} bonusuri',
  'pp.current': 'Cardul curent: {s}/{r}',
  'pp.sheet.rewards': '🎁 Recompense revendicate — {n}',
  'pp.rewards.empty': 'Niciuna încă — umple un card ca să revendici prima recompensă gratuită.',
  'pp.reward.generic': 'Recompensă gratuită',
  'pp.stampsword': 'bonusuri',
  'pp.sheet.trophies': '🏆 Trofee SuperVictor — {n}',
  'pp.trophies.empty': 'Niciun trofeu încă — fiecare card completat creează unul în colecția ta.',
  'pp.close': 'Închide',
  'col.title': 'Colecția ta',
  'col.sub': 'Obiectele digitale ale contului tău — eroi revendicați și Trofee SuperVictor.',
  'w.section': 'Portofele Solana',
  'w.copy': 'Copiază adresa',
  'w.copied': 'Copiat!',
  'w.export': 'Exportă cheia',
  'w.exporting': 'Se deschide…',
  'w.secured': 'Securizat de contul tău',
  'w.youhold': 'Cheile sunt la tine',
  'w.loading': 'Se încarcă portofelul…',
  'w.create.hint':
    'Nu ai încă un portofel Solana. Creezi unul cu un click — Privy îl securizează cu contul tău, fără nicio frază secretă de notat.',
  'w.create.btn': 'Creează-mi portofelul Solana',
  'w.create.busy': 'Se creează…',
};

export type TranslationKey = keyof typeof en;

const dictionaries: Record<Lang, Record<TranslationKey, string>> = { en, ro };

function detectLang(): Lang {
  try {
    return navigator.language?.toLowerCase().startsWith('ro') ? 'ro' : 'en';
  } catch {
    return 'en';
  }
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue>({
  lang: 'en',
  setLang: () => undefined,
  t: (k) => en[k],
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  // A manually chosen language (saved earlier) beats auto-detection.
  useEffect(() => {
    void getItem<Lang>('lang').then((saved) => {
      if (saved === 'ro' || saved === 'en') setLangState(saved);
    });
  }, []);

  const value = useMemo<I18nValue>(() => {
    const t = (key: TranslationKey, vars?: Record<string, string | number>) => {
      let s: string = dictionaries[lang][key] ?? en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replaceAll(`{${k}}`, String(v));
        }
      }
      return s;
    };
    return {
      lang,
      setLang: (l: Lang) => {
        setLangState(l);
        void setItem('lang', l);
      },
      t,
    };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nValue {
  return useContext(I18nContext);
}
