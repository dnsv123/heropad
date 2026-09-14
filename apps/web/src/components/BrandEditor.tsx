import { useRef, useState } from 'react';

import InfoTip from './InfoTip';

// Admin → venue card → Brand. What "co-branding" concretely means:
//   - the café's logo, next to its name at the top of the customer's card
//   - one accent colour, used on the reward chip, the eyebrow and the card's
//     glow — never as a background, so the card stays readable whatever
//     colour a café happens to have
//
// The logo is resized HERE, in the browser, to ≤512px and encoded as WebP,
// so what reaches the server is a few dozen KB that fits in the venue's
// branding jsonb. No upload bucket, no signed URLs, nothing to clean up.

const MAX_PX = 512;
const MAX_BYTES = 120_000;

async function fileToDataUrl(file: File): Promise<string> {
  // SVG goes through untouched — it is already small and scales perfectly.
  if (file.type === 'image/svg+xml') {
    if (file.size > MAX_BYTES) throw new Error(`SVG-ul e prea mare (${Math.round(file.size / 1024)} KB, max 120).`);
    const text = await file.text();
    // A base64 data URL, same shape as the raster path.
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponibil.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  // WebP keeps transparency and is ~3× smaller than PNG; fall back to PNG
  // where WebP encoding is unsupported.
  let url = c.toDataURL('image/webp', 0.9);
  if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/png');
  if (url.length > MAX_BYTES) {
    url = c.toDataURL('image/webp', 0.7);
    if (url.length > MAX_BYTES) throw new Error('Logo-ul rămâne prea mare și după micșorare — încearcă un PNG mai simplu sau un SVG.');
  }
  return url;
}

interface Props {
  venueName: string;
  logo: string | null;
  accent: string | null;
  tagline: string | null;
  onSave: (patch: { logo?: string; accent?: string; tagline?: string }) => Promise<void> | void;
}

export default function BrandEditor({ venueName, logo, accent, tagline, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draftLogo, setDraftLogo] = useState<string | null>(logo);
  const [draftAccent, setDraftAccent] = useState<string>(accent ?? '#F5C842');
  const [draftTagline, setDraftTagline] = useState<string>(tagline ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    try {
      setDraftLogo(await fileToDataUrl(f));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        logo: draftLogo ?? '',
        accent: draftAccent.toUpperCase(),
        tagline: draftTagline.trim(),
      });
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      setDraftLogo(null);
      setDraftAccent('#F5C842');
      setDraftTagline('');
      await onSave({ logo: '', accent: '', tagline: '' });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-hero-cyan/25 bg-hero-cyan/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-hero-cyan">
          Brand
          <InfoTip text="Co-branding (Branded și mai sus): logo-ul localului apare lângă numele lui pe cardul clientului, iar culoarea lor colorează recompensa, eticheta de sus și strălucirea cardului. Fundalul rămâne navy — cardul trebuie să fie lizibil oricare ar fi culoarea cafenelei." />
        </p>
        <div className="flex items-center gap-2">
          {logo && (
            <img src={logo} alt="" className="h-6 max-w-[80px] object-contain" />
          )}
          {accent && (
            <span className="h-4 w-4 rounded-full border border-white/20" style={{ background: accent }} />
          )}
          <button
            type="button"
            onClick={() => {
              setOpen((o) => !o);
              setDraftLogo(logo);
              setDraftAccent(accent ?? '#F5C842');
              setDraftTagline(tagline ?? '');
            }}
            className="rounded-full border border-hero-cyan/40 px-3 py-1 text-xs text-hero-cyan hover:bg-hero-cyan/10"
          >
            {open ? 'Close' : logo || accent ? 'Edit brand' : '+ Add brand'}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {/* Inputs */}
          <div className="space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Logo
                <InfoTip text="Cere-le fișierul pe care îl folosesc pe Instagram sau pe meniu. Cel mai bine: SVG, sau PNG cu fundal TRANSPARENT, minim 512 px pe latura lungă. Îl micșorăm noi aici la 512 px și îl salvăm ca WebP — deci orice PNG mare e ok. Pe card apare la ~48 px înălțime, deci un logo cu text mărunt nu se va citi; preferă simbolul, nu sloganul." />
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/webp,image/jpeg,image/svg+xml"
                onChange={(e) => void pick(e.target.files?.[0])}
                className="mt-1 block w-full text-xs text-slate-400 file:mr-3 file:rounded-full file:border-0 file:bg-hero-cyan/15 file:px-3 file:py-1 file:text-xs file:text-hero-cyan"
              />
              <p className="mt-1 text-[10px] text-slate-600">
                SVG · PNG transparent · min 512 px · max 120 KB după micșorare
              </p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Culoarea principală
                <InfoTip text="UNA singură, cea din logo sau de pe firmă. Nu se folosește ca fundal — doar pe recompensă, pe eticheta de sus și pe strălucirea cardului. Dacă e foarte închisă (navy, negru) va fi puțin vizibilă pe fundalul nostru navy; în cazul ăsta alege culoarea lor secundară, mai deschisă." />
              </p>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={draftAccent}
                  onChange={(e) => setDraftAccent(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-hero-blue/30 bg-hero-deep"
                />
                <input
                  value={draftAccent}
                  onChange={(e) => setDraftAccent(e.target.value)}
                  maxLength={7}
                  className="w-28 rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 font-mono text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                />
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                O linie a lor (opțional)
                <InfoTip text={'Sloganul sau ce sunt ei într-o propoziție, sub numele localului: „Specialty coffee din 2019”, „Gogoși calde, toată ziua”. Max 60 de caractere. E cel mai ieftin lucru care face cardul să sune a ei, nu a noastră.'} />
              </p>
              <input
                value={draftTagline}
                maxLength={60}
                onChange={(e) => setDraftTagline(e.target.value)}
                placeholder="Specialty coffee din 2019"
                className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
              />
            </div>

            {err && <p className="text-xs text-red-300">{err}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !/^#[0-9a-fA-F]{6}$/.test(draftAccent)}
                onClick={() => void save()}
                className="rounded-full bg-hero-cyan px-4 py-1.5 text-xs font-semibold text-hero-deep disabled:opacity-50"
              >
                {busy ? '…' : 'Save brand'}
              </button>
              {(logo || accent) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void clear()}
                  className="rounded-full border border-hero-blue/40 px-4 py-1.5 text-xs text-slate-400"
                >
                  Remove brand
                </button>
              )}
            </div>
          </div>

          {/* Live preview — the top of the customer's card, as they will see it */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Cum va arăta la client</p>
            <div
              className="mt-1 rounded-2xl border bg-hero-deep p-4"
              style={{ borderColor: `${draftAccent}66`, boxShadow: `0 0 40px -12px ${draftAccent}80` }}
            >
              {/* Branded = one compact row: logo + name, then their line.
                  The "⚡ Power Pass" eyebrow steps aside — the brand is the
                  eyebrow now. Mirrors pages/Loyalty.tsx. */}
              <div className="flex items-center justify-center gap-3">
                {draftLogo ? (
                  <img src={draftLogo} alt="" className="h-9 max-w-[88px] object-contain" />
                ) : (
                  <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: draftAccent }}>
                    ⚡ Power Pass
                  </span>
                )}
                <p className="font-display text-xl font-bold text-white">{venueName}</p>
              </div>
              {draftTagline.trim() && (
                <p className="mt-1 text-center text-xs text-slate-400">{draftTagline.trim()}</p>
              )}
              <div
                className="mt-3 rounded-xl border px-3 py-2 text-center"
                style={{ borderColor: `${draftAccent}59`, background: `${draftAccent}1A` }}
              >
                <p className="text-[10px] uppercase tracking-wider" style={{ color: `${draftAccent}CC` }}>
                  🎁 Recompensa ta la 5 bonusuri
                </p>
                <p className="font-display text-base font-semibold" style={{ color: draftAccent }}>
                  O cafea gratis
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
