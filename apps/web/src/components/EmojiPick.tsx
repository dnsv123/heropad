import { useState } from 'react';

// A tap-to-pick emoji palette for the venue's passport-album icon. A free-text
// field asked the operator to summon emoji from memory and a keyboard; a grid
// asks them to point at one. Curated for what a HeroPad venue actually is:
// drinks, food, sweets, and a row of wildcard vibes.

const PALETTE: string[] = [
  // drinks
  '☕', '🍵', '🧋', '🥤', '🧃', '🍺', '🍻', '🍷', '🍸', '🍹', '🥂', '🥛', '🍶', '🧉',
  // bakery + breakfast
  '🥐', '🥯', '🥖', '🍞', '🧀', '🥨', '🥞', '🧇', '🍳', '🥓',
  // meals
  '🥪', '🌭', '🍔', '🍟', '🍕', '🌮', '🌯', '🥙', '🧆', '🥗', '🍝', '🍜', '🍲', '🍛',
  '🍣', '🍱', '🥟', '🍤', '🍗', '🥩',
  // sweets
  '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '🍨', '🍦', '🍧', '🥮',
  // fruit
  '🍎', '🍓', '🍒', '🍇', '🍉', '🍌', '🥭', '🍑', '🍍', '🥥', '🫐', '🍋',
  // places + vibes
  '🏪', '🏛️', '🎪', '🎨', '🎮', '🎳', '🎯', '🎸', '🎬', '📚', '🌺', '🌵', '🐾', '⚽',
  '🛍️', '💈', '🧸', '🎁', '✨', '⭐', '🔥', '💎', '🌊', '🍀',
];

export default function EmojiPick({
  value,
  onPick,
}: {
  value: string | null;
  /** '' clears back to the default ☕. */
  onPick: (icon: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`mt-1 block h-9 w-14 rounded-lg border bg-hero-deep text-center text-xl leading-9 transition ${
          open ? 'border-hero-cyan' : 'border-hero-blue/25 hover:border-hero-cyan/60'
        }`}
      >
        {value || '☕'}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-72 rounded-xl border border-hero-blue/40 bg-hero-deep p-2.5 shadow-2xl">
          <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto">
            {PALETTE.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onPick(e);
                  setOpen(false);
                }}
                className={`rounded-lg p-1 text-xl leading-none transition hover:bg-hero-blue/25 ${
                  value === e ? 'bg-hero-blue/30 ring-1 ring-hero-cyan' : ''
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onPick('');
              setOpen(false);
            }}
            className="mt-2 w-full rounded-lg border border-slate-600/50 py-1 text-[11px] text-slate-400 transition hover:border-red-400/50 hover:text-red-300"
          >
            ✕ Clear (default ☕)
          </button>
        </div>
      )}
    </span>
  );
}
