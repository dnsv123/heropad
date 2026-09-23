// One <picture> for every landing image: AVIF first, WebP for browsers that
// do not read it, same widths, same `sizes`. Width and height are always set
// so the box is reserved before the bytes arrive (CLS 0).

interface PicProps {
  /** Path without width and extension, e.g. "/photos/tap-nfc". */
  base: string;
  widths: number[];
  sizes: string;
  width: number;
  height: number;
  alt: string;
  /** The default src width (the middle of the set is a good choice). */
  fallback: number;
  eager?: boolean;
  className?: string;
}

export default function Pic({ base, widths, sizes, width, height, alt, fallback, eager, className }: PicProps) {
  const set = (ext: string) => widths.map((w) => `${base}-${w}.${ext} ${w}w`).join(', ');
  return (
    <picture>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <img
        src={`${base}-${fallback}.webp`}
        srcSet={set('webp')}
        sizes={sizes}
        width={width}
        height={height}
        alt={alt}
        loading={eager ? undefined : 'lazy'}
        decoding="async"
        className={className}
      />
    </picture>
  );
}

/** A single-size art image (the vertical poses): AVIF with WebP fallback. */
export function Art({ src, width, height, alt, className }: { src: string; width: number; height: number; alt: string; className?: string }) {
  const base = src.replace(/\.webp$/, '');
  return (
    <picture>
      <source type="image/avif" srcSet={`${base}.avif`} />
      <img src={`${base}.webp`} width={width} height={height} alt={alt} loading="lazy" decoding="async" className={className} />
    </picture>
  );
}
