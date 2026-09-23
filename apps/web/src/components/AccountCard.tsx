import { usePrivy } from '../lib/auth';

import { useT } from '../i18n';

// Profile → the member card at the top. Same material as the loyalty card
// (logo navy, engraved lattice, one amber detail) so the profile reads as the
// holder of those cards rather than a settings page. Email, member since, and
// the two sign-in methods a customer recognises; linking an external wallet
// lives in Profile → Account → vault → Technical details.

const SURFACE =
  'repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 7px),' +
  'repeating-linear-gradient(45deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 9px),' +
  'radial-gradient(90% 80% at 85% 0%, rgba(255,255,255,0.12), transparent 50%),' +
  'linear-gradient(145deg, #14357F 0%, #0A2766 42%, #061A47 100%)';

export default function AccountCard() {
  const { user, linkEmail, linkGoogle } = usePrivy();
  const { t, lang } = useT();
  const email = user?.email?.address ?? user?.google?.email ?? '—';
  const since = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-GB', { month: 'long', year: 'numeric' })
    : '—';

  return (
    <div
      className="relative overflow-hidden rounded-[28px] p-5 text-white shadow-[0_30px_60px_-28px_rgba(3,10,35,0.8)] ring-1 ring-white/10 sm:p-6"
      style={{ background: SURFACE }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#F7A30C]">{t('acct.member')}</p>
        <p className="font-display text-xs font-bold text-white/70">
          Hero<span className="text-[#F7A30C]">Pad</span>
        </p>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-hero-navy2 ring-2 ring-white/15 md:h-20 md:w-20">
          <img
            src="/super-victor-face.webp"
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold">{email}</p>
          <p className="mt-0.5 text-xs text-white/60">
            {t('acct.since')} {since}
          </p>
        </div>
      </div>

      {(!user?.email || !user?.google) && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          {!user?.email && (
            <button
              type="button"
              onClick={linkEmail}
              className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-white/85 transition hover:border-white/40 hover:text-white"
            >
              {t('acct.link.email')}
            </button>
          )}
          {!user?.google && (
            <button
              type="button"
              onClick={linkGoogle}
              className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-white/85 transition hover:border-white/40 hover:text-white"
            >
              {t('acct.link.google')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
