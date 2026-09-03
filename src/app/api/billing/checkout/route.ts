import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { applySubscriptionUpdate } from "@/lib/server/billingAdmin";
import { logPlatformAudit } from "@/lib/server/platformAudit";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { PLAN_LIMITS } from "@/lib/constants/planLimits";
import type { WorkspacePlan } from "@/types/workspace.types";

export const runtime = "nodejs";

const CHOOSABLE_PLANS: WorkspacePlan[] = ["starter", "pro", "business"];

/**
 * "Choose a plan" from Settings > Billing & Plan or the pricing page.
 * Enterprise is NOT choosable here — see Section 13/17: it only
 * activates after a sales conversation, via /api/billing/activate-enterprise.
 *
 * This is the billing-service abstraction's `createCheckoutSession`
 * (see billingService.ts on the client) — right now, with no real
 * payment provider connected, it can't actually charge anyone, so it
 * records the request as `status: "incomplete"` (which
 * resolveEntitlements treats as "stay on the free plan's limits until
 * this becomes active") and returns `checkoutUrl: null`. Once a real
 * provider is wired up, this function's body is the ONLY place that
 * needs to change — it would create a real hosted checkout session and
 * return its URL instead; every caller (the "Choose Plan" button)
 * already handles both "here's a URL, redirect the browser" and "no
 * URL, this was recorded" without knowing which one it's getting.
 *
 * A paid plan NEVER becomes `active` from this route — only a webhook
 * (or, right now, Super Admin manually confirming payment happened
 * out-of-band) can do that. See applySubscriptionUpdate's doc comment.
 *
 * When a real provider is connected: price/currency for `planId` MUST
 * be resolved here from PLAN_PRICING (server-side, trusted), never
 * accepted from the client even as a sanity-check value — the browser
 * may request a plan by id, never define what it costs.
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
    await enforceRateLimit(`billing-checkout:${uid}`, 10, 300);
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

  // Re-checked here with firebase-admin (bypassing rules) rather than
  // trusted from the client — the same "never trust plan=business sent
  // from the browser" bar every other billing route in this app holds
  // to.
  const memberSnapshot = await adminDb().collection("members").doc(`${workspaceId}_${uid}`).get();
  const role = memberSnapshot.exists ? (memberSnapshot.data()?.role as string | undefined) : undefined;
  if (!role || !["owner", "admin"].includes(role)) {
    return NextResponse.json({ error: "Only workspace owners and admins can change the plan." }, { status: 403 });
  }

  if (!(planId in PLAN_LIMITS)) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  const subscription = await applySubscriptionUpdate(
    workspaceId,
    { planId: planId as WorkspacePlan, status: "incomplete", billingProvider: "manual" },
    uid
  );

  await logPlatformAudit({ actorUid: uid, action: "subscription_status_changed", workspaceId, details: { event: "checkout_created", planId } });

  return NextResponse.json({
    success: true,
    checkoutUrl: null as string | null,
    subscription,
    message: "Your plan change has been recorded. It activates once payment is confirmed.",
  });
}
