import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { usePrivy } from '../lib/auth';
import { useSolanaWallets } from '../lib/auth';

import { useT } from '../i18n';

// Single source of truth for the top navigation + auth button.
// Layout strategy:
//   - Desktop (md+): inline nav links + login button to the right of the wordmark.
//   - Mobile: only logo + login button visible; tapping the menu icon reveals
//     a slide-down drawer with the nav links. Keeps things readable on 375px.
//
// Privy hooks:
//   - `ready` flips to true once the SDK has loaded + checked existing session.
//   - `authenticated` is true after a successful login (or returning visit).
//   - `login()` opens the Privy modal; `logout()` clears the session and any
//     embedded-wallet keys from local storage.
//
// The markup of the wordmark row is mirrored as static HTML in index.html
// (#prehero) so the first paint already shows it. Change one, change both.
export default function Header() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { lang, setLang, t } = useT();

  // One-tap language toggle: shows the language you would SWITCH TO.
  const langToggle = (
    <button
      type="button"
      onClick={() => setLang(lang === 'ro' ? 'en' : 'ro')}
      aria-label={lang === 'ro' ? 'Switch to English' : 'Schimbă în română'}
      className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-300 transition hover:border-white/30 hover:text-white"
    >
      {lang === 'ro' ? 'EN' : 'RO'}
    </button>
  );

  // Pick the first Solana wallet (embedded if user signed in with email/Google,
  // external if they connected Phantom/Solflare). Both share the same shape.
  const solanaAddress = wallets[0]?.address;
  const shortAddress = solanaAddress
    ? `${solanaAddress.slice(0, 4)}…${solanaAddress.slice(-4)}`
    : null;

  // Friendly label fallback when wallet is still provisioning (~1–2s after login).
  const userLabel =
    shortAddress ??
    user?.email?.address ??
    user?.google?.email ??
    'Connected';

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? 'text-white'
      : 'text-slate-400 hover:text-white transition-colors';

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-hero-deep/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6 md:py-4">
        {/* Wordmark — the mascot's face beside the name. Solid white, gold
            "Pad": one colour of ink, one of paint, no gradient. */}
        <Link
          to="/"
          className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight md:text-xl"
          onClick={() => setMobileOpen(false)}
        >
          <img
            src="/super-victor-pfp.webp"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-full bg-hero-navy2 object-cover"
          />
          <span>
            Hero<span className="text-hero-gold">Pad</span>
          </span>
        </Link>

        {/* Desktop nav (hidden on mobile). */}
        <nav className="hidden items-center gap-6 text-sm md:flex">
          <NavLink to="/" end className={navLinkClass}>
            {t('nav.home')}
          </NavLink>
          {/* "Claim" intentionally hidden from nav until physical QR/NFC
              products ship — the page stays live via /claim + Ecosystem card. */}
          {/* The shelf sits in the main nav on purpose: BITS only mean
              something if what they buy is one tap away from anywhere. */}
          <NavLink to="/rewards" className={navLinkClass}>
            {t('nav.rewards')}
          </NavLink>
          <NavLink to="/v-dash" className={navLinkClass}>
            {t('nav.vdash')}
          </NavLink>
          {/* Always rendered: a guest clicking it lands on the Profile login
             prompt, and the link no longer POPS IN when Privy resolves —
             that pop was shifting the whole nav (the page's biggest CLS). */}
          <NavLink to="/profile" className={navLinkClass}>
            {t('nav.profile')}
          </NavLink>
          {langToggle}

          {/* Fixed-width slot: the login button and the account chip swap
             inside reserved space instead of resizing the nav. */}
          <div className="flex min-w-[190px] items-center justify-end gap-3">
            {!authenticated ? (
              <button
                type="button"
                onClick={login}
                disabled={!ready}
                className="btn btn-primary btn-sm"
              >
                {ready ? t('nav.login') : t('nav.loading')}
              </button>
            ) : (
              <>
                <span className="max-w-[150px] truncate rounded-full border border-white/15 px-3 py-1 font-mono text-xs text-hero-cyan">
                  {userLabel}
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="text-xs text-slate-400 transition hover:text-white"
                >
                  {t('nav.logout')}
                </button>
              </>
            )}
          </div>
        </nav>

        {/* Mobile controls: compact login + hamburger. */}
        <div className="flex items-center gap-2 md:hidden">
          {langToggle}
          {!authenticated ? (
            <button
              type="button"
              onClick={login}
              disabled={!ready}
              className="btn btn-primary btn-sm"
            >
              {ready ? t('nav.login') : '…'}
            </button>
          ) : (
            <span className="rounded-full border border-white/15 px-2.5 py-1 font-mono text-[11px] text-hero-cyan">
              {shortAddress ?? '...'}
            </span>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-slate-200 transition hover:border-white/30 hover:text-white"
          >
            {/* Tiny inline hamburger / close — no extra icon library needed. */}
            {mobileOpen ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer — only mounts when open, and on small screens only. */}
      {mobileOpen && (
        <nav className="border-t border-white/[0.06] bg-hero-deep px-4 py-3 md:hidden">
          <div className="flex flex-col gap-3 text-sm">
            <NavLink to="/" end className={navLinkClass} onClick={() => setMobileOpen(false)}>
              {t('nav.home')}
            </NavLink>
            <NavLink to="/rewards" className={navLinkClass} onClick={() => setMobileOpen(false)}>
              {t('nav.rewards')}
            </NavLink>
            <NavLink to="/v-dash" className={navLinkClass} onClick={() => setMobileOpen(false)}>
              {t('nav.vdash')}
            </NavLink>
            {authenticated && (
              <NavLink to="/profile" className={navLinkClass} onClick={() => setMobileOpen(false)}>
                {t('nav.profile')}
              </NavLink>
            )}
            {authenticated && (
              <button
                type="button"
                onClick={() => {
                  void logout();
                  setMobileOpen(false);
                }}
                className="self-start text-xs text-slate-400 hover:text-white"
              >
                {t('nav.logout')}
              </button>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
