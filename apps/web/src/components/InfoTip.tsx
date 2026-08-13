import { useState } from 'react';

// A small ⓘ that explains what a control does, on tap. Built for the admin
// panel: one operator, on a phone as often as a laptop, so hover-only
// tooltips are useless — this opens on click and closes on the next click.
export default function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        aria-label="What does this do?"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-semibold leading-none transition ${
          open
            ? 'border-hero-cyan text-hero-cyan'
            : 'border-slate-500/50 text-slate-500 hover:border-hero-cyan hover:text-hero-cyan'
        }`}
      >
        i
      </button>
      {open && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
          className="absolute left-1/2 top-full z-40 mt-1.5 block w-60 -translate-x-1/2 rounded-lg border border-hero-blue/40 bg-hero-deep p-2.5 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-slate-300 shadow-2xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}
