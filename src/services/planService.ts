import { getDoc, getDocs, query, where } from "firebase/firestore";
import { projectsCol, settingsDoc } from "@/lib/firebase/firestore";
import { getWorkspaceMembers } from "@/services/userService";
import { checkWorkspaceAIUsage } from "@/services/aiService";
import { FeatureKey } from "@/lib/constants/planLimits";
import { Workspace, WorkspacePlan, WorkspacePlanLimits } from "@/types/workspace.types";

/**
 * Centralized workspace-plan / feature-gating layer — the single
 * place any component or service checks "is this allowed on this
 * workspace's plan" instead of re-deriving it inline. No billing
 * exists yet; this only reads the `plan`/`limits` already seeded on
 * every workspace (see lib/constants/planLimits.ts) and real current
 * usage, so a future upgrade flow can plug in without every call site
 * changing.
 */

export type WorkspaceLimitMetric = "members" | "projects" | "storage" | "aiGenerations";

export interface WorkspaceLimitCheck {
  allowed: boolean;
  used: number;
  limit: number;
  /** Set only when allowed is false — safe to show directly to the user. */
  reason: string | null;
}

export function getWorkspacePlan(workspace: Workspace): WorkspacePlan {
  return workspace.plan;
}

export function getWorkspaceLimit<K extends keyof WorkspacePlanLimits>(workspace: Workspace, key: K): WorkspacePlanLimits[K] {
  return workspace.limits[key];
}

export function canUseFeature(workspace: Workspace, feature: FeatureKey): boolean {
  return workspace.limits.enabledFeatures.includes(feature);
}

/**
 * Real current usage for one metric — not cached, not estimated.
 * `members`/`projects` count live Firestore docs; `storage` reads the
 * running total fileService.ts already maintains on every
 * upload/delete (settings/{workspaceId}.storage.usedBytes);
 * `aiGenerations` delegates to aiService.ts's own counter so there's
 * exactly one place that logic lives.
 */
export async function getWorkspaceUsage(workspace: Workspace, metric: WorkspaceLimitMetric): Promise<number> {
  switch (metric) {
    case "members": {
      const members = await getWorkspaceMembers(workspace.id);
      return members.length;
    }
    case "projects": {
      const q = query(projectsCol(), where("workspaceId", "==", workspace.id), where("isArchived", "==", false));
      const snapshot = await getDocs(q);
      return snapshot.docs.length;
    }
    case "storage": {
      const snapshot = await getDoc(settingsDoc(workspace.id));
      return snapshot.exists() ? snapshot.data().storage?.usedBytes ?? 0 : 0;
    }
    case "aiGenerations": {
      const usage = await checkWorkspaceAIUsage(workspace);
      return usage.used;
    }
  }
}

const LIMIT_KEY_BY_METRIC: Record<WorkspaceLimitMetric, keyof WorkspacePlanLimits> = {
  members: "maxMembers",
  projects: "maxProjects",
  storage: "maxStorageBytes",
  aiGenerations: "maxAIRequestsPerMonth",
};

const METRIC_LABEL: Record<WorkspaceLimitMetric, string> = {
  members: "members",
  projects: "active projects",
  storage: "storage",
  aiGenerations: "AI generations this month",
};

/** The pre-flight check any create/upload/invite/generate action calls before doing the real (expensive or capacity-consuming) work. */
export async function checkWorkspaceLimit(workspace: Workspace, metric: WorkspaceLimitMetric): Promise<WorkspaceLimitCheck> {
  const limit = getWorkspaceLimit(workspace, LIMIT_KEY_BY_METRIC[metric]) as number;

  if (!Number.isFinite(limit)) {
    return { allowed: true, used: 0, limit, reason: null };
  }

  let used: number;
  try {
    used = await getWorkspaceUsage(workspace, metric);
  } catch (err) {
    // The "projects" metric counts every non-archived project in the
    // workspace — under the project-level access model (see
    // firestore.rules' canAccessProject), a regular workspace member
    // who isn't on every existing project can no longer read that
    // full set, so this query now legitimately permission-denies for
    // them. Failing OPEN here (not blocking the create they were
    // actually trying to do) is the correct trade-off: this is a
    // pre-flight capacity check, not a security boundary, and a
    // member being unable to verify a plan limit must never be the
    // reason a legitimate project creation silently breaks. Owners/
    // admins/IT Support (who CAN see every project) still get the
    // real, precisely-enforced count.
    console.warn(`[planService] couldn't verify ${metric} usage (failing open):`, err instanceof Error ? err.message : err);
    return { allowed: true, used: 0, limit, reason: null };
  }
  if (used >= limit) {
    return {
      allowed: false,
      used,
      limit,
      reason: `This workspace has reached its plan's limit of ${limit} ${METRIC_LABEL[metric]}. Contact your workspace owner about upgrading.`,
    };
  }
  return { allowed: true, used, limit, reason: null };
}
