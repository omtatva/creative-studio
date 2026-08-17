"use client";

import { useState } from "react";
import {
  MoreHorizontal,
  Pencil,
  Copy,
  Archive,
  ArchiveRestore,
  Trash2,
  Star,
  Pin,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Project } from "@/types/project.types";
import { useDismissableMenu } from "@/hooks/useDismissableMenu";

interface ProjectQuickActionsMenuProps {
  project: Project;
  currentUid: string;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onTogglePinned: () => void;
}

/**
 * Shared quick-actions dropdown used by both ProjectCard (grid/list)
 * and the project details header. Stops click propagation so it
 * works safely nested inside a clickable card.
 */
export function ProjectQuickActionsMenu({
  project,
  currentUid,
  onEdit,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
  onToggleFavorite,
  onTogglePinned,
}: ProjectQuickActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isFavorited = project.favoritedBy.includes(currentUid);
  const isPinned = project.pinnedBy.includes(currentUid);
  const ref = useDismissableMenu<HTMLDivElement>(isOpen, () => setIsOpen(false));

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  return (
    <div ref={ref} className="relative" onClick={stop}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted"
        aria-label="Project actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-theme border border-border bg-surface p-1.5 shadow-soft-lg">
          <MenuItem icon={Star} label={isFavorited ? "Unfavorite" : "Favorite"} onClick={() => { onToggleFavorite(); setIsOpen(false); }} active={isFavorited} />
          <MenuItem icon={Pin} label={isPinned ? "Unpin" : "Pin"} onClick={() => { onTogglePinned(); setIsOpen(false); }} active={isPinned} />
          <div className="my-1 h-px bg-border" />
          <MenuItem icon={Pencil} label="Edit" onClick={() => { onEdit(); setIsOpen(false); }} />
          <MenuItem icon={Copy} label="Duplicate" onClick={() => { onDuplicate(); setIsOpen(false); }} />
          {project.isArchived ? (
            <MenuItem icon={ArchiveRestore} label="Restore" onClick={() => { onRestore(); setIsOpen(false); }} />
          ) : (
            <MenuItem icon={Archive} label="Archive" onClick={() => { onArchive(); setIsOpen(false); }} />
          )}
          <div className="my-1 h-px bg-border" />
          <MenuItem icon={Trash2} label="Delete" danger onClick={() => { onDelete(); setIsOpen(false); }} />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-theme px-2.5 py-2 text-left text-sm",
        danger ? "text-error hover:bg-error/10" : "text-foreground hover:bg-surface-muted"
      )}
    >
      <Icon className={cn("h-4 w-4", active && "fill-current")} />
      {label}
    </button>
  );
}
