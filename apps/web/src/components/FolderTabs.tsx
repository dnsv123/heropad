import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Folder tabs for the merchant panel.
// ---------------------------------------------------------------------------
// Four stacked collapsibles made the barista scroll past three closed panels to
// reach the fourth, and hid how much the panel can actually do. Tabs show the
// whole surface at once and cost one tap to move between.
//
// The physical folder look is doing work rather than decorating: the active tab
// joins its body with no border between them, so it reads as one open folder in
// front of the others. That is the affordance people already know from paper.

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
      {/* Tab strip. WRAPS onto a second row when there are more tabs than
          width. It used to scroll sideways with the scrollbar hidden, which
          on a desktop with a mouse meant the ninth tab simply did not exist
          — there was nothing to drag. A folder with two rows of tabs looks a
          little less like a folder; a tab you cannot reach looks like a bug. */}
      <div className="-mb-px flex flex-wrap gap-x-1 gap-y-1 pb-0">
        {tabs.map((tab) => {
          const on = tab.key === current?.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => select(tab.key)}
              aria-current={on ? 'page' : undefined}
              className={`relative shrink-0 rounded-t-xl border border-b-0 px-3 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
                on
                  ? 'z-10 border-white/15 bg-hero-deep text-white'
                  : 'border-transparent bg-hero-navy text-slate-500 hover:bg-hero-navy hover:text-slate-300'
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
              {tab.badge && (
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${
                    on ? 'bg-hero-cyan/20 text-hero-cyan' : 'bg-slate-700/50 text-slate-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
              {/* Bridges the active tab into the body below. */}
              {on && (
                <motion.span
                  layoutId="folder-tab-bridge"
                  className="absolute inset-x-0 -bottom-px h-px bg-hero-deep"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-b-2xl rounded-tr-2xl border border-white/15 bg-hero-deep p-4 sm:p-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={current?.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {current?.render()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
