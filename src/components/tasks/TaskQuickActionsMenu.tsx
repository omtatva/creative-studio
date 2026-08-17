"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Copy, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Task } from "@/types/task.types";
import { useDismissableMenu } from "@/hooks/useDismissableMenu";

interface TaskQuickActionsMenuProps {
  task: Task;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}

export function TaskQuickActionsMenu({ task, onEdit, onDuplicate, onArchive, onRestore, onDelete }: TaskQuickActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useDismissableMenu<HTMLDivElement>(isOpen, () => setIsOpen(false));

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  return (
    <div ref={ref} className="relative" onClick={stop}>
      <button onClick={() => setIsOpen((v) => !v)} className="rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted" aria-label="Task actions">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {isOpen && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-theme border border-border bg-surface p-1.5 shadow-soft-lg">
          <MenuItem icon={Pencil} label="Edit" onClick={() => { onEdit(); setIsOpen(false); }} />
          <MenuItem icon={Copy} label="Duplicate" onClick={() => { onDuplicate(); setIsOpen(false); }} />
          {task.isArchived ? (
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

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-theme px-2.5 py-2 text-left text-sm",
        danger ? "text-error hover:bg-error/10" : "text-foreground hover:bg-surface-muted"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
