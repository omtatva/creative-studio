"use client";

import {
  Activity as ActivityIcon,
  CheckSquare,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  UserCheck,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTaskDetailsContext } from "@/contexts/TaskDetailsContext";
import { useTaskActivity } from "@/hooks/useTaskActivity";
import { TaskActivityAction } from "@/types/task.types";
import { timeAgo } from "@/lib/utils/date";

const ACTION_ICONS: Record<TaskActivityAction, React.ComponentType<{ className?: string }>> = {
  task_created: Plus,
  task_updated: Pencil,
  status_changed: ActivityIcon,
  priority_changed: ActivityIcon,
  assignee_changed: UserCheck,
  member_assigned: UserCheck,
  comment_added: MessageSquare,
  comment_edited: MessageSquare,
  comment_deleted: MessageSquare,
  checklist_item_added: CheckSquare,
  checklist_item_completed: CheckSquare,
  checklist_item_uncompleted: CheckSquare,
  subtask_added: Plus,
  attachment_added: Paperclip,
  attachment_new_version: Paperclip,
  task_archived: Archive,
  task_restored: ArchiveRestore,
};


/**
 * Full audit trail — doubles as both "Activity Timeline" and "Task
 * History" from the spec, since a chronological log of every action
 * IS the task's history. Every mutation in taskService/commentService/
 * attachmentService calls logTaskActivity, so nothing here is
 * synthesized after the fact.
 */
export function TaskActivityTab() {
  const { task } = useTaskDetailsContext();
  const { entries, isLoading } = useTaskActivity(task?.id);

  if (!task) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>

      {!isLoading && entries.length === 0 ? (
        <EmptyState icon={<ActivityIcon className="h-8 w-8" />} title="No activity yet" className="py-8" />
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map((entry) => {
            const Icon = ACTION_ICONS[entry.action] ?? ActivityIcon;
            return (
              <div key={entry.id} className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-foreground-muted">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Avatar name={entry.actor.displayName} src={entry.actor.photoURL} size="sm" />
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{entry.actor.displayName}</span>{" "}
                    <span className="text-foreground-muted">{entry.message}</span>
                  </p>
                  <span className="ml-auto shrink-0 text-xs text-foreground-muted">{timeAgo(entry.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
