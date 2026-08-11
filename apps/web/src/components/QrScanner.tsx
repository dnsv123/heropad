import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

// Camera QR scanner for the counter.
// ---------------------------------------------------------------------------
// Uses the native BarcodeDetector when the browser has it (fast, hardware
// accelerated), and falls back to jsQR over a canvas everywhere else — that
// fallback is what makes this work on iOS Safari, which has no BarcodeDetector.
//
// Emits the RAW decoded text; the caller decides what prefixes mean
// (HPC: customer code, HPR: reward code). Camera frames never leave the
// device: no upload, no third-party service.

interface QrScannerProps {
  onResult: (text: string) => void;
  onClose: () => void;
  title: string;
  hint: string;
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
}

// The jsQR fallback is the ONLY path on iOS Safari (no BarcodeDetector there).
// Scanning full sensor frames every animation frame allocates ~8 MB per frame
// and pins a core — that is what makes the phone hot. A 640px working copy
// decodes a QR held at counter distance just as well, and capping the rate at
// ~10fps leaves the device responsive.
const SCAN_EDGE = 640;
const SCAN_INTERVAL_MS = 100;

export default function QrScanner({ onResult, onClose, title, hint }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const doneRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Hold the callback in a ref so the camera effect does NOT depend on it:
  // callers usually pass an inline function, which changes identity on every
  // parent render and would otherwise stop and restart the capture session
  // mid-scan (black flash, possible second permission prompt on iOS).
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();

        const Detector = (
          window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike }
        ).BarcodeDetector;
        const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;

        let lastScan = 0;
        const tick = async () => {
          if (cancelled || doneRef.current) return;
          const v = videoRef.current;
          const canvas = canvasRef.current;
          const now = performance.now();
          if (v && canvas && v.readyState === v.HAVE_ENOUGH_DATA && now - lastScan >= SCAN_INTERVAL_MS) {
            lastScan = now;
            let text: string | null = null;
            if (detector) {
              try {
                const found = await detector.detect(v);
                text = found[0]?.rawValue ?? null;
              } catch {
                /* fall through to jsQR */
              }
            }
            if (!text) {
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx && v.videoWidth > 0) {
                const scale = Math.min(1, SCAN_EDGE / Math.max(v.videoWidth, v.videoHeight));
                const w = Math.round(v.videoWidth * scale);
                const h = Math.round(v.videoHeight * scale);
                // Only reassign when it actually changes — assigning canvas
                // dimensions reallocates the backing store every time.
                if (canvas.width !== w || canvas.height !== h) {
                  canvas.width = w;
                  canvas.height = h;
                }
                ctx.drawImage(v, 0, 0, w, h);
                const img = ctx.getImageData(0, 0, w, h);
                text = jsQR(img.data, img.width, img.height)?.data ?? null;
              }
            }
            if (text) {
              doneRef.current = true;
              onResultRef.current(text);
              return;
            }
          }
          rafRef.current = window.requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch (err) {
        const name = (err as { name?: string }).name;
        setError(
          name === 'NotAllowedError'
            ? 'Camera access was denied. Allow it in your browser settings, or type the code instead.'
            : 'Could not open the camera on this device. Type the code instead.'
        );
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-hero-blue/30 bg-hero-deep p-4 shadow-2xl">
        <h3 className="text-center font-display text-base font-semibold text-hero-cyan">{title}</h3>

        <div className="relative mt-3 aspect-square w-full overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          {/* Aiming frame */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-8 rounded-xl border-2 border-hero-gold/80"
          />
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-center text-xs text-red-200">
            {error}
          </p>
        ) : (
          <p className="mt-3 text-center text-xs text-slate-400">{hint}</p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full border border-hero-blue/40 px-4 py-2 text-sm text-slate-300 transition hover:border-hero-cyan hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
