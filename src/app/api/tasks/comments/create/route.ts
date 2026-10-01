import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { sanitizeRichText } from "@/lib/utils/htmlSanitizer";

export const runtime = "nodejs";

interface CreateCommentBody {
  taskId?: string;
  bodyHtml?: string;
  mentionedUids?: string[];
  parentCommentId?: string | null;
  displayName?: string;
  photoURL?: string | null;
  email?: string;
}

/**
 * The ONLY way a task comment is ever created now — see
 * firestore.rules' `tasks/{taskId}/comments/{commentId}` create rule,
 * which is now `if false` (mirrors projects/{id}'s create: if false
 * pattern). See /api/tasks/description's doc comment for why: bodyHtml
 * is rich text rendered via dangerouslySetInnerHTML (CommentItem.tsx),
 * and a direct client write had no server-side content check at all.
 *
 * Authorization matches the EXACT bar the old client-side rule used —
 * canAccessProject (ANY project role, including viewer, can comment;
 * not canWriteProject) — never tightened or loosened as a side effect
 * of moving this server-side.
 *
 * `author`'s uid/authorId is ALWAYS the server-verified uid, never a
 * client-supplied value — displayName/photoURL/email are accepted from
 * the client (self-describing, not privilege-bearing, same trust level
 * as the profile fields already readable from the caller's own
 * account) purely for display.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  let tokenEmail: string | null;
  try {
    ({ uid, email: tokenEmail } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed." }, { status });
  }

  let body: CreateCommentBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { taskId } = body;
  const bodyHtml = body.bodyHtml ?? "";
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required." }, { status: 400 });
  }
  if (typeof bodyHtml !== "string" || !bodyHtml.trim()) {
    return NextResponse.json({ error: "A comment body is required." }, { status: 400 });
  }

  const taskRef = adminDb().collection("tasks").doc(taskId);
  const taskSnap = await taskRef.get();
  if (!taskSnap.exists) {
    return NextResponse.json({ error: "This task no longer exists." }, { status: 404 });
  }
  const task = taskSnap.data() as { workspaceId: string; projectId: string };

  const [memberSnap, projectMemberSnap] = await Promise.all([
    adminDb().collection("members").doc(`${task.workspaceId}_${uid}`).get(),
    adminDb().collection("project_members").doc(`${task.projectId}_${uid}`).get(),
  ]);
  const workspaceRole = memberSnap.exists ? (memberSnap.data()?.role as string | undefined) : undefined;
  const isWorkspaceAdmin = workspaceRole === "owner" || workspaceRole === "admin";
  const canAccess = isWorkspaceAdmin || projectMemberSnap.exists;
  if (!canAccess) {
    return NextResponse.json({ error: "You don't have permission to comment on this task." }, { status: 403 });
  }

  const sanitized = sanitizeRichText(bodyHtml);
  const mentionedUids = Array.isArray(body.mentionedUids) ? body.mentionedUids.filter((id) => typeof id === "string") : [];
  const commentRef = adminDb().collection("tasks").doc(taskId).collection("comments").doc();

  await commentRef.set({
    id: commentRef.id,
    authorId: uid,
    author: {
      uid,
      displayName: body.displayName || "Unknown",
      photoURL: body.photoURL ?? null,
      email: body.email || tokenEmail || "",
    },
    bodyHtml: sanitized,
    mentionedUids,
    parentCommentId: body.parentCommentId ?? null,
    isEdited: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await taskRef.update({ commentCount: FieldValue.increment(1) });

  return NextResponse.json({ success: true, commentId: commentRef.id, bodyHtml: sanitized });
}
