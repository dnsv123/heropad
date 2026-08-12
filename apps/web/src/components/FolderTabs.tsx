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
  onOpen,
}: {
  tabs: FolderTab[];
  initial?: string;
  /** Fired when a tab becomes active — lets a panel lazy-load its data. */
  onOpen?: (key: string) => void;
}) {
  const [active, setActive] = useState<string>(initial ?? tabs[0]?.key ?? '');
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  function select(key: string) {
    if (key === active) return;
    setActive(key);
    onOpen?.(key);
  }

  return (
    <div className="mt-6">
      {/* Tab strip. Scrolls sideways rather than wrapping: a folder with its
          tabs on two rows stops looking like a folder. */}
      <div className="-mb-px flex gap-1 overflow-x-auto pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                  ? 'z-10 border-hero-blue/30 bg-hero-deep/80 text-white'
                  : 'border-transparent bg-hero-deep/30 text-slate-500 hover:bg-hero-deep/50 hover:text-slate-300'
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
                  className="absolute inset-x-0 -bottom-px h-px bg-hero-deep/80"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-b-2xl rounded-tr-2xl border border-hero-blue/30 bg-hero-deep/80 p-4 sm:p-5">
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
