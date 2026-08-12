// Offline queue for counter actions.
// ---------------------------------------------------------------------------
// A café's wifi drops mid-service. Before this, the barista tapped +1, saw an
// error, and the customer left without their stamp — the one failure that can
// actually ruin a day at a real counter.
//
// Queued actions survive a reload (localStorage) and are retried when the
// connection returns. The retry is only safe because each entry carries a
// request id the server treats as idempotent: the common case is a grant that
// SUCCEEDED and whose response was lost, and a blind retry there would give
// the customer two stamps rather than none.
//
// Deliberately grants only. A redemption must never happen without a human
// watching — the coffee is handed over in the same moment.

const KEY = 'heropad:offline-queue';
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // a stamp from yesterday is not a stamp

export interface QueuedGrant {
  id: string;
  slug: string;
  code: string;
  count: number;
  queuedAt: number;
  attempts: number;
}

type Listener = (pending: QueuedGrant[]) => void;
const listeners = new Set<Listener>();

function read(): QueuedGrant[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as QueuedGrant[];
    if (!Array.isArray(list)) return [];
    // Drop anything too old to still be worth sending.
    return list.filter((e) => Date.now() - e.queuedAt < MAX_AGE_MS);
  } catch {
    return [];
  }
}

function write(list: QueuedGrant[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked — the queue degrades to in-memory for this tab */
  }
  for (const l of listeners) l(list);
}

export function pending(): QueuedGrant[] {
  return read();
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn(read());
  return () => listeners.delete(fn);
}

/** A stable id per tap; reused on every retry so the server can dedupe. */
export function newRequestId(): string {
  const c: Crypto | undefined = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  c?.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function enqueue(entry: Omit<QueuedGrant, 'queuedAt' | 'attempts'>): void {
  const list = read();
  if (list.some((e) => e.id === entry.id)) return;
  list.push({ ...entry, queuedAt: Date.now(), attempts: 0 });
  write(list);
}

function remove(id: string): void {
  write(read().filter((e) => e.id !== id));
}

/**
 * Distinguishes "the network never carried this" from "the server said no".
 * Only the former is worth queueing: a rejected grant will be rejected again.
 */
export function isNetworkFailure(err: unknown): boolean {
  const e = err as { code?: string; status?: number } | null;
  if (!e) return false;
  return e.code === 'network_error' || e.status === 0;
}

let flushing = false;

/**
 * Sends everything queued. `send` performs one request and must reject on
 * failure; entries are removed only once the server has actually answered.
 */
export async function flush(
  send: (entry: QueuedGrant) => Promise<void>
): Promise<{ sent: number; left: number }> {
  if (flushing) return { sent: 0, left: read().length };
  flushing = true;
  let sent = 0;
  try {
    for (const entry of read()) {
      try {
        await send(entry);
        remove(entry.id);
        sent += 1;
      } catch (err) {
        if (isNetworkFailure(err)) break; // still offline; keep the rest
        // A definitive rejection (unknown code, cap reached) will not improve
        // with time. Dropping it is better than retrying it forever.
        remove(entry.id);
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, left: read().length };
}

/** Retry when the browser says the connection is back, and periodically. */
export function watch(onOnline: () => void): () => void {
  const handler = () => onOnline();
  window.addEventListener('online', handler);
  // `online` is unreliable on captive-portal wifi, which is most cafés.
  const timer = window.setInterval(() => {
    if (read().length > 0) onOnline();
  }, 20_000);
  return () => {
    window.removeEventListener('online', handler);
    window.clearInterval(timer);
  };
}
