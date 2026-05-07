import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';

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
export default function Header() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const [mobileOpen, setMobileOpen] = useState(false);

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
      ? 'text-hero-cyan'
      : 'text-slate-300 hover:text-white transition-colors';

  return (
    <header className="sticky top-0 z-40 border-b border-hero-blue/20 bg-hero-deep/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6 md:py-4">
        {/* Wordmark — links to home. We use Space Grotesk display font for it. */}
        <Link
          to="/"
          className="flex items-center gap-2 font-display text-lg font-bold tracking-tight md:text-xl"
          onClick={() => setMobileOpen(false)}
        >
          <span className="text-shimmer bg-gradient-to-r from-hero-cyan via-white to-hero-gold bg-clip-text text-transparent">
            HeroPad
          </span>
        </Link>

        {/* Desktop nav (hidden on mobile). */}
        <nav className="hidden items-center gap-6 text-sm md:flex">
          <NavLink to="/" end className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/claim" className={navLinkClass}>
            Claim
          </NavLink>
          <NavLink to="/v-dash" className={navLinkClass}>
            V-DASH
          </NavLink>
          {authenticated && (
            <NavLink to="/profile" className={navLinkClass}>
              Profile
            </NavLink>
          )}

          {!authenticated ? (
            <button
              type="button"
              onClick={login}
              disabled={!ready}
              className="rounded-full bg-solana-purple px-5 py-2 font-medium text-white shadow-hero-purple transition hover:bg-solana-purple-deep disabled:opacity-50"
            >
              {ready ? 'Login' : 'Loading…'}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-hero-cyan/40 px-3 py-1 font-mono text-xs text-hero-cyan">
                {userLabel}
              </span>
              <button
                type="button"
                onClick={logout}
                className="text-xs text-slate-400 transition hover:text-white"
              >
                Logout
              </button>
            </div>
          )}
        </nav>

        {/* Mobile controls: compact login + hamburger. */}
        <div className="flex items-center gap-2 md:hidden">
          {!authenticated ? (
            <button
              type="button"
              onClick={login}
              disabled={!ready}
              className="rounded-full bg-solana-purple px-4 py-1.5 text-sm font-medium text-white shadow-hero-purple disabled:opacity-50"
            >
              {ready ? 'Login' : '…'}
            </button>
          ) : (
            <span className="rounded-full border border-hero-cyan/40 px-2.5 py-1 font-mono text-[11px] text-hero-cyan">
              {shortAddress ?? '...'}
            </span>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-hero-blue/40 text-slate-200 transition hover:border-hero-cyan hover:text-hero-cyan"
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
        <nav className="border-t border-hero-blue/20 bg-hero-deep px-4 py-3 md:hidden">
          <div className="flex flex-col gap-3 text-sm">
            <NavLink to="/" end className={navLinkClass} onClick={() => setMobileOpen(false)}>
              Home
            </NavLink>
            <NavLink to="/claim" className={navLinkClass} onClick={() => setMobileOpen(false)}>
              Claim
            </NavLink>
            <NavLink to="/v-dash" className={navLinkClass} onClick={() => setMobileOpen(false)}>
              V-DASH
            </NavLink>
            {authenticated && (
              <NavLink to="/profile" className={navLinkClass} onClick={() => setMobileOpen(false)}>
                Profile
              </NavLink>
            )}
            {authenticated && (
              <button
                type="button"
                onClick={() => {
                  logout();
                  setMobileOpen(false);
                }}
                className="self-start text-xs text-slate-400 hover:text-white"
              >
                Logout
              </button>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
