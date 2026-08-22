import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { usePrivy } from '../lib/auth';

import { getJson } from '../services/apiClient';
import { useT } from '../i18n';

// Profile → the personal loyalty code, always at hand. Before this card the
// only way to see your own code was to open some venue's loyalty page — fine
// at the counter you are standing in, useless everywhere else.
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
        const r = await getJson<{ ok: true; code: string | null }>(
          '/api/loyalty/me/code',
          token
        );
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
    <div className="rounded-2xl border border-hero-cyan/25 bg-hero-deep/50 p-6 text-center">
      <p className="text-xs uppercase tracking-wider text-slate-500">{t('mc.title')}</p>
      {qr && (
        <img src={qr} alt="" className="mx-auto mt-3 h-36 w-36 rounded-xl bg-white p-1.5 shadow-lg" />
      )}
      <p className="mt-2 font-mono text-4xl font-bold tracking-[0.35em] text-hero-cyan">
        {code}
      </p>
      <p className="mt-2 text-xs text-slate-500">{t('mc.hint')}</p>
    </div>
  );
}
