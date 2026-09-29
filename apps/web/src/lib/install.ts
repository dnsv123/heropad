// Put HeroPad on the home screen (PWA).
// ---------------------------------------------------------------------------
// Chromium (Android Chrome, desktop Chrome/Edge) fires `beforeinstallprompt`
// once, early, and only lets us show the install dialog from a click later.
// This module is imported by main.tsx so the listener is in place before the
// event can fire; components ask it whether a prompt is available.
//
// Safari on iPhone has no such event and no way to install from a button:
// there we show the two steps (Share, then Add to Home Screen) instead.
//
// An installed HeroPad opens at /?source=pwa (manifest start_url) and is sent
// on to where its person uses it: the counter for staff, the card for a
// customer. The landing page is for owners, not for someone opening their app.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

if (typeof window !== 'undefined') {
  // index.html catches the event if it fires before this module has loaded.
  const early = (window as Window & { __hpInstall?: InstallPromptEvent }).__hpInstall;
  if (early) deferred = early;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
}

export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function canPrompt(): boolean {
  return deferred !== null;
}

/** Shows the browser's install dialog. True when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const d = deferred;
  if (!d) return false;
  deferred = null;
  await d.prompt();
  const choice = await d.userChoice;
  notify();
  return choice.outcome === 'accepted';
}

export function onInstallChange(f: () => void): () => void {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

/** Remembered so the installed app opens where this person uses it. For the
 *  counter, `path` keeps its ?venue= so a barista lands at their own till. */
export function rememberApp(kind: 'card' | 'counter', path?: string): void {
  try {
    localStorage.setItem('hp.lastApp', kind);
    if (kind === 'counter' && path && path.startsWith('/business')) localStorage.setItem('hp.lastCounter', path);
  } catch {
    /* private mode: the app opens on the profile instead */
  }
}

/** Where an installed HeroPad should open. */
export function pwaStartPath(): string {
  try {
    const kind = localStorage.getItem('hp.lastApp');
    const venue = localStorage.getItem('hp.lastVenue');
    if (kind === 'counter') return localStorage.getItem('hp.lastCounter') || '/business';
    if (venue) return `/loyalty/${encodeURIComponent(venue)}`;
  } catch {
    /* fall through */
  }
  return '/profile';
}
