import { ID, Timestamps } from "./common.types";
import { TaskActor } from "./task.types";

/**
 * Broad media category derived from contentType — drives which
 * preview the Creative Workspace renders (video player, image,
 * PDF frame, or a generic file-info card) without re-parsing MIME
 * strings all over the UI.
 */
export type AssetType = "video" | "image" | "pdf" | "audio" | "other";

/**
 * Lifecycle status of a creative asset version. "none" is the
 * pre-existing default (a plain, never-reviewed upload — displayed
 * as "Draft" in the Creative Workspace); "archived" is new. Extending
 * the existing `reviewStatus` union in place (rather than adding a
 * second, parallel status field) keeps fileService/reviewService/
 * FileRow/DownloadsPanel — which all already branch on this exact
 * field — working unchanged for every status the Creative Workspace
 * needs (Draft/In Review/Changes Requested/Approved/Archived).
 */
export type AssetStatus = "none" | "pending_review" | "approved" | "changes_requested" | "archived";

/**
 * Project-level deliverable/document, distinct from a task's own
 * attachments (tasks/{id}/attachments) — this is the "Files" module:
 * assets shared at the project level that Reviews reference and
 * Downloads surfaces once approved. Always belongs to one workspace
 * AND one project (see fileService.ts — every query filters both).
 *
 * Versioning: uploading a new version of an existing asset (from
 * either Project → Files or the Creative Workspace) creates a NEW
 * `ProjectFile` doc rather than mutating the old one — `assetGroupId`
 * stays constant across every version of the same asset (defaults to
 * the doc's own `id` for a version-1 upload), `previousVersionId`
 * chains back to the prior version, and `isLatestVersion` marks
 * exactly one doc per group current. This keeps reviews (which
 * target a single file doc by id) and Downloads (which filters
 * `reviewStatus === "approved"`) working unchanged per-version,
 * instead of needing a second embedded-versions schema.
 */
/**
 * "restricted" (default, or the field is simply absent on older docs) —
 * only real project members can open this file, exactly as before this
 * feature existed. "organization" — any signed-in member of the file's
 * OWN workspace can open it via the share link even without being a
 * project member (workspace membership bypasses project membership for
 * this one file only). "anyone" — the link works with no sign-in at all,
 * like an unauthenticated Google Sheets link — see firestore.rules'
 * `isSharedFile()` for the actual enforcement; this type only shapes
 * what the Share dialog writes.
 */
export type FileShareVisibility = "restricted" | "organization" | "anyone";

/** "view" — read-only. "comment" — can also add comments/markers/annotations, same as Krock's reviewer role; never full edit (no new versions, no delete, no settings). */
export type FileSharePermission = "view" | "comment";

export interface FileShareSettings {
  visibility: FileShareVisibility;
  permission: FileSharePermission;
  /** Unguessable id embedded in the share URL (/share/{shareToken}) — regenerated whenever visibility flips back to "restricted" then re-enabled, so an old copied link stops working. */
  shareToken: string;
  updatedAt: string;
  updatedBy: ID;
}

/**
 * `file_shares/{shareToken}` — a minimal, ID-keyed lookup doc kept in
 * sync with a file's own `shareSettings` (see updateFileShareSettings
 * in fileService.ts), mirroring the exact same pattern `workspace_slugs`
 * already uses for "look this opaque string up before you know which
 * tenant it belongs to."
 *
 * This exists because the public /share/[shareToken] page can't jump
 * straight to `files/{fileId}` — it doesn't know the fileId yet, only
 * the token, so it has to QUERY `files` by `shareSettings.shareToken`.
 * But firestore.rules' read gate for `files` also depends on
 * `workspaceId`/`projectId` (via canAccessProject), fields that query
 * doesn't filter on — Firestore requires every `resource.data` field a
 * list-query's rule touches to also be constrained by that query's own
 * `where` clauses, or it rejects the ENTIRE query outright (the same
 * class of bug this session already hit and fixed once for
 * `project_members`). A `get()` on a known document ID has no such
 * restriction, so the fix is the same one `workspace_slugs` already
 * uses: resolve the opaque token via a cheap, always-successful `get()`
 * on this tiny collection first (see firestore.rules — publicly
 * readable, since knowing fileId/workspaceId/projectId alone grants
 * nothing further; every other collection's real rules still apply),
 * THEN do a normal `get()` on the real `files/{fileId}` doc, which
 * evaluates isSharedFile() against real data with no compatibility
 * issue at all.
 */
export interface FileShareLookup {
  shareToken: string;
  fileId: ID;
  workspaceId: ID;
  projectId: ID;
}

export interface ProjectFile extends Timestamps {
  id: ID;
  workspaceId: ID;
  projectId: ID;
  fileName: string;
  originalName: string;
  contentType: string; // MIME type
  assetType: AssetType;
  sizeBytes: number;
  url: string;
  thumbnailUrl: string | null;
  storagePath: string;
  uploadedBy: TaskActor;
  reviewStatus: AssetStatus;
  /**
   * Workspace-configurable workflow label (references
   * WorkspaceSettings.assetOptions.statuses — see its doc comment in
   * settings.types.ts) shown in the Creative Review Workspace header's
   * Status dropdown. Deliberately separate from `reviewStatus` above,
   * which stays purely the Reviews/Downloads approval outcome.
   */
  statusId: string;
  stageId: ID | null;
  assetGroupId: ID;
  versionNumber: number;
  previousVersionId: ID | null;
  isLatestVersion: boolean;
  durationSeconds: number | null; // video/audio only, when known
  /** Null (or absent, on any file uploaded before this feature) means never shared — see FileShareSettings above. */
  shareSettings: FileShareSettings | null;
}

/**
 * A threaded comment on one version of a creative asset — the
 * Creative Workspace's review-comments panel. Lives in
 * `files/{fileId}/comments`, mirroring `tasks/{taskId}/comments`
 * (see commentService.ts) but scoped to a specific `version` so
 * comments made against v1 stay attributed to v1 even after v2 ships
 * (each version is its own `files` doc — see ProjectFile above — so
 * this subcollection is naturally version-isolated with no extra
 * filtering needed: a fresh v2 upload gets a brand-new empty
 * `comments` subcollection, v1's stays exactly as it was).
 *
 * `timestampSeconds`/`positionX`/`positionY`/`pageNumber` are all
 * optional/nullable — a general asset comment (no marker) leaves them
 * null; a video/audio comment sets `timestampSeconds` (and optionally
 * `positionX`/`positionY` for a position on that frame); an image
 * comment sets `positionX`/`positionY`; a PDF comment sets
 * `pageNumber`. `positionX`/`positionY` are normalized PERCENTAGES
 * (0–100, not 0–1) of the media's rendered width/height, not pixels,
 * so a marker stays correctly placed regardless of viewport size,
 * zoom level, or fullscreen state — see AnnotationOverlay.
 *
 * `markerNumber` is the stable, persisted "①②③" label shown on the
 * canvas and in the comments panel — assigned once by
 * fileCommentService.addAssetComment (never recomputed from array
 * position/index at render time, which would renumber on every
 * reorder/filter and break "the same marker keeps the same number
 * after refresh"). `null` for a comment created without a marker
 * (typed directly into the composer with no canvas click).
 */
export interface AssetComment extends Timestamps {
  id: ID;
  workspaceId: ID;
  projectId: ID;
  fileId: ID;
  version: number;
  authorId: ID;
  author: TaskActor;
  body: string;
  parentCommentId: ID | null;
  isResolved: boolean;
  resolvedBy: ID | null;
  resolvedAt: string | null;
  timestampSeconds: number | null;
  positionX: number | null;
  positionY: number | null;
  pageNumber: number | null;
  markerNumber: number | null;
}

/** Shape drawn on the review canvas — see AssetAnnotation. All coordinates are normalized 0–1 fractions, same convention as AssetComment.x/y. */
export type AnnotationType = "circle" | "rectangle" | "arrow" | "freehand" | "text";

export type AnnotationData =
  | { kind: "circle"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "rectangle"; x: number; y: number; width: number; height: number }
  | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "freehand"; points: { x: number; y: number }[] }
  | { kind: "text"; x: number; y: number; text: string };

/**
 * A drawn visual annotation (as opposed to a plain comment marker) on
 * one version of a creative asset. Lives in `files/{fileId}/annotations`
 * — a sibling subcollection to `files/{fileId}/comments`, same parent-
 * membership security model, but write access is author-only (no
 * shared "resolve" concept the way comments have).
 */
export interface AssetAnnotation extends Timestamps {
  id: ID;
  workspaceId: ID;
  projectId: ID;
  fileId: ID;
  version: number;
  authorId: ID;
  author: TaskActor;
  type: AnnotationType;
  data: AnnotationData;
  color: string; // CSS color string for the stroke/fill
  timestampSeconds: number | null;
  pageNumber: number | null;
}
