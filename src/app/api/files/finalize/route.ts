import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyRequestAuth, AuthVerificationError, adminDb, adminStorage } from "@/lib/server/firebaseAdmin";
import { reserveStorageBytes, resyncSlotCount, WorkspaceQuotaError } from "@/lib/server/workspaceQuota";
import { isFeatureAllowed, featureDisabledBody } from "@/lib/server/featureAccess";
import type { MemberRole } from "@/types/workspace.types";
import { assetTypeFromContentType } from "@/lib/constants/creativeFiles";
import { DEFAULT_ASSET_STATUS_ID } from "@/lib/constants/assetOptions";

export const runtime = "nodejs";

interface FinalizeFileBody {
  workspaceId?: string;
  projectId?: string;
  fileId?: string;
  fileName?: string;
  contentType?: string;
  assetType?: string;
  storagePath?: string;
  /** Already minted client-side via getDownloadURL() right after the upload succeeded — not re-derived here, since only the BYTE SIZE (verified below via Storage metadata) matters for quota enforcement, not the URL itself. */
  url?: string;
  thumbnailUrl?: string | null;
  stageId?: string | null;
  assetGroupId?: string;
  versionNumber?: number;
  previousVersionId?: string | null;
  durationSeconds?: number | null;
  newVersionOfId?: string | null;
  uploadedBy?: { uid?: string; displayName?: string; photoURL?: string | null; email?: string };
}

/**
 * The ONLY way a Storage upload ever becomes a real, counted
 * `files/{id}` Firestore document now — see firestore.rules' `files`
 * collection, whose create rule is now `if false` (mirrors
 * `projects/{id}`'s create: if false pattern).
 *
 * SECURITY (audit Priority 4): raw bytes still upload directly from
 * the browser to Storage exactly as before (unchanged — this route
 * doesn't proxy file content, only finalizes the record afterward).
 * What changes is that a completed Storage upload no longer
 * automatically becomes a usable file: this route (a) reads the
 * OBJECT'S REAL size from Storage itself via the Admin SDK — never
 * the client-supplied `file.size`, which a malicious client could lie
 * about — and (b) atomically checks that size against the workspace's
 * LIVE-resolved storage quota (reserveStorageBytes, the same
 * transaction-atomic pattern reserveSlot already uses for
 * projects/members) before the Firestore doc is ever created. If the
 * quota would be exceeded, the just-uploaded object is deleted and the
 * request is rejected — the workspace never gains a real, visible file
 * from it. A client that skips this route entirely and uploads
 * directly to Storage produces an ORPHANED object with no Firestore
 * record: invisible and unusable in the app (no UI surfaces it, no
 * other member can reach it through any normal flow), which removes
 * the practical incentive to bypass this path. See workspaceQuota.ts's
 * file header for why storageBytesUsed is an absolute-resync counter,
 * never a blind decrement, on the release side.
 *
 * Disclosed, accepted trade-off: a client COULD still upload garbage
 * bytes directly to Storage without ever finalizing them, costing the
 * platform some Storage expense with zero benefit to the attacker
 * (pure vandalism, not a way to gain usable capacity) — cleaning up
 * such orphans would need a scheduled sweep (Cloud Function comparing
 * Storage objects against real Firestore file records), which is a
 * separate, larger piece of infrastructure not built in this pass.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed." }, { status });
  }

  let body: FinalizeFileBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { workspaceId, projectId, fileId, storagePath } = body;
  if (!workspaceId || !projectId || !fileId || !storagePath || !body.fileName || !body.url) {
    return NextResponse.json({ error: "workspaceId, projectId, fileId, fileName, url, and storagePath are required." }, { status: 400 });
  }
  // The claimed path must actually live under this workspace/project —
  // never trust it blindly, even though the object's own existence is
  // also independently verified below.
  const expectedPrefix = `workspaces/${workspaceId}/projects/${projectId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "storagePath doesn't match this workspace/project." }, { status: 400 });
  }

  // `url` / `thumbnailUrl` are stored and later rendered as <a href> /
  // <img src> / <video src> for every member who opens the file, so a
  // client-supplied value must be a real Firebase Storage download URL
  // for THIS bucket — never `javascript:`, `data:`, or an external
  // host (stored-link XSS / tracking-pixel vector). The main file's URL
  // must also point at the exact object being finalized.
  const bucketName = adminStorage().name;
  const isOwnBucketUrl = (value: string): URL | null => {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && u.hostname === "firebasestorage.googleapis.com" && u.pathname.startsWith(`/v0/b/${bucketName}/o/`) ? u : null;
    } catch {
      return null;
    }
  };
  const mainUrl = isOwnBucketUrl(body.url);
  const mainObjectPath = mainUrl ? decodeURIComponent(mainUrl.pathname.slice(`/v0/b/${bucketName}/o/`.length)) : null;
  if (!mainUrl || mainObjectPath !== storagePath) {
    return NextResponse.json({ error: "url must be this file's Firebase Storage download URL." }, { status: 400 });
  }
  if (body.thumbnailUrl && !isOwnBucketUrl(body.thumbnailUrl)) {
    return NextResponse.json({ error: "thumbnailUrl must be a Firebase Storage download URL." }, { status: 400 });
  }

  const [memberSnap, projectMemberSnap] = await Promise.all([
    adminDb().collection("members").doc(`${workspaceId}_${uid}`).get(),
    adminDb().collection("project_members").doc(`${projectId}_${uid}`).get(),
  ]);
  const workspaceRole = memberSnap.exists ? (memberSnap.data()?.role as string | undefined) : undefined;
  const isWorkspaceAdmin = workspaceRole === "owner" || workspaceRole === "admin";
  const projectRole = projectMemberSnap.exists ? (projectMemberSnap.data()?.role as string | undefined) : undefined;
  const canWrite = isWorkspaceAdmin || (projectMemberSnap.exists && projectRole !== "viewer");
  if (!canWrite) {
    // Say WHY, so a "no permission" report can be told apart instantly:
    // not in this workspace, a Viewer on the project, or simply never
    // added to the project.
    const reason = !memberSnap.exists
      ? "you're not a member of this workspace"
      : projectRole === "viewer"
        ? "your role on this project is Viewer"
        : "you haven't been added to this project";
    return NextResponse.json({ error: `You don't have permission to upload files to this project — ${reason}.`, code: "INSUFFICIENT_ROLE" }, { status: 403 });
  }

  // Super Admin's Feature Access matrix. A project-only collaborator with no
  // workspace member record is evaluated as an Employee. Feature permission is
  // necessary, not sufficient: the project-membership check above already ran.
  const featureId = body.newVersionOfId ? "files.uploadVersion" : "files.upload";
  if (!(await isFeatureAllowed((workspaceRole as MemberRole | undefined) ?? "member", featureId))) {
    // The bytes were already sent to Storage (Storage rules can't read the
    // matrix — this route is the authoritative gate), and no file record
    // will ever point at them. Remove the orphan, but ONLY if no existing
    // record owns that path, so a crafted storagePath can't delete a real file.
    try {
      const owned = await adminDb().collection("files").where("storagePath", "==", storagePath).limit(1).get();
      if (owned.empty) await adminStorage().file(storagePath).delete({ ignoreNotFound: true });
    } catch (cleanupErr) {
      console.error("[files/finalize] couldn't clean up upload denied by Feature Access:", cleanupErr);
    }
    return NextResponse.json(featureDisabledBody(featureId), { status: 403 });
  }

  // Verify the project actually belongs to this workspace — same
  // cross-check every other server route in this app applies before
  // trusting a client-supplied workspaceId/projectId pair together.
  const projectSnap = await adminDb().collection("projects").doc(projectId).get();
  if (!projectSnap.exists || projectSnap.data()?.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "This project doesn't belong to this workspace." }, { status: 400 });
  }

  // The REAL, authoritative size — read from the object itself, never
  // the client. If this 404s, the client claimed a path that was never
  // actually uploaded.
  let realSizeBytes: number;
  try {
    const [metadata] = await adminStorage().file(storagePath).getMetadata();
    realSizeBytes = Number(metadata.size ?? 0);
  } catch (err) {
    console.error("[files/finalize] couldn't read uploaded object metadata:", err);
    return NextResponse.json({ error: "Couldn't find the uploaded file. Try uploading again." }, { status: 404 });
  }

  try {
    await reserveStorageBytes(workspaceId, realSizeBytes);
  } catch (err) {
    if (err instanceof WorkspaceQuotaError) {
      // Reject the upload for real — an object nobody can ever
      // reach (no Firestore record will exist for it) left sitting in
      // Storage is pure waste, so clean it up rather than leave it.
      await adminStorage()
        .file(storagePath)
        .delete()
        .catch((deleteErr) => console.error("[files/finalize] failed to delete over-quota upload:", deleteErr));
      return NextResponse.json({ error: err.message, code: err.code }, { status: 403 });
    }
    console.error("[files/finalize] quota reservation failed:", err);
    // The object is already in Storage but will never get a file record
    // (so it would be unaccounted-for bytes) — remove it; the client
    // retries the whole upload.
    await adminStorage()
      .file(storagePath)
      .delete()
      .catch((deleteErr) => console.error("[files/finalize] failed to delete unrecorded upload:", deleteErr));
    return NextResponse.json({ error: "Couldn't verify this workspace's storage quota. Try again in a moment." }, { status: 503 });
  }

  const fileRef = adminDb().collection("files").doc(fileId);
  const now = FieldValue.serverTimestamp();

  try {
    await fileRef.set({
      id: fileId,
      workspaceId,
      projectId,
      fileName: body.fileName,
      originalName: body.fileName,
      contentType: body.contentType || "application/octet-stream",
      // Recomputed from the verified contentType/fileName, not trusted
      // from the client's own claim — a cheap, purely cosmetic
      // categorization, but there's no reason to trust it when it's
      // this easy to derive server-side from data already verified.
      assetType: assetTypeFromContentType(body.contentType || "application/octet-stream", body.fileName),
      sizeBytes: realSizeBytes,
      url: body.url,
      thumbnailUrl: body.thumbnailUrl ?? null,
      storagePath,
      uploadedBy: {
        uid,
        displayName: body.uploadedBy?.displayName || "Unknown",
        photoURL: body.uploadedBy?.photoURL ?? null,
        email: body.uploadedBy?.email || "",
      },
      reviewStatus: "none",
      statusId: DEFAULT_ASSET_STATUS_ID,
      stageId: body.stageId ?? null,
      assetGroupId: body.assetGroupId || fileId,
      versionNumber: body.versionNumber ?? 1,
      previousVersionId: body.previousVersionId ?? null,
      isLatestVersion: true,
      durationSeconds: body.durationSeconds ?? null,
      shareSettings: null,
      createdAt: now,
      updatedAt: now,
    });

    if (body.newVersionOfId) {
      await adminDb().collection("files").doc(body.newVersionOfId).update({ isLatestVersion: false, updatedAt: now });
    }

    // Keep the existing display counter in sync too — StorageUsage.tsx
    // and Settings > Storage read this field; storageBytesUsed above
    // (already updated by reserveStorageBytes) is the ENFORCEMENT
    // counter, this one is purely for the existing UI.
    await adminDb()
      .collection("settings")
      .doc(workspaceId)
      .set({ storage: { usedBytes: FieldValue.increment(realSizeBytes) } }, { merge: true });
  } catch (err) {
    console.error("[files/finalize] Firestore write failed after reserving storage — resyncing:", err);
    await resyncSlotCount(workspaceId, "storage").catch((resyncErr) =>
      console.error("[files/finalize] resync-after-failure also failed:", resyncErr)
    );
    return NextResponse.json({ error: "Couldn't finish saving this file. Try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true, fileId, sizeBytes: realSizeBytes });
}
