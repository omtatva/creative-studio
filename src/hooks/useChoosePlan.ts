"use client";

import { useState } from "react";
import { createCheckoutSession, changePlan } from "@/services/billingService";
import { WorkspaceSubscription } from "@/types/billing.types";
import { WorkspacePlan } from "@/types/workspace.types";

export interface ChoosePlanOutcome {
  ok: boolean;
  error?: string;
  violations?: string[];
  message?: string;
}

/**
 * The ONE place that decides "checkout (first-time/lapsed) vs.
 * change-plan (already active/trialing)" and calls the matching
 * server route — extracted out of Settings > Billing & Plan so the
 * dedicated customer-facing /billing/upgrade page can request the
 * exact same server-verified request instead of a second, parallel
 * implementation. Neither this hook nor either caller ever flips
 * subscriptionStatus itself — both routes only ever record a request;
 * see /api/billing/checkout and /api/billing/change-plan's own doc
 * comments for why only a verified webhook (or Super Admin, manually)
 * can activate a paid plan.
 */
export function useChoosePlan(workspaceId: string | null, subscription: WorkspaceSubscription | null | undefined, onChanged?: () => void) {
  const [isChoosing, setIsChoosing] = useState<WorkspacePlan | null>(null);

  async function choosePlan(planId: Exclude<WorkspacePlan, "enterprise">): Promise<ChoosePlanOutcome> {
    if (!workspaceId) return { ok: false, error: "No active workspace." };
    setIsChoosing(planId);
    try {
      const hasActiveSubscription = subscription && (subscription.status === "active" || subscription.status === "trialing");
      const result = hasActiveSubscription ? await changePlan(workspaceId, planId) : await createCheckoutSession(workspaceId, planId);
      if (!result.ok) {
        return { ok: false, error: result.error, violations: result.violations };
      }
      onChanged?.();
      return { ok: true, message: result.data?.message };
    } finally {
      setIsChoosing(null);
    }
  }

  return { isChoosing, choosePlan };
}
