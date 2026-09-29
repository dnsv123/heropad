import { useEffect, useState } from 'react';
import { usePrivy } from '../lib/auth';

import { getJson } from '../services/apiClient';
import { useT } from '../i18n';
import Glyph from './Glyph';
import type { BitsPage } from './BitsActivity';

// The balance, always in sight at the top of the Profile, one tap from its
// history. Asks for the first page with a single row: totals come with it.
export default function BitsPill({ onOpen }: { onOpen: () => void }) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { t, lang } = useT();
  const [bits, setBits] = useState<number | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let active = true;
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const r = await getJson<BitsPage>('/api/user/bits?limit=1', token);
        if (active && r.bits) setBits(r.bits.current);
      } catch {
        /* the pill stays in its skeleton; the BITS tab has its own retry */
      }
    })();
    return () => {
      active = false;
    };
  }, [ready, authenticated, getAccessToken]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-[#F7A30C]/30 bg-[#F7A30C]/[0.07] px-4 py-3 text-left transition hover:bg-[#F7A30C]/[0.12]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#F7A30C] text-hero-deep">
        <Glyph name="bolt" className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FFC45A]">{t('bits.balance')}</span>
        <span className="tnum block font-display text-2xl font-bold leading-tight text-white">
          {bits === null ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-white/10 align-middle" /> : bits.toLocaleString(lang === 'ro' ? 'ro-RO' : 'en-GB')}
          <span className="ml-1.5 text-sm font-semibold text-slate-400">BITS</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-300">
        {t('bits.open')}
        <Glyph name="arrow" className="h-4 w-4" />
      </span>
    </button>
  );
}
