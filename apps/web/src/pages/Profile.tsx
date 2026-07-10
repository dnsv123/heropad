import { usePrivy } from '@privy-io/react-auth';

import ProfileWallet from '../components/ProfileWallet';
import LoyaltyStats from '../components/LoyaltyStats';

// /profile is auth-gated. Unauthenticated visitors see a CTA that triggers
// Privy login; once logged in they see ProfileWallet. We avoid `<Navigate />`
// so deep-links into /profile don't lose the user — they just see a soft prompt.
export default function Profile() {
  const { ready, authenticated, login } = usePrivy();

  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold">Your profile</h1>

      <div className="mt-8">
        {!ready ? (
          <p className="text-slate-400">Loading…</p>
        ) : !authenticated ? (
          <div className="space-y-4 rounded-2xl border border-slate-800 p-8 text-center">
            <p className="text-slate-300">
              Sign in to see your wallet, BITS balance, and collectibles.
            </p>
            <button
              type="button"
              onClick={login}
              className="rounded-full bg-[#9945FF] px-6 py-2.5 font-medium text-white transition hover:bg-[#7d34d6]"
            >
              Login to continue
            </button>
          </div>
        ) : (
          <>
            {/* Power Pass first — it's the daily-value widget; the wallet and
                collectibles (where trophies land) follow below. */}
            <LoyaltyStats />
            <div className="mt-8">
              <ProfileWallet />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
