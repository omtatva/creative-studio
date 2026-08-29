import { NextRequest, NextResponse } from "next/server";
import { verifySuperAdminAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { activatePlanManually } from "@/lib/server/billingAdmin";
import { logPlatformAudit } from "@/lib/server/platformAudit";
import type { WorkspacePlanLimits } from "@/types/workspace.types";

export const runtime = "nodejs";

/**
 * "Create / Activate Enterprise Subscription" — the ONLY way an
 * Enterprise plan ever turns on (see Section 17/18: never automatic
 * just because the Contact Sales form was submitted). Super-Admin-only
 * (verifySuperAdminAuth — the same platform-role check as every other
 * cross-workspace admin action in this app, not a new admin concept),
 * called from the Sales Lead detail page's "Mark Won" flow.
 *
 * Supports Enterprise's per-customer negotiated limits (Section 18) via
 * `customEntitlements` — a partial override merged onto
 * PLAN_LIMITS.enterprise by resolveEntitlements, so two Enterprise
 * customers can have completely different maxMembers/maxProjects/etc.
 * without needing separate plan ids.
 */
export async function POST(request: NextRequest) {
  let superAdminUid: string;
  try {
    ({ uid: superAdminUid } = await verifySuperAdminAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 403;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Not authorized." }, { status });
  }

  let body: { leadId?: string; workspaceId?: string; customEntitlements?: Partial<WorkspacePlanLimits> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { leadId, workspaceId, customEntitlements } = body;
  if (!leadId || !workspaceId) {
    return NextResponse.json({ error: "leadId and workspaceId are required." }, { status: 400 });
  }

  const leadRef = adminDb().collection("sales_leads").doc(leadId);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) {
    return NextResponse.json({ error: "This sales lead no longer exists." }, { status: 404 });
  }

  const workspaceSnap = await adminDb().collection("workspaces").doc(workspaceId).get();
  if (!workspaceSnap.exists) {
    return NextResponse.json({ error: "This workspace doesn't exist." }, { status: 404 });
  }

  const subscription = await activatePlanManually(workspaceId, "enterprise", superAdminUid, customEntitlements ?? null);

  await leadRef.update({
    status: "won",
    activatedWorkspaceId: workspaceId,
    updatedAt: new Date().toISOString(),
  });

  await logPlatformAudit({
    actorUid: superAdminUid,
    action: "enterprise_activated",
    workspaceId,
    details: { leadId, customEntitlements: customEntitlements ?? null },
  });

  return NextResponse.json({ success: true, subscription });
}
