import { ID, Timestamps } from "./common.types";

/**
 * One board per project (created lazily on first visit — see
 * boardService.getOrCreateBoard). Holds the SHARED, board-wide
 * settings from the spec's "Board Settings" section (background,
 * default card size, default column width, auto-sort). Per-user
 * view preferences live separately in BoardPreference so two people
 * can each have their own density/collapsed-columns without
 * fighting over one shared doc.
 */
export type BoardBackgroundType = "color" | "gradient" | "image";
export type BoardCardSize = "sm" | "md" | "lg";
export type BoardAutoSortField = "manual" | "priority" | "dueDate";

export interface BoardBackground {
  type: BoardBackgroundType;
  value: string; // "R G B" for color, CSS gradient string for gradient, URL for image
}

export interface Board extends Timestamps {
  id: ID;
  workspaceId: ID;
  projectId: ID;
  name: string;
  background: BoardBackground | null;
  defaultCardSize: BoardCardSize;
  defaultColumnWidth: number; // px
  autoSortEnabled: boolean;
  autoSortField: BoardAutoSortField;
  createdBy: ID;
}

/**
 * A column is a positioned, visibility-controlled slot for ONE
 * workspace task status — it never stores its own label/color/icon
 * (those live on TaskStatusOption in Settings, the single source of
 * truth). "Renaming a column" or "changing its color/icon" edits the
 * underlying TaskStatusOption via settingsService; this doc only
 * tracks board-specific position and visibility, and never
 * duplicates task data — column membership is derived by matching
 * Task.statusId, not by storing task ids here.
 */
export interface BoardColumn extends Timestamps {
  id: ID;
  boardId: ID;
  workspaceId: ID;
  statusId: string; // references WorkspaceSettings.taskOptions.statuses[].id
  order: number;
  isHidden: boolean;
  isArchived: boolean;
  widthOverridePx: number | null; // null = use Board.defaultColumnWidth
}

export type BoardViewDensity = "comfortable" | "compact";

/**
 * Per-user, per-board view preferences (boardId + userId composite
 * id). Distinct from Board's shared settings — this is what lets
 * one teammate collapse a column or switch to compact view without
 * changing what anyone else sees.
 */
export interface BoardPreference extends Timestamps {
  id: ID; // `${boardId}_${uid}`
  boardId: ID;
  workspaceId: ID;
  userId: ID;
  viewDensity: BoardViewDensity;
  cardSize: BoardCardSize | null; // null = use Board.defaultCardSize
  collapsedColumnIds: ID[];
}

export const DEFAULT_BOARD_PREFERENCE: Omit<BoardPreference, "id" | "boardId" | "workspaceId" | "userId" | "createdAt" | "updatedAt"> = {
  viewDensity: "comfortable",
  cardSize: null,
  collapsedColumnIds: [],
};

export type BoardActivityAction =
  | "column_created"
  | "column_renamed"
  | "column_reordered"
  | "column_archived"
  | "column_restored"
  | "column_hidden"
  | "column_shown"
  | "task_moved"
  | "task_reordered"
  | "task_archived_from_board"
  | "tasks_bulk_moved";

export interface BoardActor {
  uid: ID;
  displayName: string;
  photoURL: string | null;
}

export interface BoardActivityEntry extends Timestamps {
  id: ID;
  action: BoardActivityAction;
  actor: BoardActor;
  message: string;
}

export interface BoardFilters {
  assigneeIds: string[];
  priorityIds: string[];
  labelIds: string[];
  tags: string[];
  dueBefore: string | null;
  dueAfter: string | null;
  hiddenStatusIds: string[]; // statuses/columns toggled off in this filter session
}

export const EMPTY_BOARD_FILTERS: BoardFilters = {
  assigneeIds: [],
  priorityIds: [],
  labelIds: [],
  tags: [],
  dueBefore: null,
  dueAfter: null,
  hiddenStatusIds: [],
};
