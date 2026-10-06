import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { applySubscriptionUpdate, getSubscriptionAdmin, planRequestDecision } from "@/lib/server/billingAdmin";
import { logPlatformAudit } from "@/lib/server/platformAudit";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { notifyPurchaseRequest } from "@/lib/server/billingNotify";
import { mergePlanConfig } from "@/lib/planConfig";
import type { PlatformPlanConfig } from "@/types/platformConfig.types";
import type { WorkspacePlan } from "@/types/workspace.types";

export const runtime = "nodejs";

const CHOOSABLE_PLANS: WorkspacePlan[] = ["starter", "pro", "business"];

/**
 * Changing an ALREADY-active subscription's plan (upgrade or
 * downgrade) — distinct from /api/billing/checkout (first-time choice
 * on an incomplete/free subscription) because a downgrade needs a real
 * safety check first: Section 20's "if downgrading would violate
 * limits, warn the owner... do not silently remove users/projects."
 * If current usage already exceeds the target plan's limits, this
 * rejects with a clear, specific reason instead of applying anything —
 * the owner has to remove members/projects (or pick a different plan)
 * before the change can go through.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed." }, { status });
  }

  try {
    await enforceRateLimit(`billing-change-plan:${uid}`, 10, 300);
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  let body: { workspaceId?: string; planId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { workspaceId, planId } = body;
  if (!workspaceId || !planId || !CHOOSABLE_PLANS.includes(planId as WorkspacePlan)) {
    return NextResponse.json({ error: "A valid workspaceId and planId are required." }, { status: 400 });
  }

  const memberSnapshot = await adminDb().collection("members").doc(`${workspaceId}_${uid}`).get();
  const role = memberSnapshot.exists ? (memberSnapshot.data()?.role as string | undefined) : undefined;
  if (!role || !["owner", "admin"].includes(role)) {
    return NextResponse.json({ error: "Only workspace owners and admins can change the plan." }, { status: 403 });
  }

  const [existing, planConfigSnap, memberCountSnap, projectCountSnap] = await Promise.all([
    getSubscriptionAdmin(workspaceId),
    adminDb().collection("platform_config").doc("plans").get(),
    adminDb().collection("members").where("workspaceId", "==", workspaceId).count().get(),
    adminDb().collection("projects").where("workspaceId", "==", workspaceId).where("isArchived", "==", false).count().get(),
  ]);
  // SECURITY (audit Priority 8): resolved from the LIVE, Super-Admin-
  // editable platform_config/plans doc (the same mergePlanConfig
  // function resolveEntitlements/workspaceQuota.ts use) rather than
  // the static PLAN_LIMITS constant — a Super Admin editing a plan's
  // limits via Super Admin > Plans used to have no effect on this
  // specific downgrade-safety check until the next deploy, which could
  // let a downgrade proceed against limits nobody currently intends.
  const targetLimits = mergePlanConfig(planConfigSnap.exists ? (planConfigSnap.data() as PlatformPlanConfig) : null).limits[
    planId as WorkspacePlan
  ];
  const memberCount = memberCountSnap.data().count;
  const projectCount = projectCountSnap.data().count;

  const violations: string[] = [];
  if (Number.isFinite(targetLimits.maxMembers) && memberCount > targetLimits.maxMembers) {
    violations.push(`You currently have ${memberCount} members, but ${planId} allows ${targetLimits.maxMembers}.`);
  }
  if (Number.isFinite(targetLimits.maxProjects) && projectCount > targetLimits.maxProjects) {
    violations.push(`You currently have ${projectCount} active projects, but ${planId} allows ${targetLimits.maxProjects}.`);
  }

  if (violations.length > 0) {
    return NextResponse.json(
      {
        error: "This plan can't be applied yet.",
        violations,
        resolution: "Archive projects, or contact support to adjust your team, to fit the new plan's limits, then try again.",
      },
      { status: 409 }
    );
  }

  // Shared with /api/billing/checkout (see planRequestDecision): a
  // LIVE entitlement — actively paying, or inside a trial that hasn't
  // expired — is never interrupted by a plan request; only
  // `requestedPlanId` is recorded. A duplicate (same checkout already
  // started and awaiting payment) returns the existing record without
  // a second write or purchase-request email.
  const decision = planRequestDecision(existing, planId as WorkspacePlan);
  const hasLiveEntitlement = decision.hasLiveEntitlement;

  if (decision.isDuplicate && existing) {
    return NextResponse.json({
      success: true,
      duplicate: true,
      subscription: existing,
      message: "Checkout for this plan is already started. It activates once payment is confirmed.",
    });
  }

  // No real payment provider yet. Once a provider is connected, an
  // UPGRADE could stay this simple (redirect to a proration checkout)
  // while a DOWNGRADE the provider itself schedules for the next
  // renewal — that logic lives entirely in this one route, not spread
  // across the UI.
  const subscription = await applySubscriptionUpdate(workspaceId, decision.patch, uid);

  // Free needs no payment: resolved directly, no purchase request or email.
  if (decision.isFreeSelection) {
    await logPlatformAudit({ actorUid: uid, action: "subscription_status_changed", workspaceId, details: { event: "free_plan_selected", planId } });
    return NextResponse.json({ success: true, subscription, message: "You're on the Free plan." });
  }

  await logPlatformAudit({ actorUid: uid, action: "subscription_status_changed", workspaceId, details: { event: "plan_change_requested", planId } });

  const workspaceSnap = await adminDb().collection("workspaces").doc(workspaceId).get();
  await notifyPurchaseRequest({
    workspaceId,
    workspaceName: (workspaceSnap.data()?.name as string | undefined) ?? workspaceId,
    planId: planId as WorkspacePlan,
    event: "plan_change_requested",
    requestedByEmail: (memberSnapshot.data()?.email as string | undefined) ?? null,
  });

  return NextResponse.json({
    success: true,
    subscription,
    message: hasLiveEntitlement
      ? "Your request has been recorded. Your current plan is unaffected until payment is confirmed."
      : "Your plan change has been recorded. It activates once payment is confirmed.",
  });
}
