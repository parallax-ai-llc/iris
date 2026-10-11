/**
 * Vertical ARIA tablist for the Settings page: one section visible at a time.
 *
 * Arrow keys move between tabs (automatic activation: the focused tab is the
 * selected one). This is widget-level focus movement on the focused tablist,
 * not an app shortcut, so it stays a local onKeyDown instead of a dispatcher
 * binding. The last tab used is remembered across visits and restarts.
 */

import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { nextTabIndex, readLastSettingsTab, writeLastSettingsTab } from '../settingsTabs';

export interface SettingsTabDef {
  id: string;
  label: string;
  icon?: ReactNode;
  render: () => ReactNode;
}

interface SettingsTabsProps {
  tabs: readonly SettingsTabDef[];
  /** Accessible name of the tablist. */
  label: string;
}

export function SettingsTabs({ tabs, label }: SettingsTabsProps) {
  const ids = tabs.map((t) => t.id);
  const [selected, setSelected] = useState(() => readLastSettingsTab(ids));
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const active = tabs.find((t) => t.id === selected) ?? tabs[0];
  const tabId = (id: string) => `settings-tab-${id}`;
  const panelId = (id: string) => `settings-panel-${id}`;

  const select = useCallback((id: string) => {
    setSelected(id);
    writeLastSettingsTab(id);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const current = tabs.findIndex((t) => t.id === active.id);
    const next = nextTabIndex(e.key, current, tabs.length);
    if (next === null) return;
    e.preventDefault();
    const id = tabs[next].id;
    select(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <div className="flex gap-6 items-start">
      <div
        role="tablist"
        aria-label={label}
        aria-orientation="vertical"
        className="settings-tablist flex flex-col gap-1 w-52 flex-shrink-0 sticky top-0"
      >
        {tabs.map((tab) => {
          const isSelected = tab.id === active.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={isSelected}
              aria-controls={panelId(tab.id)}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => select(tab.id)}
              onKeyDown={onKeyDown}
              className={cn(
                'settings-tab flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--iris-violet)]',
                isSelected
                  ? 'bg-[var(--surf-3)] text-[var(--text-1)] font-medium'
                  : 'text-[var(--text-2)] hover:bg-[var(--surf-2)] hover:text-[var(--text-1)]',
              )}
            >
              {tab.icon && <span className="flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4" aria-hidden>{tab.icon}</span>}
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={panelId(active.id)}
        aria-labelledby={tabId(active.id)}
        tabIndex={0}
        className="flex-1 min-w-0 focus:outline-none"
      >
        {active.render()}
      </div>
    </div>
  );
}
