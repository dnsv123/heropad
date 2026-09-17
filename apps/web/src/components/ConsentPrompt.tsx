import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '../lib/auth';

import { postJson } from '../services/apiClient';
import { getItem, setItem } from '../services/storageService';
import { useT } from '../i18n';

// Marketing consent — asked ONCE, after the customer already has stamps.
// ---------------------------------------------------------------------------
// GDPR: using the loyalty service runs on the contract basis (no tick needed);
// sending a newsletter needs its own explicit consent. So this is opt-IN,
// never pre-ticked, phrased so declining is obviously fine, and it stores the
// text version accepted. Asking after the first stamps (not at signup) also
// keeps the entry flow at the counter as fast as possible.

const CONSENT_VERSION = '2026-08-v1';
const ASKED_KEY = 'consent:asked';

interface ConsentPromptProps {
  /** Only ask once the customer actually has something to come back for. */
  show: boolean;
}

export default function ConsentPrompt({ show }: ConsentPromptProps) {
  const { user, getAccessToken } = usePrivy();
  const { t } = useT();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!show) return;
    let active = true;
    void getItem<string>(ASKED_KEY).then((asked) => {
      if (active && !asked) setVisible(true);
    });
    return () => {
      active = false;
    };
  }, [show]);

  async function answer(consent: boolean) {
    setBusy(true);
    try {
      const token = await getAccessToken();
      const email = user?.email?.address ?? user?.google?.email ?? undefined;
      await postJson(
        '/api/loyalty/me/consent',
        { consent, email, version: CONSENT_VERSION },
        token ?? undefined
      );
      await setItem(ASKED_KEY, CONSENT_VERSION);
      setDone(true);
      window.setTimeout(() => setVisible(false), 1800);
    } catch {
      // Never block the loyalty flow over a marketing prompt.
      await setItem(ASKED_KEY, CONSENT_VERSION);
      setVisible(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="mt-4 rounded-2xl border border-white/[0.08] bg-hero-navy p-4"
        >
          {done ? (
            <p className="text-center text-sm text-solana-green">{t('consent.saved')}</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-hero-cyan">{t('consent.title')}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{t('consent.body')}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void answer(true)}
                  className="rounded-full bg-hero-cyan px-4 py-2 text-xs font-semibold text-hero-deep transition hover:bg-white disabled:opacity-50"
                >
                  {t('consent.yes')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void answer(false)}
                  className="rounded-full border border-white/15 px-4 py-2 text-xs text-slate-300 transition hover:border-white hover:text-white disabled:opacity-50"
                >
                  {t('consent.no')}
                </button>
                <Link
                  to="/privacy"
                  className="ml-auto text-[11px] text-slate-500 underline hover:text-hero-cyan"
                >
                  {t('consent.privacy')}
                </Link>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
