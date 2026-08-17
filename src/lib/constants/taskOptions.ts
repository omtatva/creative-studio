import { TaskOptionsSettings } from "@/types/settings.types";

/**
 * Seed values written into a new workspace's
 * `settings/{workspaceId}.taskOptions` doc at workspace-creation
 * time (see workspaceService.createWorkspace), mirroring
 * projectOptions.ts. `isCompletedStatus` on the "done" status is
 * what subtask/checklist progress rollups check against — see
 * taskService.recomputeParentProgress. `icon` is the single source
 * of truth for a status's icon everywhere it's shown, including as
 * a Kanban board column icon (see board.types.ts / boardColumnService.ts) —
 * a board column never stores its own icon/label/color, it only
 * references a statusId here.
 *
 * The six statuses below double as the Kanban board's default
 * columns (Backlog/Todo/In Progress/Review/Approved/Completed).
 */
export const DEFAULT_TASK_OPTIONS: TaskOptionsSettings = {
  statuses: [
    { id: "backlog", label: "Backlog", color: "148 163 184", icon: "inbox", isCompletedStatus: false },
    { id: "todo", label: "Todo", color: "99 102 241", icon: "circle", isCompletedStatus: false },
    { id: "in_progress", label: "In Progress", color: "59 130 246", icon: "loader", isCompletedStatus: false },
    { id: "review", label: "Review", color: "245 158 11", icon: "eye", isCompletedStatus: false },
    { id: "approved", label: "Approved", color: "139 92 246", icon: "thumbs-up", isCompletedStatus: false },
    { id: "completed", label: "Completed", color: "16 185 129", icon: "check-circle-2", isCompletedStatus: true },
  ],
  priorities: [
    { id: "low", label: "Low", color: "148 163 184", order: 0 },
    { id: "medium", label: "Medium", color: "99 102 241", order: 1 },
    { id: "high", label: "High", color: "245 158 11", order: 2 },
    { id: "urgent", label: "Urgent", color: "244 63 94", order: 3 },
  ],
  labels: [
    { id: "bug", label: "Bug", color: "244 63 94" },
    { id: "design", label: "Design", color: "139 92 246" },
    { id: "copy", label: "Copy", color: "20 184 166" },
    { id: "client-request", label: "Client Request", color: "245 158 11" },
    { id: "internal", label: "Internal", color: "148 163 184" },
  ],
};
