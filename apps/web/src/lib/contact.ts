// Where "Book a free demo" actually sends a café owner.
// ---------------------------------------------------------------------------
// WhatsApp first, mailto as the fallback.
//
// Why: the audience is Romanian café and shop owners, on phones, mid-shift.
// A `mailto:` link opens a mail app many of them have never configured — the
// tap does nothing visible and the lead is gone. The same person answers a
// WhatsApp message in ten minutes. This is the single highest-leverage change
// on the landing page, and it is a link.
//
// TO ACTIVATE: put the number in WHATSAPP_NUMBER below, digits only, with the
// country code and no + or spaces (Romania: 40 then the number without its
// leading 0 — e.g. 0752 123 456 becomes "40752123456"). While it is empty,
// every contact button quietly falls back to email, exactly as before.

const WHATSAPP_NUMBER = '40752364020';

const CONTACT_EMAIL = 'dinescuioanvalentin@gmail.com';

/** Prefilled first message — so the owner does not face an empty box. */
const WHATSAPP_TEXT =
  'Bună! Am văzut HeroPad și aș vrea un demo de 15 minute în localul meu.';

const MAIL_SUBJECT = 'HeroPad · demo';

export function contactIsWhatsApp(): boolean {
  return WHATSAPP_NUMBER.trim().length > 0;
}

/** The number as a Romanian reads it ("0752 364 020"), or null without one. */
export function contactPhoneDisplay(): string | null {
  const n = WHATSAPP_NUMBER.trim();
  if (!/^40\d{9}$/.test(n)) return null;
  const local = `0${n.slice(2)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

export function contactPhoneHref(): string {
  return `tel:+${WHATSAPP_NUMBER.trim()}`;
}

/** The href for any "talk to us" button on the marketing pages. */
export function contactHref(): string {
  if (contactIsWhatsApp()) {
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_TEXT)}`;
  }
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(MAIL_SUBJECT)}`;
}

/** Same, for the multi-location enquiry. */
export function chainContactHref(): string {
  if (contactIsWhatsApp()) {
    const text =
      'Bună! Am mai multe locații și aș vrea detalii despre pachetul Chain de la HeroPad.';
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  }
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('HeroPad Chain — multi-locație')}`;
}
