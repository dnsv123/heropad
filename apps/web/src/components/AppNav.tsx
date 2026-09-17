import { NavLink, useLocation } from 'react-router-dom';

import { useT } from '../i18n';

// The bottom pill — what makes the customer screens feel like an app and not
// a website. Mobile only (the header carries the links on desktop), and only
// on the four screens a customer actually moves between. It never shows on
// the landing (that page sells, it does not navigate) nor on the merchant
// and admin screens (those have their own tabs).

const APP_ROUTES = ['/loyalty', '/rewards', '/passport', '/profile'];

function isAppRoute(pathname: string): boolean {
  return APP_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** The last venue card the customer opened, so "Card" goes back to THEIR café. */
function lastVenuePath(): string {
  try {
    const slug = localStorage.getItem('hp.lastVenue');
    return slug ? `/loyalty/${slug}` : '/loyalty';
  } catch {
    return '/loyalty';
  }
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
    <path d={d} />
  </svg>
);

export default function AppNav() {
  const { pathname } = useLocation();
  const { t } = useT();
  if (!isAppRoute(pathname)) return null;

  const items = [
    { to: lastVenuePath(), match: '/loyalty', label: t('an.card'), icon: icon('M13 2L4 14h6l-1 8 9-12h-6l1-8z') },
    { to: '/rewards', match: '/rewards', label: t('an.rewards'), icon: icon('M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7a3 3 0 1 1 3-3c0 2-3 3-3 3zM12 7a3 3 0 1 0-3-3c0 2 3 3 3 3z') },
    { to: '/passport', match: '/passport', label: t('an.passport'), icon: icon('M4 4h16v16H4zM8 20V4M12 9h5M12 13h5') },
    { to: '/profile', match: '/profile', label: t('an.profile'), icon: icon('M20 21a8 8 0 1 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z') },
  ];

  return (
    <>
      {/* Keeps the last content clear of the pill. */}
      <div aria-hidden className="h-24 md:hidden" />
    <nav
      aria-label="App"
      className="fixed inset-x-4 bottom-4 z-40 flex items-center justify-around rounded-full border border-white/10 bg-hero-navy/95 p-1.5 backdrop-blur md:hidden"
      style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
    >
      {items.map((it) => {
        const active = pathname === it.match || pathname.startsWith(`${it.match}/`);
        return (
          <NavLink
            key={it.match}
            to={it.to}
            className={`flex flex-col items-center gap-0.5 rounded-full px-4 py-1.5 font-display text-[9px] font-medium uppercase tracking-wider transition ${
              active ? 'bg-hero-navy2 text-white' : 'text-slate-400'
            }`}
          >
            {it.icon}
            {it.label}
          </NavLink>
        );
      })}
    </nav>
    </>
  );
}
