import type { MemberRole } from "@/types/workspace.types";

/**
 * FEATURE ACCESS MATRIX — which workspace ROLE may use which product
 * capability. Edited only by the platform Super Admin (Super Admin >
 * Feature Access), stored in `platform_settings/featureAccess`
 * (admin-SDK-write-only, signed-in-readable — see firestore.rules),
 * and enforced server-side (see lib/server/featureAccess.ts and the
 * route/rule list on each definition below).
 *
 * This EXTENDS the existing permission vocabulary instead of adding a
 * second one: ids use the same stable `module.action` format as
 * lib/constants/permissions.ts' PERMISSION_CATALOG (`projects.create`,
 * `tasks.edit`, ...), never UI labels. It is deliberately keyed by the
 * real, enforced `MemberRole` (owner/admin/member) — NOT by the
 * per-workspace `CustomRole` layer, which is a reference layer that
 * nothing enforces (see CustomRole's doc comment in workspace.types.ts).
 *
 * Feature permission is NECESSARY but never SUFFICIENT: effective
 * access is workspace membership AND this feature grant AND project
 * membership/role AND entitlement/quota. Granting `files.upload` to
 * employees does not let one upload to a project they aren't on.
 *
 * INVARIANT the Firestore rules rely on: every CONFIGURABLE permission
 * defaults to TRUE for admin and member (today's behaviour), and the
 * rules treat "no document / key not explicitly false" as allowed. If a
 * configurable default is ever made false, firestore.rules'
 * featureAllowed() must change with it (a unit-style check in the
 * audit script asserts this).
 */

/** Columns shown in the matrix. Owners are always granted configurable permissions (locked on). Viewers are always read-only and have no column. */
export const FEATURE_ROLES = ["owner", "admin", "member"] as const;
export type FeatureRole = (typeof FEATURE_ROLES)[number];

export const FEATURE_ROLE_LABEL: Record<FeatureRole, string> = { owner: "Owner", admin: "Admin", member: "Employee" };

export type FeatureGroup =
  | "Navigation"
  | "Projects"
  | "Creative workspace"
  | "Tasks"
  | "Reviews"
  | "AI"
  | "Workspace & billing";

export interface FeaturePermissionDef {
  /** Stable database id — NEVER a UI label. */
  id: string;
  label: string;
  group: FeatureGroup;
  /** false = shown in the matrix as a fixed value (lock), not a checkbox. */
  configurable: boolean;
  /** Value per role. For configurable rows this is the default Super Admin can override (admin/member only; owner is always true). */
  defaults: Record<FeatureRole, boolean>;
  /** Where the permission is enforced beyond the UI — shown in the matrix so "is this real?" is answerable. */
  enforcedBy: string;
}

const ALL: Record<FeatureRole, boolean> = { owner: true, admin: true, member: true };
const OWNER_ADMIN: Record<FeatureRole, boolean> = { owner: true, admin: true, member: false };

const nav = (id: string, label: string): FeaturePermissionDef => ({
  id,
  label,
  group: "Navigation",
  configurable: false,
  defaults: ALL,
  enforcedBy: "Project/workspace membership (rules)",
});

export const FEATURE_PERMISSIONS: FeaturePermissionDef[] = [
  nav("dashboard.view", "Dashboard"),
  nav("board.view", "Board"),
  nav("files.view", "Files"),
  nav("downloads.view", "Downloads"),
  nav("calendar.view", "Calendar"),
  nav("activity.view", "Activity"),
  // Configurable, but UI-level only: it hides the Notifications page/bell. Notification RECORDS are still
  // created and kept (they are system/audit data) and a user can still read their own feed under the rules.
  { id: "notifications.view", label: "Notifications", group: "Navigation", configurable: true, defaults: ALL, enforcedBy: "UI only (hides the page and bell); records are still delivered and kept" },
  { id: "projects.view", label: "Projects — View", group: "Projects", configurable: false, defaults: ALL, enforcedBy: "Project membership (rules)" },
  { id: "projects.create", label: "Projects — Create", group: "Projects", configurable: true, defaults: ALL, enforcedBy: "POST /api/projects/create" },
  { id: "projects.edit", label: "Projects — Edit", group: "Projects", configurable: true, defaults: ALL, enforcedBy: "Firestore rules (projects update) + project role" },
  { id: "projects.delete", label: "Projects — Delete / archive", group: "Projects", configurable: true, defaults: ALL, enforcedBy: "Firestore rules (projects update/delete) + project role" },
  { id: "creative.workspace", label: "Creative Workspace", group: "Creative workspace", configurable: false, defaults: ALL, enforcedBy: "Project membership (rules)" },
  { id: "files.upload", label: "Upload files", group: "Creative workspace", configurable: true, defaults: ALL, enforcedBy: "POST /api/files/finalize (the only way a file becomes a record)" },
  { id: "files.download", label: "Download files", group: "Creative workspace", configurable: true, defaults: ALL, enforcedBy: "POST /api/files/download + GET /api/files/download (every download path)" },
  { id: "files.uploadVersion", label: "Upload new version", group: "Creative workspace", configurable: true, defaults: ALL, enforcedBy: "POST /api/files/finalize" },
  { id: "stages.create", label: "Create stage", group: "Creative workspace", configurable: true, defaults: ALL, enforcedBy: "Firestore rules (stages create)" },
  { id: "stages.edit", label: "Edit stage", group: "Creative workspace", configurable: true, defaults: ALL, enforcedBy: "Firestore rules (stages update)" },
  { id: "stages.delete", label: "Delete stage", group: "Creative workspace", configurable: true, defaults: ALL, enforcedBy: "Firestore rules (stages update/delete)" },
  { id: "tasks.view", label: "Tasks — View", group: "Tasks", configurable: false, defaults: ALL, enforcedBy: "Project membership (rules)" },
  { id: "tasks.create", label: "Tasks — Create", group: "Tasks", configurable: true, defaults: ALL, enforcedBy: "Firestore rules (tasks create)" },
  { id: "tasks.edit", label: "Tasks — Edit", group: "Tasks", configurable: true, defaults: ALL, enforcedBy: "Firestore rules (tasks update)" },
  { id: "reviews.view", label: "Reviews — View", group: "Reviews", configurable: false, defaults: ALL, enforcedBy: "Project membership (rules)" },
  { id: "reviews.comment", label: "Reviews — Comment", group: "Reviews", configurable: false, defaults: ALL, enforcedBy: "Project membership (rules)" },
  { id: "reviews.approve", label: "Reviews — Approve", group: "Reviews", configurable: false, defaults: OWNER_ADMIN, enforcedBy: "Workspace role (existing review rules)" },
  { id: "ai.use", label: "AI Studio", group: "AI", configurable: true, defaults: ALL, enforcedBy: "POST /api/ai-studio/generate (+ plan entitlement & quota)" },
  { id: "workspace.customize", label: "Workspace customization", group: "Workspace & billing", configurable: false, defaults: OWNER_ADMIN, enforcedBy: "Workspace role (settings rules)" },
  { id: "billing.view", label: "Billing — View", group: "Workspace & billing", configurable: false, defaults: OWNER_ADMIN, enforcedBy: "Subscription read rule (owner/admin)" },
  { id: "billing.requestUpgrade", label: "Billing — Request upgrade", group: "Workspace & billing", configurable: false, defaults: OWNER_ADMIN, enforcedBy: "POST /api/billing/checkout & /change-plan (owner/admin)" },
];

export const FEATURE_PERMISSION_BY_ID: Record<string, FeaturePermissionDef> = Object.fromEntries(FEATURE_PERMISSIONS.map((p) => [p.id, p]));

export const CONFIGURABLE_PERMISSION_IDS: string[] = FEATURE_PERMISSIONS.filter((p) => p.configurable).map((p) => p.id);

/** Ordered group list for rendering. */
export const FEATURE_GROUP_ORDER: FeatureGroup[] = ["Navigation", "Projects", "Creative workspace", "Tasks", "Reviews", "AI", "Workspace & billing"];

/**
 * HARD-LOCKED platform permissions — never configurable for any
 * workspace role. Shown in the matrix page as locked, with no
 * Owner/Admin/Employee checkboxes. Enforced by Super Admin-only routes
 * and rules (see the People & Access model), not by this registry.
 */
export const PLATFORM_CONTROLLED_PERMISSIONS: { label: string; enforcedBy: string }[] = [
  { label: "Invite members", enforcedBy: "/api/invites/send + workspace_invites rules" },
  { label: "Edit members", enforcedBy: "/api/workspaces/members + members rules" },
  { label: "Remove members", enforcedBy: "/api/workspaces/members + members rules" },
  { label: "Disable members", enforcedBy: "/api/workspaces/members + members rules" },
  { label: "Change member role", enforcedBy: "/api/workspaces/members + members rules" },
  { label: "Roles administration", enforcedBy: "workspace_roles rules" },
  { label: "Access Control administration", enforcedBy: "settings rules (sidebarConfig / fieldSecurity)" },
  { label: "Plan authority", enforcedBy: "Subscription written only by server routes / Super Admin" },
  { label: "Limits", enforcedBy: "Workspace billing cache locked in rules; limits resolved server-side" },
  { label: "Entitlements", enforcedBy: "resolveEntitlements on the subscription" },
  { label: "Subscription administration", enforcedBy: "Super Admin billing routes" },
];

/** Shape of `platform_settings/featureAccess` — only configurable permissions, only admin/member (owner is locked on). */
export type FeatureGrants = Record<string, { admin?: boolean; member?: boolean }>;

export interface FeatureAccessDoc {
  grants: FeatureGrants;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The defaults, fully materialized — what "Reset to defaults" writes and what a never-saved matrix shows. */
export function defaultFeatureGrants(): FeatureGrants {
  const grants: FeatureGrants = {};
  for (const p of FEATURE_PERMISSIONS) if (p.configurable) grants[p.id] = { admin: p.defaults.admin, member: p.defaults.member };
  return grants;
}

/**
 * The ONE resolution function (client UI and server both use it).
 * `grants === null` means no matrix has ever been saved → defaults.
 *  - unknown permission id → false (fail closed)
 *  - non-configurable → its fixed per-role value (a workspace viewer gets
 *    only the fixed ".view"/comment rows, never owner/admin-only ones)
 *  - configurable: owner always true; otherwise the saved value, else the
 *    default. A workspace "viewer" has no matrix column and is evaluated
 *    as an Employee: whether they can actually WRITE is decided by their
 *    PROJECT role (a project viewer is read-only; a workspace viewer who
 *    was explicitly made a project editor already could upload), so the
 *    matrix must not silently change that.
 */
export function resolveFeatureGrant(grants: FeatureGrants | null | undefined, role: MemberRole | null | undefined, permissionId: string): boolean {
  const def = FEATURE_PERMISSION_BY_ID[permissionId];
  if (!def || !role) return false;
  const column: FeatureRole = role === "viewer" ? "member" : role;
  if (!def.configurable) return def.defaults[column];
  if (column === "owner") return true;
  const saved = grants?.[permissionId]?.[column];
  return typeof saved === "boolean" ? saved : def.defaults[column];
}

/** Validates an incoming grants payload (Super Admin save): only known configurable ids, only admin/member, only booleans. Returns the cleaned, fully materialized map or an error. */
export function validateFeatureGrants(input: unknown): { ok: true; grants: FeatureGrants } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "grants must be an object." };
  const raw = input as Record<string, unknown>;
  const out = defaultFeatureGrants();
  for (const [id, value] of Object.entries(raw)) {
    const def = FEATURE_PERMISSION_BY_ID[id];
    if (!def) return { ok: false, error: `Unknown permission "${id}".` };
    if (!def.configurable) return { ok: false, error: `"${id}" is not configurable.` };
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: `Invalid value for "${id}".` };
    for (const [role, granted] of Object.entries(value as Record<string, unknown>)) {
      if (role === "owner") continue; // owners are locked on; ignore rather than reject
      if (role !== "admin" && role !== "member") return { ok: false, error: `Unknown role "${role}" for "${id}".` };
      if (typeof granted !== "boolean") return { ok: false, error: `"${id}.${role}" must be true or false.` };
      out[id]![role] = granted;
    }
  }
  return { ok: true, grants: out };
}
