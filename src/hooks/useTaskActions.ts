"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import * as taskService from "@/services/taskService";
import * as commentService from "@/services/commentService";
import * as attachmentService from "@/services/attachmentService";
import { CreateTaskPayload, Task, TaskActor, UpdateTaskPayload } from "@/types/task.types";
import { TaskStatusOption, TaskPriorityOption } from "@/types/settings.types";
import { ROUTES, taskRoute } from "@/lib/constants/routes";

/**
 * UI-facing mutation hook for tasks — wraps taskService/
 * commentService/attachmentService with loading/error state, same
 * shape as useProjectActions. Lists/details re-render via realtime
 * onSnapshot subscriptions (useTasks/useTask/etc.), so callers here
 * never manually refetch.
 */
export function useTaskActions() {
  const router = useRouter();
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser, profile } = useAuthContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function currentActor(): TaskActor {
    return {
      uid: firebaseUser?.uid ?? "",
      displayName: profile?.displayName ?? firebaseUser?.displayName ?? "Unknown",
      photoURL: profile?.photoURL ?? firebaseUser?.photoURL ?? null,
      email: profile?.email ?? firebaseUser?.email ?? "",
    };
  }

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setIsSubmitting(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function create(projectId: string, payload: CreateTaskPayload, navigateOnSuccess = true) {
    if (!workspaceId) return null;
    const taskId = await run(() =>
      taskService.createTask({ workspaceId, projectId, reporter: currentActor(), payload })
    );
    if (taskId && navigateOnSuccess) router.push(taskRoute(taskId));
    return taskId;
  }

  async function update(taskId: string, patch: UpdateTaskPayload) {
    if (!workspaceId) return null;
    return run(() => taskService.updateTask(workspaceId, taskId, patch, currentActor()));
  }

  async function changeStatus(taskId: string, status: TaskStatusOption) {
    if (!workspaceId) return;
    await run(() => taskService.changeTaskStatus(workspaceId, taskId, status, currentActor()));
  }

  async function reorderInColumn(taskId: string, newBoardOrder: number) {
    if (!workspaceId) return;
    await run(() => taskService.reorderTaskInColumn(workspaceId, taskId, newBoardOrder));
  }

  async function bulkChangeStatus(taskIds: string[], status: TaskStatusOption) {
    if (!workspaceId) return;
    await run(() => taskService.bulkChangeStatus(workspaceId, taskIds, status, currentActor()));
  }

  async function changePriority(taskId: string, priority: TaskPriorityOption) {
    if (!workspaceId) return;
    await run(() => taskService.changeTaskPriority(workspaceId, taskId, priority.label, priority.id, currentActor()));
  }

  async function assign(taskId: string, assignee: TaskActor | null) {
    if (!workspaceId) return;
    await run(() => taskService.assignTask(workspaceId, taskId, assignee, currentActor()));
  }

  async function archive(taskId: string) {
    if (!workspaceId) return null;
    return run(() => taskService.archiveTask(workspaceId, taskId, currentActor()));
  }

  async function restore(taskId: string) {
    if (!workspaceId) return null;
    return run(() => taskService.restoreTask(workspaceId, taskId, currentActor()));
  }

  async function remove(taskId: string, redirectAfter = false) {
    if (!workspaceId) return null;
    const result = await run(() => taskService.deleteTask(workspaceId, taskId));
    if (result !== null && redirectAfter) router.push(ROUTES.tasks);
    return result;
  }

  async function duplicate(taskId: string) {
    if (!workspaceId) return null;
    return run(() => taskService.duplicateTask(workspaceId, taskId, currentActor()));
  }

  async function createSubtask(parentTask: Task, title: string) {
    if (!workspaceId) return null;
    return run(() =>
      taskService.createTask({
        workspaceId,
        projectId: parentTask.projectId,
        reporter: currentActor(),
        payload: {
          title,
          descriptionHtml: "",
          assignee: null,
          statusId: parentTask.statusId,
          priorityId: parentTask.priorityId,
          startDate: null,
          dueDate: null,
          estimatedMinutes: null,
          tags: [],
          labelIds: [],
          parentTaskId: parentTask.id,
        },
      })
    );
  }

  async function addChecklistItem(taskId: string, text: string) {
    if (!workspaceId) return;
    await run(() => taskService.addChecklistItem(workspaceId, taskId, text, currentActor()));
  }

  async function toggleChecklistItem(taskId: string, itemId: string) {
    if (!workspaceId) return;
    await run(() => taskService.toggleChecklistItem(workspaceId, taskId, itemId, currentActor()));
  }

  async function removeChecklistItem(taskId: string, itemId: string) {
    if (!workspaceId) return;
    await run(() => taskService.removeChecklistItem(workspaceId, taskId, itemId));
  }

  async function addComment(taskId: string, bodyHtml: string, mentionedUids: string[], parentCommentId: string | null = null) {
    return run(() => commentService.addComment({ taskId, author: currentActor(), bodyHtml, mentionedUids, parentCommentId }));
  }

  async function editComment(taskId: string, commentId: string, bodyHtml: string) {
    await run(() => commentService.editComment(taskId, commentId, bodyHtml, currentActor()));
  }

  async function deleteComment(taskId: string, commentId: string) {
    await run(() => commentService.deleteComment(taskId, commentId, currentActor()));
  }

  async function uploadAttachment(taskId: string, file: File) {
    if (!workspaceId) return;
    await run(() => attachmentService.uploadAttachment(workspaceId, taskId, file, currentActor()));
  }

  async function deleteAttachment(taskId: string, attachmentId: string) {
    await run(() => attachmentService.deleteAttachment(taskId, attachmentId));
  }

  return {
    isSubmitting,
    error,
    currentActor,
    create,
    update,
    changeStatus,
    reorderInColumn,
    bulkChangeStatus,
    changePriority,
    assign,
    archive,
    restore,
    remove,
    duplicate,
    createSubtask,
    addChecklistItem,
    toggleChecklistItem,
    removeChecklistItem,
    addComment,
    editComment,
    deleteComment,
    uploadAttachment,
    deleteAttachment,
  };
}
