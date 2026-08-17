"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useBoard } from "@/hooks/useBoard";
import { useBoardColumns } from "@/hooks/useBoardColumns";
import { useBoardPreferences } from "@/hooks/useBoardPreferences";
import { useBoardActions } from "@/hooks/useBoardActions";
import { useBoardDragDrop } from "@/hooks/useBoardDragDrop";
import { useTasks } from "@/hooks/useTasks";
import { useTaskOptions } from "@/hooks/useTaskOptions";
import { useTaskActions } from "@/hooks/useTaskActions";
import { useToast } from "@/hooks/useToast";
import { getProject } from "@/services/projectService";
import { Loader } from "@/components/ui/Loader";
import { ErrorState } from "@/components/shared/ErrorState";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { BoardToolbar } from "./BoardToolbar";
import { BoardColumnComponent } from "./BoardColumnComponent";
import { BoardColumnSkeleton } from "./BoardCardSkeleton";
import { AddColumnModal } from "./AddColumnModal";
import { BoardFiltersPanel } from "./BoardFiltersPanel";
import { BoardSettingsModal } from "./BoardSettingsModal";
import { BulkActionsBar } from "./BulkActionsBar";
import { MoveTaskModal } from "./MoveTaskModal";
import { AssignTaskModal } from "./AssignTaskModal";
import { BoardActivityModal } from "./BoardActivityModal";
import { matchesBoardFilters, matchesBoardSearch } from "@/lib/utils/boardFilters";
import { EMPTY_BOARD_FILTERS } from "@/types/board.types";
import { Task, TaskActor } from "@/types/task.types";
import { TaskFormValues } from "@/lib/validations/task.schema";

/**
 * Top-level board orchestrator, rendered by the Projects module's
 * Board tab (the integration point). Composes: useBoard (get-or-
 * create + realtime board doc), useBoardColumns (realtime, ordered),
 * useBoardPreferences (per-user density/size/collapsed), useTasks
 * from the TASKS MODULE reused as-is for the project's task data
 * (allTasksForCounts is the full unpaginated set — exactly what a
 * board needs), and useBoardDragDrop for the interaction layer.
 */
export function BoardShell({ projectId }: { projectId: string }) {
  const { firebaseUser } = useAuthContext();
  const uid = firebaseUser?.uid ?? "";
  const { workspaceId } = useWorkspaceContext();

  const { board, isLoading: isBoardLoading, error: boardError } = useBoard(projectId);
  const { columns, isLoading: areColumnsLoading } = useBoardColumns(board?.id);
  const { viewDensity, cardSize: preferredCardSize, collapsedColumnIds } = useBoardPreferences(board?.id);
  const { options } = useTaskOptions();
  const { allTasksForCounts: allTasks, isLoading: areTasksLoading } = useTasks(projectId);
  const taskActions = useTaskActions();
  const boardActions = useBoardActions();
  const toast = useToast();

  const [projectMembers, setProjectMembers] = useState<TaskActor[]>([]);
  useEffect(() => {
    if (!workspaceId) return;
    getProject(workspaceId, projectId).then((project) => {
      setProjectMembers(project ? project.members.map((m) => ({ uid: m.uid, displayName: m.displayName, photoURL: m.photoURL, email: m.email })) : []);
    });
  }, [workspaceId, projectId]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState(EMPTY_BOARD_FILTERS);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);

  const [taskFormState, setTaskFormState] = useState<{ open: boolean; task: Task | null; presetStatusId: string | null }>({
    open: false,
    task: null,
    presetStatusId: null,
  });
  const [moveTarget, setMoveTarget] = useState<Task | null>(null);
  const [assignTarget, setAssignTarget] = useState<Task | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [columnArchiveTarget, setColumnArchiveTarget] = useState<{ id: string; label: string } | null>(null);
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const activeTasks = useMemo(() => allTasks.filter((t) => !t.isArchived), [allTasks]);

  const filteredTasks = useMemo(
    () => activeTasks.filter((t) => matchesBoardSearch(t, searchQuery) && matchesBoardFilters(t, filters)),
    [activeTasks, searchQuery, filters]
  );

  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const status of options.statuses) {
      const inColumn = filteredTasks.filter((t) => t.statusId === status.id);
      inColumn.sort((a, b) => {
        if (board?.autoSortEnabled && board.autoSortField === "priority") {
          const pa = options.priorities.find((p) => p.id === a.priorityId)?.order ?? 0;
          const pb = options.priorities.find((p) => p.id === b.priorityId)?.order ?? 0;
          return pb - pa;
        }
        if (board?.autoSortEnabled && board.autoSortField === "dueDate") {
          return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
        }
        return a.boardOrder - b.boardOrder;
      });
      map[status.id] = inColumn;
    }
    return map;
  }, [filteredTasks, options.statuses, options.priorities, board]);

  const dragDrop = useBoardDragDrop({ boardId: board?.id, tasksByStatus });

  const activeFilterCount =
    filters.assigneeIds.length + filters.priorityIds.length + filters.labelIds.length + filters.tags.length +
    (filters.dueBefore ? 1 : 0) + (filters.dueAfter ? 1 : 0);

  // Sourced from the project's actual member list (not from existing task
  // assignees) — a board with no assignments yet previously offered an
  // empty candidate list here, a dead end for "Assign member".
  const availableAssignees = projectMembers;

  const effectiveCardSize = preferredCardSize ?? board?.defaultCardSize ?? "md";

  async function handleTaskFormSubmit(values: TaskFormValues & { projectId: string; assignee: Task["assignee"] }) {
    if (taskFormState.task) {
      const result = await taskActions.update(taskFormState.task.id, {
        title: values.title,
        descriptionHtml: values.descriptionHtml,
        assignee: values.assignee,
        statusId: values.statusId,
        priorityId: values.priorityId,
        startDate: values.startDate,
        dueDate: values.dueDate,
        estimatedMinutes: values.estimatedMinutes,
        tags: values.tags,
        labelIds: values.labelIds,
      });
      if (result === null) {
        toast.error(taskActions.error ?? "Couldn't save changes. Please try again.");
        return;
      }
    } else {
      const newId = await taskActions.create(projectId, {
        title: values.title,
        descriptionHtml: values.descriptionHtml,
        assignee: values.assignee,
        statusId: taskFormState.presetStatusId ?? values.statusId,
        priorityId: values.priorityId,
        startDate: values.startDate,
        dueDate: values.dueDate,
        estimatedMinutes: values.estimatedMinutes,
        tags: values.tags,
        labelIds: values.labelIds,
        parentTaskId: null,
      }, false);
      if (!newId) {
        toast.error(taskActions.error ?? "Couldn't create task. Please try again.");
        return;
      }
      if (board) await boardActions.logTaskMoved(board.id, `created "${values.title}"`);
    }
    setTaskFormState({ open: false, task: null, presetStatusId: null });
  }

  if (isBoardLoading) return <Loader fullScreen={false} label="Setting up your board..." />;
  if (boardError) return <ErrorState title="Couldn't load board" message={boardError} />;
  if (!board) return <ErrorState title="Couldn't load board" message="Something went wrong creating this project's board." />;

  const background = board.background
    ? board.background.type === "color"
      ? { backgroundColor: `rgb(${board.background.value} / 0.06)` }
      : { background: board.background.value }
    : undefined;

  return (
    <div className="flex flex-col gap-4" style={background}>
      <BoardToolbar
        onSearchChange={setSearchQuery}
        viewDensity={viewDensity}
        onViewDensityChange={(d) => board && boardActions.setViewDensity(board.id, d)}
        cardSize={effectiveCardSize}
        onCardSizeChange={(s) => board && boardActions.setCardSize(board.id, s)}
        activeFilterCount={activeFilterCount}
        onOpenFilters={() => setIsFiltersOpen(true)}
        onAddColumn={() => setIsAddColumnOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenActivity={() => setIsActivityOpen(true)}
      />

      <div className={cn("flex gap-3 overflow-x-auto pb-4", viewDensity === "compact" && "gap-2")}>
        {areColumnsLoading
          ? Array.from({ length: 4 }).map((_, i) => <BoardColumnSkeleton key={i} />)
          : columns
              .filter((c) => !c.isHidden)
              .map((column) => {
                const status = options.statuses.find((s) => s.id === column.statusId);
                if (!status) return null;
                const tasks = tasksByStatus[status.id] ?? [];
                return (
                  <BoardColumnComponent
                    key={column.id}
                    column={column}
                    status={status}
                    tasks={tasks}
                    options={options}
                    cardSize={effectiveCardSize}
                    width={column.widthOverridePx ?? board.defaultColumnWidth}
                    isCollapsed={collapsedColumnIds.includes(column.id)}
                    isLoading={areTasksLoading}
                    draggingTaskId={dragDrop.draggingTaskId}
                    isDragOver={dragDrop.dragOverColumnStatusId === status.id}
                    selectedTaskIds={dragDrop.selectedTaskIds}
                    attachmentCounts={Object.fromEntries(tasks.map((t) => [t.id, t.attachmentCount]))}
                    commentCounts={Object.fromEntries(tasks.map((t) => [t.id, t.commentCount]))}
                    onToggleCollapsed={() => board && boardActions.toggleColumnCollapsed(board.id, column.id, collapsedColumnIds.includes(column.id), collapsedColumnIds)}
                    onRename={(label) => boardActions.renameColumn(column.id, label)}
                    onChangeColor={(color) => boardActions.changeColumnColor(column.id, color)}
                    onChangeIcon={(icon) => boardActions.changeColumnIcon(column.id, icon)}
                    onToggleHidden={() => boardActions.toggleColumnHidden(column.id)}
                    onArchive={() => setColumnArchiveTarget({ id: column.id, label: status.label })}
                    onRestore={() => boardActions.restoreColumn(column.id)}
                    onAddTask={() => setTaskFormState({ open: true, task: null, presetStatusId: status.id })}
                    onDragStartTask={dragDrop.handleDragStart}
                    onDragEndTask={dragDrop.handleDragEnd}
                    onDragOverColumn={(index) => dragDrop.handleDragOverColumn(status.id, index)}
                    onDropOnColumn={(index) => dragDrop.handleDrop(status, index)}
                    onToggleSelectTask={(taskId) => dragDrop.toggleSelected(taskId)}
                    onEditTask={(task) => setTaskFormState({ open: true, task, presetStatusId: null })}
                    onDuplicateTask={(task) => taskActions.duplicate(task.id)}
                    onArchiveTask={(task) => setArchiveTarget(task)}
                    onDeleteTask={(task) => setDeleteTarget(task)}
                    onMoveTask={(task) => setMoveTarget(task)}
                    onAssignTask={(task) => setAssignTarget(task)}
                  />
                );
              })}
      </div>

      <BulkActionsBar
        selectedCount={dragDrop.selectedTaskIds.size}
        statuses={options.statuses}
        onBulkMove={async (status) => {
          const ids = Array.from(dragDrop.selectedTaskIds);
          await taskActions.bulkChangeStatus(ids, status);
          if (board) await boardActions.logBulkMove(board.id, `moved ${ids.length} tasks to "${status.label}"`);
          dragDrop.clearSelection();
        }}
        onBulkArchive={() => setBulkArchiveConfirm(true)}
        onBulkDelete={() => setBulkDeleteConfirm(true)}
        onClear={dragDrop.clearSelection}
      />

      <TaskFormModal
        isOpen={taskFormState.open}
        onClose={() => setTaskFormState({ open: false, task: null, presetStatusId: null })}
        task={taskFormState.task}
        projectId={projectId}
        onSubmit={handleTaskFormSubmit}
        isSubmitting={taskActions.isSubmitting}
      />

      <AddColumnModal
        isOpen={isAddColumnOpen}
        onClose={() => setIsAddColumnOpen(false)}
        onCreate={async (label, color, icon) => {
          if (!board) return;
          const columnId = await boardActions.createColumn(board.id, label, color, icon);
          if (!columnId) {
            toast.error(boardActions.error ?? "Couldn't create column. Please try again.");
            return;
          }
          setIsAddColumnOpen(false);
        }}
        isSubmitting={boardActions.isSubmitting}
      />

      <BoardFiltersPanel
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        options={options}
        availableAssignees={availableAssignees}
      />

      <BoardSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        board={board}
        onSave={(patch) => boardActions.updateBoardSettings(board.id, patch)}
        isSubmitting={boardActions.isSubmitting}
      />

      <MoveTaskModal
        isOpen={Boolean(moveTarget)}
        onClose={() => setMoveTarget(null)}
        task={moveTarget}
        statuses={options.statuses}
        onMove={async (status) => {
          if (!moveTarget) return;
          await taskActions.changeStatus(moveTarget.id, status);
          if (board) await boardActions.logTaskMoved(board.id, `moved "${moveTarget.title}" to "${status.label}"`);
        }}
      />

      <AssignTaskModal
        isOpen={Boolean(assignTarget)}
        onClose={() => setAssignTarget(null)}
        task={assignTarget}
        candidates={availableAssignees}
        onAssign={(assignee) => assignTarget && taskActions.assign(assignTarget.id, assignee)}
      />

      <ConfirmModal
        isOpen={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={async () => { if (archiveTarget) await taskActions.archive(archiveTarget.id); setArchiveTarget(null); }}
        title="Archive task?"
        description={`"${archiveTarget?.title}" will be hidden from the board. You can restore it from the Tasks tab.`}
        confirmLabel="Archive"
        isSubmitting={taskActions.isSubmitting}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => { if (deleteTarget) await taskActions.remove(deleteTarget.id); setDeleteTarget(null); }}
        title="Delete task?"
        description={`This permanently deletes "${deleteTarget?.title}" and its subtasks. This can't be undone.`}
        confirmLabel="Delete"
        isDanger
        isSubmitting={taskActions.isSubmitting}
      />

      <ConfirmModal
        isOpen={Boolean(columnArchiveTarget)}
        onClose={() => setColumnArchiveTarget(null)}
        onConfirm={async () => {
          if (columnArchiveTarget) await boardActions.archiveColumn(columnArchiveTarget.id);
          setColumnArchiveTarget(null);
        }}
        title="Archive column?"
        description={`"${columnArchiveTarget?.label}" and its cards will be hidden from the board. You can restore it from board settings.`}
        confirmLabel="Archive"
        isSubmitting={boardActions.isSubmitting}
      />

      <ConfirmModal
        isOpen={bulkArchiveConfirm}
        onClose={() => setBulkArchiveConfirm(false)}
        onConfirm={async () => {
          const ids = Array.from(dragDrop.selectedTaskIds);
          const results = await Promise.all(ids.map((id) => taskActions.archive(id)));
          if (results.some((r) => r === null)) toast.error("Some tasks couldn't be archived. Please try again.");
          dragDrop.clearSelection();
          setBulkArchiveConfirm(false);
        }}
        title={`Archive ${dragDrop.selectedTaskIds.size} task${dragDrop.selectedTaskIds.size === 1 ? "" : "s"}?`}
        description="They'll be hidden from the board. You can restore them from the Tasks tab."
        confirmLabel="Archive"
        isSubmitting={taskActions.isSubmitting}
      />

      <ConfirmModal
        isOpen={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        onConfirm={async () => {
          const ids = Array.from(dragDrop.selectedTaskIds);
          const results = await Promise.all(ids.map((id) => taskActions.remove(id)));
          if (results.some((r) => r === null)) toast.error("Some tasks couldn't be deleted. Please try again.");
          dragDrop.clearSelection();
          setBulkDeleteConfirm(false);
        }}
        title={`Delete ${dragDrop.selectedTaskIds.size} task${dragDrop.selectedTaskIds.size === 1 ? "" : "s"}?`}
        description="This permanently deletes them and their subtasks. This can't be undone."
        confirmLabel="Delete"
        isDanger
        isSubmitting={taskActions.isSubmitting}
      />

      <BoardActivityModal isOpen={isActivityOpen} onClose={() => setIsActivityOpen(false)} boardId={board.id} />
    </div>
  );
}
