import { PLAN_LIMITS, DEFAULT_PLAN } from "@/lib/constants/planLimits";
import type { WorkspacePlan, WorkspacePlanLimits } from "@/types/workspace.types";
import type { SubscriptionStatus, WorkspaceSubscription } from "@/types/billing.types";

/**
 * Pure, isomorphic entitlement resolution — the ONE place that decides
 * "given this subscription record, what limits actually apply right
 * now." Used from two call sites that must never disagree:
 *  1. subscriptionService.ts's syncWorkspaceCache (client, right after
 *     an owner reads their own subscription) and the admin billing
 *     routes (server, right after a webhook/manual-activation writes
 *     a new subscription) — both write the result onto
 *     `workspaces/{id}.plan` / `.limits`, the fast-path cache every
 *     EXISTING limit check (checkWorkspaceLimit, canUseFeature, ...)
 *     already reads.
 *  2. Settings > Billing & Plan, to show "what you get" without
 *     waiting for a cache write to land.
 *
 * A status that isn't genuinely paying (past_due beyond grace,
 * canceled, incomplete, paused) falls back to the free plan's limits —
 * "enforce the selected fallback plan" per the trial/lapse behavior
 * this was built for. `trialing` and `active` both get the real plan.
 */
const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(["trialing", "active"]);

export function resolveEntitlements(
  subscription: Pick<WorkspaceSubscription, "planId" | "status" | "customEntitlements"> | null,
  // Defaults to the static PLAN_LIMITS — callers that have already
  // fetched Super Admin > Plans' live overrides (see
  // lib/planConfig.ts's mergePlanConfig) pass those instead, so a
  // NEW subscription event resolves against current numbers. See
  // billingAdmin.ts's applySubscriptionUpdate for the one place this
  // actually happens; every other caller keeps the exact old
  // static-only behavior by omitting this argument.
  planLimits: Record<WorkspacePlan, WorkspacePlanLimits> = PLAN_LIMITS
): {
  plan: WorkspacePlan;
  limits: WorkspacePlanLimits;
} {
  if (!subscription || !ENTITLED_STATUSES.has(subscription.status)) {
    return { plan: DEFAULT_PLAN, limits: planLimits[DEFAULT_PLAN] };
  }

  const basePlan = subscription.planId;
  const baseLimits = planLimits[basePlan];

  // Enterprise customers routinely negotiate limits PLAN_LIMITS.enterprise
  // doesn't represent (that entry is just "unlimited" as a sane default) —
  // customEntitlements overrides individual keys without needing a
  // per-customer plan id. Any plan COULD carry an override in principle;
  // in practice only Enterprise activations ever set one (see
  // /api/billing/activate-enterprise).
  if (!subscription.customEntitlements) {
    return { plan: basePlan, limits: baseLimits };
  }

  return { plan: basePlan, limits: { ...baseLimits, ...subscription.customEntitlements } };
}

/** Human-friendly copy for a status badge — Settings > Billing & Plan, never the raw enum. */
export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Payment overdue",
  canceled: "Canceled",
  incomplete: "Incomplete",
  paused: "Paused",
};
