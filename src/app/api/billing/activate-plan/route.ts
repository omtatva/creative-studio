import { NextRequest, NextResponse } from "next/server";
import { verifySuperAdminAuth, AuthVerificationError } from "@/lib/server/firebaseAdmin";
import { activatePlanManually, getSubscriptionAdmin } from "@/lib/server/billingAdmin";
import { logPlatformAudit } from "@/lib/server/platformAudit";
import { PLAN_LIMITS } from "@/lib/constants/planLimits";
import type { WorkspacePlan } from "@/types/workspace.types";

export const runtime = "nodejs";

/**
 * Super-Admin-only MANUAL / COMPLIMENTARY activation of a workspace's
 * Free/Pro/Business plan. This records NO payment: the subscription
 * becomes `active` with `paymentStatus: "not_started"`, and Super
 * Admin shows it as "Complimentary / Manual" — never "Paid". Only a
 * verified payment-provider webhook event (see /api/billing/webhook)
 * can mark a subscription paid. Enterprise activation has its own
 * route (/api/billing/activate-enterprise) since that one is tied to
 * closing a specific sales lead.
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

  const previous = await getSubscriptionAdmin(workspaceId);
  const subscription = await activatePlanManually(workspaceId, planId as WorkspacePlan, superAdminUid);
  // Actor + timestamp are recorded by logPlatformAudit itself
  // (actorUid/createdAt). No "reason" field is captured: this route and
  // its Super Admin UI don't collect one today.
  await logPlatformAudit({
    actorUid: superAdminUid,
    action: "manual_plan_activation",
    workspaceId,
    details: {
      planId,
      previousPlanId: previous?.planId ?? null,
      previousStatus: previous?.status ?? null,
      billing: "manual_comp",
    },
  });
  return NextResponse.json({ success: true, subscription });
}
