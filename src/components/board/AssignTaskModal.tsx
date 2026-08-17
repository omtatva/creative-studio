"use client";

import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { Task, TaskActor } from "@/types/task.types";

interface AssignTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  candidates: TaskActor[];
  onAssign: (assignee: TaskActor | null) => void;
}

/** Right-click "Assign member" — reuses taskService.assignTask via useTaskActions, same as the task detail header. */
export function AssignTaskModal({ isOpen, onClose, task, candidates, onAssign }: AssignTaskModalProps) {
  if (!task) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Assign "${task.title}"`}>
      <div className="flex flex-col gap-1">
        <button
          onClick={() => { onAssign(null); onClose(); }}
          className="rounded-theme px-2.5 py-2 text-left text-sm text-foreground-muted hover:bg-surface-muted"
        >
          Unassigned
        </button>
        {candidates.map((candidate) => (
          <button
            key={candidate.uid}
            onClick={() => { onAssign(candidate); onClose(); }}
            className="flex items-center gap-2.5 rounded-theme px-2.5 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
          >
            <Avatar name={candidate.displayName} src={candidate.photoURL} size="sm" />
            {candidate.displayName}
          </button>
        ))}
      </div>
    </Modal>
  );
}
