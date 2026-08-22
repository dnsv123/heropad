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

// /profile is auth-gated. Unauthenticated visitors see a CTA that triggers
// Privy login; once logged in they see ProfileWallet. We avoid `<Navigate />`
// so deep-links into /profile don't lose the user — they just see a soft prompt.
export default function Profile() {
  const { ready, authenticated, login } = usePrivy();
  const { t } = useT();

  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold">{t('p.title')}</h1>

      <div className="mt-8">
        {!ready ? (
          <p className="text-slate-400">Loading…</p>
        ) : !authenticated ? (
          <div className="space-y-4 rounded-2xl border border-slate-800 p-8 text-center">
            <p className="text-slate-300">{t('p.login.hint')}</p>
            <button
              type="button"
              onClick={login}
              className="rounded-full bg-[#9945FF] px-6 py-2.5 font-medium text-white transition hover:bg-[#7d34d6]"
            >
              {t('p.login.btn')}
            </button>
          </div>
        ) : (
          <>
            {/* Order: who you are → your daily value (Power Pass) → the
                plumbing (wallets) → what you own (collection). */}
            <AccountCard />
            {/* The code lives high on the page: it is the thing a customer
                opens the Profile FOR when they are standing at a counter. */}
            <div className="mt-8">
              <MyCode />
            </div>
            {/* Renders nothing for a plain customer; sits high for the people
                who do wear another hat, because it is why they opened this. */}
            <div className="mt-8">
              <MyRoles />
            </div>
            <div className="mt-8">
              <LoyaltyStats />
            </div>
            <div className="mt-8">
              <PartnerVenues />
            </div>
            <div className="mt-8">
              <BirthdayCard />
            </div>
            <div className="mt-8">
              <ProfileWallet />
            </div>
            <CollectionCard />
          </>
        )}
      </div>
    </section>
  );
}
