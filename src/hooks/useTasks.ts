"use client";

import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { tasksCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { useAccessibleProjectIds } from "@/hooks/useAccessibleProjectIds";
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
// Firestore's `in` query caps at 30 values per query — chunk
// membership-filtered task fetches into groups this size, same as
// useProjects.ts.
const ID_QUERY_CHUNK_SIZE = 30;

/**
 * Realtime, workspace-scoped task list — optionally narrowed to one
 * project. When called WITHOUT a projectId ("My Tasks", workspace-
 * wide), a regular project member (not workspace owner/admin/IT
 * Support) is scoped to only the projects they're an explicit
 * project_members on — see useAccessibleProjectIds.ts. Without this,
 * "My Tasks" would fetch every task in the workspace regardless of
 * project membership, which both leaks task data from unauthorized
 * projects into the UI and would now fail outright once
 * firestore.rules requires project access to read a task (see
 * firestore.rules' `tasks` match block). When called WITH a
 * projectId, this is unaffected — that's already project-scoped and
 * rules enforce it directly.
 */
export function useTasks(projectId?: string) {
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser } = useAuthContext();
  const { projectIds: accessibleProjectIds, isLoading: isLoadingAccess } = useAccessibleProjectIds();
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

    // Project-scoped view: unaffected by project-membership scoping —
    // already narrowed to one project, exactly as before.
    if (projectId) {
      setIsLoading(true);
      const q = query(tasksCol(), where("workspaceId", "==", workspaceId), where("projectId", "==", projectId), orderBy("updatedAt", "desc"));
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
    }

    // Workspace-wide "My Tasks": wait for the accessible-project-ids
    // resolution first.
    if (isLoadingAccess) return;

    // null = workspace owner/admin/Super Admin — unfiltered, same query as before.
    if (accessibleProjectIds === null) {
      setIsLoading(true);
      const q = query(tasksCol(), where("workspaceId", "==", workspaceId), orderBy("updatedAt", "desc"));
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
    }

    if (accessibleProjectIds.length === 0) {
      setAllTasks([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    const chunks: string[][] = [];
    for (let i = 0; i < accessibleProjectIds.length; i += ID_QUERY_CHUNK_SIZE) {
      chunks.push(accessibleProjectIds.slice(i, i + ID_QUERY_CHUNK_SIZE));
    }

    const resultsByChunk = new Map<number, Task[]>();
    const unsubscribers = chunks.map((chunk, index) =>
      onSnapshot(
        query(tasksCol(), where("workspaceId", "==", workspaceId), where("projectId", "in", chunk), orderBy("updatedAt", "desc")),
        (snapshot) => {
          resultsByChunk.set(index, snapshot.docs.map((d) => d.data()));
          const merged = Array.from(resultsByChunk.values()).flat();
          merged.sort((a, b) => toDateSafe(b.updatedAt).getTime() - toDateSafe(a.updatedAt).getTime());
          setAllTasks(merged);
          setIsLoading(false);
          setError(null);
        },
        (err) => {
          setError(err.message);
          setIsLoading(false);
        }
      )
    );
    return () => unsubscribers.forEach((u) => u());
  }, [workspaceId, projectId, accessibleProjectIds, isLoadingAccess]);

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
