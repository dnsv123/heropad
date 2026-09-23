import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { usePrivy } from '../lib/auth';

import { getJson } from '../services/apiClient';
import { useT } from '../i18n';

// Profile → the personal loyalty code, always at hand, drawn like a boarding
// pass: the QR on white where a scanner reads it best, the code big beside
// it, one line saying what to do with it. Before this card the only way to
// see your own code was to open some venue's loyalty page.
export default function MyCode() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { t } = useT();
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let active = true;
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const r = await getJson<{ ok: true; code: string | null }>('/api/loyalty/me/code', token);
        if (active) setCode(r.code);
      } catch {
        /* the card simply does not render */
      }
    })();
    return () => {
      active = false;
    };
  }, [ready, authenticated, getAccessToken]);

  // Same HPC: prefix the counter scanner understands on the loyalty page.
  useEffect(() => {
    if (!code) {
      setQr(null);
      return;
    }
    void QRCode.toDataURL(`HPC:${code}`, {
      width: 320,
      margin: 1,
      color: { dark: '#0A1B3A', light: '#FFFFFF' },
    }).then(setQr, () => setQr(null));
  }, [code]);

  if (!ready || !authenticated || !code) return null;

  return (
    <div className="card flex items-center gap-4 overflow-hidden p-4 sm:gap-5 sm:p-5">
      <div className="shrink-0 rounded-2xl bg-white p-2 shadow-lg">
        {qr ? (
          <img src={qr} alt="" width={128} height={128} className="h-28 w-28 sm:h-32 sm:w-32" />
        ) : (
          <div className="h-28 w-28 animate-pulse rounded-xl bg-slate-200 sm:h-32 sm:w-32" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{t('mc.title')}</p>
        <p className="mt-1 font-mono text-3xl font-bold tracking-[0.25em] text-white sm:text-4xl">{code}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">{t('mc.hint')}</p>
      </div>
    </div>
  );
}
