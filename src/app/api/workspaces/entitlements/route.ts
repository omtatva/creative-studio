import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, verifySuperAdminAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { getWorkspaceEntitlements } from "@/lib/server/workspaceEntitlements";

export const runtime = "nodejs";

/**
 * READ-ONLY resolved entitlements + usage for one workspace — the single policy the uploader, Settings, the dashboard and Super Admin all read
 * (see types/entitlements.types.ts). It cannot change anything.
 *   - The platform Super Admin can read ANY workspace (without being a member of it, so it never takes a seat).
 *   - An ACTIVE member of a workspace can read that workspace's storage and per-file policy (they need it to upload); only an Owner/Admin also
 *     gets the seat breakdown (`members`).
 *   - Anyone else, and disabled members, get 403.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed." }, { status });
  }

  let body: { workspaceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });

  let isSuperAdmin = false;
  try {
    await verifySuperAdminAuth(request);
    isSuperAdmin = true;
  } catch {
    isSuperAdmin = false;
  }

  let seeSeats = isSuperAdmin;
  if (!isSuperAdmin) {
    const memberSnap = await adminDb().collection("members").doc(`${workspaceId}_${uid}`).get();
    const member = memberSnap.data();
    if (!memberSnap.exists || member?.status === "suspended" || member?.status === "invited") {
      return NextResponse.json({ error: "You aren't an active member of this workspace." }, { status: 403 });
    }
    seeSeats = member?.role === "owner" || member?.role === "admin";
  }

  try {
    const entitlements = await getWorkspaceEntitlements(workspaceId, { includeSeatDetails: seeSeats });
    if (!entitlements) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    return NextResponse.json({ entitlements, canEditOverrides: isSuperAdmin });
  } catch (err) {
    console.error("[workspaces/entitlements] resolution failed:", err);
    return NextResponse.json({ error: "Couldn't resolve this workspace's entitlements. Try again in a moment." }, { status: 503 });
  }
}
