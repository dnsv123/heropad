// nfcService — read a HeroPad URL/text from an NFC tag, abstracted.
// ---------------------------------------------------------------------------
// Web NFC (NDEFReader) works on Chrome/Android only. Everywhere else this
// service reports `isSupported() === false` and the caller shows the QR /
// camera fallback. When we move to Capacitor we swap the body of `startScan`
// for a native NFC plugin — callers (the loyalty page) don't change.
//
// Contract is deliberately tiny: start scanning, get URL strings via a
// callback, stop scanning. No loyalty logic lives here.

import { supportsWebNFC } from './platformService';

export interface NfcScanHandlers {
  /** Called with the decoded URL (or text) from a tapped tag. */
  onRead: (payload: string) => void;
  /** Called on permission denial / read error. */
  onError?: (err: Error) => void;
}

export interface NfcScanController {
  /** Stop scanning and release the reader. */
  stop: () => void;
}

/** True if this runtime can read NFC tags right now (Web NFC present). */
export function isSupported(): boolean {
  return supportsWebNFC();
}

// Minimal shape of the Web NFC API we use (avoids depending on lib.dom NFC defs).
interface NDEFRecordLike {
  recordType: string;
  data?: BufferSource;
}
interface NDEFMessageLike {
  records: NDEFRecordLike[];
}
interface NDEFReadingEventLike {
  message: NDEFMessageLike;
}
interface NDEFReaderLike {
  scan: (opts?: { signal?: AbortSignal }) => Promise<void>;
  addEventListener: (type: 'reading' | 'readingerror', cb: (ev: NDEFReadingEventLike) => void) => void;
}

function decodeFirstUrl(message: NDEFMessageLike): string | null {
  for (const record of message.records) {
    if (record.recordType === 'url' || record.recordType === 'text') {
      try {
        const text = new TextDecoder().decode(record.data);
        if (text) return text;
      } catch {
        /* skip undecodable record */
      }
    }
  }
  return null;
}

/**
 * Begin scanning for NFC tags. Returns a controller to stop, or null if NFC is
 * unsupported (caller should fall back to QR). The caller owns the lifecycle —
 * call `.stop()` on unmount.
 */
export function startScan(handlers: NfcScanHandlers): NfcScanController | null {
  if (!isSupported()) return null;

  const abort = new AbortController();
  try {
    const Reader = (window as unknown as { NDEFReader: new () => NDEFReaderLike }).NDEFReader;
    const reader = new Reader();
    reader.addEventListener('reading', (ev) => {
      const url = decodeFirstUrl(ev.message);
      if (url) handlers.onRead(url);
    });
    reader.addEventListener('readingerror', () => {
      handlers.onError?.(new Error('Could not read the NFC tag. Try again.'));
    });
    void reader.scan({ signal: abort.signal }).catch((err: unknown) => {
      handlers.onError?.(err instanceof Error ? err : new Error('NFC scan failed'));
    });
  } catch (err) {
    handlers.onError?.(err instanceof Error ? err : new Error('NFC unavailable'));
    return null;
  }

  return { stop: () => abort.abort() };
}
