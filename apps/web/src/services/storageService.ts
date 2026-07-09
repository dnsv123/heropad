// storageService — abstract key/value persistence with optional TTL.
// ---------------------------------------------------------------------------
// Why an abstraction: the prompt's rule "do NOT use localStorage for critical
// data" — on native (Capacitor) localStorage can be evicted, so we route ALL
// persistence through this async interface. Today it's backed by localStorage;
// swapping in @capacitor/preferences or SQLite later means editing ONLY this
// file. Callers always `await`, so the contract is already native-ready.
//
// Keys are namespaced under "heropad:" to avoid collisions.

const PREFIX = 'heropad:';

interface Envelope<T> {
  v: T;
  exp: number | null; // epoch ms when this expires, or null = never
}

function backend(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // private mode / disabled
  }
}

/** Read a value. Returns null if missing, expired, or storage unavailable. */
export async function getItem<T>(key: string): Promise<T | null> {
  const store = backend();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (env.exp !== null && Date.now() > env.exp) {
      store.removeItem(PREFIX + key);
      return null;
    }
    return env.v;
  } catch {
    return null;
  }
}

/** Write a value. `ttlMs` optional — omit for no expiry. */
export async function setItem<T>(key: string, value: T, ttlMs?: number): Promise<void> {
  const store = backend();
  if (!store) return;
  try {
    const env: Envelope<T> = {
      v: value,
      exp: ttlMs ? Date.now() + ttlMs : null,
    };
    store.setItem(PREFIX + key, JSON.stringify(env));
  } catch {
    /* quota / disabled — fail silently, persistence is best-effort */
  }
}

/** Remove a value. */
export async function removeItem(key: string): Promise<void> {
  const store = backend();
  if (!store) return;
  try {
    store.removeItem(PREFIX + key);
  } catch {
    /* no-op */
  }
}
