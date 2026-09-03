import { NextRequest, NextResponse } from "next/server";
import { applySubscriptionUpdateIdempotent } from "@/lib/server/billingAdmin";
import { logPlatformAudit } from "@/lib/server/platformAudit";
import { PLAN_LIMITS } from "@/lib/constants/planLimits";
import type { SubscriptionStatus, BillingProvider } from "@/types/billing.types";
import type { WorkspacePlan } from "@/types/workspace.types";

export const runtime = "nodejs";

const VALID_STATUSES: SubscriptionStatus[] = ["trialing", "active", "past_due", "canceled", "incomplete", "paused"];
const VALID_PROVIDERS: BillingProvider[] = ["manual", "stripe", "razorpay", "paddle"];

/**
 * Billing-provider webhook endpoint — the ONLY thing allowed to move a
 * subscription to a genuinely paid, `active` status (see
 * applySubscriptionUpdate). Not connected to a real provider yet — see
 * the implementation report's "remaining payment-provider
 * configuration" note — but the shape here is deliberately
 * provider-agnostic so wiring one up is a signature-verification swap,
 * not a rewrite:
 *
 *  - Stripe: verify the `stripe-signature` header against the RAW body
 *    text below (never the re-parsed JSON — Stripe's HMAC is computed
 *    over the exact bytes it sent, and re-serializing JSON can produce
 *    a byte-for-byte different string that fails verification even
 *    for a genuine event) with `stripe.webhooks.constructEvent(rawBody,
 *    signature, secret)`. Map `checkout.session.completed` /
 *    `customer.subscription.*` / `invoice.payment_failed` events to
 *    the body shape below, using Stripe's own event `id` as `eventId`.
 *  - Razorpay/Paddle: same idea, their own signature scheme, same raw-
 *    body requirement, same idea of using the provider's own event id.
 *
 * Until a provider is connected, this checks a shared secret header
 * instead of a real signature — set BILLING_WEBHOOK_SECRET and have
 * your provider (or a manual test call) send it as
 * `x-billing-webhook-secret`. Never trusts a bare
 * `workspaceId`/`planId`/`status` from an unauthenticated caller
 * without this check passing first, and validates both against the
 * trusted enums below rather than writing whatever string arrives.
 *
 * Idempotency: `eventId` is required and is the ONLY thing that
 * decides whether an event has already been processed —
 * applySubscriptionUpdateIdempotent atomically checks-and-records it
 * in the same Firestore transaction that applies the subscription
 * patch, so a duplicate delivery of the identical event (providers
 * routinely retry) is a genuine no-op, not a second write racing the
 * first.
 *
 * NOT yet implemented (disclosed, not silently skipped): out-of-order
 * delivery protection (an OLDER event arriving late and overwriting a
 * newer already-applied state) — that needs the real provider's own
 * event timestamp/sequence to do correctly, which doesn't exist until
 * one is connected. See the security report's residual-risk list.
 */
interface WebhookBody {
  eventId: string;
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
    // Deliberately no header/body contents logged here — only that a
    // rejection happened.
    console.error("[billing/webhook] rejected: missing or invalid x-billing-webhook-secret header.");
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  // Read the raw text FIRST, parse second — see the doc comment above
  // on why a real provider's signature must be verified against these
  // exact bytes, not a re-serialized object. Once a real provider is
  // connected, its signature check replaces the shared-secret check
  // above and reads this same `rawBody` variable.
  const rawBody = await request.text();
  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.eventId || !body.workspaceId || !body.planId || !body.status || !body.billingProvider) {
    return NextResponse.json({ error: "eventId, workspaceId, planId, status, and billingProvider are required." }, { status: 400 });
  }
  if (!(body.planId in PLAN_LIMITS)) {
    console.error("[billing/webhook] rejected: unknown planId", { eventId: body.eventId, planId: body.planId });
    return NextResponse.json({ error: "Unknown planId." }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(body.status)) {
    console.error("[billing/webhook] rejected: unknown status", { eventId: body.eventId, status: body.status });
    return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  }
  if (!VALID_PROVIDERS.includes(body.billingProvider)) {
    console.error("[billing/webhook] rejected: unknown billingProvider", { eventId: body.eventId, billingProvider: body.billingProvider });
    return NextResponse.json({ error: "Unknown billingProvider." }, { status: 400 });
  }

  try {
    const { subscription, duplicate } = await applySubscriptionUpdateIdempotent(body.eventId, body.workspaceId, {
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
    });

    if (!duplicate) {
      await logPlatformAudit({
        actorUid: "billing-webhook",
        action: "subscription_status_changed",
        workspaceId: body.workspaceId,
        details: { eventId: body.eventId, planId: body.planId, status: body.status, billingProvider: body.billingProvider },
      });
    }

    return NextResponse.json({ success: true, subscription, duplicate });
  } catch (err) {
    console.error("[billing/webhook] failed to apply subscription update:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't apply the subscription update." }, { status: 500 });
  }
}
