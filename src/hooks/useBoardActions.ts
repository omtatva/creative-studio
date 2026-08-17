"use client";

import { useState } from "react";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import * as boardService from "@/services/boardService";
import * as boardColumnService from "@/services/boardColumnService";
import * as boardPreferenceService from "@/services/boardPreferenceService";
import { logBoardActivity } from "@/services/boardActivityService";
import { BoardActor, BoardCardSize, BoardViewDensity } from "@/types/board.types";

/**
 * UI-facing mutation hook for board-specific concerns: column
 * management, board settings, and per-user preferences. Task moves,
 * bulk moves, duplicate/archive/delete/assign are NOT re-implemented
 * here — board components call the existing `useTaskActions()` hook
 * for those (see BoardCard / BoardColumnComponent), since a card
 * move is just a task status change the Tasks module already owns.
 */
export function useBoardActions() {
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser, profile } = useAuthContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function currentActor(): BoardActor {
    return {
      uid: firebaseUser?.uid ?? "",
      displayName: profile?.displayName ?? firebaseUser?.displayName ?? "Unknown",
      photoURL: profile?.photoURL ?? firebaseUser?.photoURL ?? null,
    };
  }

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setIsSubmitting(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createColumn(boardId: string, label: string, color: string, icon: string) {
    if (!workspaceId) return null;
    return run(() => boardColumnService.createCustomColumn(workspaceId, boardId, label, color, icon, currentActor()));
  }

  async function renameColumn(columnId: string, newLabel: string) {
    if (!workspaceId) return;
    await run(() => boardColumnService.renameColumn(workspaceId, columnId, newLabel, currentActor()));
  }

  async function changeColumnColor(columnId: string, color: string) {
    if (!workspaceId) return;
    await run(() => boardColumnService.changeColumnColor(workspaceId, columnId, color));
  }

  async function changeColumnIcon(columnId: string, icon: string) {
    if (!workspaceId) return;
    await run(() => boardColumnService.changeColumnIcon(workspaceId, columnId, icon));
  }

  async function reorderColumns(boardId: string, orderedColumnIds: string[]) {
    if (!workspaceId) return;
    await run(() => boardColumnService.reorderColumns(workspaceId, boardId, orderedColumnIds, currentActor()));
  }

  async function toggleColumnHidden(columnId: string) {
    if (!workspaceId) return;
    await run(() => boardColumnService.toggleColumnHidden(workspaceId, columnId, currentActor()));
  }

  async function archiveColumn(columnId: string) {
    if (!workspaceId) return null;
    return run(() => boardColumnService.archiveColumn(workspaceId, columnId, currentActor()));
  }

  async function restoreColumn(columnId: string) {
    if (!workspaceId) return;
    await run(() => boardColumnService.restoreColumn(workspaceId, columnId, currentActor()));
  }

  async function setColumnWidth(columnId: string, widthPx: number | null) {
    if (!workspaceId) return;
    await run(() => boardColumnService.setColumnWidth(workspaceId, columnId, widthPx));
  }

  async function updateBoardSettings(boardId: string, patch: Parameters<typeof boardService.updateBoardSettings>[2]) {
    if (!workspaceId) return;
    await run(() => boardService.updateBoardSettings(workspaceId, boardId, patch));
  }

  async function setViewDensity(boardId: string, density: BoardViewDensity) {
    if (!firebaseUser) return;
    await run(() => boardPreferenceService.updateBoardPreference(boardId, firebaseUser.uid, { viewDensity: density }));
  }

  async function setCardSize(boardId: string, size: BoardCardSize | null) {
    if (!firebaseUser) return;
    await run(() => boardPreferenceService.updateBoardPreference(boardId, firebaseUser.uid, { cardSize: size }));
  }

  async function toggleColumnCollapsed(boardId: string, columnId: string, isCollapsed: boolean, current: string[]) {
    if (!firebaseUser) return;
    await run(() => boardPreferenceService.toggleColumnCollapsed(boardId, firebaseUser.uid, columnId, isCollapsed, current));
  }

  async function logTaskMoved(boardId: string, message: string) {
    await logBoardActivity(boardId, currentActor(), "task_moved", message);
  }

  async function logTaskReordered(boardId: string, message: string) {
    await logBoardActivity(boardId, currentActor(), "task_reordered", message);
  }

  async function logBulkMove(boardId: string, message: string) {
    await logBoardActivity(boardId, currentActor(), "tasks_bulk_moved", message);
  }

  return {
    isSubmitting,
    error,
    createColumn,
    renameColumn,
    changeColumnColor,
    changeColumnIcon,
    reorderColumns,
    toggleColumnHidden,
    archiveColumn,
    restoreColumn,
    setColumnWidth,
    updateBoardSettings,
    setViewDensity,
    setCardSize,
    toggleColumnCollapsed,
    logTaskMoved,
    logTaskReordered,
    logBulkMove,
  };
}
