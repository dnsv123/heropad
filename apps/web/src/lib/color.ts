// A venue's accent, made readable as text or an icon on our navy.
// ---------------------------------------------------------------------------
// Owners pick their brand colour for their signage, not for our screens: a
// deep red or a dark green on navy is a line nobody can read. For text and
// small icons we lift the colour toward white, keeping its hue, until it
// clears a contrast of about 4.5:1 against the card navy. Large fills (the
// light in a corner, the top edge) keep the owner's exact colour.

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lum([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

const NAVY_LUM = lum(hexToRgb('#0F2450'));

/** The accent, lifted just enough to read on the navy surfaces. */
export function readableOnNavy(hex: string): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return hex;
  const base = hexToRgb(hex);
  for (let t = 0; t <= 1.001; t += 0.05) {
    const mixed = base.map((c) => Math.round(c + (255 - c) * t)) as [number, number, number];
    if ((lum(mixed) + 0.05) / (NAVY_LUM + 0.05) >= 4.5) {
      return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    }
  }
  return '#FFFFFF';
}
