import { ID, Timestamps } from "./common.types";

/**
 * Platform-wide Super Admin action trail — deliberately separate from
 * the existing per-workspace `audit_logs` collection (audit.types.ts),
 * which is written client-side by ordinary workspace members about
 * their own workspace. This one is admin-SDK-write-only (see
 * firestore.rules' platform_audit_logs block) and only ever records
 * actions the Super Admin takes across the platform — plan
 * activations, Enterprise activations, subscription status changes.
 */
export type PlatformAuditAction = "plan_activated" | "enterprise_activated" | "subscription_status_changed";

export interface PlatformAuditLogEntry extends Timestamps {
  id: ID;
  actorUid: ID;
  action: PlatformAuditAction;
  workspaceId: ID;
  details: Record<string, unknown>;
}
