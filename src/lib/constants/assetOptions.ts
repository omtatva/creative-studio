import { AssetOptionsSettings } from "@/types/settings.types";

/**
 * Seed values written into a new workspace's
 * `settings/{workspaceId}.assetOptions` doc at workspace-creation
 * time (see workspaceService.createWorkspace) — same convention as
 * DEFAULT_PROJECT_OPTIONS/DEFAULT_TASK_OPTIONS. Once seeded, the live
 * source of truth is Firestore; Creative Workspace components always
 * resolve the status list through WorkspaceSettings.assetOptions
 * (see useAssetOptions), never through this constant directly, except
 * as the initial seed or a fallback for a workspace created before
 * `assetOptions` existed on the settings doc.
 */
export const DEFAULT_ASSET_OPTIONS: AssetOptionsSettings = {
  statuses: [
    { id: "no_status", label: "No Status", color: "148 163 184", isEnabled: true, order: 0 },
    { id: "in_progress", label: "In Progress", color: "99 102 241", isEnabled: true, order: 1 },
    { id: "needs_review", label: "Needs Review", color: "245 158 11", isEnabled: true, order: 2 },
    { id: "reviewing", label: "Reviewing", color: "139 92 246", isEnabled: true, order: 3 },
    { id: "needs_changes", label: "Needs Changes", color: "244 63 94", isEnabled: true, order: 4 },
    { id: "approved", label: "Approved", color: "16 185 129", isEnabled: true, order: 5 },
  ],
};

export const DEFAULT_ASSET_STATUS_ID = "no_status";
