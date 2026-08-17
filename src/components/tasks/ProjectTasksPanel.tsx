"use client";

import { useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTasks } from "@/hooks/useTasks";
import { useTaskOptions } from "@/hooks/useTaskOptions";
import { useTaskActions } from "@/hooks/useTaskActions";
import { SectionTabs } from "@/components/shared/SectionTabs";
import { Pagination } from "@/components/shared/Pagination";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { TaskListToolbar } from "./TaskListToolbar";
import { TaskCard } from "./TaskCard";
import { TaskCardSkeleton } from "./TaskCardSkeleton";
import { TaskTable } from "./TaskTable";
import { TaskEmptyState } from "./TaskEmptyState";
import { TaskFormModal } from "./TaskFormModal";
import { TaskFiltersPanel } from "./TaskFiltersPanel";
import { EMPTY_TASK_FILTERS, TASK_SECTIONS, Task, TaskSection } from "@/types/task.types";
import { TaskFormValues } from "@/lib/validations/task.schema";

/**
 * The Projects module's Tasks tab (app/(dashboard)/projects/[projectId]/tasks/page.tsx)
 * renders this — it's the integration seam between the two modules.
 * Everything here is the SAME useTasks/useTaskActions/TaskCard/
 * TaskFormModal used by the global /tasks page, just called with a
 * fixed `projectId` so the Firestore query narrows to one project
 * instead of the whole workspace. No task logic is duplicated.
 */
export function ProjectTasksPanel({ projectId }: { projectId: string }) {
  const { firebaseUser } = useAuthContext();
  const uid = firebaseUser?.uid ?? "";
  const { options } = useTaskOptions();
  const {
    tasks, totalCount, isLoading, error,
    section, setSection, setSearchQuery,
    filters, setFilters, sort, setSort,
    page, setPage, totalPages, pageSize, allTasksForCounts,
  } = useTasks(projectId);
  const actions = useTaskActions();

  const [viewMode, setViewMode] = useState<"list" | "table">("list");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const availableAssignees = useMemo(() => {
    const map = new Map<string, NonNullable<Task["assignee"]>>();
    allTasksForCounts.forEach((t) => { if (t.assignee) map.set(t.assignee.uid, t.assignee); });
    return Array.from(map.values());
  }, [allTasksForCounts]);

  const counts = useMemo<Record<TaskSection, number>>(() => ({
    all: allTasksForCounts.length,
    my_tasks: allTasksForCounts.filter((t) => t.assignee?.uid === uid || t.reporter.uid === uid).length,
    assigned_to_me: allTasksForCounts.filter((t) => t.assignee?.uid === uid).length,
    created_by_me: allTasksForCounts.filter((t) => t.reporter.uid === uid).length,
    overdue: allTasksForCounts.filter((t) => !t.isCompleted && t.dueDate && t.dueDate < new Date().toISOString()).length,
    completed: allTasksForCounts.filter((t) => t.isCompleted).length,
  }), [allTasksForCounts, uid]);

  const activeFilterCount =
    filters.statusIds.length + filters.priorityIds.length + filters.labelIds.length + filters.assigneeIds.length +
    (filters.dueBefore ? 1 : 0) + (filters.dueAfter ? 1 : 0);

  function openCreateModal() {
    setEditingTask(null);
    setIsFormOpen(true);
  }

  async function handleFormSubmit(values: TaskFormValues & { projectId: string; assignee: Task["assignee"] }) {
    if (editingTask) {
      await actions.update(editingTask.id, {
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
    } else {
      await actions.create(projectId, {
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
        parentTaskId: null,
      }, false);
    }
    setIsFormOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionTabs items={TASK_SECTIONS} active={section} onChange={setSection} counts={counts} />

      <TaskListToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onSearchChange={setSearchQuery}
        sort={sort}
        onSortChange={setSort}
        activeFilterCount={activeFilterCount}
        onOpenFilters={() => setIsFiltersOpen(true)}
        onCreateTask={openCreateModal}
      />

      {!isLoading && tasks.length === 0 ? (
        <TaskEmptyState
          section={section}
          hasSearchOrFilters={activeFilterCount > 0}
          onCreateTask={openCreateModal}
          onClearSearch={() => setFilters(EMPTY_TASK_FILTERS)}
        />
      ) : isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => <TaskCardSkeleton key={i} />)}
        </div>
      ) : viewMode === "table" ? (
        <TaskTable
          tasks={tasks}
          options={options}
          onEdit={(t) => { setEditingTask(t); setIsFormOpen(true); }}
          onDuplicate={(t) => actions.duplicate(t.id)}
          onArchive={(t) => setArchiveTarget(t)}
          onRestore={(t) => actions.restore(t.id)}
          onDelete={(t) => setDeleteTarget(t)}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              status={options.statuses.find((s) => s.id === task.statusId)}
              priority={options.priorities.find((p) => p.id === task.priorityId)}
              labels={task.labelIds.map((id) => options.labels.find((l) => l.id === id))}
              onEdit={() => { setEditingTask(task); setIsFormOpen(true); }}
              onDuplicate={() => actions.duplicate(task.id)}
              onArchive={() => setArchiveTarget(task)}
              onRestore={() => actions.restore(task.id)}
              onDelete={() => setDeleteTarget(task)}
            />
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalCount={totalCount} pageSize={pageSize} />

      <TaskFormModal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} task={editingTask} projectId={projectId} onSubmit={handleFormSubmit} isSubmitting={actions.isSubmitting} />

      <TaskFiltersPanel isOpen={isFiltersOpen} onClose={() => setIsFiltersOpen(false)} filters={filters} onChange={setFilters} options={options} availableAssignees={availableAssignees} />

      <ConfirmModal
        isOpen={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={async () => { if (archiveTarget) await actions.archive(archiveTarget.id); setArchiveTarget(null); }}
        title="Archive task?"
        description={`"${archiveTarget?.title}" will be hidden from active views. You can restore it anytime.`}
        confirmLabel="Archive"
        isSubmitting={actions.isSubmitting}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => { if (deleteTarget) await actions.remove(deleteTarget.id); setDeleteTarget(null); }}
        title="Delete task?"
        description={`This permanently deletes "${deleteTarget?.title}" and its subtasks. This can't be undone.`}
        confirmLabel="Delete"
        isDanger
        isSubmitting={actions.isSubmitting}
      />
    </div>
  );
}
