"use client";

import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { tasksCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  DEFAULT_TASK_SORT,
  EMPTY_TASK_FILTERS,
  Task,
  TaskFilters,
  TaskSection,
  TaskSort,
} from "@/types/task.types";
import { isOverdue, toDateSafe } from "@/lib/utils/date";

const PAGE_SIZE = 10;

/**
 * Realtime, workspace-scoped task list — optionally narrowed to one
 * project. The Firestore query filters by `workspaceId` (and
 * `projectId` when provided) — the only collection-level filters;
 * section/search/filter/sort/pagination all run client-side against
 * that already-tenant-scoped snapshot, same pattern as useProjects.
 */
export function useTasks(projectId?: string) {
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser } = useAuthContext();
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [section, setSection] = useState<TaskSection>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [sort, setSort] = useState<TaskSort>(DEFAULT_TASK_SORT);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!workspaceId) {
      setAllTasks([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const clauses = [where("workspaceId", "==", workspaceId)];
    if (projectId) clauses.push(where("projectId", "==", projectId));
    const q = query(tasksCol(), ...clauses, orderBy("updatedAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setAllTasks(snapshot.docs.map((d) => d.data()));
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setIsLoading(false);
      }
    );
    return unsubscribe;
  }, [workspaceId, projectId]);

  useEffect(() => {
    setPage(1);
  }, [section, searchQuery, filters, sort]);

  const uid = firebaseUser?.uid ?? "";

  const rootTasks = useMemo(() => allTasks.filter((t) => !t.parentTaskId), [allTasks]);

  const sectioned = useMemo(() => {
    const active = rootTasks.filter((t) => !t.isArchived);
    switch (section) {
      case "my_tasks":
        return active.filter((t) => t.assignee?.uid === uid || t.reporter.uid === uid);
      case "assigned_to_me":
        return active.filter((t) => t.assignee?.uid === uid);
      case "created_by_me":
        return active.filter((t) => t.reporter.uid === uid);
      case "overdue":
        return active.filter((t) => !t.isCompleted && isOverdue(t.dueDate));
      case "completed":
        return active.filter((t) => t.isCompleted);
      case "all":
      default:
        return active;
    }
  }, [rootTasks, section, uid]);

  const searched = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sectioned;
    return sectioned.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        t.assignee?.displayName.toLowerCase().includes(q) ||
        t.reporter.displayName.toLowerCase().includes(q)
    );
  }, [sectioned, searchQuery]);

  const filtered = useMemo(() => {
    return searched.filter((t) => {
      if (filters.statusIds.length && !filters.statusIds.includes(t.statusId)) return false;
      if (filters.priorityIds.length && !filters.priorityIds.includes(t.priorityId)) return false;
      if (filters.labelIds.length && !t.labelIds.some((l) => filters.labelIds.includes(l))) return false;
      if (filters.assigneeIds.length && !(t.assignee && filters.assigneeIds.includes(t.assignee.uid))) return false;
      if (filters.dueBefore && (!t.dueDate || t.dueDate > filters.dueBefore)) return false;
      if (filters.dueAfter && (!t.dueDate || t.dueDate < filters.dueAfter)) return false;
      return true;
    });
  }, [searched, filters]);

  const sorted = useMemo(() => {
    const items = [...filtered];
    const dir = sort.direction === "asc" ? 1 : -1;
    items.sort((a, b) => {
      switch (sort.field) {
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "dueDate":
          return ((a.dueDate ?? "").localeCompare(b.dueDate ?? "")) * dir;
        case "priority":
          return a.priorityId.localeCompare(b.priorityId) * dir;
        case "createdAt":
          return (toDateSafe(a.createdAt).getTime() - toDateSafe(b.createdAt).getTime()) * dir;
        case "updatedAt":
        default:
          return (toDateSafe(a.updatedAt).getTime() - toDateSafe(b.updatedAt).getTime()) * dir;
      }
    });
    return items;
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return {
    tasks: paginated,
    totalCount: sorted.length,
    isLoading,
    error,
    section,
    setSection,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    sort,
    setSort,
    page,
    setPage,
    totalPages,
    pageSize: PAGE_SIZE,
    allTasksForCounts: rootTasks.filter((t) => !t.isArchived),
  };
}
