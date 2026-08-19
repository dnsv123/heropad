import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getJson } from '../services/apiClient';
import { useT } from '../i18n';

// Profile → every venue in the network, with a door in. Public data (it is
// the printed-sticker information), so no auth needed and the list doubles
// as discovery: a customer of one café learns the other seven exist.

interface PublicVenue {
  slug: string;
  name: string;
  address: string | null;
  icon: string | null;
}

export default function PartnerVenues() {
  const { t } = useT();
  const [venues, setVenues] = useState<PublicVenue[] | null>(null);

  useEffect(() => {
    let active = true;
    getJson<{ ok: true; venues: PublicVenue[] }>('/api/loyalty/venues')
      .then((r) => active && setVenues(r.venues))
      .catch(() => active && setVenues([]));
    return () => {
      active = false;
    };
  }, []);

  if (!venues || venues.length === 0) return null;

  return (
    /* Dashed border on purpose — the visual language of "not collected yet"
       the passport album already speaks. This card is the map of what exists;
       the Power Pass above is the diary of where you already collect. */
    <div className="rounded-2xl border border-dashed border-hero-cyan/35 bg-hero-deep/30 p-6">
      <h2 className="font-display text-lg font-semibold text-hero-cyan">🧭 {t('pv.title')}</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{t('pv.hint')}</p>
      <div className="mt-4 space-y-2">
        {venues.map((v) => (
          <Link
            key={v.slug}
            to={`/loyalty/${v.slug}`}
            className="flex items-center gap-3 rounded-xl border border-hero-blue/10 bg-hero-deep/40 px-4 py-2.5 transition hover:border-hero-cyan/50 hover:bg-hero-deep/70"
          >
            <span className="text-2xl leading-none">{v.icon ?? '☕'}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-slate-200">{v.name}</span>
              {v.address && (
                <span className="block truncate text-[11px] text-slate-500">
                  📍 {v.address}
                </span>
              )}
            </span>
            <span className="text-hero-cyan">→</span>
          </Link>
        ))}
      </div>
      <Link
        to="/passport"
        className="mt-3 block rounded-xl border border-hero-gold/25 bg-hero-gold/5 px-4 py-2.5 text-center text-sm text-hero-gold transition hover:bg-hero-gold/10"
      >
        🗺️ {t('pv.passport')}
      </Link>
    </div>
  );
}
