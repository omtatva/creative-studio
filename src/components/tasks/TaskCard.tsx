"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Calendar, CheckSquare, ListTree } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { TaskStatusBadge } from "./TaskStatusBadge";
import { TaskPriorityBadge } from "./TaskPriorityBadge";
import { TaskLabelChip } from "./TaskLabelChip";
import { TaskQuickActionsMenu } from "./TaskQuickActionsMenu";
import { Task } from "@/types/task.types";
import { TaskStatusOption, TaskPriorityOption, TaskLabelOption } from "@/types/settings.types";
import { taskRoute } from "@/lib/constants/routes";
import { formatDueDate } from "@/lib/utils/date";

interface TaskCardProps {
  task: Task;
  status: TaskStatusOption | undefined;
  priority: TaskPriorityOption | undefined;
  labels: (TaskLabelOption | undefined)[];
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}

/** List-view row-card for the task list page (List View mode). */
export function TaskCard({ task, status, priority, labels, onEdit, onDuplicate, onArchive, onRestore, onDelete }: TaskCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
      <Link href={taskRoute(task.id)}>
        <Card className="transition-colors hover:bg-surface-muted">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                {task.subtaskCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-foreground-muted">
                    <ListTree className="h-3 w-3" />
                    {task.completedSubtaskCount}/{task.subtaskCount}
                  </span>
                )}
                {task.checklist.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-foreground-muted">
                    <CheckSquare className="h-3 w-3" />
                    {task.checklist.filter((c) => c.isCompleted).length}/{task.checklist.length}
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <TaskStatusBadge status={status} />
                <TaskPriorityBadge priority={priority} />
                {labels.map((label) => label && <TaskLabelChip key={label.id} label={label} />)}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {task.dueDate && (
                <span className="flex items-center gap-1 text-xs text-foreground-muted">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDueDate(task.dueDate)}
                </span>
              )}
              {task.assignee && <Avatar name={task.assignee.displayName} src={task.assignee.photoURL} size="sm" />}
              <TaskQuickActionsMenu task={task} onEdit={onEdit} onDuplicate={onDuplicate} onArchive={onArchive} onRestore={onRestore} onDelete={onDelete} />
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
