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

  const hasContact = Boolean(b.phone || b.email || b.instagram || b.facebook || b.website);
  if (!hasContact && !happyHourNext && !(gpsLat && gpsLng)) return null;

  const chip =
    'flex items-center gap-1.5 rounded-full border border-hero-blue/25 bg-hero-deep/70 px-3 py-1.5 text-xs text-slate-300 transition hover:border-hero-cyan hover:text-white';

  return (
    <div className="mt-6 rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-5">
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
                ⚡ {t('vc.hh.now').replace('{n}', String(happyHourNext.mult))}
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

      <p className="text-xs uppercase tracking-wider text-slate-500">{t('vc.title')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={mapUrl} target="_blank" rel="noopener noreferrer" className={chip}>
          📍 {t('vc.map')}
        </a>
        {b.phone && (
          <a href={`tel:${b.phone.replace(/\s/g, '')}`} className={chip}>
            📞 {b.phone}
          </a>
        )}
        {b.email && (
          <a href={`mailto:${b.email}`} className={chip}>
            ✉️ {b.email}
          </a>
        )}
        {b.instagram && (
          <a
            href={instagramUrl(b.instagram)}
            target="_blank"
            rel="noopener noreferrer"
            className={chip}
          >
            📷 Instagram
          </a>
        )}
        {b.facebook && (
          <a
            href={facebookUrl(b.facebook)}
            target="_blank"
            rel="noopener noreferrer"
            className={chip}
          >
            👍 Facebook
          </a>
        )}
        {b.website && (
          <a href={b.website} target="_blank" rel="noopener noreferrer" className={chip}>
            🌐 {t('vc.website')}
          </a>
        )}
      </div>
    </div>
  );
}
