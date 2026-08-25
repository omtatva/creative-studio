import { deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { fileCommentsCol, fileCommentDoc } from "@/lib/firebase/firestore";
import { logActivity } from "@/services/activityService";
import { AssetComment } from "@/types/file.types";
import { TaskActor } from "@/types/task.types";

/**
 * Comment CRUD for a creative asset's `files/{fileId}/comments`
 * subcollection — the Creative Workspace's review-comments panel.
 * Mirrors commentService.ts (task comments) in shape; kept as its
 * own module because it hangs off a different parent collection and
 * carries version/resolve/timestamp-marker semantics task comments
 * don't need.
 */

interface AddAssetCommentArgs {
  workspaceId: string;
  projectId: string;
  fileId: string;
  version: number;
  author: TaskActor;
  body: string;
  parentCommentId: string | null;
  /** Video/audio marker time, in seconds — null for a general (non-timestamped) comment. */
  timestampSeconds?: number | null;
  /** Normalized 0–100 percentage position on the frame/image — null when the comment has no on-canvas marker. */
  positionX?: number | null;
  positionY?: number | null;
  /** PDF page the comment was left on — null for non-PDF assets. */
  pageNumber?: number | null;
}

/**
 * Assigns the next marker number for THIS file (version) by reading
 * every existing comment on it and taking the highest `markerNumber`
 * seen + 1 — never the count/index of whatever's currently rendered,
 * which would shift if a comment were deleted or the list re-sorted.
 * Comments are per-version (own `files` doc + own `comments`
 * subcollection — see AssetComment's doc comment), so this is
 * automatically scoped to one version's numbering with no extra
 * filtering, and a fresh v2 always starts back at 1.
 */
async function nextMarkerNumber(fileId: string): Promise<number> {
  const snapshot = await getDocs(fileCommentsCol(fileId));
  let max = 0;
  snapshot.forEach((d) => {
    const n = d.data().markerNumber;
    if (typeof n === "number" && n > max) max = n;
  });
  return max + 1;
}

export async function addAssetComment({
  workspaceId,
  projectId,
  fileId,
  version,
  author,
  body,
  parentCommentId,
  timestampSeconds = null,
  positionX = null,
  positionY = null,
  pageNumber = null,
}: AddAssetCommentArgs): Promise<string> {
  const commentRef = doc(fileCommentsCol(fileId));

  // A comment only gets a visible marker number when it actually carries marker
  // context (a canvas position, a video timestamp, or a PDF page) — a plain
  // reply or a freeform comment typed with no marker stays unnumbered.
  const hasMarker = positionX !== null || timestampSeconds !== null || pageNumber !== null;
  const markerNumber = hasMarker ? await nextMarkerNumber(fileId) : null;

  const comment: Omit<AssetComment, "createdAt" | "updatedAt"> = {
    id: commentRef.id,
    workspaceId,
    projectId,
    fileId,
    version,
    authorId: author.uid,
    author,
    body,
    parentCommentId,
    isResolved: false,
    resolvedBy: null,
    resolvedAt: null,
    timestampSeconds,
    positionX,
    positionY,
    pageNumber,
    markerNumber,
  };

  await setDoc(commentRef, { ...comment, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

  // Best-effort: a shared-link guest commenter (see FileShareSettings)
  // isn't a workspace member, so this write is denied by
  // activity_logs' own rules for them — that must not fail the comment
  // itself, which already succeeded above.
  try {
    await logActivity(workspaceId, {
      actorId: author.uid,
      actorName: author.displayName,
      action: parentCommentId
        ? "replied to a comment"
        : timestampSeconds !== null
          ? `commented on an asset at ${Math.floor(timestampSeconds / 60)}:${String(Math.floor(timestampSeconds % 60)).padStart(2, "0")}`
          : "commented on an asset",
      targetType: "file",
      targetId: fileId,
    });
  } catch (err) {
    console.error("[fileCommentService] activity log failed (non-fatal):", err);
  }

  return commentRef.id;
}

export async function resolveAssetComment(
  workspaceId: string,
  fileId: string,
  commentId: string,
  actor: TaskActor,
  isResolved = true
): Promise<void> {
  await updateDoc(fileCommentDoc(fileId, commentId), {
    isResolved,
    resolvedBy: isResolved ? actor.uid : null,
    resolvedAt: isResolved ? new Date().toISOString() : null,
    updatedAt: serverTimestamp(),
  });

  await logActivity(workspaceId, {
    actorId: actor.uid,
    actorName: actor.displayName,
    action: isResolved ? "resolved a comment" : "reopened a comment",
    targetType: "file",
    targetId: fileId,
  });
}

export async function editAssetComment(fileId: string, commentId: string, body: string): Promise<void> {
  const snapshot = await getDoc(fileCommentDoc(fileId, commentId));
  if (!snapshot.exists()) throw new Error("Comment not found.");
  await updateDoc(fileCommentDoc(fileId, commentId), { body, updatedAt: serverTimestamp() });
}

export async function deleteAssetComment(fileId: string, commentId: string): Promise<void> {
  await deleteDoc(fileCommentDoc(fileId, commentId));
}
