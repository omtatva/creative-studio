import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { sanitizeRichText } from "@/lib/utils/htmlSanitizer";

export const runtime = "nodejs";

/**
 * The ONLY way an existing task comment's bodyHtml is ever edited now
 * — see firestore.rules' `tasks/{taskId}/comments/{commentId}` update
 * rule, now `if false`. Author-only, matching the exact bar the old
 * client-side rule used (`resource.data.authorId == request.auth.uid`)
 * — re-verified here via a real Firestore read, never trusted from the
 * request body.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed." }, { status });
  }

  let body: { taskId?: string; commentId?: string; bodyHtml?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { taskId, commentId } = body;
  const bodyHtml = body.bodyHtml ?? "";
  if (!taskId || !commentId) {
    return NextResponse.json({ error: "taskId and commentId are required." }, { status: 400 });
  }
  if (typeof bodyHtml !== "string" || !bodyHtml.trim()) {
    return NextResponse.json({ error: "A comment body is required." }, { status: 400 });
  }

  const commentRef = adminDb().collection("tasks").doc(taskId).collection("comments").doc(commentId);
  const commentSnap = await commentRef.get();
  if (!commentSnap.exists) {
    return NextResponse.json({ error: "This comment no longer exists." }, { status: 404 });
  }
  if (commentSnap.data()?.authorId !== uid) {
    return NextResponse.json({ error: "You can only edit your own comments." }, { status: 403 });
  }

  const sanitized = sanitizeRichText(bodyHtml);
  await commentRef.update({ bodyHtml: sanitized, isEdited: true, updatedAt: FieldValue.serverTimestamp() });

  return NextResponse.json({ success: true, bodyHtml: sanitized });
}
