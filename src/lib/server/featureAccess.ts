import "server-only";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { FEATURE_PERMISSION_BY_ID, resolveFeatureGrant, type FeatureGrants } from "@/lib/constants/featurePermissions";
import type { MemberRole } from "@/types/workspace.types";

/**
 * Server-side half of the Feature Access matrix (see
 * lib/constants/featurePermissions.ts). Reads the Super-Admin-written
 * `platform_settings/featureAccess` doc with the Admin SDK and answers
 * "may this workspace ROLE use this capability" through the SAME
 * resolveFeatureGrant function the UI uses, so the two can't drift.
 *
 * A missing doc, an unreadable doc, or a key that was never saved all
 * resolve to the registry default (today's behaviour) — the matrix only
 * ever RESTRICTS when Super Admin has explicitly saved an unticked box.
 * This is a necessary-not-sufficient check: callers still verify
 * workspace membership, project membership/role, and quota themselves.
 */
export async function loadFeatureGrants(): Promise<FeatureGrants | null> {
  try {
    const snap = await adminDb().collection("platform_settings").doc("featureAccess").get();
    return snap.exists ? ((snap.data()?.grants as FeatureGrants | undefined) ?? null) : null;
  } catch (err) {
    // A transient read failure must not lock every workspace out of
    // core features — fall back to defaults (today's behaviour). The
    // other authorization layers (membership, project role, quota)
    // still apply regardless.
    console.error("[featureAccess] couldn't read feature grants — using defaults:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function isFeatureAllowed(role: MemberRole | null | undefined, permissionId: string): Promise<boolean> {
  if (!FEATURE_PERMISSION_BY_ID[permissionId]) return false;
  return resolveFeatureGrant(await loadFeatureGrants(), role, permissionId);
}

export const FEATURE_DISABLED_CODE = "FEATURE_DISABLED";

/** The standard 403 body for a feature the caller's role has been denied — says WHICH capability, never why in policy terms. */
export function featureDisabledBody(permissionId: string) {
  const label = FEATURE_PERMISSION_BY_ID[permissionId]?.label ?? permissionId;
  return { error: `"${label}" isn't enabled for your role in this workspace. Contact your administrator.`, code: FEATURE_DISABLED_CODE };
}
