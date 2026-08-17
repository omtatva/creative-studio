import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { tasksCol, taskDoc } from "@/lib/firebase/firestore";
import { logTaskActivity, deleteAllTaskActivity } from "@/services/taskActivityService";
import { logActivity } from "@/services/activityService";
import { pushNotification } from "@/services/notificationService";
import { deleteAllComments } from "@/services/commentService";
import { deleteAllAttachments } from "@/services/attachmentService";
import {
  ChecklistItem,
  CreateTaskPayload,
  Task,
  TaskActor,
  UpdateTaskPayload,
} from "@/types/task.types";
import { TaskStatusOption } from "@/types/settings.types";

/**
 * All task reads/writes live here. Every function takes
 * `workspaceId` and either filters by it or re-validates a fetched
 * doc against it before proceeding — same enforcement pattern as
 * projectService.ts, matching firebase-config/firestore.rules.
 */

interface CreateTaskArgs {
  workspaceId: string;
  projectId: string;
  reporter: TaskActor;
  payload: CreateTaskPayload;
}

export async function createTask({ workspaceId, projectId, reporter, payload }: CreateTaskArgs): Promise<string> {
  const taskRef = doc(tasksCol());
  const taskId = taskRef.id;

  const task: Omit<Task, "createdAt" | "updatedAt"> = {
    id: taskId,
    workspaceId,
    projectId,
    title: payload.title,
    descriptionHtml: payload.descriptionHtml,
    assignee: payload.assignee,
    reporter,
    statusId: payload.statusId,
    priorityId: payload.priorityId,
    startDate: payload.startDate,
    dueDate: payload.dueDate,
    estimatedMinutes: payload.estimatedMinutes,
    actualMinutes: null,
    tags: payload.tags,
    labelIds: payload.labelIds,
    parentTaskId: payload.parentTaskId,
    sourceFileId: payload.sourceFileId ?? null,
    sourceCommentId: payload.sourceCommentId ?? null,
    subtaskCount: 0,
    completedSubtaskCount: 0,
    checklist: [],
    progress: 0,
    boardOrder: Date.now(),
    commentCount: 0,
    attachmentCount: 0,
    isArchived: false,
    isCompleted: false,
    createdBy: reporter.uid,
  };

  await setDoc(taskRef, {
    ...task,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await logTaskActivity(taskId, reporter, "task_created", `created this task`);
  await logActivity(workspaceId, {
    actorId: reporter.uid,
    actorName: reporter.displayName,
    action: `created task "${payload.title}"`,
    targetType: "task",
    targetId: taskId,
  });

  if (payload.parentTaskId) {
    await logTaskActivity(payload.parentTaskId, reporter, "subtask_added", `added subtask "${payload.title}"`);
    await recomputeParentProgress(workspaceId, payload.parentTaskId);
  }

  return taskId;
}

export async function getTask(workspaceId: string, taskId: string): Promise<Task | null> {
  const snapshot = await getDoc(taskDoc(taskId));
  if (!snapshot.exists()) return null;
  const task = snapshot.data();
  if (task.workspaceId !== workspaceId) return null;
  return task;
}

export async function getWorkspaceTasks(workspaceId: string): Promise<Task[]> {
  const q = query(tasksCol(), where("workspaceId", "==", workspaceId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

export async function getProjectTasks(workspaceId: string, projectId: string): Promise<Task[]> {
  const q = query(tasksCol(), where("workspaceId", "==", workspaceId), where("projectId", "==", projectId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

export async function getSubtasks(workspaceId: string, parentTaskId: string): Promise<Task[]> {
  const q = query(tasksCol(), where("workspaceId", "==", workspaceId), where("parentTaskId", "==", parentTaskId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

export async function updateTask(
  workspaceId: string,
  taskId: string,
  patch: UpdateTaskPayload,
  actor: TaskActor
): Promise<void> {
  const existing = await getTask(workspaceId, taskId);
  if (!existing) throw new Error("Task not found in this workspace.");

  await updateDoc(taskDoc(taskId), { ...patch, updatedAt: serverTimestamp() } as never);
  await logTaskActivity(taskId, actor, "task_updated", "updated task details");
}

export async function changeTaskStatus(
  workspaceId: string,
  taskId: string,
  status: TaskStatusOption,
  actor: TaskActor
): Promise<void> {
  const existing = await getTask(workspaceId, taskId);
  if (!existing) throw new Error("Task not found in this workspace.");

  await updateDoc(taskDoc(taskId), {
    statusId: status.id,
    isCompleted: status.isCompletedStatus,
    updatedAt: serverTimestamp(),
  });

  await logTaskActivity(taskId, actor, "status_changed", `changed status to "${status.label}"`);

  // Workspace-wide activity feed only gets a "completed" entry on the
  // actual done transition (not every status change) — logTaskActivity
  // above already covers the per-task activity tab for every change.
  if (status.isCompletedStatus && !existing.isCompleted) {
    await logActivity(workspaceId, {
      actorId: actor.uid,
      actorName: actor.displayName,
      action: `completed task "${existing.title}"`,
      targetType: "task",
      targetId: taskId,
    });
  }

  if (existing.parentTaskId) {
    await recomputeParentProgress(workspaceId, existing.parentTaskId);
  }
}

/**
 * Reorders a task within its current status/column on the Kanban
 * board. `boardOrder` lives directly on the task doc (see
 * task.types.ts) rather than a separate position-tracking
 * collection — one field, one write, no risk of the board's
 * ordering data drifting out of sync with the task itself.
 */
export async function reorderTaskInColumn(workspaceId: string, taskId: string, newBoardOrder: number): Promise<void> {
  const existing = await getTask(workspaceId, taskId);
  if (!existing) throw new Error("Task not found in this workspace.");
  await updateDoc(taskDoc(taskId), { boardOrder: newBoardOrder, updatedAt: serverTimestamp() });
}

/**
 * Bulk column move for the board's multi-select mode. Reuses the
 * same per-task status-change path as a single drag-and-drop move
 * (including per-task activity logging), just looped — Firestore
 * writes stay simple and auditable rather than a special-cased batch
 * write that would skip activity logging.
 */
export async function bulkChangeStatus(
  workspaceId: string,
  taskIds: string[],
  status: TaskStatusOption,
  actor: TaskActor
): Promise<void> {
  await Promise.all(taskIds.map((taskId) => changeTaskStatus(workspaceId, taskId, status, actor)));
}

export async function changeTaskPriority(
  workspaceId: string,
  taskId: string,
  priorityLabel: string,
  priorityId: string,
  actor: TaskActor
): Promise<void> {
  const existing = await getTask(workspaceId, taskId);
  if (!existing) throw new Error("Task not found in this workspace.");
  await updateDoc(taskDoc(taskId), { priorityId, updatedAt: serverTimestamp() });
  await logTaskActivity(taskId, actor, "priority_changed", `changed priority to "${priorityLabel}"`);
}

export async function assignTask(
  workspaceId: string,
  taskId: string,
  assignee: TaskActor | null,
  actor: TaskActor
): Promise<void> {
  const existing = await getTask(workspaceId, taskId);
  if (!existing) throw new Error("Task not found in this workspace.");
  await updateDoc(taskDoc(taskId), { assignee, updatedAt: serverTimestamp() });
  await logTaskActivity(
    taskId,
    actor,
    "member_assigned",
    assignee ? `assigned this task to ${assignee.displayName}` : "unassigned this task"
  );
  if (assignee && assignee.uid !== actor.uid) {
    await pushNotification(workspaceId, assignee.uid, {
      title: "New task assigned",
      body: `${actor.displayName} assigned you to "${existing.title}".`,
      read: false,
    });
  }
}

export async function archiveTask(workspaceId: string, taskId: string, actor: TaskActor): Promise<void> {
  const existing = await getTask(workspaceId, taskId);
  if (!existing) throw new Error("Task not found in this workspace.");
  await updateDoc(taskDoc(taskId), { isArchived: true, updatedAt: serverTimestamp() });
  await logTaskActivity(taskId, actor, "task_archived", "archived this task");
}

export async function restoreTask(workspaceId: string, taskId: string, actor: TaskActor): Promise<void> {
  const existing = await getTask(workspaceId, taskId);
  if (!existing) throw new Error("Task not found in this workspace.");
  await updateDoc(taskDoc(taskId), { isArchived: false, updatedAt: serverTimestamp() });
  await logTaskActivity(taskId, actor, "task_restored", "restored this task");
}

/** Purges a task's own comments/attachments(+files)/activity subcollections — Firestore never cascade-deletes these just because the parent doc is gone, so skipping this leaves orphaned, unreachable data behind forever. */
async function purgeTaskSubcollections(taskId: string): Promise<void> {
  await Promise.all([deleteAllComments(taskId), deleteAllAttachments(taskId), deleteAllTaskActivity(taskId)]);
}

export async function deleteTask(workspaceId: string, taskId: string): Promise<void> {
  const existing = await getTask(workspaceId, taskId);
  if (!existing) throw new Error("Task not found in this workspace.");

  // Best-effort: also delete direct subtasks so a parent delete doesn't
  // leave orphaned children pointing at a nonexistent parentTaskId.
  const subtasks = await getSubtasks(workspaceId, taskId);
  await Promise.all(
    subtasks.map(async (s) => {
      await purgeTaskSubcollections(s.id);
      await deleteDoc(taskDoc(s.id));
    })
  );
  await purgeTaskSubcollections(taskId);
  await deleteDoc(taskDoc(taskId));

  if (existing.parentTaskId) {
    await recomputeParentProgress(workspaceId, existing.parentTaskId);
  }
}

export async function duplicateTask(workspaceId: string, taskId: string, actor: TaskActor): Promise<string> {
  const existing = await getTask(workspaceId, taskId);
  if (!existing) throw new Error("Task not found in this workspace.");

  const newRef = doc(tasksCol());
  const duplicate: Omit<Task, "createdAt" | "updatedAt"> = {
    ...existing,
    id: newRef.id,
    title: `${existing.title} (Copy)`,
    isArchived: false,
    isCompleted: false,
    checklist: existing.checklist.map((item) => ({ ...item, isCompleted: false, completedAt: null, completedBy: null })),
    subtaskCount: 0,
    completedSubtaskCount: 0,
    progress: 0,
    boardOrder: Date.now(),
    commentCount: 0,
    attachmentCount: 0,
    reporter: actor,
    createdBy: actor.uid,
  };

  await setDoc(newRef, { ...duplicate, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await logTaskActivity(newRef.id, actor, "task_created", `duplicated from "${existing.title}"`);

  return newRef.id;
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

export async function addChecklistItem(workspaceId: string, taskId: string, text: string, actor: TaskActor): Promise<void> {
  const existing = await getTask(workspaceId, taskId);
  if (!existing) throw new Error("Task not found in this workspace.");

  const item: ChecklistItem = {
    id: crypto.randomUUID(),
    text,
    isCompleted: false,
    completedAt: null,
    completedBy: null,
  };
  const checklist = [...existing.checklist, item];

  await updateDoc(taskDoc(taskId), { checklist, progress: computeChecklistProgress(checklist, existing), updatedAt: serverTimestamp() });
  await logTaskActivity(taskId, actor, "checklist_item_added", `added checklist item "${text}"`);
}

export async function toggleChecklistItem(
  workspaceId: string,
  taskId: string,
  itemId: string,
  actor: TaskActor
): Promise<void> {
  const existing = await getTask(workspaceId, taskId);
  if (!existing) throw new Error("Task not found in this workspace.");

  let toggledText = "";
  let nowCompleted = false;
  const checklist = existing.checklist.map((item) => {
    if (item.id !== itemId) return item;
    toggledText = item.text;
    nowCompleted = !item.isCompleted;
    return {
      ...item,
      isCompleted: nowCompleted,
      completedAt: nowCompleted ? new Date().toISOString() : null,
      completedBy: nowCompleted ? actor.uid : null,
    };
  });

  await updateDoc(taskDoc(taskId), { checklist, progress: computeChecklistProgress(checklist, existing), updatedAt: serverTimestamp() });
  await logTaskActivity(
    taskId,
    actor,
    nowCompleted ? "checklist_item_completed" : "checklist_item_uncompleted",
    `${nowCompleted ? "completed" : "reopened"} checklist item "${toggledText}"`
  );
}

export async function removeChecklistItem(workspaceId: string, taskId: string, itemId: string): Promise<void> {
  const existing = await getTask(workspaceId, taskId);
  if (!existing) throw new Error("Task not found in this workspace.");
  const checklist = existing.checklist.filter((item) => item.id !== itemId);
  await updateDoc(taskDoc(taskId), { checklist, progress: computeChecklistProgress(checklist, existing), updatedAt: serverTimestamp() });
}

function computeChecklistProgress(checklist: ChecklistItem[], task: Task): number {
  // Subtask completion takes precedence when subtasks exist; otherwise fall back to checklist.
  if (task.subtaskCount > 0) return task.progress;
  if (checklist.length === 0) return task.isCompleted ? 100 : 0;
  const completed = checklist.filter((i) => i.isCompleted).length;
  return Math.round((completed / checklist.length) * 100);
}

// ---------------------------------------------------------------------------
// Subtask progress rollup
// ---------------------------------------------------------------------------

/**
 * Recomputes a parent task's subtaskCount/completedSubtaskCount/
 * progress from its children's current isCompleted flags. Called
 * after any subtask is created, deleted, or changes status — this
 * is what satisfies "Progress should automatically update according
 * to completed subtasks."
 */
export async function recomputeParentProgress(workspaceId: string, parentTaskId: string): Promise<void> {
  const parent = await getTask(workspaceId, parentTaskId);
  if (!parent) return;

  const subtasks = await getSubtasks(workspaceId, parentTaskId);
  const subtaskCount = subtasks.length;
  const completedSubtaskCount = subtasks.filter((s) => s.isCompleted).length;
  const progress = subtaskCount > 0 ? Math.round((completedSubtaskCount / subtaskCount) * 100) : parent.progress;

  await updateDoc(taskDoc(parentTaskId), {
    subtaskCount,
    completedSubtaskCount,
    progress,
    updatedAt: serverTimestamp(),
  });
}
