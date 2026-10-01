import "server-only";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { mergePlanConfig } from "@/lib/planConfig";
import { resolveEntitlements } from "@/lib/entitlements";
import type { PlatformPlanConfig } from "@/types/platformConfig.types";
import type { WorkspaceSubscription } from "@/types/billing.types";
import type { WorkspacePlan, WorkspacePlanLimits } from "@/types/workspace.types";

/**
 * The ONE server-side entry point for "what is this workspace actually
 * entitled to, right now" — extracted from the inline pattern
 * /api/projects/restore already used (workspaceQuota.ts's
 * resolveLiveLimit does the same thing for a single metric) so a THIRD
 * call site (AI Studio's generate route, and settings/ai-key/*) didn't
 * have to duplicate it a second time.
 *
 * SECURITY (audit Priority 1): this is Admin-SDK, reading directly
 * from `workspaces/{id}/billing/subscription` (Admin-SDK-write-only —
 * see firestore.rules) and `platform_config/plans` (Super-Admin-write-
 * only) — NEVER the cached `workspaces/{id}.limits`/`.plan` fields,
 * which firestore.rules' `workspaces/{id}` update rule does NOT
 * protect from a direct client write by any owner/admin. Any server
 * route making an authoritative billing/entitlement/feature-gate
 * decision must resolve through this function, never read the cached
 * fields directly.
 */
export async function resolveWorkspaceEntitlements(
  workspaceId: string
): Promise<{ plan: WorkspacePlan; limits: WorkspacePlanLimits }> {
  const [subSnap, planConfigSnap] = await Promise.all([
    adminDb().collection("workspaces").doc(workspaceId).collection("billing").doc("subscription").get(),
    adminDb().collection("platform_config").doc("plans").get(),
  ]);
  const subscription = subSnap.exists ? (subSnap.data() as WorkspaceSubscription) : null;
  const planLimits = mergePlanConfig(planConfigSnap.exists ? (planConfigSnap.data() as PlatformPlanConfig) : null).limits;
  return resolveEntitlements(subscription, planLimits);
}
