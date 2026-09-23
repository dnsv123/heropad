import { useState, type ReactNode } from 'react';

import { readableOnNavy } from '../lib/color';

// Tabs for the merchant and admin panels.
// ---------------------------------------------------------------------------
// Four stacked collapsibles made the barista scroll past three closed panels
// to reach the fourth. Tabs show the whole surface at once and cost one tap.
//
// v3: a segmented control with drawn icons (emoji read as chat and render
// differently per phone). The active segment is lifted one step and its icon
// takes the venue's accent, or our amber when the venue has none. The panel
// under it is one quiet surface, not a card inside a card.

export interface FolderTab {
  key: string;
  /** A drawn icon (Glyph) or a short glyph; carries the tab at narrow widths. */
  icon: ReactNode;
  label: string;
  /** Small count/state pill on the tab, e.g. seats used. */
  badge?: string;
  render: () => ReactNode;
}

export default function FolderTabs({
  tabs,
  initial,
  active: controlled,
  onOpen,
  accent,
}: {
  tabs: FolderTab[];
  initial?: string;
  /** Drive the open folder from the parent — lets one panel send you to another. */
  active?: string;
  /** Fired when a tab becomes active — lets a panel lazy-load its data. */
  onOpen?: (key: string) => void;
  /** The venue's accent colour (#RRGGBB) for the active icon. */
  accent?: string | null;
}) {
  const [own, setOwn] = useState<string>(initial ?? tabs[0]?.key ?? '');
  const active = controlled ?? own;
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  const tint = accent ? readableOnNavy(accent) : '#F7A30C';

  function select(key: string) {
    if (key === active) return;
    setOwn(key);
    onOpen?.(key);
  }

  return (
    <div className="mt-8">
      <div
        role="tablist"
        className="flex flex-wrap gap-1 rounded-[22px] border border-white/[0.08] bg-hero-deep/70 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      >
        {tabs.map((tab) => {
          const on = tab.key === current?.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => select(tab.key)}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[18px] px-2 py-2.5 text-[11px] font-medium transition sm:flex-row sm:gap-2 sm:text-sm ${
                on
                  ? 'bg-gradient-to-b from-hero-navy2 to-hero-navy text-white shadow-[0_6px_16px_-8px_rgba(0,0,0,0.6)] ring-1 ring-white/10'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="flex items-center" style={on ? { color: tint } : undefined}>
                {tab.icon}
              </span>
              <span className="max-w-full truncate">{tab.label}</span>
              {tab.badge && (
                <span
                  className={`tnum rounded-full px-1.5 py-0.5 text-[10px] ${
                    on ? 'bg-hero-deep text-white' : 'bg-hero-deep text-slate-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        key={current?.key}
        role="tabpanel"
        className="mt-3 rounded-[28px] border border-white/[0.08] bg-gradient-to-b from-hero-navy to-hero-navy/70 p-4 shadow-[0_24px_48px_-32px_rgba(0,0,0,0.8)] sm:p-6"
      >
        {current?.render()}
      </div>
    </div>
  );
}
