import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '../lib/auth';

import { getJson } from '../services/apiClient';
import { useT } from '../i18n';

// The customer's OTHER cards, as a row of chips under the venue name. A regular
// at three cafés should not need the menu to move between them: the bottom
// nav's "Card" opens the last one, and this row is the way to the rest.
// Renders nothing for a customer with a single card.

interface VenueStat {
  slug: string;
  name: string;
  current: number;
  required: number;
}

export default function MyCards({ currentSlug }: { currentSlug: string }) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { t } = useT();
  const [venues, setVenues] = useState<VenueStat[]>([]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let active = true;
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const r = await getJson<{ ok: true; venues: VenueStat[] }>('/api/loyalty/me/stats', token);
        if (active) setVenues(r.venues);
      } catch {
        /* the row is a convenience — the card itself is unaffected */
      }
    })();
    return () => {
      active = false;
    };
  }, [ready, authenticated, getAccessToken]);

  const others = venues.filter((v) => v.slug !== currentSlug);
  if (others.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-center text-[10px] uppercase tracking-[0.18em] text-slate-500">
        {t('loy.mycards')}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {others.map((v) => (
          <Link key={v.slug} to={`/loyalty/${v.slug}`} className="chip hover:border-white/30">
            <span>{v.name}</span>
            <span className="tnum text-slate-400">
              {v.current}/{v.required}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
