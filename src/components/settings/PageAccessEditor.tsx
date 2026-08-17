"use client";

import { GripVertical, EyeOff, Eye, Lock, Unlock } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { SidebarItemConfig } from "@/types/settings.types";

const DEFAULT_LABELS: Record<string, string> = {
  dashboard: "Dashboard", projects: "Projects", tasks: "My Tasks", board: "Board", files: "Files",
  reviews: "Reviews", downloads: "Downloads", team: "Team", calendar: "Calendar", activity: "Activity",
  notifications: "Notifications", aiStudio: "AI Studio", settings: "Settings",
};

interface PageAccessEditorProps {
  items: SidebarItemConfig[];
  onChange: (items: SidebarItemConfig[]) => void;
}

/** Hide/disable/rename/reorder every sidebar item — reads/writes settings.sidebarConfig.items, which Sidebar.tsx enforces for real. */
export function PageAccessEditor({ items, onChange }: PageAccessEditorProps) {
  const sorted = [...items].sort((a, b) => a.order - b.order);

  function update(key: string, patch: Partial<SidebarItemConfig>) {
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const current = sorted[index];
    const swapWith = sorted[target];
    if (!current || !swapWith) return;
    const reordered = [...sorted];
    reordered[index] = swapWith;
    reordered[target] = current;
    onChange(reordered.map((item, i) => ({ ...item, order: i })));
  }

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((item, index) => (
        <div key={item.key} className={cn("flex items-center gap-2.5 rounded-theme border px-2.5 py-2", item.isHidden ? "border-border bg-surface-muted/50 opacity-60" : "border-border bg-surface")}>
          <GripVertical className="h-4 w-4 shrink-0 text-foreground-muted" />
          <Input
            value={item.label ?? DEFAULT_LABELS[item.key] ?? item.key}
            onChange={(e) => update(item.key, { label: e.target.value || null })}
            className="h-8 flex-1"
          />
          <button onClick={() => move(index, -1)} disabled={index === 0} className="text-xs text-foreground-muted hover:text-foreground disabled:opacity-30">Up</button>
          <button onClick={() => move(index, 1)} disabled={index === sorted.length - 1} className="text-xs text-foreground-muted hover:text-foreground disabled:opacity-30">Down</button>
          <button onClick={() => update(item.key, { isDisabled: !item.isDisabled })} className="rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted" aria-label={item.isDisabled ? "Enable page" : "Disable page"}>
            {item.isDisabled ? <Lock className="h-3.5 w-3.5 text-amber-500" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => update(item.key, { isHidden: !item.isHidden })} className="rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted" aria-label={item.isHidden ? "Show page" : "Hide page"}>
            {item.isHidden ? <EyeOff className="h-3.5 w-3.5 text-red-500" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      ))}
    </div>
  );
}
