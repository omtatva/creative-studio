import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyRequestAuth, AuthVerificationError, adminDb, adminStorage } from "@/lib/server/firebaseAdmin";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { resolveProjectAccess } from "@/lib/server/projectAccess";
import { resyncSlotCount } from "@/lib/server/workspaceQuota";

export const runtime = "nodejs";

/**
 * Permanently deletes ONE uploaded file (one version of an asset) — the way to remove a wrong video or an accidental duplicate.
 *
 * Authorization (re-derived here, never from the client): a signed-in user with PROJECT write access (not a project Viewer) who is
 * EITHER the person who uploaded the file OR a project owner/manager / workspace owner/admin. Workspace membership alone is not enough.
 *
 * What it cleans up, so nothing dangles and the plan's storage quota is given back:
 *  - the Storage object(s) for this file (the video and its thumbnail), the file record and its comments/annotations;
 *  - the file's id in its stage;
 *  - review links for the file are revoked (they can no longer open anything);
 *  - if it was the asset's latest version, the newest remaining version becomes the latest again;
 *  - the storage counter is recomputed from the real sum (an absolute resync, never a blind decrement).
 * Review rounds that referenced the file are kept as history. The deletion is audited.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed.", code: "UNAUTHORIZED" }, { status });
  }
  try {
    await enforceRateLimit(`file-delete:${uid}`, 60, 3600);
  } catch (err) {
    if (err instanceof RateLimitExceededError) return NextResponse.json({ error: err.message }, { status: 429 });
    return NextResponse.json({ error: "Couldn't delete this file. Try again." }, { status: 500 });
  }

  let body: { workspaceId?: unknown; fileId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body.workspaceId !== "string" || typeof body.fileId !== "string" || !body.workspaceId || !body.fileId) {
    return NextResponse.json({ error: "workspaceId and fileId are required." }, { status: 400 });
  }
  const { workspaceId, fileId } = body;

  try {
    const db = adminDb();
    const fileRef = db.collection("files").doc(fileId);
    const snap = await fileRef.get();
    const file = snap.data();
    if (!snap.exists || !file || file.workspaceId !== workspaceId) return NextResponse.json({ error: "File not found." }, { status: 404 });

    const access = await resolveProjectAccess(uid, workspaceId, file.projectId);
    if (!access.canRead) return NextResponse.json({ error: "File not found." }, { status: 404 });
    if (!access.canWrite) return NextResponse.json({ error: "You don't have permission to delete files in this project.", code: "INSUFFICIENT_ROLE" }, { status: 403 });
    const isUploader = file.uploadedBy?.uid === uid;
    if (!isUploader && !access.canManage) {
      return NextResponse.json({ error: "Only the person who uploaded this file, or a project manager or admin, can delete it.", code: "INSUFFICIENT_ROLE" }, { status: 403 });
    }

    const sizeBytes = Number(file.sizeBytes) || 0;
    const fileName = typeof file.fileName === "string" ? file.fileName : "a file";

    // 1) Storage: the file's own folder (video + thumbnail), only when it is exactly the expected per-file folder; else just the object.
    const expectedPrefix = `workspaces/${workspaceId}/projects/${file.projectId}/files/${fileId}/`;
    const bucket = adminStorage();
    try {
      if (typeof file.storagePath === "string" && file.storagePath.startsWith(expectedPrefix)) await bucket.deleteFiles({ prefix: expectedPrefix });
      else if (typeof file.storagePath === "string" && file.storagePath.startsWith(`workspaces/${workspaceId}/projects/${file.projectId}/`)) await bucket.file(file.storagePath).delete({ ignoreNotFound: true });
    } catch (err) {
      // Never block removing the record because an object was already gone; but report a real storage failure so it isn't silently orphaned.
      console.error("[files/delete] storage cleanup failed:", err instanceof Error ? err.message : err);
    }

    // 2) The record and its subcollections.
    for (const sub of ["comments", "annotations"]) {
      const docs = await fileRef.collection(sub).get();
      for (const d of docs.docs) await d.ref.delete();
    }
    await fileRef.delete();
    if (file.shareSettings?.shareToken) await db.collection("file_shares").doc(file.shareSettings.shareToken).delete().catch(() => undefined);

    // 3) Stage bookkeeping + review links.
    if (file.stageId) await db.collection("stages").doc(file.stageId).update({ fileIds: FieldValue.arrayRemove(fileId), updatedAt: FieldValue.serverTimestamp() }).catch(() => undefined);
    const shares = await db.collection("review_shares").where("fileId", "==", fileId).get();
    const now = new Date().toISOString();
    for (const s of shares.docs) {
      if (s.data().status === "active") await s.ref.update({ status: "revoked", revokedAt: now, revokedBy: uid, updatedAt: now });
    }

    // 4) If this was the asset's latest version, promote the newest remaining one.
    const groupId = (file.assetGroupId as string | undefined) || fileId;
    if (file.isLatestVersion !== false) {
      const rest = await db.collection("files").where("workspaceId", "==", workspaceId).where("assetGroupId", "==", groupId).get();
      const newest = rest.docs.sort((a, b) => (Number(b.data().versionNumber) || 0) - (Number(a.data().versionNumber) || 0))[0];
      if (newest) await newest.ref.update({ isLatestVersion: true, updatedAt: FieldValue.serverTimestamp() });
    }

    // 5) Give the quota back: display counter + an absolute resync of the authoritative counter.
    await db.collection("settings").doc(workspaceId).set({ storage: { usedBytes: FieldValue.increment(-sizeBytes) } }, { merge: true }).catch(() => undefined);
    await resyncSlotCount(workspaceId, "storage").catch((err) => console.error("[files/delete] storage resync failed (deletion already applied):", err instanceof Error ? err.message : err));

    // 6) Audit + activity feed (ids and the file name only).
    const actor = (await db.collection("members").doc(`${workspaceId}_${uid}`).get()).data();
    const actorName = (actor?.displayName as string | undefined) ?? "A teammate";
    try {
      const auditRef = db.collection("audit_logs").doc();
      await auditRef.set({
        id: auditRef.id, workspaceId, userId: uid, userName: actorName, action: "file_deleted", targetType: "file", targetId: fileId,
        ipAddress: "Not recorded", userAgent: "server", previousValue: JSON.stringify({ fileName, versionNumber: file.versionNumber ?? 1, sizeBytes }), newValue: null, createdAt: now, updatedAt: now,
      });
      await db.collection("workspaces").doc(workspaceId).collection("activity_logs").add({ actorId: uid, actorName, action: `deleted "${fileName}"`, targetType: "file", targetId: fileId, createdAt: FieldValue.serverTimestamp() });
    } catch (err) {
      console.error("[files/delete] audit write failed (non-fatal):", err instanceof Error ? err.message : err);
    }

    return NextResponse.json({ success: true, freedBytes: sizeBytes });
  } catch (err) {
    console.error("[files/delete] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't delete this file. Try again.", code: "DELETE_FAILED" }, { status: 500 });
  }
}
