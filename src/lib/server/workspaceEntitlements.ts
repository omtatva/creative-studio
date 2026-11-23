import "server-only";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { mergePlanConfig } from "@/lib/planConfig";
import { resolveEntitlementsDetailed, resolveFilePolicy, type ResolvedEntitlements } from "@/lib/entitlements";
import { summarizeSeats } from "@/lib/server/seats";
import { ensureCounterInitialized } from "@/lib/server/workspaceQuota";
import { PLATFORM_MAX_FILE_BYTES } from "@/lib/constants/uploadPolicy";
import type { PlatformPlanConfig } from "@/types/platformConfig.types";
import type { WorkspaceSubscription } from "@/types/billing.types";
import type { WorkspacePlan, WorkspacePlanLimits } from "@/types/workspace.types";
import type { WorkspaceEntitlements, EntitlementSource } from "@/types/entitlements.types";

/**
 * THE server-side entitlement resolver — "what is this workspace actually entitled to, right now".
 *
 * Inputs, all Admin-SDK reads of server-controlled data (NEVER the client-writable cache `workspaces/{id}.limits/.plan`):
 *   workspaces/{id}/billing/subscription   (Admin-SDK-write-only)  — plan, status, Super Admin overrides (customEntitlements)
 *   platform_config/plans                  (Super-Admin-write-only) — live plan limits, merged over the static defaults in constants/planLimits.ts
 *   settings/{id}.storage.maxFileSizeMb                             — the workspace owner/admin's own (lower) per-file choice
 *   workspaces/{id}.storageBytesUsed       (Admin-SDK-write-only)  — authoritative storage usage
 *   members                                                         — seat usage (lib/server/seats.ts)
 *
 * Failure behaviour (never "unlimited"):
 *   no subscription / expired / unknown plan  -> the default plan's limits
 *   malformed override key                    -> ignored (plan value applies) and listed in `malformedOverrides`
 *   half-edited plan document                 -> missing numbers fall back to the default plan's, never Infinity
 *   workspace missing                         -> getWorkspaceEntitlements returns null; the quota functions throw
 *   Firestore read error                      -> the error propagates; callers (finalize, quota) fail CLOSED
 */

async function loadInputs(workspaceId: string) {
  const [subSnap, planConfigSnap] = await Promise.all([
    adminDb().collection("workspaces").doc(workspaceId).collection("billing").doc("subscription").get(),
    adminDb().collection("platform_config").doc("plans").get(),
  ]);
  const subscription = subSnap.exists ? (subSnap.data() as WorkspaceSubscription) : null;
  const planLimits = mergePlanConfig(planConfigSnap.exists ? (planConfigSnap.data() as PlatformPlanConfig) : null).limits;
  return { subscription, planLimits };
}

/** The resolved limits + where each came from (limits only — the cheap path used by quota reservation). */
export async function resolveWorkspaceEntitlements(workspaceId: string): Promise<ResolvedEntitlements> {
  const { subscription, planLimits } = await loadInputs(workspaceId);
  return resolveEntitlementsDetailed(subscription, planLimits);
}

/** What the plan alone would give this workspace (ignoring any Super Admin override) — shown beside the override so the effect is visible. */
async function resolvePlanOnly(workspaceId: string) {
  const { subscription, planLimits } = await loadInputs(workspaceId);
  const planOnly = resolveEntitlementsDetailed(subscription ? { ...subscription, customEntitlements: null } : null, planLimits);
  return { subscription, planOnly, full: resolveEntitlementsDetailed(subscription, planLimits) };
}

const finite = (n: number | undefined | null): number | null => (typeof n === "number" && Number.isFinite(n) ? n : null);
const sourceOf = (s: string): EntitlementSource => (s === "override" ? "override" : s === "default" ? "default" : "plan");

/** The workspace's owner/admin-configured per-file choice (MB) — a business CONFIGURATION, stored apart from the entitlement. */
async function readWorkspaceConfiguredMb(workspaceId: string): Promise<number | null> {
  const snap = await adminDb().collection("settings").doc(workspaceId).get();
  const mb = snap.data()?.storage?.maxFileSizeMb;
  return typeof mb === "number" && Number.isFinite(mb) && mb > 0 ? mb : null;
}

/**
 * The effective per-file policy for one workspace, for the finalize route. Fails closed: if the entitlement or the setting can't be
 * read, this throws and the caller must refuse the upload rather than assume a larger limit.
 */
export async function resolveWorkspaceFilePolicy(workspaceId: string) {
  const [resolved, configuredMb] = await Promise.all([resolveWorkspaceEntitlements(workspaceId), readWorkspaceConfiguredMb(workspaceId)]);
  return resolveFilePolicy({
    platformCeilingBytes: PLATFORM_MAX_FILE_BYTES,
    entitlementBytes: resolved.limits.maxFileEntitlementBytes,
    workspaceConfiguredMb: configuredMb,
  });
}

/**
 * The full resolved entitlements + usage for a workspace (see types/entitlements.types.ts). `includeSeatDetails` is false for callers who
 * may see storage and the file policy but not who holds seats (plain members).
 */
export async function getWorkspaceEntitlements(workspaceId: string, opts: { includeSeatDetails?: boolean } = {}): Promise<WorkspaceEntitlements | null> {
  const db = adminDb();
  const wsSnap = await db.collection("workspaces").doc(workspaceId).get();
  if (!wsSnap.exists) return null;

  await ensureCounterInitialized(workspaceId, "storage").catch(() => undefined);
  const [{ subscription, planOnly, full }, configuredMb, freshWs, seats, invitesSnap] = await Promise.all([
    resolvePlanOnly(workspaceId),
    readWorkspaceConfiguredMb(workspaceId),
    db.collection("workspaces").doc(workspaceId).get(),
    opts.includeSeatDetails === false ? Promise.resolve(null) : summarizeSeats(workspaceId),
    opts.includeSeatDetails === false
      ? Promise.resolve(null)
      : db.collection("workspace_invites").where("workspaceId", "==", workspaceId).where("status", "==", "pending").select("expiresAt").get(),
  ]);

  const ws = freshWs.data() ?? {};
  const limits: WorkspacePlanLimits = full.limits;
  const status = subscription?.status;
  const billingSource: WorkspaceEntitlements["billingSource"] =
    status === "trialing" ? "trial" : status === "active" ? (subscription?.billingProvider === "manual" ? "manual" : "paid") : "free";

  const memberLimit = finite(limits.maxMembers);
  const storageLimit = finite(limits.maxStorageBytes);
  const usedBytes = typeof ws.storageBytesUsed === "number" ? ws.storageBytesUsed : 0;
  const now = Date.now();
  const customRaw = (subscription?.customEntitlements ?? {}) as Record<string, unknown>;
  const overrideOf = (key: string) => {
    const legacy = key === "maxFileEntitlementBytes" ? customRaw.maxFileBytes : undefined;
    const v = customRaw[key] ?? legacy;
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  };

  const file = resolveFilePolicy({
    platformCeilingBytes: PLATFORM_MAX_FILE_BYTES,
    entitlementBytes: limits.maxFileEntitlementBytes,
    workspaceConfiguredMb: configuredMb,
  });

  return {
    workspaceId,
    workspaceName: String(ws.name ?? ""),
    plan: full.plan as WorkspacePlan,
    subscriptionStatus: String(ws.subscriptionStatus ?? subscription?.status ?? "active"),
    billingSource,
    malformedOverrides: full.malformedOverrides,
    members:
      seats === null
        ? null
        : {
            used: seats.used,
            limit: memberLimit,
            remaining: memberLimit === null ? null : Math.max(0, memberLimit - seats.used),
            source: sourceOf(full.sources.maxMembers),
            planLimit: finite(planOnly.limits.maxMembers),
            override: overrideOf("maxMembers"),
            byRole: seats.byRole,
            disabled: seats.disabled,
            superAdminMembers: seats.superAdminMembers,
            pendingInvites: invitesSnap ? invitesSnap.docs.filter((d) => Date.parse(d.data().expiresAt as string) >= now).length : 0,
          },
    storage: {
      usedBytes,
      limitBytes: storageLimit,
      remainingBytes: storageLimit === null ? null : Math.max(0, storageLimit - usedBytes),
      source: sourceOf(full.sources.maxStorageBytes),
      planLimitBytes: finite(planOnly.limits.maxStorageBytes),
      overrideBytes: overrideOf("maxStorageBytes"),
    },
    files: {
      platformCeilingBytes: file.platformCeilingBytes,
      entitlementBytes: file.entitlementBytes,
      workspaceCeilingBytes: file.workspaceCeilingBytes,
      workspaceConfiguredBytes: file.workspaceConfiguredBytes,
      maxFileBytes: file.maxFileBytes,
      source: file.source === "workspace" ? "workspace" : file.source === "entitlement" ? sourceOf(full.sources.maxFileEntitlementBytes) : "platform",
    },
  };
}
