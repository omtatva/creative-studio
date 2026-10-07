import { NextRequest, NextResponse } from "next/server";
import { verifySuperAdminAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { logPlatformAudit } from "@/lib/server/platformAudit";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { defaultFeatureGrants, validateFeatureGrants, type FeatureGrants } from "@/lib/constants/featurePermissions";

/** Saved grants overlaid on the registry defaults — the effective matrix before this save. */
function materializeSaved(saved: FeatureGrants | undefined): FeatureGrants {
  const out = defaultFeatureGrants();
  for (const id of Object.keys(out)) {
    for (const role of ["admin", "member"] as const) {
      const v = saved?.[id]?.[role];
      if (typeof v === "boolean") out[id]![role] = v;
    }
  }
  return out;
}

export const runtime = "nodejs";

/**
 * Saves the Feature Access matrix — SUPER ADMIN ONLY (the existing
 * verifySuperAdminAuth mechanism), written with the Admin SDK because
 * `platform_settings` is client-write-locked in firestore.rules. Body:
 * `{ grants }` (validated: only known CONFIGURABLE ids, only admin/
 * member, only booleans — the hard-locked platform permissions and the
 * owner column can't be set through here at all) or `{ reset: true }`
 * to restore the registry defaults. Always stores the FULL materialized
 * map so the Firestore rules and every reader see one complete document.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifySuperAdminAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 403;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Not authorized." }, { status });
  }

  try {
    await enforceRateLimit(`feature-access-update:${uid}`, 20, 300);
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  let body: { grants?: unknown; reset?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  let grants;
  if (body.reset === true) {
    grants = defaultFeatureGrants();
  } else {
    const checked = validateFeatureGrants(body.grants);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    grants = checked.grants;
  }

  const ref = adminDb().collection("platform_settings").doc("featureAccess");
  const now = new Date().toISOString();
  try {
    const existing = await ref.get();
    const createdAt = (existing.exists ? existing.data()?.createdAt : null) ?? now;
    // What actually changed (vs the previous effective matrix), so the audit trail says more than "saved".
    const before = materializeSaved(existing.exists ? (existing.data()?.grants as FeatureGrants | undefined) : undefined);
    const changed: string[] = [];
    for (const [id, roles] of Object.entries(grants)) {
      for (const role of ["admin", "member"] as const) {
        if (roles[role] !== before[id]?.[role]) changed.push(`${id}.${role}=${roles[role]}`);
      }
    }
    // set() without merge: the document is replaced wholesale so a
    // removed/renamed permission id can never linger.
    await ref.set({ grants, updatedBy: uid, createdAt, updatedAt: now });
    await logPlatformAudit({
      actorUid: uid,
      action: "feature_access_updated",
      workspaceId: "platform",
      details: { event: body.reset === true ? "reset_to_defaults" : "saved", changed },
    });
    return NextResponse.json({ success: true, grants });
  } catch (err) {
    console.error("[platform-settings/feature-access] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't save feature access. Try again." }, { status: 503 });
  }
}
