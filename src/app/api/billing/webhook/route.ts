import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
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
 * applySubscriptionUpdate).
 *
 * ============================================================
 * STATUS (audit Priority 5, re-confirmed on every review of this
 * file): DEVELOPMENT-SAFE MODE ONLY. NOT connected to a real payment
 * provider. Do NOT enable real paid activation through this endpoint
 * until it is replaced with that provider's actual signature scheme.
 * ============================================================
 *
 * This intentionally does NOT invent a generic/fake signature
 * algorithm — that would be worse than no signature at all, since it
 * would look like real protection without providing any. Instead it
 * checks a shared secret (BILLING_WEBHOOK_SECRET) with a constant-time
 * comparison, which is real protection against a network attacker who
 * doesn't know the secret, but is NOT equivalent to verifying a
 * cryptographic signature tied to the specific payload — anyone who
 * DOES have the secret (a leak, a misconfigured client, a compromised
 * CI variable) can activate/modify ANY workspace's subscription. This
 * is acceptable ONLY as a manual-testing stand-in while no real money
 * moves through this app; it is explicitly NOT acceptable once a
 * payment provider is connected.
 *
 * What actually remains before this can safely accept real payments —
 * see this file's PR/commit for the full list, but concretely:
 *   - Pick a provider (Stripe, Razorpay, Paddle, ...).
 *   - Verify the RAW body (rawBody below is already read first, before
 *     JSON.parse, specifically so this is a drop-in swap later — a
 *     provider's HMAC is computed over the exact bytes it sent, and
 *     re-serializing JSON can produce a byte-for-byte different string
 *     that fails verification even for a genuine event) against that
 *     provider's own signature header, using that provider's own
 *     signing secret (Stripe: `stripe-signature` header +
 *     `stripe.webhooks.constructEvent`; Razorpay: `x-razorpay-signature`
 *     header + their documented HMAC-SHA256 scheme over the raw body;
 *     Paddle: their own documented mechanism) — NEVER a shared secret
 *     compared with `===`/`timingSafeEqual` the way this stand-in does.
 *   - Map that provider's real event shapes (Stripe's
 *     `checkout.session.completed`/`customer.subscription.*`/
 *     `invoice.payment_failed`, or the Razorpay/Paddle equivalents) to
 *     the WebhookBody shape below, using the provider's own event id
 *     as `eventId` and the provider's own event timestamp as
 *     `eventTimestamp` (both already required below).
 *   - Remove the shared-secret check entirely once real signature
 *     verification is in place — do not run both.
 *
 * Idempotency: `eventId` is required and is the ONLY thing that
 * decides whether an event has already been processed —
 * applySubscriptionUpdateIdempotent atomically checks-and-records it
 * in the same Firestore transaction that applies the subscription
 * patch, so a duplicate delivery of the identical event (providers
 * routinely retry) is a genuine no-op, not a second write racing the
 * first.
 *
 * Out-of-order protection: `eventTimestamp` (the provider's own event
 * time — every real provider supplies one) is required and compared
 * against the subscription's `lastEventTimestamp` inside the same
 * transaction — an event OLDER than one already applied is rejected
 * (recorded, not reapplied) rather than silently overwriting newer
 * state with stale data. See applySubscriptionUpdateIdempotent's doc
 * comment in billingAdmin.ts.
 */
interface WebhookBody {
  eventId: string;
  eventTimestamp: string;
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

/** Constant-time secret comparison — a plain `!==` leaks (in theory; network jitter makes this hard to exploit in practice, but there's no reason not to close it) how many leading bytes matched via response timing. */
function secretsMatch(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

export async function POST(request: NextRequest) {
  const secret = process.env.BILLING_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[billing/webhook] BILLING_WEBHOOK_SECRET is not configured — rejecting all webhook calls.");
    return NextResponse.json({ error: "Webhook isn't configured on the server yet." }, { status: 503 });
  }
  const providedSecret = request.headers.get("x-billing-webhook-secret");
  if (!providedSecret || !secretsMatch(providedSecret, secret)) {
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

  if (!body.eventId || !body.eventTimestamp || !body.workspaceId || !body.planId || !body.status || !body.billingProvider) {
    return NextResponse.json(
      { error: "eventId, eventTimestamp, workspaceId, planId, status, and billingProvider are required." },
      { status: 400 }
    );
  }
  if (Number.isNaN(new Date(body.eventTimestamp).getTime())) {
    return NextResponse.json({ error: "eventTimestamp must be a valid ISO date string." }, { status: 400 });
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
    const { subscription, duplicate, outOfOrder } = await applySubscriptionUpdateIdempotent(
      body.eventId,
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
      body.eventTimestamp
    );

    if (!duplicate) {
      await logPlatformAudit({
        actorUid: "billing-webhook",
        action: "subscription_status_changed",
        workspaceId: body.workspaceId,
        details: {
          eventId: body.eventId,
          planId: body.planId,
          status: body.status,
          billingProvider: body.billingProvider,
          outOfOrder,
        },
      });
    }

    return NextResponse.json({ success: true, subscription, duplicate, outOfOrder, developmentSafeMode: true });
  } catch (err) {
    console.error("[billing/webhook] failed to apply subscription update:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't apply the subscription update." }, { status: 500 });
  }
}
