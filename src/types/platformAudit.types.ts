import { ID, Timestamps } from "./common.types";

/**
 * Security-sensitive BILLING action trail — deliberately separate
 * from the existing per-workspace `audit_logs` collection
 * (audit.types.ts), which is written client-side by ordinary
 * workspace members about their own workspace. This one is
 * admin-SDK-write-only (see firestore.rules' platform_audit_logs
 * block) and records every billing-relevant event regardless of who
 * triggered it: Super Admin actions (plan activations, Enterprise
 * activations, manual status changes) AND ordinary owner/admin-
 * initiated ones (checkout created, plan changed) and the billing
 * webhook itself — `actorUid` distinguishes them (a real uid, or the
 * literal string "billing-webhook" for provider-initiated events).
 * `details` carries an `event` sub-classification (e.g.
 * "checkout_created") where one action id covers more than one real
 * event shape.
 *
 * `workspaceId` is `"platform"` (a sentinel, not a real workspace id)
 * for events with no per-workspace scope at all — currently only
 * `platform_settings_updated` (see /api/platform-settings/update). The
 * Audit Logs page checks for this sentinel and skips linking to
 * Super Admin > Customers for those rows.
 */
export type PlatformAuditAction =
  | "plan_activated"
  | "enterprise_activated"
  | "subscription_status_changed"
  | "platform_settings_updated";

export interface PlatformAuditLogEntry extends Timestamps {
  id: ID;
  actorUid: ID;
  action: PlatformAuditAction;
  workspaceId: ID;
  details: Record<string, unknown>;
}
