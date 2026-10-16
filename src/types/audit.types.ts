import { ID, Timestamps } from "./common.types";

export type AuditAction =
  | "login"
  | "logout"
  | "role_changed"
  | "permission_changed"
  | "settings_changed"
  | "file_upload"
  | "review_approval"
  | "project_change"
  | "task_change"
  // External review links (written server-side by lib/server/reviewShare.ts — never carry passwords or tokens).
  | "review_link_created"
  | "review_link_updated"
  | "review_link_revoked"
  | "external_review_opened"
  | "external_comment_created"
  | "external_review_approved"
  | "external_changes_requested";

/**
 * Compliance-grade audit trail — distinct from the human-readable
 * `activity_logs` feed (see activityService.ts) used for the
 * Activity page/dashboard widget. This collection exists
 * specifically to capture before/after values and actor context for
 * sensitive actions. IP address is NOT captured: a client-only app
 * has no reliable, spoof-resistant way to determine the caller's IP
 * (that requires a server request context this codebase doesn't
 * have), so `ipAddress` is always "Not available (client-side app)"
 * rather than a fabricated value — see auditService.ts.
 */
export interface AuditLogEntry extends Timestamps {
  id: ID;
  workspaceId: ID;
  userId: ID;
  userName: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  ipAddress: string;
  userAgent: string;
  previousValue: string | null;
  newValue: string | null;
}
