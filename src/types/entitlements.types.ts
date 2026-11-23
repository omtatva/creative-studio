/**
 * The ONE resolved entitlement/usage policy for a workspace — built server-side by getWorkspaceEntitlements() (lib/server/workspaceEntitlements.ts)
 * and consumed unchanged by the uploader, Settings > Storage, Settings > Users, the dashboard and Super Admin > Customers. "null" means "no limit".
 *
 * Precedence, in one direction only:
 *   PLATFORM safety ceiling  ->  PLAN entitlement  ->  SUPER ADMIN workspace override  ->  WORKSPACE-configurable value (file size only)
 */

export type EntitlementSource = "plan" | "override" | "default" | "platform" | "workspace";

export interface SeatEntitlement {
  /** Active seat holders: active owner/admin/member/viewer. Disabled members, pending invites, the Super Admin and external reviewers hold no seat. */
  used: number;
  limit: number | null;
  remaining: number | null;
  /** Where `limit` comes from: the plan, a Super Admin override, or the default plan because no paid entitlement is active. */
  source: EntitlementSource;
  planLimit: number | null;
  override: number | null;
  byRole: { owner: number; admin: number; member: number; viewer: number };
  disabled: number;
  superAdminMembers: number;
  pendingInvites: number;
}

export interface StorageEntitlement {
  usedBytes: number;
  limitBytes: number | null;
  remainingBytes: number | null;
  source: EntitlementSource;
  planLimitBytes: number | null;
  overrideBytes: number | null;
}

export interface FileEntitlement {
  /** Absolute platform safety ceiling for one file. */
  platformCeilingBytes: number;
  /** The per-file ENTITLEMENT from the plan/override, if one exists (null = none, the platform ceiling applies). Set by Super Admin only. */
  entitlementBytes: number | null;
  /** min(platform ceiling, entitlement): the most a workspace owner/admin may configure. */
  workspaceCeilingBytes: number;
  /** What the workspace owner/admin CHOSE (Settings > Storage), stored separately from the entitlement. null = nothing chosen. */
  workspaceConfiguredBytes: number | null;
  /** EFFECTIVE per-file limit every upload is checked against, in the browser and again at finalize. */
  maxFileBytes: number;
  /** Which layer decided `maxFileBytes`. */
  source: EntitlementSource;
}

export interface WorkspaceEntitlements {
  workspaceId: string;
  workspaceName: string;
  plan: string;
  subscriptionStatus: string;
  /** How the entitlement is held. */
  billingSource: "trial" | "paid" | "manual" | "free";
  /** Override keys that were present but malformed and therefore IGNORED (the plan value applies instead). */
  malformedOverrides: string[];
  /** null for callers who may not see seat details (only owners/admins/Super Admin do). */
  members: SeatEntitlement | null;
  storage: StorageEntitlement;
  files: FileEntitlement;
}
