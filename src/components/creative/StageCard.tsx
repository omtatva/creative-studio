"use client";

import { useState } from "react";
import { Archive, Layers, MoreVertical, Pencil } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Stage } from "@/types/stage.types";
import { useDismissableMenu } from "@/hooks/useDismissableMenu";

interface StageCardProps {
  stage: Stage;
  assetCount: number;
  pendingCount: number;
  approvedCount: number;
  isActive: boolean;
  onClick: () => void;
  onRename: (name: string) => void;
  onArchive: () => void;
}

export function StageCard({ stage, assetCount, pendingCount, approvedCount, isActive, onClick, onRename, onArchive }: StageCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(stage.name);
  const menuRef = useDismissableMenu<HTMLDivElement>(isMenuOpen, () => setIsMenuOpen(false));

  function submitRename() {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== stage.name) onRename(trimmed);
    setIsRenaming(false);
  }

  return (
    <div
      className={cn(
        "relative flex min-w-[190px] shrink-0 flex-col gap-2 rounded-theme border p-3.5 text-left transition-all hover:-translate-y-0.5",
        isActive ? "border-primary bg-primary/5 shadow-soft" : "border-border bg-surface hover:shadow-soft"
      )}
    >
      <button onClick={onClick} className="flex items-center gap-2 text-left">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-theme", isActive ? "bg-primary/15 text-primary" : "bg-surface-muted text-foreground-muted")}>
          <Layers className="h-4 w-4" />
        </div>
        {isRenaming ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") { setNameDraft(stage.name); setIsRenaming(false); }
            }}
            onBlur={submitRename}
            className="h-6 flex-1 rounded border border-primary bg-surface px-1 text-sm font-semibold text-foreground outline-none"
          />
        ) : (
          <p className="truncate text-sm font-semibold text-foreground">{stage.name}</p>
        )}
      </button>

      <button onClick={onClick} className="text-left">
        <p className="truncate text-xs text-foreground-muted">{stage.description || "No description"}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-foreground-muted">
          <span>{assetCount} asset{assetCount === 1 ? "" : "s"}</span>
          {pendingCount > 0 && <span className="text-info">{pendingCount} in review</span>}
          {approvedCount > 0 && <span className="text-success">{approvedCount} approved</span>}
        </div>
      </button>

      <div ref={menuRef} className="absolute right-1.5 top-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsMenuOpen((v) => !v);
          }}
          className="rounded-theme p-1 text-foreground-muted hover:bg-surface-muted"
          aria-label="Stage options"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
        {isMenuOpen && (
          <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-theme border border-border bg-surface py-1 shadow-soft-lg">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(false);
                setIsRenaming(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-muted"
            >
              <Pencil className="h-3.5 w-3.5" /> Rename
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(false);
                onArchive();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground-muted hover:bg-error/10 hover:text-error"
            >
              <Archive className="h-3.5 w-3.5" /> Archive
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
