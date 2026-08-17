"use client";

import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTasks } from "@/hooks/useTasks";
import { useTaskOptions } from "@/hooks/useTaskOptions";
import { taskRoute, ROUTES } from "@/lib/constants/routes";
import { formatDueDate } from "@/lib/utils/date";

/** Now backed by the live, workspace-scoped task list (see useTasks) instead of a static placeholder — same hook the /tasks page uses. */
export function MyTasks() {
  const { firebaseUser } = useAuthContext();
  const { allTasksForCounts, isLoading } = useTasks();
  const { options } = useTaskOptions();

  const uid = firebaseUser?.uid ?? "";
  const myTasks = allTasksForCounts
    .filter((t) => !t.isCompleted && (t.assignee?.uid === uid || t.reporter.uid === uid))
    .slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Tasks</CardTitle>
        {myTasks.length > 0 && (
          <Link href={ROUTES.tasks} className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        )}
      </CardHeader>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 w-full animate-pulse rounded-theme bg-surface-muted" />
          ))}
        </div>
      ) : myTasks.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="h-8 w-8" />}
          title="You're all clear"
          description="Tasks assigned to you will appear in this list."
        />
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {myTasks.map((task) => {
            const status = options.statuses.find((s) => s.id === task.statusId);
            return (
              <Link key={task.id} href={taskRoute(task.id)} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0 hover:opacity-80">
                <span className="truncate text-sm text-foreground">{task.title}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <TaskStatusBadge status={status} />
                  {task.dueDate && <span className="text-xs text-foreground-muted">{formatDueDate(task.dueDate)}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
