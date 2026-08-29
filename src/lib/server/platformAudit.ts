import "server-only";
import { adminDb } from "@/lib/server/firebaseAdmin";
import type { PlatformAuditAction } from "@/types/platformAudit.types";

interface LogPlatformAuditArgs {
  actorUid: string;
  action: PlatformAuditAction;
  workspaceId: string;
  details: Record<string, unknown>;
}

/** Records one Super Admin action — see platformAudit.types.ts. Best-effort: a logging failure never blocks the underlying admin action. */
export async function logPlatformAudit({ actorUid, action, workspaceId, details }: LogPlatformAuditArgs): Promise<void> {
  try {
    const ref = adminDb().collection("platform_audit_logs").doc();
    const now = new Date().toISOString();
    await ref.set({ id: ref.id, actorUid, action, workspaceId, details, createdAt: now, updatedAt: now });
  } catch (err) {
    console.error("[platformAudit] failed to write audit log entry:", err);
  }
}
