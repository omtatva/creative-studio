import { ID, Timestamps } from "./common.types";

/**
 * Minimal actor snapshot embedded on a task (assignee/reporter) and
 * on comments/activity entries — mirrors ProjectMember's shape from
 * project.types.ts so the same Avatar/picker UI patterns work
 * unchanged, without importing project types into the task domain.
 */
export interface TaskActor {
  uid: ID;
  displayName: string;
  photoURL: string | null;
  email: string;
}

export interface ChecklistItem {
  id: ID;
  text: string;
  isCompleted: boolean;
  completedAt: string | null;
  completedBy: ID | null;
}

export interface AttachmentVersion {
  versionNumber: number;
  url: string;
  storagePath: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: TaskActor;
}

export interface TaskAttachment {
  id: ID;
  fileName: string;
  contentType: string;
  versions: AttachmentVersion[]; // last entry is the current version
}

export type TaskActivityAction =
  | "task_created"
  | "task_updated"
  | "status_changed"
  | "priority_changed"
  | "assignee_changed"
  | "member_assigned"
  | "comment_added"
  | "comment_edited"
  | "comment_deleted"
  | "checklist_item_added"
  | "checklist_item_completed"
  | "checklist_item_uncompleted"
  | "subtask_added"
  | "attachment_added"
  | "attachment_new_version"
  | "task_archived"
  | "task_restored";

export interface TaskActivityEntry extends Timestamps {
  id: ID;
  action: TaskActivityAction;
  actor: TaskActor;
  message: string; // human-readable summary, e.g. "changed status from To Do to In Progress"
  metadata?: Record<string, string>;
}

export interface TaskComment extends Timestamps {
  id: ID;
  authorId: ID;
  author: TaskActor;
  bodyHtml: string; // rich text, from RichTextEditor
  mentionedUids: ID[];
  parentCommentId: ID | null; // one level of replies
  isEdited: boolean;
}

/**
 * `statusId`/`priorityId`/`labelIds` reference
 * `WorkspaceSettings.taskOptions` — never a hardcoded enum (see
 * settings.types.ts / lib/constants/taskOptions.ts). `tags` stays
 * free-form text the assignee types in, distinct from the curated
 * `labelIds` taxonomy.
 *
 * `parentTaskId` models unlimited-depth subtasks by pointing back
 * into the same `tasks` collection; `progress` on a parent is
 * derived from its children's statuses (see
 * taskService.recomputeParentProgress) plus its own checklist.
 */
export interface Task extends Timestamps {
  id: ID;
  workspaceId: ID;
  projectId: ID;
  title: string;
  descriptionHtml: string;
  assignee: TaskActor | null;
  reporter: TaskActor;
  statusId: string;
  priorityId: string;
  startDate: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  tags: string[];
  labelIds: string[];
  parentTaskId: ID | null;
  sourceFileId: ID | null; // set when created via "Create task" from a Creative Workspace asset (see file.types.ts)
  sourceCommentId: ID | null; // set when created via "Create task" from a specific review comment
  subtaskCount: number;
  completedSubtaskCount: number;
  checklist: ChecklistItem[];
  progress: number; // 0-100, derived from checklist + subtasks
  boardOrder: number; // position within its status/column on the Kanban board — see boardService.ts
  commentCount: number; // denormalized from tasks/{id}/comments — lets board cards show a count without N subcollection listeners
  attachmentCount: number; // denormalized from tasks/{id}/attachments, same reasoning
  isArchived: boolean;
  isCompleted: boolean; // convenience flag mirroring statusId's isCompletedStatus
  createdBy: ID;
}

export interface CreateTaskPayload {
  title: string;
  descriptionHtml: string;
  assignee: TaskActor | null;
  statusId: string;
  priorityId: string;
  startDate: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  tags: string[];
  labelIds: string[];
  parentTaskId: ID | null;
  sourceFileId?: ID | null;
  sourceCommentId?: ID | null;
}

export type UpdateTaskPayload = Partial<
  Omit<Task, "id" | "workspaceId" | "projectId" | "createdAt" | "updatedAt" | "createdBy" | "reporter">
>;

export type TaskViewMode = "list" | "table";

export type TaskSection = "all" | "my_tasks" | "assigned_to_me" | "created_by_me" | "overdue" | "completed";

export const TASK_SECTIONS: { key: TaskSection; label: string }[] = [
  { key: "all", label: "All Tasks" },
  { key: "my_tasks", label: "My Tasks" },
  { key: "assigned_to_me", label: "Assigned to Me" },
  { key: "created_by_me", label: "Created by Me" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
];

export interface TaskFilters {
  statusIds: string[];
  priorityIds: string[];
  labelIds: string[];
  assigneeIds: string[];
  dueBefore: string | null;
  dueAfter: string | null;
}

export const EMPTY_TASK_FILTERS: TaskFilters = {
  statusIds: [],
  priorityIds: [],
  labelIds: [],
  assigneeIds: [],
  dueBefore: null,
  dueAfter: null,
};

export type TaskSortField = "updatedAt" | "createdAt" | "dueDate" | "title" | "priority";
export type SortDirection = "asc" | "desc";

export interface TaskSort {
  field: TaskSortField;
  direction: SortDirection;
}

export const DEFAULT_TASK_SORT: TaskSort = { field: "updatedAt", direction: "desc" };
