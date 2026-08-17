import { WorkspacePlan, WorkspacePlanLimits } from "@/types/workspace.types";

/**
 * The plan every new workspace is created on. Nothing here charges
 * anyone or gates a feature yet — this is the data model a future
 * billing/upgrade flow would read from and write to, seeded now so
 * that flow doesn't need a migration across every existing workspace
 * when it's built.
 */
export const DEFAULT_PLAN: WorkspacePlan = "starter";

export const FEATURE_KEYS = ["aiStudio", "reviews", "board", "downloads", "customBranding"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const PLAN_LIMITS: Record<WorkspacePlan, WorkspacePlanLimits> = {
  starter: {
    maxMembers: 5,
    maxProjects: 10,
    maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
    maxAIRequestsPerMonth: 50,
    enabledFeatures: ["aiStudio", "reviews", "board", "downloads"],
  },
  pro: {
    maxMembers: 25,
    maxProjects: 100,
    maxStorageBytes: 100 * 1024 * 1024 * 1024, // 100 GB
    maxAIRequestsPerMonth: 1000,
    enabledFeatures: ["aiStudio", "reviews", "board", "downloads", "customBranding"],
  },
  business: {
    maxMembers: 100,
    maxProjects: 500,
    maxStorageBytes: 500 * 1024 * 1024 * 1024, // 500 GB
    maxAIRequestsPerMonth: 5000,
    enabledFeatures: ["aiStudio", "reviews", "board", "downloads", "customBranding"],
  },
  enterprise: {
    maxMembers: Infinity,
    maxProjects: Infinity,
    maxStorageBytes: Infinity,
    maxAIRequestsPerMonth: Infinity,
    enabledFeatures: [...FEATURE_KEYS],
  },
};

/** Display order + user-facing name for every plan — Pricing, Settings, and anywhere else a plan is shown all read from here so there's one label per plan, not one per screen. */
export const PLAN_ORDER: WorkspacePlan[] = ["starter", "pro", "business", "enterprise"];

export const PLAN_DISPLAY_NAMES: Record<WorkspacePlan, string> = {
  starter: "Free",
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
};

/**
 * Placeholder pricing for the architecture, not final commercial
 * pricing — read by the Pricing page so numbers live in one place
 * instead of being hardcoded into pricing UI. `monthly: null` means
 * "Contact us" (no self-serve price shown). No Stripe/payment
 * processing is wired to these numbers yet.
 */
export const PLAN_PRICING: Record<WorkspacePlan, { monthlyUsd: number | null; billingPeriod: string }> = {
  starter: { monthlyUsd: 0, billingPeriod: "forever" },
  pro: { monthlyUsd: 29, billingPeriod: "per month" },
  business: { monthlyUsd: 99, billingPeriod: "per month" },
  enterprise: { monthlyUsd: null, billingPeriod: "custom" },
};
