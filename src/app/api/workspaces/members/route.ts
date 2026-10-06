import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifySuperAdminAuth, AuthVerificationError, adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { resyncSlotCount } from "@/lib/server/workspaceQuota";
import { logPlatformAudit } from "@/lib/server/platformAudit";

export const runtime = "nodejs";

type MemberAction = "change_role" | "set_disabled" | "remove";

interface MemberAdminBody {
  workspaceId?: string;
  /** The member being administered (their Firebase uid). */
  uid?: string;
  action?: MemberAction;
  role?: string;
  disabled?: boolean;
}

/** An invite can grant exactly these — Owner is never assignable (same bar as workspace_invites' own rule). */
const ASSIGNABLE_ROLES = ["admin", "member", "viewer"];

/**
 * WORKSPACE MEMBER ADMINISTRATION — change role, disable/restore,
 * remove — SUPER ADMIN ONLY.
 *
 * These used to be direct client writes to `members/{workspaceId}_{uid}`
 * authorized only by Firestore rules (workspace owner/admin), which
 * made the rules the only boundary and hid nothing from a determined
 * owner/admin calling Firestore directly. Membership administration is
 * a platform operation: this route is now the ONLY path (firestore.rules
 * makes `members` update/delete server-only), and it authorizes with the
 * existing Super Admin mechanism (verifySuperAdminAuth — the same one
 * every other Super Admin route uses), never the workspace Owner/Admin
 * role. A workspace owner/admin/employee calling it directly gets 403.
 *
 * The workspace's own Owner can't be changed, disabled or removed
 * here — matching what the Users page always enforced in the UI, now
 * enforced where it can't be bypassed.
 */
export async function POST(request: NextRequest) {
  let actorUid: string;
  try {
    ({ uid: actorUid } = await verifySuperAdminAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 403;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Not authorized." }, { status });
  }

  try {
    await enforceRateLimit(`member-admin:${actorUid}`, 60, 60);
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  let body: MemberAdminBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { workspaceId, uid, action } = body;
  if (!workspaceId || !uid || (action !== "change_role" && action !== "set_disabled" && action !== "remove")) {
    return NextResponse.json({ error: "workspaceId, uid and a valid action are required." }, { status: 400 });
  }
  if (action === "change_role" && (typeof body.role !== "string" || !ASSIGNABLE_ROLES.includes(body.role))) {
    return NextResponse.json({ error: "role must be admin, member, or viewer." }, { status: 400 });
  }
  if (action === "set_disabled" && typeof body.disabled !== "boolean") {
    return NextResponse.json({ error: "disabled must be true or false." }, { status: 400 });
  }

  const memberRef = adminDb().collection("members").doc(`${workspaceId}_${uid}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    return NextResponse.json({ error: "Member not found in this workspace." }, { status: 404 });
  }
  const member = memberSnap.data() as { role?: string; displayName?: string };
  if (member.role === "owner") {
    return NextResponse.json({ error: "A workspace's owner can't be changed, disabled, or removed here." }, { status: 403 });
  }

  let summary: string;
  if (action === "change_role") {
    await memberRef.update({ role: body.role, updatedAt: FieldValue.serverTimestamp() });
    summary = `changed ${member.displayName ?? "a member"}'s role to ${body.role}`;
  } else if (action === "set_disabled") {
    await memberRef.update({ status: body.disabled ? "suspended" : "active", updatedAt: FieldValue.serverTimestamp() });
    summary = `${body.disabled ? "disabled" : "re-enabled"} ${member.displayName ?? "a member"}`;
  } else {
    await memberRef.delete();
    summary = `removed ${member.displayName ?? "a member"} from the workspace`;
    // Removal frees a member slot — recompute from the real aggregate
    // (never a blind decrement; see workspaceQuota.ts). Best-effort: the
    // removal itself has already succeeded.
    await resyncSlotCount(workspaceId, "member").catch((err) =>
      console.error("[workspaces/members] member-count resync failed (removal already applied):", err instanceof Error ? err.message : err)
    );
  }

  // The workspace's own activity feed (same shape the client's
  // logActivity wrote) and the platform audit trail.
  const actor = await adminAuth().getUser(actorUid).catch(() => null);
  await adminDb()
    .collection("workspaces")
    .doc(workspaceId)
    .collection("activity_logs")
    .add({
      actorId: actorUid,
      actorName: actor?.displayName || actor?.email || "Super Admin",
      action: summary,
      targetType: "member",
      targetId: uid,
      createdAt: FieldValue.serverTimestamp(),
    })
    .catch((err) => console.error("[workspaces/members] activity log failed:", err instanceof Error ? err.message : err));
  await logPlatformAudit({
    actorUid,
    action: "member_administered",
    workspaceId,
    details: { event: action, targetUid: uid, role: action === "change_role" ? body.role : undefined, disabled: action === "set_disabled" ? body.disabled : undefined },
  });

  return NextResponse.json({ success: true });
}
