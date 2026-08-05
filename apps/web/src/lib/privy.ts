// Privy configuration for HeroPad.
// Single source of truth for the PrivyProvider config shape.
//
// Login flow:
//   - Email + Google for low-friction onboarding (Web2 users without wallet apps).
//   - External Solana wallets (Phantom, Solflare, etc.) auto-detected via Wallet Standard.
//   - Embedded Solana wallet auto-created for any user who logs in without one.
//
// All values that can change between environments come from import.meta.env.
// VITE_PRIVY_APP_ID must be set in .env (local) and on Vercel (Production/Preview).

import type { PrivyClientConfig } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

// Auto-connect is intentionally OFF.
// Reason: when set to true, ANY injected wallet extension (including EVM-only
// ones like MetaMask) can trigger an unwanted unlock popup on every page load.
// Users explicitly click "Login → Continue with a wallet" when they want to
// connect — that's a clearer mental model and zero surprise pop-ups.
const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: false });

export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;

const SITE =
  typeof window !== 'undefined'
    ? window.location.origin
    : 'https://heropad.supervictoruniverse.com';

export const privyConfig: PrivyClientConfig = {
  loginMethods: ['email', 'google', 'wallet'],
  // GDPR Art. 13: the notice must be reachable AT the point of collection.
  // Privy renders these inside its own login modal, so a customer signing up
  // at a café counter sees them without hunting through the footer.
  legal: {
    privacyPolicyUrl: `${SITE}/privacy`,
    termsAndConditionsUrl: `${SITE}/terms`,
  },
  appearance: {
    theme: 'dark',
    // Solana brand purple — matches the rest of the HeroPad palette.
    accentColor: '#9945FF',
    walletChainType: 'solana-only',
    logo: undefined, // TODO: swap in /logo.svg once we have a final logo file.
    showWalletLoginFirst: false,
  },
  externalWallets: {
    solana: { connectors: solanaConnectors },
  },
  embeddedWallets: {
    // Auto-provision an embedded Solana wallet for users who log in via Email/Google
    // and do not bring their own wallet. This is the cNFT receive address.
    createOnLogin: 'users-without-wallets',
  },
};
