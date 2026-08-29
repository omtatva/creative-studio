import { NextRequest, NextResponse } from "next/server";
import { verifySuperAdminAuth, AuthVerificationError } from "@/lib/server/firebaseAdmin";
import { activatePlanManually } from "@/lib/server/billingAdmin";
import { logPlatformAudit } from "@/lib/server/platformAudit";
import { PLAN_LIMITS } from "@/lib/constants/planLimits";
import type { WorkspacePlan } from "@/types/workspace.types";

export const runtime = "nodejs";

/**
 * Super-Admin-only manual confirmation that a workspace's Free/Pro/
 * Business subscription is genuinely active — the stand-in for a
 * payment-provider webhook until one is connected (see
 * /api/billing/webhook's doc comment). Use this to confirm a payment
 * that happened outside the app (bank transfer, an invoice paid
 * directly, a sales-assisted deal that isn't Enterprise) without
 * waiting on real payment-provider integration. Enterprise activation
 * has its own route (/api/billing/activate-enterprise) since that one
 * is tied to closing a specific sales lead.
 */
export async function POST(request: NextRequest) {
  let superAdminUid: string;
  try {
    ({ uid: superAdminUid } = await verifySuperAdminAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 403;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Not authorized." }, { status });
  }

  let body: { workspaceId?: string; planId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { workspaceId, planId } = body;
  if (!workspaceId || !planId || !(planId in PLAN_LIMITS)) {
    return NextResponse.json({ error: "A valid workspaceId and planId are required." }, { status: 400 });
  }

  const subscription = await activatePlanManually(workspaceId, planId as WorkspacePlan, superAdminUid);
  await logPlatformAudit({ actorUid: superAdminUid, action: "plan_activated", workspaceId, details: { planId } });
  return NextResponse.json({ success: true, subscription });
}
