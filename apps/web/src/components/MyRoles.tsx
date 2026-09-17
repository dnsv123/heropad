import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { usePrivy } from '../lib/auth';

import { getJson } from '../services/apiClient';
import { useT } from '../i18n';

// The hats one account wears.
// ---------------------------------------------------------------------------
// A single login can be a customer, a barista at one café, the owner of
// another, and a referral partner. Before this, the only way to discover you
// had been added to a team was for someone to tell you, and the only way to
// reach the right screen was for them to send you a link. Roles you hold and
// cannot find are roles that do not exist.
//
// Renders nothing for a plain customer — most people have no second hat and
// should not be shown an empty box explaining that.

interface Roles {
  ok: true;
  merchantOf: Array<{ slug: string; name: string }>;
  staffAt: Array<{ slug: string; name: string; displayName: string }>;
  partner: { code: string; displayName: string; active: boolean } | null;
}

export default function MyRoles() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { t } = useT();
  const [roles, setRoles] = useState<Roles | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let alive = true;
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const r = await getJson<Roles>('/api/loyalty/me/roles', token);
        if (alive) setRoles(r);
      } catch {
        // A missing roles card must never break the profile page.
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready, authenticated, getAccessToken]);

  const has =
    roles && (roles.merchantOf.length > 0 || roles.staffAt.length > 0 || roles.partner !== null);
  if (!has) return null;

  const row = (
    key: string,
    icon: string,
    title: string,
    subtitle: string,
    to: string,
    tone: string
  ) => (
    <Link
      key={key}
      to={to}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition hover:brightness-125 ${tone}`}
    >
      <span className="text-lg">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{title}</span>
        <span className="block truncate text-[11px] text-slate-400">{subtitle}</span>
      </span>
      <span className="shrink-0 text-slate-500">›</span>
    </Link>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/[0.08] bg-hero-navy p-5"
    >
      <h2 className="font-display text-lg font-semibold text-white">{t('roles.title')}</h2>
      <p className="mt-1 text-xs text-slate-500">{t('roles.sub')}</p>

      <div className="mt-4 space-y-2">
        {roles.merchantOf.map((v) =>
          row(
            `owner-${v.slug}`,
            '🏪',
            v.name,
            t('roles.owner'),
            `/business?venue=${v.slug}`,
            'border-hero-gold/30 bg-hero-gold/5'
          )
        )}
        {roles.staffAt.map((v) =>
          row(
            `staff-${v.slug}`,
            '👤',
            v.name,
            t('roles.staff').replace('{name}', v.displayName),
            `/business?venue=${v.slug}`,
            'border-hero-cyan/25 bg-hero-cyan/5'
          )
        )}
        {roles.partner &&
          row(
            'partner',
            '🤝',
            t('roles.partner.title'),
            t('roles.partner.sub').replace('{code}', roles.partner.code),
            '/partner',
            'border-hero-gold/30 bg-hero-gold/5'
          )}
      </div>
    </motion.div>
  );
}
