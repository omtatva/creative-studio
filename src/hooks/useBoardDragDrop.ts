"use client";

import { useState } from "react";
import { Task } from "@/types/task.types";
import { TaskStatusOption } from "@/types/settings.types";
import { useTaskActions } from "./useTaskActions";
import { useBoardActions } from "./useBoardActions";

interface UseBoardDragDropArgs {
  boardId: string | undefined;
  tasksByStatus: Record<string, Task[]>; // already sorted by boardOrder asc
}

/**
 * Owns all drag-and-drop mechanics for the board: dragging a single
 * card (cross-column move + same-column reorder) and dragging a
 * multi-selected group (bulk move). Uses the browser's native HTML5
 * drag-and-drop API (draggable/onDragStart/onDragOver/onDrop) rather
 * than a new dependency — framer-motion (already installed) handles
 * the visual "lift and settle" animation in BoardCard/BoardColumn,
 * this hook only handles the data side.
 *
 * Reordering writes sequential `boardOrder` values (spaced by 1000)
 * across the affected column so drop position is exact; cross-column
 * moves reuse taskService.changeTaskStatus via useTaskActions — no
 * status-change logic is duplicated here.
 */
export function useBoardDragDrop({ boardId, tasksByStatus }: UseBoardDragDropArgs) {
  const taskActions = useTaskActions();
  const boardActions = useBoardActions();

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverColumnStatusId, setDragOverColumnStatusId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  function handleDragStart(task: Task) {
    setDraggingTaskId(task.id);
  }

  function handleDragEnd() {
    setDraggingTaskId(null);
    setDragOverColumnStatusId(null);
    setDragOverIndex(null);
  }

  function handleDragOverColumn(statusId: string, index: number) {
    setDragOverColumnStatusId(statusId);
    setDragOverIndex(index);
  }

  async function handleDrop(targetStatus: TaskStatusOption, dropIndex: number) {
    if (!draggingTaskId || !boardId) {
      handleDragEnd();
      return;
    }

    const isMultiDrag = selectedTaskIds.has(draggingTaskId) && selectedTaskIds.size > 1;
    const draggedIds = isMultiDrag ? Array.from(selectedTaskIds) : [draggingTaskId];

    const allDragged: Task[] = draggedIds
      .map((id) => Object.values(tasksByStatus).flat().find((t) => t.id === id))
      .filter((t): t is Task => Boolean(t));

    const firstDragged = allDragged[0];
    if (!firstDragged) {
      handleDragEnd();
      return;
    }

    const sourceStatusId = firstDragged.statusId;
    const crossColumn = sourceStatusId !== targetStatus.id;

    if (isMultiDrag && crossColumn) {
      await taskActions.bulkChangeStatus(draggedIds, targetStatus);
      await boardActions.logBulkMove(boardId, `moved ${draggedIds.length} tasks to "${targetStatus.label}"`);
      setSelectedTaskIds(new Set());
      handleDragEnd();
      return;
    }

    if (crossColumn) {
      await taskActions.changeStatus(firstDragged.id, targetStatus);
      await boardActions.logTaskMoved(boardId, `moved "${firstDragged.title}" to "${targetStatus.label}"`);
    }

    // Recompute sequential order for the destination column with the dragged task(s) inserted at dropIndex.
    const destColumnTasks = (tasksByStatus[targetStatus.id] ?? []).filter((t) => !draggedIds.includes(t.id));
    const reordered = [...destColumnTasks.slice(0, dropIndex), ...allDragged, ...destColumnTasks.slice(dropIndex)];

    await Promise.all(reordered.map((t, index) => taskActions.reorderInColumn(t.id, (index + 1) * 1000)));
    if (!crossColumn) {
      await boardActions.logTaskReordered(boardId, `reordered "${firstDragged.title}"`);
    }

    handleDragEnd();
  }

  function toggleSelected(taskId: string) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedTaskIds(new Set());
  }

  return {
    draggingTaskId,
    dragOverColumnStatusId,
    dragOverIndex,
    selectedTaskIds,
    toggleSelected,
    clearSelection,
    handleDragStart,
    handleDragEnd,
    handleDragOverColumn,
    handleDrop,
    isSubmitting: taskActions.isSubmitting,
  };
}
