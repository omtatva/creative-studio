"use client";

import Link from "next/link";
import { Calendar, Clock, FolderKanban, ListTree, User } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { TaskLabelChip } from "@/components/tasks/TaskLabelChip";
import { useTaskDetailsContext } from "@/contexts/TaskDetailsContext";
import { useTask } from "@/hooks/useTask";
import { formatDate, isOverdue } from "@/lib/utils/date";
import { projectRoute, taskRoute } from "@/lib/constants/routes";

/** Overview tab: rich description + the full metadata field set the spec calls out for every task. */
export function TaskOverviewTab() {
  const { task, options } = useTaskDetailsContext();
  const { task: parentTask } = useTask(task?.parentTaskId ?? undefined);

  if (!task) return null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          {task.descriptionHtml ? (
            <div className="prose-editor text-sm text-foreground" dangerouslySetInnerHTML={{ __html: task.descriptionHtml }} />
          ) : (
            <p className="text-sm text-foreground-muted">No description yet.</p>
          )}
        </Card>

        {(task.subtaskCount > 0 || task.checklist.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <div className="mb-1 flex items-center justify-between text-xs text-foreground-muted">
              <span>{task.subtaskCount > 0 ? "Subtasks completed" : "Checklist completed"}</span>
              <span>{task.progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${task.progress}%` }} />
            </div>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-3 text-sm">
            <DetailRow icon={FolderKanban} label="Project">
              <Link href={projectRoute(task.projectId)} className="text-primary hover:underline">
                View project
              </Link>
            </DetailRow>

            <DetailRow icon={User} label="Reporter">
              <div className="flex items-center gap-2">
                <Avatar name={task.reporter.displayName} src={task.reporter.photoURL} size="sm" />
                <span className="text-foreground">{task.reporter.displayName}</span>
              </div>
            </DetailRow>

            <DetailRow icon={Calendar} label="Start date">
              <span className="text-foreground">{formatDate(task.startDate)}</span>
            </DetailRow>

            <DetailRow icon={Calendar} label="Due date">
              <span className={isOverdue(task.dueDate) && !task.isCompleted ? "text-red-500" : "text-foreground"}>
                {formatDate(task.dueDate)}
              </span>
            </DetailRow>

            <DetailRow icon={Clock} label="Estimated">
              <span className="text-foreground">{task.estimatedMinutes ? `${(task.estimatedMinutes / 60).toFixed(1)}h` : "—"}</span>
            </DetailRow>

            <DetailRow icon={Clock} label="Actual">
              <span className="text-foreground">{task.actualMinutes ? `${(task.actualMinutes / 60).toFixed(1)}h` : "—"}</span>
            </DetailRow>

            {task.parentTaskId && (
              <DetailRow icon={ListTree} label="Parent task">
                <Link href={taskRoute(task.parentTaskId)} className="text-primary hover:underline">
                  {parentTask?.title ?? "View task"}
                </Link>
              </DetailRow>
            )}
          </div>
        </Card>

        {task.labelIds.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Labels</CardTitle>
            </CardHeader>
            <div className="flex flex-wrap gap-1.5">
              {task.labelIds.map((id) => {
                const label = options.labels.find((l) => l.id === id);
                return label && <TaskLabelChip key={id} label={label} />;
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-foreground-muted">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      {children}
    </div>
  );
}
