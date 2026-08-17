"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { TaskStatusBadge } from "./TaskStatusBadge";
import { TaskPriorityBadge } from "./TaskPriorityBadge";
import { TaskQuickActionsMenu } from "./TaskQuickActionsMenu";
import { Task } from "@/types/task.types";
import { TaskOptionsSettings } from "@/types/settings.types";
import { taskRoute } from "@/lib/constants/routes";
import { formatDueDate } from "@/lib/utils/date";

interface TaskTableProps {
  tasks: Task[];
  options: TaskOptionsSettings;
  onEdit: (task: Task) => void;
  onDuplicate: (task: Task) => void;
  onArchive: (task: Task) => void;
  onRestore: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/** Dense Table View — same data/actions as TaskCard, spreadsheet-style layout. */
export function TaskTable({ tasks, options, onEdit, onDuplicate, onArchive, onRestore, onDelete }: TaskTableProps) {
  return (
    <div className="overflow-x-auto rounded-theme border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            <th className="px-4 py-2.5">Title</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Priority</th>
            <th className="px-4 py-2.5">Assignee</th>
            <th className="px-4 py-2.5">Due</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const status = options.statuses.find((s) => s.id === task.statusId);
            const priority = options.priorities.find((p) => p.id === task.priorityId);
            return (
              <tr key={task.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                <td className="px-4 py-2.5">
                  <Link href={taskRoute(task.id)} className="font-medium text-foreground hover:underline">
                    {task.title}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <TaskStatusBadge status={status} />
                </td>
                <td className="px-4 py-2.5">
                  <TaskPriorityBadge priority={priority} />
                </td>
                <td className="px-4 py-2.5">
                  {task.assignee ? (
                    <div className="flex items-center gap-2">
                      <Avatar name={task.assignee.displayName} src={task.assignee.photoURL} size="sm" />
                      <span className="text-foreground-muted">{task.assignee.displayName}</span>
                    </div>
                  ) : (
                    <span className="text-foreground-muted">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-foreground-muted">{task.dueDate ? formatDueDate(task.dueDate) : "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <TaskQuickActionsMenu
                    task={task}
                    onEdit={() => onEdit(task)}
                    onDuplicate={() => onDuplicate(task)}
                    onArchive={() => onArchive(task)}
                    onRestore={() => onRestore(task)}
                    onDelete={() => onDelete(task)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
