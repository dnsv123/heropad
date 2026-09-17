import { useState, type ReactNode } from 'react';

// Tabs for the merchant and admin panels.
// ---------------------------------------------------------------------------
// Four stacked collapsibles made the barista scroll past three closed panels
// to reach the fourth. Tabs show the whole surface at once and cost one tap.
//
// v2: a segmented control — one pill strip, the active segment one step up —
// instead of the paper-folder look. The folder tabs were charming and read
// as a website; a segmented control reads as iOS Settings. Wraps to a second
// row when there are more tabs than width (Admin has nine).

export interface FolderTab {
  key: string;
  /** Emoji or short glyph — carries the tab at narrow widths. */
  icon: string;
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
}: {
  tabs: FolderTab[];
  initial?: string;
  /** Drive the open folder from the parent — lets one panel send you to another. */
  active?: string;
  /** Fired when a tab becomes active — lets a panel lazy-load its data. */
  onOpen?: (key: string) => void;
}) {
  const [own, setOwn] = useState<string>(initial ?? tabs[0]?.key ?? '');
  const active = controlled ?? own;
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  function select(key: string) {
    if (key === active) return;
    setOwn(key);
    onOpen?.(key);
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-1 rounded-[22px] border border-white/[0.08] bg-hero-navy p-1">
        {tabs.map((tab) => {
          const on = tab.key === current?.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => select(tab.key)}
              aria-current={on ? 'page' : undefined}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition sm:text-sm ${
                on ? 'bg-hero-navy2 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
              {tab.badge && (
                <span
                  className={`tnum ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                    on ? 'bg-hero-deep text-hero-cyan' : 'bg-hero-deep text-slate-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div key={current?.key} className="card mt-3 p-4 sm:p-5">
        {current?.render()}
      </div>
    </div>
  );
}
