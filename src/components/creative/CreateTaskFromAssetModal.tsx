"use client";

import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { useTaskActions } from "@/hooks/useTaskActions";
import { useToast } from "@/hooks/useToast";
import { TaskFormValues } from "@/lib/validations/task.schema";
import { formatDuration } from "@/lib/utils/fileFormat";
import { AssetComment, ProjectFile } from "@/types/file.types";
import { TaskActor } from "@/types/task.types";

/**
 * "Create task from asset" (and, when `comment` is passed, "Create
 * task from comment" — the full-screen review workspace's feedback-
 * to-task action). Reuses the existing TaskFormModal/
 * useTaskActions.create() wholesale (same validation, same board/
 * status defaults) and just threads `sourceFileId`/`sourceCommentId`
 * through so the resulting task links back and appears in
 * Project → Tasks, Board, and My Tasks exactly like any other task.
 */
export function CreateTaskFromAssetModal({
  asset,
  comment,
  isOpen,
  onClose,
}: {
  asset: ProjectFile;
  comment?: AssetComment | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const actions = useTaskActions();
  const toast = useToast();

  async function handleSubmit(values: TaskFormValues & { projectId: string; assignee: TaskActor | null }) {
    const taskId = await actions.create(
      asset.projectId,
      {
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
        parentTaskId: null,
        sourceFileId: asset.id,
        sourceCommentId: comment?.id ?? null,
      },
      false
    );
    if (taskId) {
      toast.success("Task created");
      onClose();
    } else {
      toast.error(actions.error ?? "Couldn't create task. Please try again.");
    }
  }

  const marker = comment?.timestampSeconds !== undefined && comment?.timestampSeconds !== null
    ? formatDuration(comment.timestampSeconds)
    : comment?.pageNumber
      ? `page ${comment.pageNumber}`
      : null;

  const initialTitle = comment ? `Fix: ${asset.fileName}${marker ? ` (${marker})` : ""}` : `Fix: ${asset.fileName}`;
  const initialDescriptionHtml = comment
    ? `<p>${marker ? `<strong>${marker}</strong> — ` : ""}${comment.body}</p>`
    : undefined;

  return (
    <TaskFormModal
      isOpen={isOpen}
      onClose={onClose}
      projectId={asset.projectId}
      initialTitle={initialTitle}
      initialDescriptionHtml={initialDescriptionHtml}
      onSubmit={handleSubmit}
      isSubmitting={actions.isSubmitting}
    />
  );
}
