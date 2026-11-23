import { PLAN_LIMITS, DEFAULT_PLAN, TRIAL_DAYS } from "@/lib/constants/planLimits";
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
 * this was built for. `trialing` and `active` both get the real plan —
 * EXCEPT a `trialing` subscription whose `trialEnd` has already
 * passed: there's no cron job in this codebase to flip that status
 * automatically the moment a trial ends, so expiry is computed live,
 * right here, every time entitlements are resolved. This is what
 * makes the 7-day trial (see /api/billing/start-trial) actually end
 * on time without needing scheduled infrastructure — Settings >
 * Billing & Plan's "Upgrade" banner reads the same subscription doc
 * and shows the reminder once this falls back.
 */
const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(["trialing", "active"]);

type TrialFields = Pick<WorkspaceSubscription, "status" | "trialEnd"> & Partial<Pick<WorkspaceSubscription, "trialStart">>;

/**
 * When a `trialing` subscription's trial ends — the ONE definition
 * every expiry check (here, the display layer, the cache sync) uses.
 *  1. An explicit `trialEnd` wins.
 *  2. Legacy records with no `trialEnd` but a `trialStart`: that
 *     timestamp + the fixed trial length (TRIAL_DAYS) — derived from
 *     data the record already holds, not an arbitrary date.
 *  3. Neither (or unparseable): null — there is NOT enough information
 *     to establish an active trial. isTrialExpired treats that as
 *     expired, so such a record can never grant Pro indefinitely.
 */
export function resolveTrialEnd(subscription: Pick<WorkspaceSubscription, "trialEnd"> & Partial<Pick<WorkspaceSubscription, "trialStart">>): string | null {
  const explicit = subscription.trialEnd ? Date.parse(subscription.trialEnd) : NaN;
  if (!Number.isNaN(explicit)) return new Date(explicit).toISOString();
  const start = subscription.trialStart ? Date.parse(subscription.trialStart) : NaN;
  if (!Number.isNaN(start)) return new Date(start + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

/**
 * True for a `trialing` subscription that has ended (`trialEnd <= now`)
 * OR whose end can't be established at all (see resolveTrialEnd) —
 * fail closed: an unverifiable trial is not an active trial.
 */
export function isTrialExpired(subscription: TrialFields | null): boolean {
  if (!subscription || subscription.status !== "trialing") return false;
  const end = resolveTrialEnd(subscription);
  return end === null || new Date(end).getTime() <= Date.now();
}

const NUMERIC_LIMIT_KEYS = ["maxMembers", "maxProjects", "maxStorageBytes", "maxAIRequestsPerMonth"] as const;
/** The per-workspace overrides Super Admin can set (stored in subscription.customEntitlements). */
export const OVERRIDABLE_LIMIT_KEYS = ["maxMembers", "maxStorageBytes", "maxFileEntitlementBytes"] as const;
export type OverridableLimitKey = (typeof OVERRIDABLE_LIMIT_KEYS)[number];

export type LimitSource = "plan" | "override" | "default";

export interface ResolvedEntitlements {
  plan: WorkspacePlan;
  limits: WorkspacePlanLimits;
  /** Which layer decided each overridable limit. "default" = no entitled subscription, so the default plan applies. */
  sources: Record<OverridableLimitKey, LimitSource>;
  /** Override keys that were present but malformed (NaN, negative, text, ...) and were IGNORED. */
  malformedOverrides: string[];
}

const isCount = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v) && v >= 0;
const isPositiveFinite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * A plan's limits with every numeric key guaranteed to be a real number. A missing/NaN/negative value (a half-edited plan document, a bad
 * migration) must NEVER turn into "unlimited", so it falls back to the default plan's value. Only an explicit Infinity — what the Enterprise
 * plan deliberately stores — means unlimited.
 */
export function sanitizePlanLimits(raw: Partial<WorkspacePlanLimits> | undefined, fallback: WorkspacePlanLimits): WorkspacePlanLimits {
  const out: WorkspacePlanLimits = { ...fallback, ...(raw ?? {}) } as WorkspacePlanLimits;
  for (const key of NUMERIC_LIMIT_KEYS) if (!isCount(out[key])) out[key] = fallback[key];
  if (!Array.isArray(out.enabledFeatures)) out.enabledFeatures = fallback.enabledFeatures;
  return out;
}

export function resolveEntitlementsDetailed(
  subscription: (Pick<WorkspaceSubscription, "planId" | "status" | "customEntitlements" | "trialEnd"> & Partial<Pick<WorkspaceSubscription, "trialStart">>) | null,
  // Defaults to the static PLAN_LIMITS — callers that have already fetched Super Admin > Plans' live overrides (see lib/planConfig.ts's
  // mergePlanConfig) pass those instead, so a NEW subscription event resolves against current numbers.
  planLimits: Record<WorkspacePlan, WorkspacePlanLimits> = PLAN_LIMITS
): ResolvedEntitlements {
  const defaults: Record<OverridableLimitKey, LimitSource> = { maxMembers: "default", maxStorageBytes: "default", maxFileEntitlementBytes: "default" };
  const fallbackLimits = sanitizePlanLimits(planLimits[DEFAULT_PLAN], PLAN_LIMITS[DEFAULT_PLAN]);

  if (!subscription || !ENTITLED_STATUSES.has(subscription.status) || isTrialExpired(subscription)) {
    return { plan: DEFAULT_PLAN, limits: fallbackLimits, sources: defaults, malformedOverrides: [] };
  }

  // A subscription naming a plan we don't know is treated as the default plan, never as unlimited and never as a crash.
  const knownPlan = subscription.planId in planLimits ? subscription.planId : DEFAULT_PLAN;
  const baseLimits = sanitizePlanLimits(planLimits[knownPlan], PLAN_LIMITS[knownPlan] ?? PLAN_LIMITS[DEFAULT_PLAN]);
  const sources: Record<OverridableLimitKey, LimitSource> = { maxMembers: "plan", maxStorageBytes: "plan", maxFileEntitlementBytes: "plan" };
  const malformed: string[] = [];
  const limits: WorkspacePlanLimits = { ...baseLimits };

  // Enterprise customers routinely negotiate limits PLAN_LIMITS.enterprise doesn't represent — customEntitlements overrides individual keys
  // without needing a per-customer plan id. Any plan can carry one; Super Admin sets them from Customers > a workspace > Plan & entitlements.
  const custom = (subscription.customEntitlements ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(custom)) {
    const value = custom[key];
    // Legacy name: the file-size entitlement was first stored as "maxFileBytes". Still read, never written.
    const target = key === "maxFileBytes" ? "maxFileEntitlementBytes" : key;
    if (value === undefined || value === null) continue;
    if ((OVERRIDABLE_LIMIT_KEYS as readonly string[]).includes(target)) {
      if (isPositiveFinite(value)) {
        (limits as unknown as Record<string, number>)[target] = value;
        sources[target as OverridableLimitKey] = "override";
      } else {
        malformed.push(key);
      }
    } else if ((NUMERIC_LIMIT_KEYS as readonly string[]).includes(key) || key === "enabledFeatures") {
      // Other limits (projects, AI, features) keep the long-standing behaviour — but only a well-formed value is applied.
      if (key === "enabledFeatures" ? Array.isArray(value) : isCount(value)) (limits as unknown as Record<string, unknown>)[key] = value;
      else malformed.push(key);
    }
  }
  return { plan: knownPlan, limits, sources, malformedOverrides: malformed };
}

export function resolveEntitlements(
  subscription: Parameters<typeof resolveEntitlementsDetailed>[0],
  planLimits: Record<WorkspacePlan, WorkspacePlanLimits> = PLAN_LIMITS
): { plan: WorkspacePlan; limits: WorkspacePlanLimits } {
  const { plan, limits } = resolveEntitlementsDetailed(subscription, planLimits);
  return { plan, limits };
}

/**
 * The per-file size policy — the ONE function that decides "how big may one file be in this workspace".
 *   platform safety ceiling  >=  entitlement (plan/override, optional)  >=  what the workspace owner/admin configured (optional)  =  effective.
 * The owner's choice can only LOWER the limit; an entitlement can only lower the platform ceiling; nothing exceeds the ceiling.
 */
export function resolveFilePolicy(input: {
  platformCeilingBytes: number;
  entitlementBytes?: number | null;
  /** Settings > Storage "Maximum size of a single file", in MB (stored as settings.storage.maxFileSizeMb). */
  workspaceConfiguredMb?: number | null;
}): {
  platformCeilingBytes: number;
  entitlementBytes: number | null;
  workspaceCeilingBytes: number;
  workspaceConfiguredBytes: number | null;
  maxFileBytes: number;
  source: "platform" | "entitlement" | "workspace";
} {
  const MB = 1024 * 1024;
  const platform = input.platformCeilingBytes;
  const entitlement = isPositiveFinite(input.entitlementBytes) ? Math.min(Math.floor(input.entitlementBytes), platform) : null;
  const ceiling = entitlement ?? platform;
  const configured = isPositiveFinite(input.workspaceConfiguredMb) ? Math.round(input.workspaceConfiguredMb) * MB : null;
  const effective = configured !== null ? Math.min(configured, ceiling) : ceiling;
  const source = configured !== null && configured < ceiling ? "workspace" : entitlement !== null && entitlement < platform ? "entitlement" : "platform";
  return { platformCeilingBytes: platform, entitlementBytes: entitlement, workspaceCeilingBytes: ceiling, workspaceConfiguredBytes: configured, maxFileBytes: effective, source };
}

/**
 * SEAT POLICY — one definition, used by every counter and display. A seat is an ACTIVE member of any role. Disabled ("suspended") and
 * not-yet-joined ("invited") members keep their record but hold no seat; the platform Super Admin never holds one.
 */
export function holdsSeat(member: { status?: string | null }, isPlatformSuperAdmin: boolean): boolean {
  if (isPlatformSuperAdmin) return false;
  return member.status !== "suspended" && member.status !== "invited";
}

/** Human-friendly copy for a status badge — Settings > Billing & Plan, never the raw enum. */
export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Payment overdue",
  canceled: "Canceled",
  // "incomplete" is the persisted representation of "pending payment"
  // (a paid plan was requested/checkout started, payment not confirmed)
  // — labeled as what it means to a reader, never as "Active".
  incomplete: "Pending payment",
  paused: "Paused",
};
