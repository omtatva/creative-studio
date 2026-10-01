import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { sanitizeRichText } from "@/lib/utils/htmlSanitizer";

export const runtime = "nodejs";

/**
 * The ONLY way a task's descriptionHtml is ever written now — see
 * firestore.rules' `tasks/{taskId}` update rule, which denies a direct
 * client change to this specific field (everything else on a task can
 * still be updated client-side as before).
 *
 * SECURITY (audit Priority 2): descriptionHtml is rich text authored
 * via a contentEditable editor (RichTextEditor.tsx) and rendered via
 * dangerouslySetInnerHTML (TaskOverviewTab.tsx) — a direct Firestore
 * write (the old path) had no server-side check on its CONTENT at all,
 * only on who could write. This route sanitizes it (sanitizeRichText)
 * before persisting, closing that stored-XSS path, while every other
 * field on a task keeps updating exactly as before.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed." }, { status });
  }

  let body: { taskId?: string; descriptionHtml?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { taskId } = body;
  const descriptionHtml = body.descriptionHtml ?? "";
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required." }, { status: 400 });
  }
  if (typeof descriptionHtml !== "string") {
    return NextResponse.json({ error: "descriptionHtml must be a string." }, { status: 400 });
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
  const projectRole = projectMemberSnap.exists ? (projectMemberSnap.data()?.role as string | undefined) : undefined;
  const canWrite = isWorkspaceAdmin || (projectMemberSnap.exists && projectRole !== "viewer");
  if (!canWrite) {
    return NextResponse.json({ error: "You don't have permission to edit this task." }, { status: 403 });
  }

  const sanitized = sanitizeRichText(descriptionHtml);

  await taskRef.update({ descriptionHtml: sanitized, updatedAt: FieldValue.serverTimestamp() });

  return NextResponse.json({ success: true, descriptionHtml: sanitized });
}
