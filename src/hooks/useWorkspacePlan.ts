"use client";

import { useCallback } from "react";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { canUseFeature, checkWorkspaceLimit, getWorkspaceLimit, getWorkspacePlan, type WorkspaceLimitMetric } from "@/services/planService";
import { FeatureKey } from "@/lib/constants/planLimits";
import { WorkspacePlanLimits } from "@/types/workspace.types";

/**
 * UI-facing wrapper around planService.ts, bound to the active
 * workspace — the hook version of the same centralized checks so
 * components never re-derive plan logic inline. Returns no-op-safe
 * defaults while the workspace hasn't loaded yet (every check simply
 * reports "allowed: true" — a component should already be gating on
 * `isLoading`/an active workspace before it matters).
 */
export function useWorkspacePlan() {
  const { workspace } = useWorkspaceContext();

  const checkLimit = useCallback(
    async (metric: WorkspaceLimitMetric) => {
      if (!workspace) return { allowed: true, used: 0, limit: Infinity, reason: null };
      return checkWorkspaceLimit(workspace, metric);
    },
    [workspace]
  );

  const hasFeature = useCallback(
    (feature: FeatureKey) => {
      if (!workspace) return true;
      return canUseFeature(workspace, feature);
    },
    [workspace]
  );

  const limit = useCallback(
    <K extends keyof WorkspacePlanLimits>(key: K): WorkspacePlanLimits[K] | undefined => {
      if (!workspace) return undefined;
      return getWorkspaceLimit(workspace, key);
    },
    [workspace]
  );

  return {
    workspace,
    plan: workspace ? getWorkspacePlan(workspace) : null,
    hasFeature,
    getLimit: limit,
    checkLimit,
  };
}
