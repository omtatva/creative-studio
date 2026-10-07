import { NextRequest, NextResponse } from "next/server";
import { verifySuperAdminAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { logPlatformAudit } from "@/lib/server/platformAudit";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { validateProjectHeaderStyle, type PlatformAppearanceDoc } from "@/lib/constants/projectAppearance";

export const runtime = "nodejs";

/**
 * Saves the global project header appearance — SUPER ADMIN ONLY
 * (verifySuperAdminAuth), Admin-SDK write because `platform_settings` is
 * client-write-locked in firestore.rules. Body:
 *   { projectHeader: { primary, secondary, direction }, applyToExisting?: boolean }
 * - Always stores the style as the default for NEW projects (and records
 *   `defaultSavedAt` the first time, which is what makes later projects
 *   follow it).
 * - `applyToExisting: true` additionally stamps `appliedToAllAt`. That is
 *   the ENTIRE "apply to all existing projects" operation: one document
 *   write. Every project's header is derived from this doc at render time
 *   (see lib/constants/projectAppearance.ts), so no project documents are
 *   touched, nothing needs a batch/cursor, and it can't half-apply.
 * Colors must be #RRGGBB and direction a whitelisted keyword, so nothing
 * else can ever be interpolated into CSS.
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
    await enforceRateLimit(`appearance-update:${uid}`, 20, 300);
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  let body: { projectHeader?: unknown; applyToExisting?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body.applyToExisting !== "undefined" && typeof body.applyToExisting !== "boolean") {
    return NextResponse.json({ error: "applyToExisting must be true or false." }, { status: 400 });
  }
  const checked = validateProjectHeaderStyle(body.projectHeader);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const ref = adminDb().collection("platform_settings").doc("appearance");
  const now = new Date().toISOString();
  try {
    const existing = await ref.get();
    const prev = existing.exists ? (existing.data() as Partial<PlatformAppearanceDoc>) : {};
    const next: PlatformAppearanceDoc = {
      projectHeader: checked.style,
      defaultSavedAt: prev.defaultSavedAt ?? now,
      appliedToAllAt: body.applyToExisting === true ? now : (prev.appliedToAllAt ?? null),
      updatedBy: uid,
      createdAt: prev.createdAt ?? now,
      updatedAt: now,
    };
    await ref.set(next);

    await logPlatformAudit({
      actorUid: uid,
      action: "platform_settings_updated",
      workspaceId: "platform",
      details: {
        event: body.applyToExisting === true ? "project_header_applied_to_existing" : "project_header_default_saved",
        section: "appearance",
        projectHeader: checked.style,
      },
    });
    return NextResponse.json({ success: true, appearance: next });
  } catch (err) {
    console.error("[platform-settings/appearance] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't save appearance. Try again." }, { status: 503 });
  }
}
