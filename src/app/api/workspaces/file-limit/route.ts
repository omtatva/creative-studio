import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyRequestAuth, verifySuperAdminAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { getWorkspaceEntitlements } from "@/lib/server/workspaceEntitlements";
import { MB } from "@/lib/constants/uploadPolicy";

export const runtime = "nodejs";

/**
 * The workspace owner/admin's OWN per-file choice (Settings > Storage > "Maximum size of a single file", stored as settings.storage.maxFileSizeMb).
 * This is workspace CONFIGURATION, kept apart from the entitlement: it can only LOWER the limit, so a value above the workspace's ceiling
 * (min of the platform safety ceiling and its per-file entitlement) is REJECTED here with 400 FILE_LIMIT_EXCEEDS_ENTITLEMENT — an owner
 * can't raise their own entitlement. (/api/files/finalize also caps at the same ceiling, so a direct write can't get around it.)
 * Body: { workspaceId, maxFileSizeMb: number | null }  — null clears the choice (the ceiling then applies).
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed." }, { status });
  }

  let body: { workspaceId?: unknown; maxFileSizeMb?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });

  let allowed = false;
  try {
    await verifySuperAdminAuth(request);
    allowed = true;
  } catch {
    const memberSnap = await adminDb().collection("members").doc(`${workspaceId}_${uid}`).get();
    const m = memberSnap.data();
    allowed = memberSnap.exists && m?.status !== "suspended" && (m?.role === "owner" || m?.role === "admin");
  }
  if (!allowed) return NextResponse.json({ error: "Only a workspace owner or admin can change this." }, { status: 403 });

  const requested = body.maxFileSizeMb;
  if (requested !== null && (typeof requested !== "number" || !Number.isFinite(requested) || requested < 1)) {
    return NextResponse.json({ error: "Enter a limit of at least 1 MB, or clear it." }, { status: 400 });
  }

  let entitlements;
  try {
    entitlements = await getWorkspaceEntitlements(workspaceId, { includeSeatDetails: false });
  } catch (err) {
    console.error("[workspaces/file-limit] resolution failed:", err);
    return NextResponse.json({ error: "Couldn't verify this workspace's entitlements. Try again in a moment." }, { status: 503 });
  }
  if (!entitlements) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  const mb = requested === null ? null : Math.round(requested);
  if (mb !== null && mb * MB > entitlements.files.workspaceCeilingBytes) {
    return NextResponse.json(
      { error: "That is more than this workspace is entitled to for a single file. A higher limit has to be granted by the platform.", code: "FILE_LIMIT_EXCEEDS_ENTITLEMENT", ceilingBytes: entitlements.files.workspaceCeilingBytes },
      { status: 400 }
    );
  }

  await adminDb().collection("settings").doc(workspaceId).set({ storage: { maxFileSizeMb: mb }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const fresh = await getWorkspaceEntitlements(workspaceId, { includeSeatDetails: false });
  return NextResponse.json({ success: true, entitlements: fresh });
}
