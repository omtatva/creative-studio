"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Palette, Smile, EyeOff, Archive, ArchiveRestore } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { COLOR_PALETTE } from "@/lib/constants/colorPalette";
import { STATUS_ICON_KEYS, getStatusIcon } from "@/lib/constants/statusIconMap";
import { useDismissableMenu } from "@/hooks/useDismissableMenu";

interface BoardColumnMenuProps {
  isArchived: boolean;
  isHidden: boolean;
  onRename: () => void;
  onChangeColor: (color: string) => void;
  onChangeIcon: (icon: string) => void;
  onToggleHidden: () => void;
  onArchive: () => void;
  onRestore: () => void;
}

/** Column header's "..." menu — rename, color, icon, hide, archive/restore, per spec's column-management requirements. */
export function BoardColumnMenu({ isArchived, isHidden, onRename, onChangeColor, onChangeIcon, onToggleHidden, onArchive, onRestore }: BoardColumnMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [subPanel, setSubPanel] = useState<"color" | "icon" | null>(null);
  const ref = useDismissableMenu<HTMLDivElement>(isOpen, () => {
    setIsOpen(false);
    setSubPanel(null);
  });

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setIsOpen((v) => !v)} className="rounded-theme p-1 text-foreground-muted hover:bg-surface-muted" aria-label="Column options">
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-theme border border-border bg-surface p-1.5 shadow-soft-lg">
          {subPanel === "color" ? (
            <div className="grid grid-cols-5 gap-1.5 p-1.5">
              {COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  onClick={() => { onChangeColor(color); setSubPanel(null); setIsOpen(false); }}
                  className="h-6 w-6 rounded-full"
                  style={{ backgroundColor: `rgb(${color})` }}
                  aria-label={color}
                />
              ))}
            </div>
          ) : subPanel === "icon" ? (
            <div className="grid grid-cols-4 gap-1 p-1.5">
              {STATUS_ICON_KEYS.map((key) => {
                const Icon = getStatusIcon(key);
                return (
                  <button
                    key={key}
                    onClick={() => { onChangeIcon(key); setSubPanel(null); setIsOpen(false); }}
                    className="flex h-8 w-8 items-center justify-center rounded-theme text-foreground-muted hover:bg-surface-muted"
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <MenuItem icon={Pencil} label="Rename" onClick={() => { onRename(); setIsOpen(false); }} />
              <MenuItem icon={Palette} label="Change color" onClick={() => setSubPanel("color")} />
              <MenuItem icon={Smile} label="Change icon" onClick={() => setSubPanel("icon")} />
              <MenuItem icon={EyeOff} label={isHidden ? "Show column" : "Hide column"} onClick={() => { onToggleHidden(); setIsOpen(false); }} />
              <div className="my-1 h-px bg-border" />
              {isArchived ? (
                <MenuItem icon={ArchiveRestore} label="Restore column" onClick={() => { onRestore(); setIsOpen(false); }} />
              ) : (
                <MenuItem icon={Archive} label="Archive column" onClick={() => { onArchive(); setIsOpen(false); }} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-2.5 rounded-theme px-2.5 py-2 text-left text-sm text-foreground hover:bg-surface-muted")}>
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
