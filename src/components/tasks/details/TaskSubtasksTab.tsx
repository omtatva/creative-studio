"use client";

import { useState } from "react";
import Link from "next/link";
import { ListTree, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import { useTaskDetailsContext } from "@/contexts/TaskDetailsContext";
import { useSubtasks } from "@/hooks/useSubtasks";
import { useTaskActions } from "@/hooks/useTaskActions";
import { taskRoute } from "@/lib/constants/routes";

/**
 * Unlimited-depth subtasks: each subtask is a normal Task with
 * `parentTaskId` set, so a subtask can itself have subtasks just by
 * navigating into it — this tab only shows one level (the direct
 * children), same as most task trackers' subtask lists.
 */
export function TaskSubtasksTab() {
  const { task, options } = useTaskDetailsContext();
  const { subtasks, isLoading } = useSubtasks(task?.id);
  const actions = useTaskActions();
  const [draft, setDraft] = useState("");

  if (!task) return null;

  async function handleAdd() {
    const title = draft.trim();
    if (!title) return;
    await actions.createSubtask(task!, title);
    setDraft("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subtasks</CardTitle>
        {subtasks.length > 0 && (
          <span className="text-xs text-foreground-muted">
            {task.completedSubtaskCount}/{task.subtaskCount} · {task.progress}%
          </span>
        )}
      </CardHeader>

      {subtasks.length > 0 && (
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${task.progress}%` }} />
        </div>
      )}

      {!isLoading && subtasks.length === 0 ? (
        <EmptyState icon={<ListTree className="h-8 w-8" />} title="No subtasks yet" description="Break this task down into smaller pieces." className="py-8" />
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {subtasks.map((subtask) => {
            const status = options.statuses.find((s) => s.id === subtask.statusId);
            return (
              <Link key={subtask.id} href={taskRoute(subtask.id)} className="flex items-center justify-between gap-3 py-2.5 hover:opacity-80">
                <span className="truncate text-sm text-foreground">{subtask.title}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <TaskStatusBadge status={status} />
                  {subtask.assignee && <Avatar name={subtask.assignee.displayName} src={subtask.assignee.photoURL} size="sm" />}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Add a subtask..."
          className="flex-1"
        />
        <Button size="sm" onClick={handleAdd} disabled={!draft.trim()} isLoading={actions.isSubmitting}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
    </Card>
  );
}
