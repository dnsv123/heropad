// platformService — single source of truth for "where am I running?".
// ---------------------------------------------------------------------------
// Today everything is the web/PWA. When we wrap the app with Capacitor (Q3/Q4),
// `@capacitor/core` injects a global `Capacitor` object; this service detects it
// so the rest of the app can branch on platform WITHOUT importing Capacitor
// everywhere. Keep all platform checks behind these functions — never sniff the
// user agent or `window.Capacitor` directly in components.

export type Platform = 'web' | 'ios' | 'android';

interface CapacitorGlobal {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
}

function capacitor(): CapacitorGlobal | null {
  const g = globalThis as unknown as { Capacitor?: CapacitorGlobal };
  return g.Capacitor ?? null;
}

/** 'web' today; 'ios' | 'android' once wrapped in Capacitor. */
export function getPlatform(): Platform {
  const cap = capacitor();
  const p = cap?.getPlatform?.();
  if (p === 'ios' || p === 'android') return p;
  return 'web';
}

/** True only inside a native Capacitor shell. */
export function isNativePlatform(): boolean {
  return capacitor()?.isNativePlatform?.() ?? false;
}

/** Web NFC is available (Chrome on Android). iOS Safari has no Web NFC — there
 *  we fall back to QR on web, and to the native NFC plugin once in Capacitor. */
export function supportsWebNFC(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
}

/** Light haptic tap. Uses the Vibration API on web; a Capacitor Haptics plugin
 *  can replace the body later without changing callers. No-op if unsupported. */
export function hapticTap(durationMs = 12): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(durationMs);
    }
  } catch {
    /* vibration blocked / unsupported — silent */
  }
}
