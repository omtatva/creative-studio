import { ID, Timestamps } from "./common.types";

/**
 * Project-level member role. Deliberately separate from
 * `MemberRole` (workspace.types.ts) — a person's workspace role
 * (owner/admin/member/viewer) is independent from the role they
 * hold on any single project (owner/admin/manager/member).
 */
export type ProjectRole = "owner" | "admin" | "manager" | "member";

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
