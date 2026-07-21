import { usePrivy } from '@privy-io/react-auth';

import { useT } from '../i18n';

// Profile → Account card. Avatar (SuperVictor pfp for now — a custom photo
// slot later), email, joined date, and the linked-methods actions. Sits at
// the very top of the Profile page.

export default function AccountCard() {
  const { user, linkEmail, linkGoogle, linkWallet } = usePrivy();
  const { t } = useT();

  return (
    <div className="rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-6">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-hero-cyan/30 bg-gradient-to-br from-hero-blue/40 to-hero-deep md:h-20 md:w-20">
          <img
            src="/super-victor-pfp.png"
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-hero-cyan/20"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-slate-500">{t('acct.label')}</p>
          <p className="mt-1 truncate font-medium text-slate-100">
            {user?.email?.address ?? user?.google?.email ?? '—'}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {t('acct.joined')}{' '}
            {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-hero-blue/15 pt-4">
        {!user?.email && (
          <button
            type="button"
            onClick={linkEmail}
            className="rounded-full border border-hero-blue/40 bg-hero-deep/50 px-4 py-1.5 text-xs text-slate-200 transition hover:border-hero-cyan hover:text-white"
          >
            {t('acct.link.email')}
          </button>
        )}
        {!user?.google && (
          <button
            type="button"
            onClick={linkGoogle}
            className="rounded-full border border-hero-blue/40 bg-hero-deep/50 px-4 py-1.5 text-xs text-slate-200 transition hover:border-hero-cyan hover:text-white"
          >
            {t('acct.link.google')}
          </button>
        )}
        <button
          type="button"
          onClick={linkWallet}
          className="rounded-full border border-hero-blue/40 bg-hero-deep/50 px-4 py-1.5 text-xs text-slate-200 transition hover:border-solana-purple hover:text-white"
        >
          {t('acct.link.wallet')}
        </button>
      </div>
    </div>
  );
}
