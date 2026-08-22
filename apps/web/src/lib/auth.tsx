/* eslint-disable react-refresh/only-export-components -- a context module: the
   provider and its hooks are one API and belong in one file. */
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useState,
  type ReactNode,
} from 'react';

// The auth bridge.
// ---------------------------------------------------------------------------
// Privy + its wallet connectors are ~600KB of the entry bundle, and a visitor
// reading the landing page needs none of it. This module gives every consumer
// the SAME hook shapes (`usePrivy`, `useSolanaWallets`) WITHOUT statically
// importing the SDK: the app renders instantly against a stub, while the real
// SDK loads in its own lazy chunk (./privy-bridge) and swaps itself in.
//
// The stub is not a dead end: any call made before the SDK is up (login, a
// token request from a page that loaded fast) parks on a promise and replays
// against the real SDK the moment it reports ready. In practice the chunk
// arrives within ~1s of first paint, long before a human reaches the login
// button.
//
// Consumers import { usePrivy, useSolanaWallets } from '../lib/auth' — the
// call sites are byte-identical to the SDK's own API, so the rest of the app
// neither knows nor cares which side of the bridge it is talking to.

export interface AuthUser {
  email?: { address?: string | null } | null;
  google?: { email?: string | null } | null;
  createdAt?: string | number | Date;
  linkedAccounts?: Array<{ type?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

export interface SolanaWallet {
  address: string;
  /** 'privy' for the embedded wallet; the connector name for external ones. */
  walletClientType?: string;
  [k: string]: unknown;
}

export interface AuthValue {
  ready: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  login: () => void;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  linkEmail: () => void;
  linkGoogle: () => void;
  linkWallet: () => void;
}

export interface SolanaValue {
  ready: boolean;
  wallets: SolanaWallet[];
  createWallet: () => Promise<unknown>;
  exportWallet: (opts: { address: string }) => Promise<void>;
}

// Live handles + the gate stub calls park on. The gate opens only when the
// real SDK reports ready:true, so a replayed login() cannot fire into a
// half-initialised SDK.
let liveAuth: AuthValue | null = null;
let liveSolana: SolanaValue | null = null;
let openGate: () => void = () => {};
const sdkReady = new Promise<void>((resolve) => {
  openGate = resolve;
});

const AUTH_STUB: AuthValue = {
  ready: false,
  authenticated: false,
  user: null,
  login: () => {
    void sdkReady.then(() => liveAuth?.login());
  },
  logout: async () => {
    await sdkReady;
    await liveAuth?.logout();
  },
  getAccessToken: async () => {
    await sdkReady;
    return liveAuth ? liveAuth.getAccessToken() : null;
  },
  linkEmail: () => {
    void sdkReady.then(() => liveAuth?.linkEmail());
  },
  linkGoogle: () => {
    void sdkReady.then(() => liveAuth?.linkGoogle());
  },
  linkWallet: () => {
    void sdkReady.then(() => liveAuth?.linkWallet());
  },
};

const SOLANA_STUB: SolanaValue = {
  ready: false,
  wallets: [],
  createWallet: async () => {
    await sdkReady;
    return liveSolana?.createWallet();
  },
  exportWallet: async (opts) => {
    await sdkReady;
    await liveSolana?.exportWallet(opts);
  },
};

const AuthCtx = createContext<AuthValue>(AUTH_STUB);
const SolanaCtx = createContext<SolanaValue>(SOLANA_STUB);

export function usePrivy(): AuthValue {
  return useContext(AuthCtx);
}

export function useSolanaWallets(): SolanaValue {
  return useContext(SolanaCtx);
}

const PrivyBridge = lazy(() => import('./privy-bridge'));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthValue>(AUTH_STUB);
  const [solana, setSolana] = useState<SolanaValue>(SOLANA_STUB);

  return (
    <AuthCtx.Provider value={auth}>
      <SolanaCtx.Provider value={solana}>
        {children}
        {/* Mounts immediately, resolves in the background; fallback is
            nothing because the app is already fully rendered above. */}
        <Suspense fallback={null}>
          <PrivyBridge
            onAuth={(v) => {
              liveAuth = v;
              setAuth(v);
              if (v.ready) openGate();
            }}
            onSolana={(v) => {
              liveSolana = v;
              setSolana(v);
            }}
          />
        </Suspense>
      </SolanaCtx.Provider>
    </AuthCtx.Provider>
  );
}
