import "server-only";
import { FieldValue, Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { resolveEntitlements, isTrialExpired, resolveTrialEnd } from "@/lib/entitlements";
import { mergePlanConfig } from "@/lib/planConfig";
import { DEFAULT_PLAN } from "@/lib/constants/planLimits";
import type { Workspace, WorkspacePlan, WorkspacePlanLimits } from "@/types/workspace.types";
import type { WorkspaceSubscription, SubscriptionStatus, BillingProvider } from "@/types/billing.types";
import type { PlatformPlanConfig } from "@/types/platformConfig.types";

type WorkspaceBillingCache = Pick<Workspace, "plan" | "limits" | "subscriptionStatus" | "pendingPlan" | "trialEnd">;

/**
 * The ONE place that turns a subscription record into the display
 * cache stored on `workspaces/{id}` (plan/limits/subscriptionStatus/
 * pendingPlan/trialEnd — all server-controlled, see firestore.rules).
 * Nothing authoritative reads this cache — resolveEntitlements does —
 * it exists so surfaces that only have the workspace doc can render
 * the right badge. Effective-state rules:
 *  - `incomplete` → "pending_payment": one consistent term for "paid
 *    plan requested, payment not complete", whether or not checkout
 *    has started (the subscription's `checkoutStatus` says which).
 *  - a `trialing` subscription whose trialEnd has passed → "expired"
 *    (the persisted subscription status stays `trialing`; nothing
 *    writes it on a timer — see entitlements.ts — so this is derived).
 *  - a pending request layered on a live entitlement (`requestedPlanId`)
 *    is mirrored into `pendingPlan` without touching the status.
 */
export function deriveWorkspaceBillingCache(
  sub: WorkspaceSubscription,
  planLimits: Record<WorkspacePlan, WorkspacePlanLimits>
): WorkspaceBillingCache {
  const { plan, limits } = resolveEntitlements(sub, planLimits);
  const subscriptionStatus: WorkspaceBillingCache["subscriptionStatus"] = isTrialExpired(sub)
    ? "expired"
    : sub.status === "incomplete"
      ? "pending_payment"
      : sub.status;
  return {
    plan,
    limits,
    subscriptionStatus,
    pendingPlan: sub.requestedPlanId ?? (sub.status === "incomplete" ? sub.planId : null),
    // The RESOLVED end (explicit trialEnd, else trialStart + trial
    // length for legacy records) — so a legacy workspace's cache gains a
    // real trialEnd the first time it's synced.
    trialEnd: sub.status === "trialing" ? resolveTrialEnd(sub) : null,
  };
}

function sameLimits(a: Partial<WorkspacePlanLimits> | undefined, b: WorkspacePlanLimits): boolean {
  if (!a) return false;
  const keys = ["maxMembers", "maxProjects", "maxStorageBytes", "maxAIRequestsPerMonth"] as const;
  return keys.every((k) => a[k] === b[k]) && [...(a.enabledFeatures ?? [])].sort().join(",") === [...b.enabledFeatures].sort().join(",");
}

function sameBillingCache(current: Partial<Workspace>, next: WorkspaceBillingCache): boolean {
  return (
    current.plan === next.plan &&
    current.subscriptionStatus === next.subscriptionStatus &&
    (current.pendingPlan ?? null) === (next.pendingPlan ?? null) &&
    (current.trialEnd ?? null) === (next.trialEnd ?? null) &&
    sameLimits(current.limits, next.limits)
  );
}

function subscriptionRef(workspaceId: string) {
  return adminDb().collection("workspaces").doc(workspaceId).collection("billing").doc("subscription");
}

function webhookEventRef(eventId: string) {
  return adminDb().collection("billing_webhook_events").doc(eventId);
}

export async function getSubscriptionAdmin(workspaceId: string): Promise<WorkspaceSubscription | null> {
  const snap = await subscriptionRef(workspaceId).get();
  return snap.exists ? (snap.data() as WorkspaceSubscription) : null;
}

/**
 * Server-only (admin SDK) writes to workspaces/{id}/billing/subscription
 * — the ONLY code allowed to touch that document at all (see its
 * firestore.rules block: client write is unconditionally denied). Every
 * caller here is itself an API route that has already independently
 * verified who's asking (verifyRequestAuth + a real role/Super-Admin
 * check, or the webhook's signature/shared-secret check) — this module
 * does the actual write, not the authorization decision.
 *
 * Runs as ONE Firestore transaction (subscription read+write, live
 * plan-config read, and the workspace cache update, together) so two
 * concurrent calls for the SAME workspace (e.g. a duplicate webhook
 * delivery, or a user double-clicking "Change Plan") can never produce
 * a lost update — Firestore automatically retries the loser against
 * the winner's already-committed state, producing one deterministic
 * final subscription rather than a race. This is what "ONE
 * authoritative subscription state" (Section 24) actually means in
 * Firestore terms: not a `runTransaction` per caller reinventing this,
 * but every caller going through this single function.
 */
export async function applySubscriptionUpdate(
  workspaceId: string,
  patch: Partial<Omit<WorkspaceSubscription, "workspaceId" | "createdAt">>,
  updatedBy: string | null
): Promise<WorkspaceSubscription> {
  return adminDb().runTransaction((tx) => applySubscriptionUpdateInTransaction(tx, workspaceId, patch, updatedBy));
}

async function applySubscriptionUpdateInTransaction(
  tx: Transaction,
  workspaceId: string,
  patch: Partial<Omit<WorkspaceSubscription, "workspaceId" | "createdAt">>,
  updatedBy: string | null
): Promise<WorkspaceSubscription> {
  const ref = subscriptionRef(workspaceId);
  const workspaceRef = adminDb().collection("workspaces").doc(workspaceId);
  const planConfigRef = adminDb().collection("platform_config").doc("plans");

  // All reads before any writes — required for Firestore transactions,
  // and incidentally what makes this atomic in the first place.
  const [existingSnap, planConfigSnap] = await Promise.all([tx.get(ref), tx.get(planConfigRef)]);
  const now = new Date().toISOString();

  const base: WorkspaceSubscription = existingSnap.exists
    ? (existingSnap.data() as WorkspaceSubscription)
    : {
        workspaceId,
        planId: DEFAULT_PLAN,
        status: "active",
        billingProvider: "manual",
        customerId: null,
        subscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialStart: null,
        trialEnd: null,
        customEntitlements: null,
        updatedBy: null,
        lastEventTimestamp: null,
        requestedPlanId: null,
        checkoutStatus: "not_started",
        paymentStatus: "not_started",
        createdAt: now,
        updatedAt: now,
      };

  const next: WorkspaceSubscription = { ...base, ...patch, workspaceId, updatedBy, updatedAt: now };

  // Any REAL status transition (a genuine activation, cancellation,
  // pause, or fresh trial — anything other than the "request recorded,
  // no live entitlement to protect" `incomplete` holding pattern)
  // resolves whatever plan request was pending, one way or another —
  // clear it rather than leaving a stale "X requested" around a
  // subscription that just moved on. A caller that wants to set a
  // NEW pending request passes `requestedPlanId` explicitly (see
  // /api/billing/change-plan), which this leaves untouched.
  if (patch.requestedPlanId === undefined && patch.status !== undefined && patch.status !== "incomplete") {
    next.requestedPlanId = null;
  }

  tx.set(ref, next, { merge: false });

  const planLimits = mergePlanConfig(planConfigSnap.exists ? (planConfigSnap.data() as PlatformPlanConfig) : null).limits;

  tx.update(workspaceRef, {
    ...deriveWorkspaceBillingCache(next, planLimits),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return next;
}

/**
 * The ONE decision shared by /api/billing/checkout and
 * /api/billing/change-plan for "the owner explicitly started checkout
 * for `planId`" — so the two routes can never disagree on it:
 *  - A LIVE entitlement (active, or a trial that hasn't expired) is
 *    never touched: only `requestedPlanId` is recorded, so the
 *    current plan/trial keeps applying until a verified payment (or a
 *    manual activation) replaces it.
 *  - With no live entitlement (free, expired trial, lapsed, nothing
 *    yet) the request becomes the `incomplete` ("pending payment")
 *    record for `planId`.
 * `isDuplicate` is true when this exact checkout was already started
 * and is still awaiting payment — the routes then return the existing
 * record WITHOUT re-writing it or re-sending the purchase-request
 * email, so a double-click or retried HTTP call can't produce a
 * second request/notification. A failed/cancelled earlier attempt
 * isn't a duplicate: retrying creates a fresh request.
 */
export function planRequestDecision(existing: WorkspaceSubscription | null, planId: WorkspacePlan) {
  const hasLiveEntitlement = !!existing && (existing.status === "active" || (existing.status === "trialing" && !isTrialExpired(existing)));

  const effectiveCheckoutStatus = existing?.checkoutStatus ?? (existing?.status === "incomplete" ? "created" : "not_started");
  const checkoutInFlight = effectiveCheckoutStatus === "created" || effectiveCheckoutStatus === "redirected";
  const isDuplicate =
    !!existing &&
    checkoutInFlight &&
    (hasLiveEntitlement ? existing.requestedPlanId === planId : existing.status === "incomplete" && existing.planId === planId);

  // Choosing Free with no live entitlement needs no payment and
  // elevates nothing (Free is exactly what they'd resolve to anyway), so
  // it's resolved directly — NOT recorded as a purchase request, which
  // would put a $0 "request" in Super Admin's queue (and inbox) that can
  // never be paid or confirmed. This also clears a pending selection
  // cleanly. (With a live paid entitlement, moving to Free stays a
  // recorded request — that's a downgrade of a customer worth a human's
  // attention.)
  const isFreeSelection = planId === DEFAULT_PLAN && !hasLiveEntitlement;

  const patch: Partial<Omit<WorkspaceSubscription, "workspaceId" | "createdAt">> = isFreeSelection
    ? {
        planId,
        status: "active",
        billingProvider: existing?.billingProvider ?? "manual",
        cancelAtPeriodEnd: false,
        requestedPlanId: null,
        checkoutStatus: "not_started",
        paymentStatus: "not_started",
      }
    : hasLiveEntitlement
      ? { requestedPlanId: planId, checkoutStatus: "created", paymentStatus: "not_started" }
      : {
          planId,
          status: "incomplete",
          billingProvider: existing?.billingProvider ?? "manual",
          requestedPlanId: null,
          checkoutStatus: "created",
          paymentStatus: "not_started",
        };

  return { hasLiveEntitlement, isDuplicate, isFreeSelection, patch };
}

const REQUESTABLE_PLANS: ReadonlySet<string> = new Set(["pro", "business", "enterprise"]);

/**
 * Server-side, idempotent repair of the workspace's billing DISPLAY
 * cache from the authoritative subscription doc — the safe lazy
 * resync for stale-cache cases (chiefly a trial whose trialEnd passed:
 * nothing writes on a timer, so the cache keeps saying "trialing"
 * until some other subscription write lands). Writes ONLY the cache
 * fields on `workspaces/{id}`; never touches the subscription doc, so
 * it can't change what anyone is entitled to — resolveEntitlements
 * already enforces the effective state live. Safe to trigger from any
 * workspace member (see /api/billing/resync-cache): the values written
 * derive entirely from server-held data, never from the caller.
 *
 * With NO subscription doc (a signup that picked a paid plan and
 * hasn't started checkout) nothing authoritative records the request —
 * the creation-time `pending_payment`/`pendingPlan` cache IS the
 * record — so those are preserved (if they're a valid shape) while
 * plan/limits are forced to the Free fallback.
 */
export async function resyncWorkspaceBillingCache(workspaceId: string): Promise<{ cache: WorkspaceBillingCache; changed: boolean }> {
  return adminDb().runTransaction(async (tx) => {
    const workspaceRef = adminDb().collection("workspaces").doc(workspaceId);
    const [workspaceSnap, subSnap, planConfigSnap] = await Promise.all([
      tx.get(workspaceRef),
      tx.get(subscriptionRef(workspaceId)),
      tx.get(adminDb().collection("platform_config").doc("plans")),
    ]);
    if (!workspaceSnap.exists) throw new Error(`Workspace ${workspaceId} not found.`);

    const planLimits = mergePlanConfig(planConfigSnap.exists ? (planConfigSnap.data() as PlatformPlanConfig) : null).limits;
    let cache: WorkspaceBillingCache;
    if (subSnap.exists) {
      cache = deriveWorkspaceBillingCache(subSnap.data() as WorkspaceSubscription, planLimits);
    } else {
      const current = workspaceSnap.data() as Partial<Workspace>;
      const keepPending =
        current.subscriptionStatus === "pending_payment" && !!current.pendingPlan && REQUESTABLE_PLANS.has(current.pendingPlan);
      cache = {
        plan: DEFAULT_PLAN,
        limits: planLimits[DEFAULT_PLAN],
        subscriptionStatus: keepPending ? "pending_payment" : "active",
        pendingPlan: keepPending ? (current.pendingPlan as WorkspacePlan) : null,
        trialEnd: null,
      };
    }

    // Called on every workspace load (see WorkspaceContext), so it must
    // be cheap when there's nothing to repair: no write unless the
    // cache actually differs from what the authoritative state says.
    if (sameBillingCache(workspaceSnap.data() as Partial<Workspace>, cache)) return { cache, changed: false };

    tx.update(workspaceRef, { ...cache, updatedAt: FieldValue.serverTimestamp() });
    return { cache, changed: true };
  });
}

/**
 * Webhook-specific: applies a subscription patch AND records the
 * provider's own event id as an idempotency key, atomically in the
 * SAME transaction — a duplicate delivery of the identical event
 * (payment providers routinely retry, and can deliver more than once
 * for the same event) sees the idempotency doc already exists and
 * returns the ALREADY-APPLIED result without reapplying anything,
 * rather than a second call racing the first one. This is
 * Section 24's "no duplicate subscription/invoice/entitlement created"
 * requirement in concrete terms.
 *
 * The idempotency doc's `applied` payload lets a genuine duplicate
 * return the same response the original call did, rather than an
 * empty/ambiguous "already processed" with no data.
 *
 * SECURITY (audit Priority 5) — out-of-order protection: `eventTimestamp`
 * is the provider's own event time (every real provider — Stripe's
 * `created`, Razorpay's `created_at`, etc. — supplies one; the current
 * development-safe shared-secret webhook requires the caller to send
 * it too, see /api/billing/webhook). Before applying, this compares it
 * against `lastEventTimestamp` already stored on the subscription — an
 * event that's OLDER than one already applied is rejected rather than
 * silently overwriting newer state with stale data (e.g. a late-
 * arriving "payment_succeeded" retry landing after a subsequent
 * "subscription_canceled" already processed). Rejected-as-stale events
 * are still recorded in the idempotency ledger so a retry of THAT
 * exact stale event also short-circuits instead of being evaluated
 * twice.
 */
export async function applySubscriptionUpdateIdempotent(
  eventId: string,
  workspaceId: string,
  patch: Partial<Omit<WorkspaceSubscription, "workspaceId" | "createdAt">>,
  eventTimestamp: string
): Promise<{ subscription: WorkspaceSubscription; duplicate: boolean; outOfOrder: boolean }> {
  const eventRef = webhookEventRef(eventId);

  return adminDb().runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (eventSnap.exists) {
      const applied = eventSnap.data()?.appliedSubscription as WorkspaceSubscription | undefined;
      if (applied) return { subscription: applied, duplicate: true, outOfOrder: Boolean(eventSnap.data()?.outOfOrder) };
      // Idempotency doc exists but somehow has no payload (shouldn't
      // happen) — fail closed rather than silently reapplying.
      throw new Error(`Webhook event ${eventId} was already recorded but has no stored result.`);
    }

    const subRef = subscriptionRef(workspaceId);
    const currentSnap = await tx.get(subRef);
    const current = currentSnap.exists ? (currentSnap.data() as WorkspaceSubscription) : null;

    const isOutOfOrder = !!current?.lastEventTimestamp && eventTimestamp < current.lastEventTimestamp;

    if (isOutOfOrder) {
      // Record the rejection (for idempotency + auditability) without
      // touching the subscription at all — the already-applied, newer
      // state stands.
      tx.set(eventRef, {
        eventId,
        workspaceId,
        processedAt: FieldValue.serverTimestamp(),
        outOfOrder: true,
        rejectedEventTimestamp: eventTimestamp,
        appliedSubscription: current,
      });
      return { subscription: current as WorkspaceSubscription, duplicate: false, outOfOrder: true };
    }

    const subscription = await applySubscriptionUpdateInTransaction(
      tx,
      workspaceId,
      { ...patch, lastEventTimestamp: eventTimestamp },
      null
    );

    tx.set(eventRef, {
      eventId,
      workspaceId,
      processedAt: FieldValue.serverTimestamp(),
      outOfOrder: false,
      appliedSubscription: subscription,
    });

    return { subscription, duplicate: false, outOfOrder: false };
  });
}

/**
 * Manual / complimentary activation by Super Admin (or Enterprise
 * activation after a sales lead closes). This is deliberately NOT a
 * payment: `paymentStatus` and `checkoutStatus` are reset to
 * "not_started" and any pending request is cleared, so the record can
 * never be mistaken for a paid subscription — the display layer
 * (billingDisplay.ts resolveBillingType) calls an active subscription
 * "Paid" only when `paymentStatus === "paid"` (only a verified webhook
 * event sets that) and "Complimentary / Manual" only when
 * `activationSource === "manual"` — the explicit marker written here
 * and nowhere else. Anything else is "Legacy / Payment status unknown".
 * `trialStart`/`trialEnd` are left as historical timestamps; every
 * trial check requires `status === "trialing"`, so they have no effect
 * on an active subscription.
 */
export async function activatePlanManually(
  workspaceId: string,
  planId: WorkspacePlan,
  updatedBy: string,
  customEntitlements: WorkspaceSubscription["customEntitlements"] = null
): Promise<WorkspaceSubscription> {
  return applySubscriptionUpdate(
    workspaceId,
    {
      planId,
      status: "active",
      billingProvider: "manual",
      customEntitlements,
      cancelAtPeriodEnd: false,
      requestedPlanId: null,
      checkoutStatus: "not_started",
      paymentStatus: "not_started",
      activationSource: "manual",
    },
    updatedBy
  );
}

export type { SubscriptionStatus, BillingProvider };
