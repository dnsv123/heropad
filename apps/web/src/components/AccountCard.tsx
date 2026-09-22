import { usePrivy } from '../lib/auth';

import { useT } from '../i18n';

// Profile → Account card. Avatar (SuperVictor pfp for now — a custom photo
// slot later), email, joined date, and the linked-methods actions. Sits at
// the very top of the Profile page.

export default function AccountCard() {
  const { user, linkEmail, linkGoogle } = usePrivy();
  const { t } = useT();

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-hero-navy p-6">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-hero-cyan/30 bg-gradient-to-br from-hero-blue/40 to-hero-deep md:h-20 md:w-20">
          <img
            src="/super-victor-face.webp"
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

      {/* Only the two sign-in methods a customer recognises. Linking an
          external wallet moved to Profile → vault → Technical details:
          it is an expert action, and offering it here made the account card
          read like a crypto app. */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.08] pt-4">
        {!user?.email && (
          <button
            type="button"
            onClick={linkEmail}
            className="rounded-full border border-white/15 bg-hero-navy px-4 py-1.5 text-xs text-slate-200 transition hover:border-white/30 hover:text-white"
          >
            {t('acct.link.email')}
          </button>
        )}
        {!user?.google && (
          <button
            type="button"
            onClick={linkGoogle}
            className="rounded-full border border-white/15 bg-hero-navy px-4 py-1.5 text-xs text-slate-200 transition hover:border-white/30 hover:text-white"
          >
            {t('acct.link.google')}
          </button>
        )}
      </div>
    </div>
  );
}
