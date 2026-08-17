/**
 * Dynamic, generated permission catalog — every module × action
 * combination, not a hand-picked subset. Nothing about "what
 * permissions exist" is hardcoded per-role; roles just select keys
 * from this catalog (see workspace.types.ts CustomRole). Adding a
 * new module here automatically gives every role screen a new
 * row — no other file needs to change.
 */
export const PERMISSION_MODULES = [
  "Dashboard",
  "Projects",
  "Tasks",
  "Board",
  "Files",
  "Reviews",
  "Downloads",
  "Calendar",
  "Team",
  "Notifications",
  "AI Studio",
  "Settings",
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "archive", "export", "manage"] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export interface PermissionOption {
  key: string; // `${module}.${action}`, lowercase-dashed module
  label: string;
  module: PermissionModule;
  action: PermissionAction;
}

function moduleSlug(module: PermissionModule): string {
  return module.toLowerCase().replace(/\s+/g, "_");
}

export const PERMISSION_CATALOG: PermissionOption[] = PERMISSION_MODULES.flatMap((module) =>
  PERMISSION_ACTIONS.map((action) => ({
    key: `${moduleSlug(module)}.${action}`,
    label: `${action.charAt(0).toUpperCase()}${action.slice(1)} ${module}`,
    module,
    action,
  }))
);

export function permissionKey(module: PermissionModule, action: PermissionAction): string {
  return `${moduleSlug(module)}.${action}`;
}

/**
 * Seed permission sets for the built-in named roles the Access
 * Control page ships with (see lib/constants/roles.ts). These are
 * just the INITIAL permissions of a seeded CustomRole doc — once
 * seeded, editing them is identical to editing any custom role
 * (Firestore is the source of truth from that point on, not this
 * constant).
 */
const ALL_KEYS = PERMISSION_CATALOG.map((p) => p.key);
const VIEW_ONLY = PERMISSION_CATALOG.filter((p) => p.action === "view").map((p) => p.key);
const NO_SETTINGS_MANAGE = ALL_KEYS.filter((k) => k !== permissionKey("Settings", "manage"));

export const ROLE_SEED_PERMISSIONS: Record<string, string[]> = {
  "Super Admin": ALL_KEYS,
  "Workspace Admin": NO_SETTINGS_MANAGE,
  "Project Manager": PERMISSION_CATALOG.filter((p) => ["Dashboard", "Projects", "Tasks", "Board", "Calendar", "Team"].includes(p.module)).map((p) => p.key),
  "Team Lead": PERMISSION_CATALOG.filter((p) => ["Dashboard", "Projects", "Tasks", "Board", "Calendar"].includes(p.module) && p.action !== "delete").map((p) => p.key),
  Reviewer: PERMISSION_CATALOG.filter((p) => ["Dashboard", "Reviews", "Files", "Downloads"].includes(p.module) || (p.module === "Projects" && p.action === "view")).map((p) => p.key),
  Designer: PERMISSION_CATALOG.filter((p) => ["Dashboard", "Tasks", "Board", "Files"].includes(p.module) && ["view", "create", "edit"].includes(p.action)).map((p) => p.key),
  Editor: PERMISSION_CATALOG.filter((p) => ["Dashboard", "Tasks", "Files"].includes(p.module) && ["view", "create", "edit"].includes(p.action)).map((p) => p.key),
  Viewer: VIEW_ONLY,
};
