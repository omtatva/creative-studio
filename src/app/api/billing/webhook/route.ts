import { NextRequest, NextResponse } from "next/server";
import { applySubscriptionUpdate } from "@/lib/server/billingAdmin";
import type { SubscriptionStatus, BillingProvider } from "@/types/billing.types";
import type { WorkspacePlan } from "@/types/workspace.types";

export const runtime = "nodejs";

/**
 * Billing-provider webhook endpoint — the ONLY thing allowed to move a
 * subscription to a genuinely paid, `active` status (see
 * applySubscriptionUpdate). Not connected to a real provider yet — see
 * the implementation report's "remaining payment-provider
 * configuration" note — but the shape here is deliberately
 * provider-agnostic so wiring one up is a signature-verification swap,
 * not a rewrite:
 *
 *  - Stripe: verify `stripe-signature` header with
 *    `stripe.webhooks.constructEvent(rawBody, signature, secret)`,
 *    map `checkout.session.completed` / `customer.subscription.*` /
 *    `invoice.payment_failed` events to the body shape below.
 *  - Razorpay/Paddle: same idea, their own signature scheme.
 *
 * Until then, this checks a shared secret header instead of a real
 * signature — set BILLING_WEBHOOK_SECRET and have your provider (or a
 * manual test call) send it as `x-billing-webhook-secret`. Never
 * trusts a bare `workspaceId`/`planId` from an unauthenticated caller
 * without this check passing first.
 */
interface WebhookBody {
  workspaceId: string;
  planId: WorkspacePlan;
  status: SubscriptionStatus;
  billingProvider: BillingProvider;
  customerId?: string;
  subscriptionId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  trialStart?: string;
  trialEnd?: string;
}

export async function POST(request: NextRequest) {
  const secret = process.env.BILLING_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[billing/webhook] BILLING_WEBHOOK_SECRET is not configured — rejecting all webhook calls.");
    return NextResponse.json({ error: "Webhook isn't configured on the server yet." }, { status: 503 });
  }
  const providedSecret = request.headers.get("x-billing-webhook-secret");
  if (providedSecret !== secret) {
    console.error("[billing/webhook] rejected: missing or invalid x-billing-webhook-secret header.");
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.workspaceId || !body.planId || !body.status || !body.billingProvider) {
    return NextResponse.json({ error: "workspaceId, planId, status, and billingProvider are required." }, { status: 400 });
  }

  try {
    const subscription = await applySubscriptionUpdate(
      body.workspaceId,
      {
        planId: body.planId,
        status: body.status,
        billingProvider: body.billingProvider,
        customerId: body.customerId ?? null,
        subscriptionId: body.subscriptionId ?? null,
        currentPeriodStart: body.currentPeriodStart ?? null,
        currentPeriodEnd: body.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: body.cancelAtPeriodEnd ?? false,
        trialStart: body.trialStart ?? null,
        trialEnd: body.trialEnd ?? null,
      },
      null // no Firebase uid initiated this — it came from the billing provider itself
    );
    return NextResponse.json({ success: true, subscription });
  } catch (err) {
    console.error("[billing/webhook] failed to apply subscription update:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't apply the subscription update." }, { status: 500 });
  }
}
