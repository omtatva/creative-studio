import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { reserveSlot, resyncSlotCount, WorkspaceQuotaError } from "@/lib/server/workspaceQuota";
import { logPlatformAudit } from "@/lib/server/platformAudit";

export const runtime = "nodejs";

interface CreateProjectRequestBody {
  workspaceId: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  statusId: string;
  priorityId: string;
  startDate: string | null;
  dueDate: string | null;
  tags: string[];
  ownerDisplayName: string;
  ownerPhotoURL: string | null;
  ownerEmail: string;
}

/**
 * The ONLY way a `projects` document is ever created now — see
 * firestore.rules' `projects` collection, whose `create` rule is now
 * `if false`. Reused by projectService.ts's createProject AND
 * duplicateProject (the client computes the field values for each
 * case identically to before; only WHERE the document actually gets
 * written moved here). Cover image upload and the follow-up
 * project_members/activity-log/default-stage steps stay exactly where
 * they were — they're not security-sensitive and don't need to move.
 *
 * Never trusts workspaceId for authorization on its own: role is
 * re-checked here via the real `members/{workspaceId}_{uid}` doc,
 * mirroring the EXACT bar the old client-side create rule used
 * (owner/admin/member — a viewer cannot create). `ownerId`/`createdBy`
 * are always the server-verified uid, never a client-supplied value —
 * only display fields (name, photoURL, email) are trusted from the
 * client, since they carry no privilege.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed.", code: "WORKSPACE_ACCESS_DENIED" }, { status });
  }

  let body: CreateProjectRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { workspaceId, name } = body;
  if (!workspaceId || !name?.trim()) {
    return NextResponse.json({ error: "workspaceId and name are required." }, { status: 400 });
  }

  const memberSnap = await adminDb().collection("members").doc(`${workspaceId}_${uid}`).get();
  const role = memberSnap.exists ? (memberSnap.data()?.role as string | undefined) : undefined;
  if (!role || !["owner", "admin", "member"].includes(role)) {
    return NextResponse.json({ error: "You don't have permission to create projects in this workspace.", code: "INSUFFICIENT_ROLE" }, { status: 403 });
  }

  try {
    await reserveSlot(workspaceId, "project");
  } catch (err) {
    if (err instanceof WorkspaceQuotaError) {
      await logPlatformAudit({ actorUid: uid, action: "subscription_status_changed", workspaceId, details: { event: "project_creation_blocked_quota" } });
      return NextResponse.json({ error: err.message, code: err.code }, { status: 403 });
    }
    console.error("[projects/create] quota reservation failed:", err);
    return NextResponse.json({ error: "Couldn't verify this workspace's project quota. Try again in a moment.", code: "SUBSCRIPTION_INACTIVE" }, { status: 503 });
  }

  const projectRef = adminDb().collection("projects").doc();

  try {
    await projectRef.set({
      id: projectRef.id,
      workspaceId,
      name: name.trim(),
      description: body.description ?? "",
      coverImageUrl: null,
      color: body.color ?? "",
      icon: body.icon ?? "",
      statusId: body.statusId ?? "",
      priorityId: body.priorityId ?? "",
      startDate: body.startDate ?? null,
      dueDate: body.dueDate ?? null,
      ownerId: uid,
      members: [{ uid, displayName: body.ownerDisplayName || "Unknown", photoURL: body.ownerPhotoURL ?? null, email: body.ownerEmail || "", role: "owner" }],
      tags: body.tags ?? [],
      progress: 0,
      isArchived: false,
      archivedAt: null,
      favoritedBy: [],
      pinnedBy: [],
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[projects/create] project doc write failed after reserving a slot — releasing it:", err);
    // The slot was reserved but the actual project was never created —
    // resync (never a blind decrement, see workspaceQuota.ts) so this
    // failure doesn't permanently cost the workspace a slot.
    await resyncSlotCount(workspaceId, "project").catch((resyncErr) =>
      console.error("[projects/create] resync-after-failure also failed:", resyncErr)
    );
    return NextResponse.json({ error: "Couldn't create the project. Try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true, projectId: projectRef.id });
}
