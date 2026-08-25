import { ID, Timestamps } from "./common.types";

/**
 * Project-level member role. Deliberately separate from
 * `MemberRole` (workspace.types.ts) — a person's workspace role
 * (owner/admin/member/viewer) is independent from the role they
 * hold on any single project.
 *
 * owner   — full project access, manage members, project settings, delete/archive.
 * manager — manage project + members (if permitted), tasks/files/reviews.
 * editor  — work on the project (tasks/files/reviews); cannot manage members.
 * viewer  — read-only project access (see firestore.rules' canWriteProject).
 */
export type ProjectRole = "owner" | "manager" | "editor" | "viewer";

export interface ProjectMember {
  uid: ID;
  displayName: string;
  photoURL: string | null;
  email: string;
  role: ProjectRole;
}

/**
 * Status/priority ids reference `WorkspaceSettings.projectOptions`
 * (see settings.types.ts) — never a hardcoded enum. A project only
 * stores the id; the label/color it renders with is resolved by
 * looking that id up in the workspace's configured options, so
 * renaming or recoloring a status in Settings updates every project
 * automatically.
 */
export interface Project extends Timestamps {
  id: ID;
  workspaceId: ID;
  name: string;
  description: string;
  coverImageUrl: string | null;
  color: string; // "R G B", from WorkspaceSettings.projectOptions.colors
  icon: string; // icon key, from WorkspaceSettings.projectOptions.icons
  statusId: string;
  priorityId: string;
  startDate: string | null; // ISO date
  dueDate: string | null; // ISO date
  ownerId: ID;
  members: ProjectMember[];
  tags: string[];
  progress: number; // 0-100
  isArchived: boolean;
  archivedAt: string | null;
  favoritedBy: ID[];
  pinnedBy: ID[];
  createdBy: ID;
}

export interface CreateProjectPayload {
  name: string;
  description: string;
  color: string;
  icon: string;
  statusId: string;
  priorityId: string;
  startDate: string | null;
  dueDate: string | null;
  tags: string[];
  coverImageFile: File | null;
}

export type UpdateProjectPayload = Partial<
  Omit<Project, "id" | "workspaceId" | "createdAt" | "updatedAt" | "createdBy" | "members" | "ownerId">
>;

/**
 * Real, queryable project-level access-control record — the actual
 * authorization source for "can this Firebase UID see/act on this
 * project", used by Firestore rules and by useProjects.ts's
 * membership-filtered list query. Deliberately a separate top-level
 * collection (`project_members`, doc id `${projectId}_${uid}`)
 * rather than only the denormalized `Project.members[]` array above:
 * an array of maps can't be queried ("give me every project where
 * I'm a member") or cleanly checked in a security rule the way a
 * scalar `uid` field on its own doc can. `Project.members[]` is kept
 * as-is, unchanged, purely for display (avatars, member-name search)
 * — every membership mutation (add/remove/role-change) now writes to
 * BOTH, so existing UI reading the array keeps working exactly as
 * before.
 *
 * `permissions` is reserved for future fine-grained overrides beyond
 * what `role` implies; empty until that's needed — nothing reads it
 * yet.
 */
export interface ProjectMembership {
  id: ID; // `${projectId}_${uid}`
  projectId: ID;
  workspaceId: ID;
  uid: ID;
  role: ProjectRole;
  permissions: string[];
  addedAt: string;
  addedBy: ID;
  updatedAt: string;
}

export type ProjectViewMode = "grid" | "list";

export type ProjectSection = "all" | "favorites" | "recent" | "pinned" | "archived";

export const PROJECT_SECTIONS: { key: ProjectSection; label: string }[] = [
  { key: "all", label: "All Projects" },
  { key: "recent", label: "Recent" },
  { key: "favorites", label: "Favorites" },
  { key: "pinned", label: "Pinned" },
  { key: "archived", label: "Archived" },
];

export interface ProjectFilters {
  statusIds: string[];
  priorityIds: string[];
  ownerIds: string[];
  dueBefore: string | null;
  dueAfter: string | null;
  createdAfter: string | null;
}

export const EMPTY_PROJECT_FILTERS: ProjectFilters = {
  statusIds: [],
  priorityIds: [],
  ownerIds: [],
  dueBefore: null,
  dueAfter: null,
  createdAfter: null,
};

export type ProjectSortField = "updatedAt" | "createdAt" | "dueDate" | "name" | "progress";
export type SortDirection = "asc" | "desc";

export interface ProjectSort {
  field: ProjectSortField;
  direction: SortDirection;
}

export const DEFAULT_PROJECT_SORT: ProjectSort = { field: "updatedAt", direction: "desc" };
