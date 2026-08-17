"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { BoardColumnMenu } from "./BoardColumnMenu";
import { getStatusIcon } from "@/lib/constants/statusIconMap";
import { TaskStatusOption } from "@/types/settings.types";
import { BoardColumn } from "@/types/board.types";

interface BoardColumnHeaderProps {
  status: TaskStatusOption;
  column: BoardColumn;
  taskCount: number;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onRename: (label: string) => void;
  onChangeColor: (color: string) => void;
  onChangeIcon: (icon: string) => void;
  onToggleHidden: () => void;
  onArchive: () => void;
  onRestore: () => void;
}

/** Column identity (icon/label/color) is read from the TaskStatusOption, never stored on the column itself — see board.types.ts. */
export function BoardColumnHeader({
  status,
  column,
  taskCount,
  isCollapsed,
  onToggleCollapsed,
  onRename,
  onChangeColor,
  onChangeIcon,
  onToggleHidden,
  onArchive,
  onRestore,
}: BoardColumnHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(status.label);
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = getStatusIcon(status.icon);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== status.label) onRename(trimmed);
    setIsEditing(false);
  }

  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      <button onClick={onToggleCollapsed} className="text-foreground-muted hover:text-foreground" aria-label={isCollapsed ? "Expand column" : "Collapse column"}>
        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-theme" style={{ backgroundColor: `rgb(${status.color} / 0.15)` }}>
        <Icon className="h-3.5 w-3.5" style={{ color: `rgb(${status.color})` }} />
      </span>

      {isEditing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => e.key === "Enter" && commitRename()}
          className="h-6 min-w-0 flex-1 rounded border border-primary bg-surface px-1.5 text-sm font-medium text-foreground outline-none"
        />
      ) : (
        <button onDoubleClick={() => setIsEditing(true)} className="truncate text-sm font-medium text-foreground hover:opacity-80">
          {status.label}
        </button>
      )}

      <span className="shrink-0 text-xs text-foreground-muted">{taskCount}</span>

      <div className="ml-auto">
        <BoardColumnMenu
          isArchived={column.isArchived}
          isHidden={column.isHidden}
          onRename={() => setIsEditing(true)}
          onChangeColor={onChangeColor}
          onChangeIcon={onChangeIcon}
          onToggleHidden={onToggleHidden}
          onArchive={onArchive}
          onRestore={onRestore}
        />
      </div>
    </div>
  );
}
