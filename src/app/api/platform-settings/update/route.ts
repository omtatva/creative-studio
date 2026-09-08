import { NextRequest, NextResponse } from "next/server";
import { verifySuperAdminAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { logPlatformAudit } from "@/lib/server/platformAudit";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { DEFAULT_PLATFORM_SETTINGS } from "@/types/platformSettings.types";

export const runtime = "nodejs";

/**
 * The only path that may ever change platform_settings/global (see
 * firestore.rules — the collection's client write side is `if false`).
 * verifySuperAdminAuth re-verifies the caller's REAL, server-checked
 * platformRole on every call — never a request-body `role`/`email`/
 * `isSuperAdmin` field, which a normal signed-in user could trivially
 * send. Only the specific, allow-listed fields below are ever written,
 * so an unrelated/unexpected body field can't silently land in the doc.
 */
const EDITABLE_FIELDS = ["platformName", "platformUrl", "supportEmail", "timezone", "maintenanceMode"] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

interface UpdateBody {
  platformName?: string;
  platformUrl?: string;
  supportEmail?: string;
  timezone?: string;
  maintenanceMode?: boolean;
}

export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifySuperAdminAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 403;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Not authorized." }, { status });
  }

  try {
    await enforceRateLimit(`platform-settings-update:${uid}`, 20, 300);
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  let body: UpdateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const patch: Partial<Record<EditableField, unknown>> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) patch[key] = body[key];
  }

  if (typeof patch.platformName !== "undefined" && (typeof patch.platformName !== "string" || !patch.platformName.trim())) {
    return NextResponse.json({ error: "Platform name can't be empty." }, { status: 400 });
  }
  if (typeof patch.supportEmail !== "undefined" && (typeof patch.supportEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.supportEmail))) {
    return NextResponse.json({ error: "Enter a valid support email address." }, { status: 400 });
  }
  if (typeof patch.maintenanceMode !== "undefined" && typeof patch.maintenanceMode !== "boolean") {
    return NextResponse.json({ error: "maintenanceMode must be true or false." }, { status: 400 });
  }

  const ref = adminDb().collection("platform_settings").doc("global");
  const now = new Date().toISOString();
  try {
    const existing = await ref.get();
    const base = existing.exists ? existing.data() : { ...DEFAULT_PLATFORM_SETTINGS, createdAt: now };
    const next = { ...base, ...patch, updatedBy: uid, updatedAt: now, createdAt: base?.createdAt ?? now };
    await ref.set(next, { merge: true });

    await logPlatformAudit({
      actorUid: uid,
      action: "platform_settings_updated",
      workspaceId: "platform",
      details: { event: "platform_settings_updated", updatedFields: Object.keys(patch) },
    });

    return NextResponse.json({ success: true, settings: next });
  } catch (err) {
    console.error("[platform-settings/update] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't save platform settings. Try again." }, { status: 503 });
  }
}
