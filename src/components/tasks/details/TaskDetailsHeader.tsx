"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Clapperboard, FolderKanban } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import { TaskPriorityBadge } from "@/components/tasks/TaskPriorityBadge";
import { TaskQuickActionsMenu } from "@/components/tasks/TaskQuickActionsMenu";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useTaskDetailsContext } from "@/contexts/TaskDetailsContext";
import { useTaskActions } from "@/hooks/useTaskActions";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { getFile } from "@/services/fileService";
import { ROUTES, projectRoute, fileReviewRoute } from "@/lib/constants/routes";
import { TaskFormValues } from "@/lib/validations/task.schema";
import { ProjectFile } from "@/types/file.types";

/** When a task was created via "Create task" from a Creative Workspace asset/comment, link back to it — a one-time (non-realtime) lookup since it's just a reference, not something this header needs to live-update on. */
function SourceAssetLink({ sourceFileId }: { sourceFileId: string }) {
  const { workspaceId } = useWorkspaceContext();
  const [file, setFile] = useState<ProjectFile | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    getFile(workspaceId, sourceFileId).then(setFile);
  }, [workspaceId, sourceFileId]);

  if (!file) return null;

  return (
    <Link
      href={fileReviewRoute(file.projectId, file.stageId ?? "none", file.id)}
      className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-primary"
    >
      <Clapperboard className="h-3.5 w-3.5" />
      From asset: {file.fileName}
    </Link>
  );
}

/** Identity + status/priority + quick actions header shared by every task detail tab. */
export function TaskDetailsHeader() {
  const router = useRouter();
  const { task, options } = useTaskDetailsContext();
  const actions = useTaskActions();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  if (!task) return null;

  const status = options.statuses.find((s) => s.id === task.statusId);
  const priority = options.priorities.find((p) => p.id === task.priorityId);

  async function handleFormSubmit(values: TaskFormValues & { projectId: string; assignee: typeof task.assignee }) {
    await actions.update(task!.id, {
      title: values.title,
      descriptionHtml: values.descriptionHtml,
      assignee: values.assignee,
      statusId: values.statusId,
      priorityId: values.priorityId,
      startDate: values.startDate,
      dueDate: values.dueDate,
      estimatedMinutes: values.estimatedMinutes,
      tags: values.tags,
      labelIds: values.labelIds,
    });
    setIsFormOpen(false);
  }

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link href={projectRoute(task.projectId)} className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-primary">
              <FolderKanban className="h-3.5 w-3.5" />
              Back to project
            </Link>
            {task.sourceFileId && <SourceAssetLink sourceFileId={task.sourceFileId} />}
            <h1 className="text-lg font-semibold text-foreground">{task.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <TaskStatusBadge status={status} />
              <TaskPriorityBadge priority={priority} />
              {task.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-foreground-muted">#{tag}</span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {task.assignee ? (
              <div className="flex items-center gap-2">
                <Avatar name={task.assignee.displayName} src={task.assignee.photoURL} size="sm" />
                <span className="text-sm text-foreground-muted">{task.assignee.displayName}</span>
              </div>
            ) : (
              <span className="text-sm text-foreground-muted">Unassigned</span>
            )}
            <TaskQuickActionsMenu
              task={task}
              onEdit={() => setIsFormOpen(true)}
              onDuplicate={() => actions.duplicate(task.id)}
              onArchive={() => setIsArchiveOpen(true)}
              onRestore={() => actions.restore(task.id)}
              onDelete={() => setIsDeleteOpen(true)}
            />
          </div>
        </div>
      </Card>

      <TaskFormModal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} task={task} projectId={task.projectId} onSubmit={handleFormSubmit} isSubmitting={actions.isSubmitting} />

      <ConfirmModal
        isOpen={isArchiveOpen}
        onClose={() => setIsArchiveOpen(false)}
        onConfirm={async () => { await actions.archive(task.id); setIsArchiveOpen(false); }}
        title="Archive task?"
        description={`"${task.title}" will be hidden from active views. You can restore it anytime.`}
        confirmLabel="Archive"
        isSubmitting={actions.isSubmitting}
      />

      <ConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={async () => { await actions.remove(task.id, true); setIsDeleteOpen(false); router.push(ROUTES.tasks); }}
        title="Delete task?"
        description={`This permanently deletes "${task.title}" and its subtasks. This can't be undone.`}
        confirmLabel="Delete"
        isDanger
        isSubmitting={actions.isSubmitting}
      />
    </>
  );
}
