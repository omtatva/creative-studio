import { doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { boardColumnsCol, boardColumnDoc } from "@/lib/firebase/firestore";
import { getWorkspaceSettings, updateWorkspaceSettings } from "@/services/settingsService";
import { logBoardActivity } from "@/services/boardActivityService";
import { logActivity } from "@/services/activityService";
import { BoardActor, BoardColumn } from "@/types/board.types";
import { TaskStatusOption } from "@/types/settings.types";

/**
 * Column management. A column's identity (label/color/icon) is
 * never stored here — it lives on the matching TaskStatusOption in
 * WorkspaceSettings, so renaming/recoloring a column edits Settings
 * directly (via settingsService) and every other place that status
 * renders (task badges, filters, etc.) updates automatically. This
 * file only owns position (`order`), visibility (`isHidden`), and
 * archival (`isArchived`) — the board-specific concerns.
 */

export async function getBoardColumns(workspaceId: string, boardId: string): Promise<BoardColumn[]> {
  const q = query(boardColumnsCol(), where("workspaceId", "==", workspaceId), where("boardId", "==", boardId), orderBy("order", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

/**
 * Creates a custom column: adds a new TaskStatusOption to
 * WorkspaceSettings.taskOptions.statuses (so it's immediately usable
 * everywhere else a status can be picked — task forms, filters) AND
 * a BoardColumn positioning it at the end of this board.
 */
export async function createCustomColumn(
  workspaceId: string,
  boardId: string,
  label: string,
  color: string,
  icon: string,
  actor: BoardActor
): Promise<string> {
  const settings = await getWorkspaceSettings(workspaceId);
  if (!settings) throw new Error("Workspace settings not found.");

  const newStatus: TaskStatusOption = {
    id: crypto.randomUUID(),
    label,
    color,
    icon,
    isCompletedStatus: false,
  };

  await updateWorkspaceSettings(workspaceId, {
    taskOptions: { ...settings.taskOptions, statuses: [...settings.taskOptions.statuses, newStatus] },
  });

  const existingColumns = await getBoardColumns(workspaceId, boardId);
  const columnRef = doc(boardColumnsCol());
  await setDoc(columnRef, {
    id: columnRef.id,
    boardId,
    workspaceId,
    statusId: newStatus.id,
    order: existingColumns.length,
    isHidden: false,
    isArchived: false,
    widthOverridePx: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await logBoardActivity(boardId, actor, "column_created", `created column "${label}"`);
  await logActivity(workspaceId, {
    actorId: actor.uid,
    actorName: actor.displayName,
    action: `created board column "${label}"`,
    targetType: "board_column",
    targetId: columnRef.id,
  });
  return columnRef.id;
}

async function assertColumn(workspaceId: string, columnId: string): Promise<BoardColumn> {
  const snapshot = await getDoc(boardColumnDoc(columnId));
  if (!snapshot.exists() || snapshot.data().workspaceId !== workspaceId) {
    throw new Error("Column not found in this workspace.");
  }
  return snapshot.data();
}

export async function renameColumn(workspaceId: string, columnId: string, newLabel: string, actor: BoardActor): Promise<void> {
  const column = await assertColumn(workspaceId, columnId);
  const settings = await getWorkspaceSettings(workspaceId);
  if (!settings) throw new Error("Workspace settings not found.");

  const statuses = settings.taskOptions.statuses.map((s) => (s.id === column.statusId ? { ...s, label: newLabel } : s));
  await updateWorkspaceSettings(workspaceId, { taskOptions: { ...settings.taskOptions, statuses } });
  await logBoardActivity(column.boardId, actor, "column_renamed", `renamed a column to "${newLabel}"`);
}

export async function changeColumnColor(workspaceId: string, columnId: string, color: string): Promise<void> {
  const column = await assertColumn(workspaceId, columnId);
  const settings = await getWorkspaceSettings(workspaceId);
  if (!settings) throw new Error("Workspace settings not found.");

  const statuses = settings.taskOptions.statuses.map((s) => (s.id === column.statusId ? { ...s, color } : s));
  await updateWorkspaceSettings(workspaceId, { taskOptions: { ...settings.taskOptions, statuses } });
}

export async function changeColumnIcon(workspaceId: string, columnId: string, icon: string): Promise<void> {
  const column = await assertColumn(workspaceId, columnId);
  const settings = await getWorkspaceSettings(workspaceId);
  if (!settings) throw new Error("Workspace settings not found.");

  const statuses = settings.taskOptions.statuses.map((s) => (s.id === column.statusId ? { ...s, icon } : s));
  await updateWorkspaceSettings(workspaceId, { taskOptions: { ...settings.taskOptions, statuses } });
}

/** Persists a full column order in one batch after a drag-to-reorder — cheaper and more atomic than N individual updateDoc calls. */
export async function reorderColumns(workspaceId: string, boardId: string, orderedColumnIds: string[], actor: BoardActor): Promise<void> {
  const batch = writeBatch(db);
  orderedColumnIds.forEach((columnId, index) => {
    batch.update(boardColumnDoc(columnId), { order: index, updatedAt: serverTimestamp() });
  });
  await batch.commit();
  await logBoardActivity(boardId, actor, "column_reordered", "reordered the board's columns");
}

export async function toggleColumnHidden(workspaceId: string, columnId: string, actor: BoardActor): Promise<void> {
  const column = await assertColumn(workspaceId, columnId);
  const nextHidden = !column.isHidden;
  await updateDoc(boardColumnDoc(columnId), { isHidden: nextHidden, updatedAt: serverTimestamp() });
  await logBoardActivity(column.boardId, actor, nextHidden ? "column_hidden" : "column_shown", `${nextHidden ? "hid" : "unhid"} a column`);
}

export async function archiveColumn(workspaceId: string, columnId: string, actor: BoardActor): Promise<void> {
  const column = await assertColumn(workspaceId, columnId);
  await updateDoc(boardColumnDoc(columnId), { isArchived: true, updatedAt: serverTimestamp() });
  await logBoardActivity(column.boardId, actor, "column_archived", "archived a column");
}

export async function restoreColumn(workspaceId: string, columnId: string, actor: BoardActor): Promise<void> {
  const column = await assertColumn(workspaceId, columnId);
  await updateDoc(boardColumnDoc(columnId), { isArchived: false, updatedAt: serverTimestamp() });
  await logBoardActivity(column.boardId, actor, "column_restored", "restored a column");
}

export async function setColumnWidth(workspaceId: string, columnId: string, widthPx: number | null): Promise<void> {
  await assertColumn(workspaceId, columnId);
  await updateDoc(boardColumnDoc(columnId), { widthOverridePx: widthPx, updatedAt: serverTimestamp() });
}
