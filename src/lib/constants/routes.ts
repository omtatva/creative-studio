/**
 * Single source of truth for app routes. Import ROUTES instead of
 * hardcoding path strings in components/links so renaming a route
 * only touches this file.
 */
export const ROUTES = {
  home: "/",
  login: "/login",
  signup: "/signup",
  pricing: "/pricing",
  forgotPassword: "/forgot-password",
  dashboard: "/dashboard",
  settings: "/settings",
  settingsWorkspace: "/settings/workspace",
  settingsBranding: "/settings/branding",
  settingsTheme: "/settings/theme",
  settingsUsers: "/settings/users",
  settingsRoles: "/settings/roles",
  settingsNotifications: "/settings/notifications",
  settingsStorage: "/settings/storage",
  settingsSecurity: "/settings/security",
  settingsProject: "/settings/project-settings",
  settingsTask: "/settings/task-settings",
  settingsReview: "/settings/review-settings",
  settingsAccessControl: "/settings/access-control",
  settingsAi: "/settings/ai",
  settingsBilling: "/settings/billing",
  // Platform-wide Super Admin section — see lib/constants/itSupport.ts.
  // Deliberately its own top-level nav (Sidebar.tsx), not nested under
  // /settings: Super Admin manages EVERY workspace, not one.
  superAdmin: "/super-admin",
  superAdminCustomers: "/super-admin/customers",
  superAdminUsers: "/super-admin/users",
  superAdminBilling: "/super-admin/billing",
  superAdminPlans: "/super-admin/plans",
  superAdminSales: "/super-admin/sales",
  superAdminFeatures: "/super-admin/features",
  superAdminPlatformSettings: "/super-admin/platform-settings",
  superAdminAuditLogs: "/super-admin/audit-logs",
  workspaceCreate: "/workspace/create",
  projects: "/projects",
  tasks: "/tasks",
  board: "/board",
  files: "/files",
  reviews: "/reviews",
  downloads: "/downloads",
  team: "/team",
  calendar: "/calendar",
  activity: "/activity",
  notifications: "/notifications",
  aiStudio: "/ai-studio",
} as const;

export type RouteKey = keyof typeof ROUTES;

/** Project detail routes take an id, so they're built with a helper instead of a static map. */
export function projectRoute(projectId: string, tab: ProjectTab = "overview") {
  return `/projects/${projectId}/${tab}`;
}

export type ProjectTab =
  | "overview"
  | "workspace"
  | "tasks"
  | "board"
  | "files"
  | "reviews"
  | "activity"
  | "members"
  | "settings";

/** "workspace" is the Creative Workspace/Stage tab — the primary place a team starts creative work on a project. */
export const PROJECT_TABS: { key: ProjectTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "workspace", label: "Creative Workspace" },
  { key: "tasks", label: "Tasks" },
  { key: "board", label: "Board" },
  { key: "files", label: "Files" },
  { key: "reviews", label: "Reviews" },
  { key: "activity", label: "Activity" },
  { key: "members", label: "Members" },
  { key: "settings", label: "Settings" },
];

/** The full-screen Creative Review Workspace for one file/version, mirroring projectRoute()'s helper-function pattern. */
export function fileReviewRoute(projectId: string, stageId: string, fileId: string) {
  return `/projects/${projectId}/workspace/${stageId}/files/${fileId}`;
}

/** The accept-invite landing page a "Copy invite link" action shares — see app/invite/[inviteId]/page.tsx. */
export function inviteRoute(inviteId: string) {
  return `/invite/${inviteId}`;
}

/** Task detail routes take an id, mirroring projectRoute(). */
export function taskRoute(taskId: string, tab: TaskTab = "overview") {
  return `/tasks/${taskId}/${tab}`;
}

export type TaskTab = "overview" | "checklist" | "subtasks" | "comments" | "attachments" | "activity";

export const TASK_TABS: { key: TaskTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "checklist", label: "Checklist" },
  { key: "subtasks", label: "Subtasks" },
  { key: "comments", label: "Comments" },
  { key: "attachments", label: "Attachments" },
  { key: "activity", label: "Activity" },
];
