"use client";

import { Modal } from "@/components/ui/Modal";
import { getStatusIcon } from "@/lib/constants/statusIconMap";
import { Task } from "@/types/task.types";
import { TaskStatusOption } from "@/types/settings.types";

interface MoveTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  statuses: TaskStatusOption[];
  onMove: (status: TaskStatusOption) => void;
}

/** Right-click "Move task" — a quick column picker, reusing the same taskService.changeTaskStatus path as a drag move. */
export function MoveTaskModal({ isOpen, onClose, task, statuses, onMove }: MoveTaskModalProps) {
  if (!task) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Move "${task.title}"`}>
      <div className="flex flex-col gap-1">
        {statuses.map((status) => {
          const Icon = getStatusIcon(status.icon);
          const isCurrent = status.id === task.statusId;
          return (
            <button
              key={status.id}
              disabled={isCurrent}
              onClick={() => { onMove(status); onClose(); }}
              className="flex items-center gap-2.5 rounded-theme px-2.5 py-2 text-left text-sm text-foreground hover:bg-surface-muted disabled:opacity-40"
            >
              <Icon className="h-4 w-4" style={{ color: `rgb(${status.color})` }} />
              {status.label}
              {isCurrent && <span className="ml-auto text-xs text-foreground-muted">Current</span>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
