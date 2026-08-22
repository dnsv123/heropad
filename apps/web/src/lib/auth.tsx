/* eslint-disable react-refresh/only-export-components -- a context module: the
   provider and its hooks are one API and belong in one file. */
import {
  Component,
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';

// The auth bridge.
// ---------------------------------------------------------------------------
// Privy + its wallet connectors are ~600KB of the entry bundle, and a visitor
// reading the landing page needs none of it. This module gives every consumer
// the SAME hook shapes (`usePrivy`, `useSolanaWallets`) WITHOUT statically
// importing the SDK: the app renders instantly against a stub, while the real
// SDK loads in its own lazy chunk (./auth-sdk) and swaps itself in.
//
// The stub is not a dead end: any call made before the SDK is up (login, a
// token request from a page that loaded fast) parks on a promise and replays
// against the real SDK the moment it reports ready.
//
// FAILURE HANDLING (the part that matters as much as the split): a lazy chunk
// can fail — a stale deploy 404s its hashed file, a phone drops the network,
// an adblocker eats a script. React rethrows a rejected lazy() during render,
// so without a boundary that failure would unmount the whole app to a white
// screen, taking down a landing page that had already rendered perfectly.
// Hence: an error boundary with one silent retry, a watchdog for the chunk
// that loads but never becomes ready, and a gate that ALWAYS opens so parked
// promises resolve (as "no session") instead of hanging forever. When both
// attempts fail the app keeps working read-only and says so, with a retry.

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

/** Longest we wait for the SDK before telling the user sign-in is unavailable. */
const SDK_WATCHDOG_MS = 20_000;

let liveAuth: AuthValue | null = null;
let liveSolana: SolanaValue | null = null;
let openGate: () => void = () => {};
let sdkReady = new Promise<void>((resolve) => {
  openGate = resolve;
});

/** Re-arms the gate for a retry after a failed attempt. */
function resetGate(): void {
  sdkReady = new Promise<void>((resolve) => {
    openGate = resolve;
  });
}

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
    // liveAuth is null only when the SDK never arrived: no session, no token.
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

const AuthSdk = lazy(() => import('./auth-sdk'));

/**
 * Catches a failed chunk import so a missing SDK degrades the app instead of
 * erasing it. Keyed remounts drive the retry from the parent.
 */
class BridgeBoundary extends Component<
  { children: ReactNode; onFail: (err: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[HeroPad] auth SDK failed to load:', error.message, info.componentStack);
    this.props.onFail(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthValue>(AUTH_STUB);
  const [solana, setSolana] = useState<SolanaValue>(SOLANA_STUB);
  /** Bumping this remounts the lazy boundary — that IS the retry. */
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  const handleFail = useCallback(() => {
    // Open the gate even on failure: parked promises must resolve (to "no
    // session") rather than hang forever behind a login that will never come.
    openGate();
    setFailed((already) => {
      if (!already && attempt === 0) {
        // One silent retry — most chunk failures are a transient network blip
        // or a stale deploy, and a second request usually lands.
        setTimeout(() => {
          resetGate();
          setAttempt(1);
        }, 1200);
        return false;
      }
      return true;
    });
  }, [attempt]);

  // Watchdog: the chunk can load and still never report ready (SDK boot
  // blocked by third-party storage rules, a hung network call). Without this
  // the login button would sit disabled forever with no explanation.
  useEffect(() => {
    if (auth.ready || failed) return;
    const id = window.setTimeout(() => {
      if (!liveAuth?.ready) {
        openGate();
        setFailed(true);
      }
    }, SDK_WATCHDOG_MS);
    return () => window.clearTimeout(id);
  }, [auth.ready, failed, attempt]);

  const retry = () => {
    setFailed(false);
    resetGate();
    setAttempt((a) => a + 1);
  };

  return (
    <AuthCtx.Provider value={auth}>
      <SolanaCtx.Provider value={solana}>
        {children}

        {/* Mounts immediately, resolves in the background; the app above is
            already fully rendered, so there is nothing to fall back to. */}
        <BridgeBoundary key={attempt} onFail={handleFail}>
          <Suspense fallback={null}>
            <AuthSdk
              onAuth={(v) => {
                liveAuth = v;
                setAuth(v);
                if (v.ready) {
                  setFailed(false);
                  openGate();
                }
              }}
              onSolana={(v) => {
                liveSolana = v;
                setSolana(v);
              }}
            />
          </Suspense>
        </BridgeBoundary>

        {failed && (
          <div
            role="status"
            className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-xl border border-amber-400/40 bg-hero-deep/95 px-4 py-3 text-center text-xs text-amber-200 shadow-2xl backdrop-blur"
          >
            Autentificarea nu s-a putut încărca. Poți naviga în continuare.{' '}
            <button
              type="button"
              onClick={retry}
              className="ml-1 rounded-full border border-amber-300/50 px-2.5 py-0.5 font-semibold text-amber-100 transition hover:bg-amber-300/10"
            >
              Reîncearcă
            </button>
          </div>
        )}
      </SolanaCtx.Provider>
    </AuthCtx.Provider>
  );
}
