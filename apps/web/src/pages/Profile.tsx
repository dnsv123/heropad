import ProfileWallet from '../components/ProfileWallet';

// TODO: gate behind Privy auth, then load user collectibles + BITS balance.
export default function Profile() {
  return (
    <section className="px-6 py-16">
      <h1 className="font-display text-3xl font-semibold">Your profile</h1>
      <div className="mt-8">
        <ProfileWallet />
      </div>
    </section>
  );
}
