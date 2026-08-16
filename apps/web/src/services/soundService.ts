// Counter feedback sounds.
// ---------------------------------------------------------------------------
// A barista with a queue does not look at the screen while granting; they tap
// and move on. Haptics already confirm the tap, but a phone lying flat on a
// counter transmits nothing to a hand holding a portafilter. A short tone is
// the confirmation that survives a busy bar.
//
// Synthesised rather than loaded from a file, deliberately: no asset to
// download on a café's poor connection, no decode delay before the first
// play, and nothing to go missing from a cache. The whole module is ~1 KB.
//
// Three sounds, distinguishable without attention:
//   grant   — a bright two-note rise; something was added
//   reward  — a three-note fanfare; the card completed, hand over the coffee
//   error   — one short low tone; look at the screen
//
// Muting is remembered, because a café that finds it annoying will otherwise
// simply turn the phone's volume off and lose the haptics with it.

const MUTE_KEY = 'heropad:sound-muted';

let ctx: AudioContext | null = null;
let resumeHooked = false;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (ctx && ctx.state === 'closed') ctx = null;
    ctx ??= new Ctor();
    // iOS suspends the context until a user gesture; every call here follows
    // a tap, so resuming inline is safe and is what makes the first tone play.
    // Checked against 'running' rather than equal to 'suspended': iPadOS parks
    // a context in a non-standard 'interrupted' state when the screen locks
    // between customers, and a counter iPad does that all day — that context
    // never matched the old check, so the iPad simply went silent (Dumitru).
    if (ctx.state !== 'running') void ctx.resume();
    if (!resumeHooked) {
      resumeHooked = true;
      // Coming back to the tab is the other moment iPadOS leaves the context
      // parked; a listener costs nothing and self-heals without a tap.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') {
          void ctx.resume();
        }
      });
    }
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Wakes the audio context from inside a real tap.
 *
 * iOS refuses to start audio except in direct response to a user gesture, and
 * "direct" means synchronously — the moment a handler awaits a network call,
 * the gesture is spent. Our tones play after the grant returns, so on iPhone
 * nothing was ever heard. Call this synchronously in the click handler; by the
 * time the reply arrives the context is already running.
 */
export function primeAudio(): void {
  if (isMuted()) return;
  const ac = audioContext();
  if (!ac) return;
  // Some iOS builds only truly start after a buffer has been scheduled, so
  // play an inaudible blip alongside the resume.
  try {
    const src = ac.createBufferSource();
    src.buffer = ac.createBuffer(1, 1, 22050);
    src.connect(ac.destination);
    src.start(0);
  } catch {
    /* resume alone is enough on every other browser */
  }
}

export function isMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* private mode — sound simply stays on for the session */
  }
}

/** One note. `at` is an offset in seconds from now, so chords can be sequenced. */
function note(freq: number, at: number, duration: number, peak: number): void {
  const ac = audioContext();
  if (!ac) return;
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  // Triangle, not sine: carries over café noise without sounding like an alarm.
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, t0);
  // A quick attack and an exponential tail — a square envelope clicks.
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** A stamp landed. Short, bright, unmistakably "added". */
export function playGrant(): void {
  if (isMuted()) return;
  note(880, 0, 0.09, 0.16); // A5
  note(1318.5, 0.07, 0.13, 0.14); // E6
}

/** The card completed — this one is allowed to be heard across the room. */
export function playReward(): void {
  if (isMuted()) return;
  note(659.3, 0, 0.1, 0.16); // E5
  note(880, 0.09, 0.1, 0.17); // A5
  note(1318.5, 0.18, 0.28, 0.18); // E6
}

/** Something needs looking at. Low and short, never harsh. */
export function playError(): void {
  if (isMuted()) return;
  note(196, 0, 0.16, 0.13); // G3
}
