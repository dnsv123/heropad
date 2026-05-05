// TODO: configure PrivyProvider with Solana embedded wallet + Gmail-only login.
// Reads VITE_PRIVY_APP_ID at runtime; exports a typed config object.

export const privyConfig = {
  appId: import.meta.env.VITE_PRIVY_APP_ID as string | undefined,
  // TODO: add loginMethods: ['google'], embeddedWallets, appearance overrides.
};

export {};
