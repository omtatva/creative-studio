import { ProjectOptionsSettings } from "@/types/settings.types";

/**
 * Seed values written into a new workspace's
 * `settings/{workspaceId}.projectOptions` doc at workspace-creation
 * time (see workspaceService.createWorkspace). Once seeded, the
 * live source of truth is Firestore, not this file — Settings >
 * Project Settings (future work) would let a workspace edit these.
 * Project components always resolve statuses/priorities/colors/
 * icons through WorkspaceSettings, never through this constant
 * directly, except as the initial seed.
 */
export const DEFAULT_PROJECT_OPTIONS: ProjectOptionsSettings = {
  statuses: [
    { id: "planning", label: "Planning", color: "148 163 184" },
    { id: "in_progress", label: "In Progress", color: "99 102 241" },
    { id: "in_review", label: "In Review", color: "245 158 11" },
    { id: "completed", label: "Completed", color: "16 185 129" },
    { id: "on_hold", label: "On Hold", color: "244 63 94" },
  ],
  priorities: [
    { id: "low", label: "Low", color: "148 163 184", order: 0 },
    { id: "medium", label: "Medium", color: "99 102 241", order: 1 },
    { id: "high", label: "High", color: "245 158 11", order: 2 },
    { id: "urgent", label: "Urgent", color: "244 63 94", order: 3 },
  ],
  colors: [
    "99 102 241",
    "20 184 166",
    "244 63 94",
    "245 158 11",
    "139 92 246",
    "16 185 129",
    "59 130 246",
    "236 72 153",
  ],
  icons: [
    "folder-kanban",
    "briefcase",
    "palette",
    "camera",
    "clapperboard",
    "megaphone",
    "pen-tool",
    "layout-template",
    "sparkles",
    "rocket",
  ],
};
