import { NextRequest, NextResponse } from "next/server";
import { verifySuperAdminAuth, AuthVerificationError } from "@/lib/server/firebaseAdmin";
import { applySubscriptionUpdate, getSubscriptionAdmin } from "@/lib/server/billingAdmin";
import { logPlatformAudit } from "@/lib/server/platformAudit";
import { getWorkspaceEntitlements } from "@/lib/server/workspaceEntitlements";
import { PLATFORM_MAX_FILE_BYTES, MB, GB } from "@/lib/constants/uploadPolicy";
import { OVERRIDABLE_LIMIT_KEYS, type OverridableLimitKey } from "@/lib/entitlements";
import type { WorkspacePlanLimits } from "@/types/workspace.types";

export const runtime = "nodejs";

/**
 * SUPER-ADMIN-ONLY: set or clear a workspace's member-seat, total-storage and per-file-size ENTITLEMENT overrides.
 * Each key in the body is either a positive number (set the override) or null (remove it and fall back to the plan); keys left out are not
 * touched. Overrides are stored in the subscription's customEntitlements — the same field Enterprise activations already use — and the
 * workspace's display cache is re-derived in the same transaction, so the new entitlement applies immediately, with no deploy.
 * A workspace owner/admin cannot call this: they can see their limits but never change what they are entitled to.
 */
export async function POST(request: NextRequest) {
  let superAdminUid: string;
  try {
    ({ uid: superAdminUid } = await verifySuperAdminAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 403;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Not authorized." }, { status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });

  const changes: Partial<Record<OverridableLimitKey, number | null>> = {};
  for (const key of OVERRIDABLE_LIMIT_KEYS) {
    if (!(key in body)) continue;
    const value = body[key];
    if (value === null) {
      changes[key] = null;
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return NextResponse.json({ error: `${key} must be a positive number, or null to remove the override.` }, { status: 400 });
    if (key === "maxMembers" && (!Number.isInteger(value) || value > 100000)) return NextResponse.json({ error: "Member limit must be a whole number between 1 and 100000." }, { status: 400 });
    if (key === "maxStorageBytes" && value < GB) return NextResponse.json({ error: "Total storage must be at least 1 GB." }, { status: 400 });
    if (key === "maxFileEntitlementBytes" && (value < MB || value > PLATFORM_MAX_FILE_BYTES)) return NextResponse.json({ error: "The file-size entitlement must be between 1 MB and the platform safety ceiling." }, { status: 400 });
    changes[key] = Math.floor(value);
  }
  if (Object.keys(changes).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const existing = await getSubscriptionAdmin(workspaceId);
  const next: Partial<WorkspacePlanLimits> & Record<string, unknown> = { ...(existing?.customEntitlements ?? {}) };
  // The legacy name for the file-size entitlement is dropped the moment it is touched (it is still READ elsewhere for old data).
  if ("maxFileEntitlementBytes" in changes) delete next.maxFileBytes;
  for (const key of OVERRIDABLE_LIMIT_KEYS) {
    if (!(key in changes)) continue;
    if (changes[key] === null) delete next[key];
    else next[key] = changes[key] as number;
  }

  await applySubscriptionUpdate(workspaceId, { customEntitlements: Object.keys(next).length > 0 ? (next as Partial<WorkspacePlanLimits>) : null }, superAdminUid);
  await logPlatformAudit({ actorUid: superAdminUid, action: "entitlement_overrides_updated", workspaceId, details: { changes, resulting: next } });

  const entitlements = await getWorkspaceEntitlements(workspaceId);
  return NextResponse.json({ success: true, entitlements });
}
