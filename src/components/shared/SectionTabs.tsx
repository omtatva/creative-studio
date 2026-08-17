"use client";

import { cn } from "@/lib/utils/cn";

interface SectionTabsProps<T extends string> {
  items: { key: T; label: string }[];
  active: T;
  onChange: (section: T) => void;
  counts: Record<T, number>;
}

/**
 * Shared underline-tab bar with per-tab counts — used by both the
 * Projects list (All/Recent/Favorites/Pinned/Archived) and the Tasks
 * list (All/My Tasks/Assigned to Me/Created by Me/Overdue/Completed).
 * Generic over the section-key union so each module supplies its own
 * `items`/`counts` shape without re-implementing the tab bar itself.
 */
export function SectionTabs<T extends string>({ items, active, onChange, counts }: SectionTabsProps<T>) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={cn(
            "relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors",
            active === item.key ? "text-primary" : "text-foreground-muted hover:text-foreground"
          )}
        >
          {item.label}
          <span className="text-xs text-foreground-muted">{counts[item.key]}</span>
          {active === item.key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
        </button>
      ))}
    </div>
  );
}
