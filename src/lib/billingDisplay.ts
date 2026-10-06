import { PLAN_DISPLAY_NAMES, DEFAULT_PLAN } from "@/lib/constants/planLimits";
import { isTrialExpired, resolveEntitlements, resolveTrialEnd } from "@/lib/entitlements";
import type { Workspace, WorkspacePlan } from "@/types/workspace.types";
import type { WorkspaceSubscription } from "@/types/billing.types";

/**
 * Pure, isomorphic display resolution for billing state — every
 * customer/admin surface goes through here so none can disagree about
 * trial vs expired vs pending vs paid vs complimentary. NOTHING here
 * is authoritative for entitlements (resolveEntitlements is); this
 * only decides what to SAY about the state.
 */

/**
 * "Pro Trial" must always read as one unit, never "Pro" with a
 * separate badge a reader could miss — the plan name alone must never
 * look like proof of payment.
 */
export function planHeadline(plan: WorkspacePlan, isTrialing: boolean): string {
  return isTrialing ? `${PLAN_DISPLAY_NAMES[plan]} Trial` : PLAN_DISPLAY_NAMES[plan];
}

/**
 * Derived, never persisted (a second stored copy could drift from
 * status/paymentStatus):
 *  - trial: live `trialing` subscription
 *  - paid: active AND `paymentStatus === "paid"` — only a verified
 *    webhook event ever sets that
 *  - manual_comp: active AND `activationSource === "manual"` — the
 *    explicit marker only Super Admin's manual activation writes.
 *    Never inferred from a missing/"not_started" payment field.
 *  - legacy_unknown: active on a non-free plan with NEITHER of the
 *    above (records activated before those fields existed, or by a
 *    provider event with no payment outcome). We genuinely don't know
 *    whether money moved, so it is neither "Paid" nor "Complimentary",
 *    and the record is never rewritten to look tidier.
 *  - enterprise: active Enterprise (sales-assisted)
 *  - free: everything else (no subscription, Free plan, pending
 *    payment, expired trial, lapsed)
 */
export type BillingType = "free" | "trial" | "paid" | "manual_comp" | "legacy_unknown" | "enterprise";

export function resolveBillingType(sub: WorkspaceSubscription | null | undefined): BillingType {
  if (!sub) return "free";
  if (sub.status === "trialing") return isTrialExpired(sub) ? "free" : "trial";
  if (sub.status !== "active") return "free";
  if (sub.planId === DEFAULT_PLAN) return "free";
  if (sub.planId === "enterprise") return "enterprise";
  if (sub.paymentStatus === "paid") return "paid";
  return sub.activationSource === "manual" ? "manual_comp" : "legacy_unknown";
}

export const BILLING_TYPE_LABEL: Record<BillingType, string> = {
  free: "Free",
  trial: "Free Trial",
  paid: "Paid",
  manual_comp: "Complimentary / Manual",
  legacy_unknown: "Legacy / Payment status unknown",
  enterprise: "Enterprise",
};

export type EffectiveBillingStatus = "trialing" | "expired" | "active" | "pending_payment" | "past_due" | "canceled" | "paused";

/** Short status-badge copy for an effective status — never raw enum values, and "Active" is reserved for genuinely active subscriptions. */
export const EFFECTIVE_STATUS_LABEL: Record<EffectiveBillingStatus, string> = {
  trialing: "Trial",
  expired: "Trial expired",
  active: "Active",
  pending_payment: "Pending payment",
  past_due: "Payment overdue",
  canceled: "Canceled",
  paused: "Paused",
};

export interface BillingView {
  /** The plan the workspace is actually entitled to right now (Free once a trial expires or while payment is pending). */
  plan: WorkspacePlan;
  isTrialing: boolean;
  trialExpired: boolean;
  trialDaysLeft: number | null;
  status: EffectiveBillingStatus;
  /** null when only the workspace cache is available — the cache can't distinguish paid from complimentary. */
  billingType: BillingType | null;
}

function daysLeft(trialEnd: string): number {
  return Math.max(0, Math.ceil((new Date(trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

/**
 * What the workspace CACHE alone can establish about a trial:
 *  - "live": cached `trialing` with a `trialEnd` still in the future.
 *  - "expired": cached `expired`, or `trialing` with a `trialEnd` that has passed.
 *  - "unverified": cached `trialing` with NO `trialEnd` (a workspace last
 *    synced before `trialEnd` was cached). There's not enough here to
 *    establish an active trial, so it is never displayed as one — the
 *    server resolves the real state from the subscription (see
 *    WorkspaceContext.resolveBillingCache).
 *  - "none": not a trial.
 */
function cacheTrialState(workspace: Pick<Workspace, "subscriptionStatus" | "trialEnd">): "live" | "expired" | "unverified" | "none" {
  if (workspace.subscriptionStatus === "expired") return "expired";
  if (workspace.subscriptionStatus !== "trialing") return "none";
  const end = workspace.trialEnd ? Date.parse(workspace.trialEnd) : NaN;
  if (Number.isNaN(end)) return "unverified";
  return end <= Date.now() ? "expired" : "live";
}

/**
 * The effective billing state for one workspace.
 *  - `sub` is a subscription: authoritative (live-computed expiry,
 *    legacy `trialStart` fallback via resolveTrialEnd).
 *  - `sub === null`: the subscription is KNOWN to not exist — Free,
 *    whatever a (possibly stale or forged) cache says about trials;
 *    only the creation-time `pending_payment` selection is kept, since
 *    that has no subscription doc by design.
 *  - `sub === undefined`: unknown (not loaded, or this viewer can't read
 *    subscriptions) — fall back to the server-synced cache, which
 *    never shows an unverifiable trial as active.
 */
export function resolveBillingView(workspace: Workspace, sub: WorkspaceSubscription | null | undefined): BillingView {
  if (sub) {
    const trialExpired = isTrialExpired(sub);
    const isTrialing = sub.status === "trialing" && !trialExpired;
    const trialEnd = isTrialing ? resolveTrialEnd(sub) : null;
    return {
      plan: resolveEntitlements(sub).plan,
      isTrialing,
      trialExpired,
      trialDaysLeft: trialEnd ? daysLeft(trialEnd) : null,
      status: trialExpired ? "expired" : sub.status === "incomplete" ? "pending_payment" : (sub.status as EffectiveBillingStatus),
      billingType: resolveBillingType(sub),
    };
  }

  if (sub === null) {
    return {
      plan: DEFAULT_PLAN,
      isTrialing: false,
      trialExpired: false,
      trialDaysLeft: null,
      status: workspace.subscriptionStatus === "pending_payment" && workspace.pendingPlan ? "pending_payment" : "active",
      billingType: "free",
    };
  }

  const cached = workspace.subscriptionStatus;
  const trial = cacheTrialState(workspace);
  const isTrialing = trial === "live";
  const trialExpired = trial === "expired";
  const fallsBackToFree = trial === "expired" || trial === "unverified";
  return {
    plan: fallsBackToFree ? DEFAULT_PLAN : workspace.plan,
    isTrialing,
    trialExpired,
    trialDaysLeft: isTrialing && workspace.trialEnd ? daysLeft(workspace.trialEnd) : null,
    status: trialExpired ? "expired" : trial === "unverified" ? "active" : cached === "incomplete" ? "pending_payment" : (cached as EffectiveBillingStatus),
    billingType: null,
  };
}

/**
 * True when the workspace's display cache disagrees with what the
 * authoritative state says — an expired trial still cached as
 * "trialing", a legacy trial with no cached `trialEnd`, a cached trial
 * with no subscription behind it. The caller asks the server to resync
 * (see hooks/useBillingCacheResync.ts); this never writes anything.
 */
export function billingCacheIsStale(workspace: Workspace, sub: WorkspaceSubscription | null | undefined): boolean {
  if (sub) {
    if (isTrialExpired(sub) && workspace.subscriptionStatus !== "expired") return true;
    if (sub.status === "trialing" && !isTrialExpired(sub)) {
      const end = resolveTrialEnd(sub);
      if (end && (!workspace.trialEnd || Date.parse(workspace.trialEnd) !== Date.parse(end))) return true;
    }
    return workspace.plan !== resolveEntitlements(sub).plan;
  }
  if (sub === null) return workspace.subscriptionStatus === "trialing" || workspace.subscriptionStatus === "expired";
  const trial = cacheTrialState(workspace);
  return trial === "expired" ? workspace.subscriptionStatus !== "expired" : trial === "unverified";
}

export interface PlanRequest {
  planId: WorkspacePlan;
  /** false = selected (e.g. at signup) but checkout not started — payment required, no purchase request exists yet. true = checkout started, awaiting payment confirmation. */
  checkoutStarted: boolean;
}

/**
 * The paid plan the customer has asked for but not yet paid for, and
 * how far along it is — the ONE reading of "pending payment" for both
 * the signup-time selection (workspace cache only, no subscription
 * doc, no purchase request) and a started checkout (subscription
 * `checkoutStatus`), so the two are never conflated.
 */
export function getPlanRequest(workspace: Workspace, sub: WorkspaceSubscription | null | undefined): PlanRequest | null {
  if (sub?.requestedPlanId) {
    return { planId: sub.requestedPlanId, checkoutStarted: sub.checkoutStatus === "created" || sub.checkoutStatus === "redirected" };
  }
  if (sub?.status === "incomplete") {
    const checkoutStatus = sub.checkoutStatus ?? "created";
    return { planId: sub.planId, checkoutStarted: checkoutStatus === "created" || checkoutStatus === "redirected" };
  }
  if (workspace.subscriptionStatus === "pending_payment" && workspace.pendingPlan) {
    return { planId: workspace.pendingPlan, checkoutStarted: false };
  }
  return null;
}
