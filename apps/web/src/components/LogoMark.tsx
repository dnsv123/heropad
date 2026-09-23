import { useEffect, useState } from 'react';

// A venue's logo, placed so it reads on our navy.
// ---------------------------------------------------------------------------
// Venues upload whatever they have: a white logo made for dark signage
// (Bătrânu' Sas: white with a red slash), a black one made for paper, a
// colourful one. Put a white logo on a white chip and it vanishes; put a
// black one straight on navy and it vanishes too. So we look at the pixels
// once: a mostly light logo sits directly on the dark surface, anything
// darker gets a white chip. The logo is a data: URL from our own API, so the
// canvas can read it.

export type Tone = 'light' | 'dark' | 'boxed' | 'unknown';
const cache = new Map<string, Tone>();

function measure(src: string): Promise<Tone> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 48;
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve('dark');
        ctx.drawImage(img, 0, 0, size, size);
        const d = ctx.getImageData(0, 0, size, size).data;
        let sum = 0;
        let n = 0;
        let opaque = 0;
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3] / 255;
          if (a < 0.15) continue;
          opaque += 1;
          // perceived luminance of the visible pixel
          sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
          n += 1;
        }
        // A logo on an opaque rectangle (JPG, or PNG with a background) has
        // its own ground already: show it as a small rounded tile, no chip.
        if (opaque > size * size * 0.92) return resolve('boxed');
        resolve(n === 0 ? 'dark' : sum / n > 0.62 ? 'light' : 'dark');
      } catch {
        // tainted canvas (a logo from another origin): the old white chip
        resolve('dark');
      }
    };
    img.onerror = () => resolve('dark');
    img.src = src;
  });
}

function useLogoTone(src: string | null | undefined): Tone {
  const [tone, setTone] = useState<Tone>(() => (src ? cache.get(src) ?? 'unknown' : 'unknown'));
  useEffect(() => {
    if (!src) return;
    const hit = cache.get(src);
    if (hit) {
      setTone(hit);
      return;
    }
    let alive = true;
    void measure(src).then((t) => {
      cache.set(src, t);
      if (alive) setTone(t);
    });
    return () => {
      alive = false;
    };
  }, [src]);
  return tone;
}

/**
 * The logo at a given height. Light logos stand directly on the navy; dark or
 * boxed ones get a white chip. While unknown, nothing is drawn behind it.
 */
export default function LogoMark({
  src,
  height = 36,
  maxWidth = 120,
  className = '',
}: {
  src: string;
  height?: number;
  maxWidth?: number;
  className?: string;
}) {
  const tone = useLogoTone(src);
  const chip = tone === 'dark';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center transition-opacity duration-200 ${
        chip ? 'rounded-xl bg-white px-2 py-1 shadow-sm' : ''
      } ${tone === 'unknown' ? 'opacity-0' : 'opacity-100'} ${className}`}
      style={{ maxWidth: maxWidth + (chip ? 16 : 0), minHeight: height }}
    >
      <img
        src={src}
        alt=""
        style={{ height, maxWidth }}
        className={`w-auto object-contain ${tone === 'boxed' ? 'rounded-lg' : ''} ${
          tone === 'light' ? 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]' : ''
        }`}
        width={maxWidth}
        height={height}
      />
    </span>
  );
}
