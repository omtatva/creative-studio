import { NextRequest, NextResponse } from "next/server";
import { verifySuperAdminAuth, AuthVerificationError } from "@/lib/server/firebaseAdmin";
import { applySubscriptionUpdate } from "@/lib/server/billingAdmin";
import { logPlatformAudit } from "@/lib/server/platformAudit";
import type { SubscriptionStatus } from "@/types/billing.types";

export const runtime = "nodejs";

// The three states Super Admin can force directly from Billing >
// Subscriptions — "Suspend" and "Cancel" both stop entitlements
// (resolveEntitlements only treats trialing/active as entitled — see
// entitlements.ts), "Reactivate" restores them. Anything else
// (incomplete, past_due, trialing) only ever comes from a real
// checkout/webhook flow, not a manual admin toggle.
const ALLOWED_STATUSES: SubscriptionStatus[] = ["active", "paused", "canceled"];

/**
 * Super-Admin-only: suspend / reactivate / cancel a customer's
 * subscription directly, independent of any payment provider — for
 * troubleshooting ("customer paid but the provider never confirmed
 * it") or policy enforcement (abuse, non-payment outside the
 * provider). Does not touch billingProvider/customerId/subscriptionId
 * — those stay whatever they already were.
 */
export async function POST(request: NextRequest) {
  let superAdminUid: string;
  try {
    ({ uid: superAdminUid } = await verifySuperAdminAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 403;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Not authorized." }, { status });
  }

  let body: { workspaceId?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { workspaceId, status } = body;
  if (!workspaceId || !status || !ALLOWED_STATUSES.includes(status as SubscriptionStatus)) {
    return NextResponse.json({ error: "A valid workspaceId and status (active/paused/canceled) are required." }, { status: 400 });
  }

  const subscription = await applySubscriptionUpdate(workspaceId, { status: status as SubscriptionStatus }, superAdminUid);
  await logPlatformAudit({ actorUid: superAdminUid, action: "subscription_status_changed", workspaceId, details: { status } });
  return NextResponse.json({ success: true, subscription });
}
