"use client";

import { useState } from "react";
import { ChevronDown, UserX } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { TaskActor } from "@/types/task.types";
import { useDismissableMenu } from "@/hooks/useDismissableMenu";

interface TaskAssigneePickerProps {
  value: TaskActor | null;
  candidates: TaskActor[];
  onChange: (assignee: TaskActor | null) => void;
}

/** Dropdown of project members (the only valid assignee pool for a task) plus an "Unassigned" option. */
export function TaskAssigneePicker({ value, candidates, onChange }: TaskAssigneePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useDismissableMenu<HTMLDivElement>(isOpen, () => setIsOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex h-10 w-full items-center gap-2 rounded-theme border border-border bg-surface px-3 text-sm text-foreground hover:bg-surface-muted"
      >
        {value ? (
          <>
            <Avatar name={value.displayName} src={value.photoURL} size="sm" />
            <span className="truncate">{value.displayName}</span>
          </>
        ) : (
          <>
            <UserX className="h-4 w-4 text-foreground-muted" />
            <span className="text-foreground-muted">Unassigned</span>
          </>
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 text-foreground-muted" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-theme border border-border bg-surface p-1 shadow-soft-lg">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-theme px-2.5 py-2 text-left text-sm text-foreground-muted hover:bg-surface-muted"
          >
            <UserX className="h-4 w-4" />
            Unassigned
          </button>
          {candidates.map((candidate) => (
            <button
              key={candidate.uid}
              type="button"
              onClick={() => {
                onChange(candidate);
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-theme px-2.5 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
            >
              <Avatar name={candidate.displayName} src={candidate.photoURL} size="sm" />
              {candidate.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
