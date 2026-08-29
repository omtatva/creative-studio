import { Timestamps } from "./common.types";
import { WorkspacePlan, WorkspacePlanLimits } from "./workspace.types";

/**
 * One plan's editable "cost and services" — Super Admin > Plans
 * writes this, the public pricing page and Super Admin's own limit
 * resolution both read it. Same shape as PLAN_LIMITS[plan] +
 * PLAN_PRICING[plan] in planLimits.ts (that file is the SEED/fallback
 * used until a Super Admin first saves an edit — see
 * lib/planConfig.ts's mergePlanConfig).
 */
export interface PlanConfigEntry extends WorkspacePlanLimits {
  monthlyUsd: number | null;
  billingPeriod: string;
}

/**
 * Singleton doc at platform_config/plans. Deliberately PUBLIC read
 * (see firestore.rules) — plan pricing/features are marketing
 * information the logged-out homepage must be able to show; write is
 * Super-Admin-only. Not present at all until the first edit is saved
 * — see mergePlanConfig for the fallback-to-static-defaults behavior
 * that makes that safe.
 */
export interface PlatformPlanConfig extends Timestamps {
  plans: Partial<Record<WorkspacePlan, PlanConfigEntry>>;
  updatedBy: string | null;
}
