import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "./config";
import { AppUser } from "@/types/user.types";
import { Workspace, Member, WorkspaceInvite, CustomRole, WorkspaceSlug } from "@/types/workspace.types";
import { WorkspaceSettings } from "@/types/settings.types";
import { Project, ProjectMembership } from "@/types/project.types";
import { Task, TaskComment, TaskAttachment, TaskActivityEntry } from "@/types/task.types";
import { Board, BoardColumn, BoardPreference, BoardActivityEntry } from "@/types/board.types";
import { AssetAnnotation, AssetComment, FileShareLookup, ProjectFile } from "@/types/file.types";
import { Review } from "@/types/review.types";
import { AuditLogEntry } from "@/types/audit.types";
import { Stage } from "@/types/stage.types";
import { AIGeneration } from "@/types/ai.types";
import { WorkspaceAIConfig } from "@/types/aiConfig.types";

/**
 * Central map of every Firestore collection/path used in the
 * foundation. Nothing should call `collection(db, "some-string")`
 * directly elsewhere in the app — go through these helpers so a
 * renamed collection only needs to change in one place.
 *
 * Multi-tenancy model:
 *  - `users` is global (one doc per Firebase Auth user).
 *  - `workspaces` is global (one doc per tenant).
 *  - `members`, `settings`, `activity_logs`, `notifications`,
 *    `projects` are all scoped BY workspaceId, either via a
 *    composite id (`${workspaceId}_${uid}`) or a `workspaceId`
 *    field + query, so one tenant's data can never leak into
 *    another's reads. EVERY read/write against `projectsCol()` in
 *    projectService.ts includes a `where("workspaceId", "==", ...)`
 *    clause — never query it unfiltered.
 */

export const usersCol = () => collection(db, "users") as CollectionReference<AppUser>;
export const userDoc = (uid: string) => doc(db, "users", uid) as DocumentReference<AppUser>;

export const workspacesCol = () => collection(db, "workspaces") as CollectionReference<Workspace>;
export const workspaceDoc = (workspaceId: string) =>
  doc(db, "workspaces", workspaceId) as DocumentReference<Workspace>;

/** Document ID IS the slug — see WorkspaceSlug's doc comment in workspace.types.ts for why this is a separate, minimal collection. */
export const workspaceSlugsCol = () => collection(db, "workspace_slugs") as CollectionReference<WorkspaceSlug>;
export const workspaceSlugDoc = (slug: string) =>
  doc(db, "workspace_slugs", slug) as DocumentReference<WorkspaceSlug>;

export const membersCol = () => collection(db, "members") as CollectionReference<Member>;
export const memberDoc = (workspaceId: string, uid: string) =>
  doc(db, "members", `${workspaceId}_${uid}`) as DocumentReference<Member>;

export const settingsDoc = (workspaceId: string) =>
  doc(db, "settings", workspaceId) as DocumentReference<WorkspaceSettings>;

export const activityLogsCol = (workspaceId: string) =>
  collection(db, "workspaces", workspaceId, "activity_logs");

export const notificationsCol = (workspaceId: string, uid: string) =>
  collection(db, "workspaces", workspaceId, "notifications", uid, "items");

/**
 * `projects` is a single top-level collection (not nested under
 * workspaces/) so it can be queried/paginated/sorted directly with
 * `where("workspaceId", "==", workspaceId)` — every function in
 * projectService.ts applies that filter, matching the security
 * rules in firebase-config/firestore.rules.
 */
export const projectsCol = () => collection(db, "projects") as CollectionReference<Project>;
export const projectDoc = (projectId: string) =>
  doc(db, "projects", projectId) as DocumentReference<Project>;

/**
 * Project-level access-control records — see ProjectMembership's doc
 * comment in project.types.ts. Doc id is `${projectId}_${uid}`,
 * mirroring `members`'s `${workspaceId}_${uid}` pattern above.
 */
export const projectMembersCol = () => collection(db, "project_members") as CollectionReference<ProjectMembership>;
export const projectMemberDoc = (projectId: string, uid: string) =>
  doc(db, "project_members", `${projectId}_${uid}`) as DocumentReference<ProjectMembership>;

/**
 * `tasks` follows the same top-level-collection-with-workspaceId
 * pattern as `projects`. It additionally carries a `projectId`
 * field so project-scoped views (Projects > [id] > Tasks) can query
 * `where("workspaceId", "==", ...).where("projectId", "==", ...)`,
 * while workspace-wide views (My Tasks) query on workspaceId alone.
 * Subtasks are plain `tasks` docs with `parentTaskId` set — no
 * separate collection, so nesting depth is unlimited "for free".
 *
 * Comments, attachments, and activity are subcollections of each
 * task doc — they inherit the parent task's tenant scope by
 * construction (you can't reach `tasks/{id}/comments` without first
 * resolving `tasks/{id}`, which is itself workspace-checked).
 */
export const tasksCol = () => collection(db, "tasks") as CollectionReference<Task>;
export const taskDoc = (taskId: string) => doc(db, "tasks", taskId) as DocumentReference<Task>;

export const taskCommentsCol = (taskId: string) =>
  collection(db, "tasks", taskId, "comments") as CollectionReference<TaskComment>;
export const taskCommentDoc = (taskId: string, commentId: string) =>
  doc(db, "tasks", taskId, "comments", commentId) as DocumentReference<TaskComment>;

export const taskAttachmentsCol = (taskId: string) =>
  collection(db, "tasks", taskId, "attachments") as CollectionReference<TaskAttachment>;
export const taskAttachmentDoc = (taskId: string, attachmentId: string) =>
  doc(db, "tasks", taskId, "attachments", attachmentId) as DocumentReference<TaskAttachment>;

export const taskActivityCol = (taskId: string) =>
  collection(db, "tasks", taskId, "activity") as CollectionReference<TaskActivityEntry>;

/**
 * Board collections. `boards` is one doc per project (workspaceId +
 * projectId fields, always queried filtered). `board_columns`
 * carries both `boardId` and `workspaceId` so it can be queried
 * directly by board without a join. `board_preferences` uses a
 * composite id (`${boardId}_${uid}`) mirroring the `members`
 * collection's pattern. Board activity is a subcollection of its
 * board, matching tasks/{taskId}/activity.
 */
export const boardsCol = () => collection(db, "boards") as CollectionReference<Board>;
export const boardDoc = (boardId: string) => doc(db, "boards", boardId) as DocumentReference<Board>;

export const boardColumnsCol = () => collection(db, "board_columns") as CollectionReference<BoardColumn>;
export const boardColumnDoc = (columnId: string) =>
  doc(db, "board_columns", columnId) as DocumentReference<BoardColumn>;

export const boardPreferencesCol = () => collection(db, "board_preferences") as CollectionReference<BoardPreference>;
export const boardPreferenceDoc = (boardId: string, uid: string) =>
  doc(db, "board_preferences", `${boardId}_${uid}`) as DocumentReference<BoardPreference>;

export const boardActivityCol = (boardId: string) =>
  collection(db, "boards", boardId, "activity") as CollectionReference<BoardActivityEntry>;

/**
 * Files and Reviews follow the same top-level-collection-with-
 * workspaceId(+projectId) pattern as tasks/projects/boards. Reviews
 * reference file ids rather than embedding file data — approving a
 * review updates the referenced ProjectFile docs directly (see
 * reviewService.ts), so file data is never duplicated.
 */
export const filesCol = () => collection(db, "files") as CollectionReference<ProjectFile>;
export const fileDoc = (fileId: string) => doc(db, "files", fileId) as DocumentReference<ProjectFile>;

/** Comments on one creative asset — subcollection of its `files/{fileId}` doc, mirroring tasks/{taskId}/comments. */
export const fileCommentsCol = (fileId: string) =>
  collection(db, "files", fileId, "comments") as CollectionReference<AssetComment>;
export const fileCommentDoc = (fileId: string, commentId: string) =>
  doc(db, "files", fileId, "comments", commentId) as DocumentReference<AssetComment>;

/** Drawn annotations (circle/rectangle/arrow/freehand/text) on one creative asset — sibling subcollection to files/{fileId}/comments. */
export const fileAnnotationsCol = (fileId: string) =>
  collection(db, "files", fileId, "annotations") as CollectionReference<AssetAnnotation>;
export const fileAnnotationDoc = (fileId: string, annotationId: string) =>
  doc(db, "files", fileId, "annotations", annotationId) as DocumentReference<AssetAnnotation>;

/** See FileShareLookup's doc comment in file.types.ts for why this exists separately from `files` itself. */
export const fileShareDoc = (shareToken: string) => doc(db, "file_shares", shareToken) as DocumentReference<FileShareLookup>;

export const reviewsCol = () => collection(db, "reviews") as CollectionReference<Review>;
export const reviewDoc = (reviewId: string) => doc(db, "reviews", reviewId) as DocumentReference<Review>;

/**
 * Creative Stages — same top-level-collection-with-workspaceId(+projectId)
 * pattern as files/reviews/tasks (see the comment above `filesCol`).
 */
export const stagesCol = () => collection(db, "stages") as CollectionReference<Stage>;
export const stageDoc = (stageId: string) => doc(db, "stages", stageId) as DocumentReference<Stage>;

export const workspaceInvitesCol = () => collection(db, "workspace_invites") as CollectionReference<WorkspaceInvite>;
export const workspaceInviteDoc = (inviteId: string) =>
  doc(db, "workspace_invites", inviteId) as DocumentReference<WorkspaceInvite>;

export const customRolesCol = () => collection(db, "workspace_roles") as CollectionReference<CustomRole>;
export const customRoleDoc = (roleId: string) => doc(db, "workspace_roles", roleId) as DocumentReference<CustomRole>;

export const auditLogsCol = () => collection(db, "audit_logs") as CollectionReference<AuditLogEntry>;

/** AI Studio generation history — same top-level-collection-with-workspaceId pattern as everything above. */
export const aiUsageLogsCol = () => collection(db, "ai_usage_logs") as CollectionReference<AIGeneration>;

/** One doc per workspace PER PROVIDER (id = `${workspaceId}_${provider}`), holding that provider's encrypted key — see types/aiConfig.types.ts. */
export const aiConfigDoc = (workspaceId: string, provider: string) =>
  doc(db, "ai_config", `${workspaceId}_${provider}`) as DocumentReference<WorkspaceAIConfig>;
export const aiUsageLogDoc = (id: string) => doc(db, "ai_usage_logs", id) as DocumentReference<AIGeneration>;
