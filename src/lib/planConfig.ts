import { PLAN_LIMITS, PLAN_PRICING, PLAN_ORDER } from "@/lib/constants/planLimits";
import type { WorkspacePlan, WorkspacePlanLimits } from "@/types/workspace.types";
import type { PlatformPlanConfig, PlanConfigEntry } from "@/types/platformConfig.types";

export interface PlanPricing {
  monthlyUsd: number | null;
  billingPeriod: string;
}

/**
 * Merges the live, Super-Admin-editable platform_config/plans doc on
 * top of the static PLAN_LIMITS/PLAN_PRICING defaults in
 * planLimits.ts — one plan at a time, so a workspace that's never had
 * a live entry saved for it still gets the exact static default (this
 * is what makes it safe for the doc to not exist at all, or to only
 * have SOME plans edited). Used by both the public pricing page and
 * Super Admin > Plans (client), and billingAdmin.ts (server, via
 * Admin SDK) when resolving entitlements for a NEW subscription event
 * — see that file's doc comment for what does and doesn't get a live
 * update retroactively.
 */
export function mergePlanConfig(live: PlatformPlanConfig | null): {
  limits: Record<WorkspacePlan, WorkspacePlanLimits>;
  pricing: Record<WorkspacePlan, PlanPricing>;
} {
  const limits = { ...PLAN_LIMITS };
  const pricing = { ...PLAN_PRICING };
  if (!live) return { limits, pricing };

  for (const plan of PLAN_ORDER) {
    const override = live.plans[plan];
    if (!override) continue;
    limits[plan] = {
      maxMembers: override.maxMembers,
      maxProjects: override.maxProjects,
      maxStorageBytes: override.maxStorageBytes,
      maxAIRequestsPerMonth: override.maxAIRequestsPerMonth,
      enabledFeatures: override.enabledFeatures,
    };
    pricing[plan] = { monthlyUsd: override.monthlyUsd, billingPeriod: override.billingPeriod };
  }
  return { limits, pricing };
}

/** The default editable entry for one plan, seeded from the static constants — what Super Admin > Plans starts from before ever saving an edit. */
export function defaultPlanConfigEntry(plan: WorkspacePlan): PlanConfigEntry {
  return { ...PLAN_LIMITS[plan], ...PLAN_PRICING[plan] };
}
