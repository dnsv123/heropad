import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { usePrivy } from '../lib/auth';
import { useSolanaWallets } from '../lib/auth';

import { useT } from '../i18n';
import { contactHref, contactIsWhatsApp } from '../lib/contact';

// Single source of truth for the top navigation + auth button.
//
// Two faces, one component. The landing is paper (cream, navy ink, brass);
// every app screen is navy. The route decides, so the header never has to
// be told. Layout is the same in both: wordmark left, links + login right,
// a drawer on phones.
//
// Privy hooks:
//   - `ready` flips to true once the SDK has loaded + checked existing session.
//   - `authenticated` is true after a successful login (or returning visit).
//   - `login()` opens the Privy modal; `logout()` clears the session.
//
// The wordmark row is mirrored as static HTML in index.html (#prehero) so the
// first paint already shows it. Change one, change both.
export default function Header() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { lang, setLang, t } = useT();
  const paper = useLocation().pathname === '/';

  const c = paper
    ? {
        bar: 'border-ink/10 bg-paper/90',
        drawer: 'border-ink/10 bg-paper',
        wm: 'text-ink',
        link: 'font-semibold text-ink-2 hover:text-ink',
        active: 'font-semibold text-ink',
        pill: 'border-ink text-ink hover:bg-paper-2',
        chip: 'border-ink text-ink',
        muted: 'text-ink-3 hover:text-ink',
        btn: 'pbtn pbtn-white pbtn-sm',
      }
    : {
        bar: 'border-white/[0.06] bg-hero-deep/85',
        drawer: 'border-white/[0.06] bg-hero-deep',
        wm: 'text-white',
        link: 'text-slate-400 hover:text-white',
        active: 'text-white',
        pill: 'border-white/15 text-slate-300 hover:border-white/30 hover:text-white',
        chip: 'border-white/15 text-hero-cyan',
        muted: 'text-slate-400 hover:text-white',
        btn: 'btn btn-primary btn-sm',
      };

  const langToggle = (
    <button
      type="button"
      onClick={() => setLang(lang === 'ro' ? 'en' : 'ro')}
      aria-label={lang === 'ro' ? 'Switch to English' : 'Schimbă în română'}
      className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition ${paper ? 'border-2' : 'border'} ${c.pill}`}
    >
      {lang === 'ro' ? 'EN' : 'RO'}
    </button>
  );

  const solanaAddress = wallets[0]?.address;
  const shortAddress = solanaAddress
    ? `${solanaAddress.slice(0, 4)}…${solanaAddress.slice(-4)}`
    : null;
  const userLabel = shortAddress ?? user?.email?.address ?? user?.google?.email ?? 'Connected';

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? c.active : `${c.link} transition-colors`;

  const links = (onClick?: () => void) => (
    <>
      <NavLink to="/" end className={navLinkClass} onClick={onClick}>
        {t('nav.home')}
      </NavLink>
      {paper && (
        <a href="#pricing" className={`${c.link} transition-colors`} onClick={onClick}>
          {t('nav.pricing')}
        </a>
      )}
      <NavLink to="/rewards" className={navLinkClass} onClick={onClick}>
        {t('nav.rewards')}
      </NavLink>
      <NavLink to="/v-dash" className={navLinkClass} onClick={onClick}>
        {t('nav.vdash')}
      </NavLink>
      <NavLink to="/profile" className={navLinkClass} onClick={onClick}>
        {t('nav.profile')}
      </NavLink>
    </>
  );

  return (
    <header className={`sticky top-0 z-40 border-b backdrop-blur ${c.bar}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 md:py-4">
        {/* Wordmark: the mascot's face beside the name, one word, brass "Pad". */}
        <Link
          to="/"
          className={`flex min-w-0 items-center gap-2.5 font-display text-lg font-bold tracking-tight md:text-xl ${c.wm}`}
          onClick={() => setMobileOpen(false)}
        >
          <img
            src="/super-victor-face.webp"
            alt=""
            width={28}
            height={28}
            className={`h-7 w-7 shrink-0 rounded-full object-cover ${paper ? 'border-2 border-ink bg-electric-deep' : 'bg-hero-navy2'}`}
          />
          <span className="whitespace-nowrap">
            Hero<span className={paper ? 'text-electric' : 'text-hero-gold'}>Pad</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 text-sm md:flex">
          {links()}
          {langToggle}
          <div className="flex min-w-[150px] items-center justify-end gap-3">
            {/* On the landing the owner's action leads; login is for customers. */}
            {paper && (
              <a
                href={contactHref()}
                target={contactIsWhatsApp() ? '_blank' : undefined}
                rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
                className="pbtn pbtn-blue pbtn-sm hidden lg:inline-flex"
              >
                {t('nav.demo')}
              </a>
            )}
            {!authenticated ? (
              <button type="button" onClick={login} disabled={!ready} className={c.btn}>
                {ready ? t('nav.login') : t('nav.loading')}
              </button>
            ) : (
              <>
                <span className={`max-w-[150px] truncate rounded-full border px-3 py-1 font-mono text-xs ${c.chip}`}>
                  {userLabel}
                </span>
                <button type="button" onClick={logout} className={`text-xs transition ${c.muted}`}>
                  {t('nav.logout')}
                </button>
              </>
            )}
          </div>
        </nav>

        {/* Phone controls */}
        <div className="flex shrink-0 items-center gap-2 md:hidden">
          {langToggle}
          {!authenticated ? (
            <button type="button" onClick={login} disabled={!ready} className={c.btn}>
              {ready ? t('nav.login') : '…'}
            </button>
          ) : (
            <span className={`rounded-full border px-2.5 py-1 font-mono text-[11px] ${c.chip}`}>
              {shortAddress ?? '...'}
            </span>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition ${paper ? 'border-2' : 'border'} ${c.pill}`}
          >
            {mobileOpen ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className={`border-t px-4 py-3 md:hidden ${c.drawer}`}>
          <div className="flex flex-col gap-3 text-sm">
            {links(() => setMobileOpen(false))}
            {authenticated && (
              <button
                type="button"
                onClick={() => {
                  void logout();
                  setMobileOpen(false);
                }}
                className={`self-start text-xs ${c.muted}`}
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
