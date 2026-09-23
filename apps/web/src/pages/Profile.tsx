import { useState } from 'react';
import { usePrivy } from '../lib/auth';

import { useT } from '../i18n';
import AccountCard from '../components/AccountCard';
import BirthdayCard from '../components/BirthdayCard';
import MyCode from '../components/MyCode';
import MyRoles from '../components/MyRoles';
import PartnerVenues from '../components/PartnerVenues';
import ProfileWallet from '../components/ProfileWallet';
import LoyaltyStats from '../components/LoyaltyStats';
import CollectionCard from '../components/CollectionCard';
import MyRewards from '../components/MyRewards';

// /profile. The member card on top, then three tabs instead of one long
// scroll: what you use at the counter (code, cards, rewards), what you have
// collected (trophies, BITS), and the account itself (birthday, vault).
// The tab is remembered in the URL hash so a link can open "#collection".
//
// Auth-gated softly: a visitor without a session sees a prompt that opens
// Privy, never a redirect, so deep links into /profile keep working.

type Tab = 'cards' | 'collection' | 'account';
const TABS: Tab[] = ['cards', 'collection', 'account'];

function initialTab(): Tab {
  if (typeof window === 'undefined') return 'cards';
  const h = window.location.hash.replace('#', '');
  return (TABS as string[]).includes(h) ? (h as Tab) : 'cards';
}

export default function Profile() {
  const { ready, authenticated, login } = usePrivy();
  const { t } = useT();
  const [tab, setTab] = useState<Tab>(initialTab);

  const choose = (k: Tab) => {
    setTab(k);
    try {
      window.history.replaceState(null, '', k === 'cards' ? window.location.pathname : `#${k}`);
    } catch {
      /* sandboxed history — the tab still changes */
    }
  };

  return (
    <section className="mx-auto max-w-xl px-4 pb-28 pt-8 sm:px-6 md:pt-12">
      <h1 className="sr-only">{t('p.title')}</h1>

      {!ready ? (
        <div className="h-40 animate-pulse rounded-[28px] bg-hero-navy2" aria-busy="true" />
      ) : !authenticated ? (
        <div className="card space-y-4 p-8 text-center">
          <p className="font-display text-lg font-semibold text-white">{t('p.title')}</p>
          <p className="text-slate-300">{t('p.login.hint')}</p>
          <button type="button" onClick={login} className="btn btn-primary">
            {t('p.login.btn')}
          </button>
        </div>
      ) : (
        <>
          <AccountCard />

          {/* Renders nothing for a plain customer; for owners, staff and
              partners it is the reason they opened this page. */}
          <div className="mt-4 empty:hidden">
            <MyRoles />
          </div>

          <div className="mt-5 flex gap-1 rounded-full border border-white/[0.08] bg-hero-navy p-1" role="tablist">
            {TABS.map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => choose(k)}
                className={`flex-1 rounded-full px-3 py-2 text-sm font-medium transition ${
                  tab === k ? 'bg-hero-navy2 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t(`prof.tab.${k}` as 'prof.tab.cards')}
              </button>
            ))}
          </div>

          {tab === 'cards' && (
            <div className="mt-5 space-y-6">
              {/* The code first: it is what a customer opens Profile FOR
                  when they stand at a counter. */}
              <MyCode />
              <LoyaltyStats />
              <MyRewards />
              <PartnerVenues />
            </div>
          )}

          {tab === 'collection' && (
            <div className="mt-5">
              <CollectionCard />
            </div>
          )}

          {tab === 'account' && (
            <div className="mt-5 space-y-6">
              <BirthdayCard />
              <ProfileWallet />
            </div>
          )}
        </>
      )}
    </section>
  );
}
