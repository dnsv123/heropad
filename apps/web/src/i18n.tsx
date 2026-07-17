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
