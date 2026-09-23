import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

import { useT } from '../i18n';

// The venue's own details, on the customer's card page.
// ---------------------------------------------------------------------------
// A customer who opens their loyalty card is already thinking about this café.
// Giving them the phone, the map and the Instagram there costs nothing and
// saves a search — and for the owner it turns a loyalty page into a small
// storefront, which is a reason to send people to it.
//
// The Happy Hour countdown sits here for the same reason "one stamp left"
// pulses gold: a promotion nobody knows is running is not a promotion. The
// seconds come from the server, computed in the venue's own time zone —
// doing that arithmetic in a browser somewhere else is the bug we just fixed.

export interface VenueBranding {
  phone?: string;
  email?: string;
  instagram?: string;
  facebook?: string;
  website?: string;
  orderUrl?: string;
}

/**
 * Same defence-in-depth the review link already gets on the loyalty page: the
 * API validates the scheme on write, but `venues.branding` also has non-API
 * writers (seeds, manual Supabase edits), and React only WARNS on a
 * `javascript:` href — it still renders it.
 */
function safeWebUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export interface HappyHourNext {
  state: 'active' | 'upcoming';
  seconds: number;
  mult: number;
}

/** "2h 14m" / "14m 30s" — coarse when far away, precise when it matters. */
function humanise(sec: number): string {
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

function instagramUrl(handle: string): string {
  if (/^https?:\/\//i.test(handle)) return handle;
  return `https://instagram.com/${handle.replace(/^@/, '')}`;
}

function facebookUrl(handle: string): string {
  if (/^https?:\/\//i.test(handle)) return handle;
  return `https://facebook.com/${handle.replace(/^@/, '')}`;
}

export default function VenueContact({
  name,
  branding,
  gpsLat,
  gpsLng,
  happyHourNext,
}: {
  name: string;
  branding: VenueBranding | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
  happyHourNext?: HappyHourNext | null;
}) {
  const { t } = useT();
  const [left, setLeft] = useState(happyHourNext?.seconds ?? 0);

  useEffect(() => {
    setLeft(happyHourNext?.seconds ?? 0);
    if (!happyHourNext) return;
    // Local ticking, server-anchored: the page does not poll once a second.
    const id = window.setInterval(() => {
      setLeft((n) => (n > 0 ? n - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [happyHourNext]);

  const b = branding ?? {};
  const mapUrl =
    gpsLat && gpsLng
      ? `https://www.google.com/maps/search/?api=1&query=${gpsLat},${gpsLng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;

  const orderUrl = safeWebUrl(b.orderUrl);
  const hasContact = Boolean(b.phone || b.email || b.instagram || b.facebook || b.website || orderUrl);
  if (!hasContact && !happyHourNext && !(gpsLat && gpsLng)) return null;

  // The venue's storefront: one tile per way to reach them, a drawn icon and
  // a word, in a grid a thumb can hit. Ordering first and in amber: it is
  // the one action that makes the venue money right now.
  const tiles: Array<{ key: string; href: string; label: string; icon: keyof typeof ICONS; external?: boolean; primary?: boolean }> = [];
  if (orderUrl) tiles.push({ key: 'order', href: orderUrl, label: t('vc.order'), icon: 'order', external: true, primary: true });
  tiles.push({ key: 'map', href: mapUrl, label: t('vc.map'), icon: 'map', external: true });
  if (b.phone) tiles.push({ key: 'call', href: `tel:${b.phone.replace(/\s/g, '')}`, label: t('vc.call'), icon: 'call' });
  if (b.instagram) tiles.push({ key: 'ig', href: instagramUrl(b.instagram), label: 'Instagram', icon: 'ig', external: true });
  if (b.facebook) tiles.push({ key: 'fb', href: facebookUrl(b.facebook), label: 'Facebook', icon: 'fb', external: true });
  const site = safeWebUrl(b.website);
  if (site) tiles.push({ key: 'web', href: site, label: t('vc.website'), icon: 'web', external: true });
  if (b.email) tiles.push({ key: 'mail', href: `mailto:${b.email}`, label: t('vc.email'), icon: 'mail' });

  return (
    <div className="mt-6 rounded-3xl border border-white/[0.08] bg-hero-navy p-5">
      {/* Countdown first: it is the only part that changes, and the only part
          that can make someone come in today rather than tomorrow. */}
      {happyHourNext && left > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-4 rounded-xl border px-4 py-3 text-center ${
            happyHourNext.state === 'active'
              ? 'border-hero-gold/50 bg-hero-gold/10'
              : 'border-hero-cyan/30 bg-hero-cyan/5'
          }`}
        >
          {happyHourNext.state === 'active' ? (
            <>
              <p className="font-display text-sm font-bold text-hero-gold">
                {t('vc.hh.now').replace('{n}', String(happyHourNext.mult))}
              </p>
              <p className="mt-0.5 text-[11px] text-hero-gold/80">
                {t('vc.hh.endsin')} <b className="font-mono">{humanise(left)}</b>
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-400">
                {t('vc.hh.next').replace('{n}', String(happyHourNext.mult))}
              </p>
              <p className="mt-0.5 font-display text-lg font-bold text-hero-cyan">
                {humanise(left)}
              </p>
            </>
          )}
        </motion.div>
      )}

      <p className="font-display text-base font-semibold text-white">{name}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{t('vc.title')}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {tiles.map((tile) => (
          <a
            key={tile.key}
            href={tile.href}
            target={tile.external ? '_blank' : undefined}
            rel={tile.external ? 'noopener noreferrer' : undefined}
            className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center text-[11px] font-medium transition ${
              tile.primary
                ? 'border-transparent bg-[#F7A30C] text-hero-deep hover:bg-[#FFB42A]'
                : 'border-white/[0.08] bg-hero-deep/60 text-slate-200 hover:border-white/25 hover:text-white'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
              {ICONS[tile.icon].map((d) => (
                <path key={d} d={d} />
              ))}
            </svg>
            <span className="max-w-full truncate">{tile.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// Drawn icons (Lucide paths): the same on every phone, unlike emoji.
const ICONS = {
  order: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
  map: ['M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  call: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'],
  ig: ['M17 2H7a5 5 0 0 0-5 5v10a5 5 0 0 0 5 5h10a5 5 0 0 0 5-5V7a5 5 0 0 0-5-5z', 'M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z', 'M17.5 6.5h.01'],
  fb: ['M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z'],
  web: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'],
  mail: ['M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z', 'm22 6-10 7L2 6'],
} as const;
