"use client";

import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { projectsCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  DEFAULT_PROJECT_SORT,
  EMPTY_PROJECT_FILTERS,
  Project,
  ProjectFilters,
  ProjectSection,
  ProjectSort,
} from "@/types/project.types";
import { toDateSafe } from "@/lib/utils/date";

const PAGE_SIZE = 9;

/**
 * Realtime, workspace-scoped project list. The Firestore query is
 * filtered by `workspaceId` (the ONLY collection-level filter — see
 * lib/firebase/firestore.ts); everything else (section, search,
 * filters, sort, pagination) is applied client-side against that
 * already-tenant-scoped snapshot, so no code path here can ever
 * touch another workspace's data.
 */
export function useProjects() {
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser } = useAuthContext();
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [section, setSection] = useState<ProjectSection>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<ProjectFilters>(EMPTY_PROJECT_FILTERS);
  const [sort, setSort] = useState<ProjectSort>(DEFAULT_PROJECT_SORT);
  const [page, setPage] = useState(1);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!workspaceId) {
      setAllProjects([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const q = query(projectsCol(), where("workspaceId", "==", workspaceId), orderBy("updatedAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setAllProjects(snapshot.docs.map((d) => d.data()));
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setIsLoading(false);
      }
    );
    return unsubscribe;
    // retryCount is a manual bump, not real data — its only job is
    // forcing this effect to re-run and open a FRESH onSnapshot
    // listener. Once a listener errors (e.g. "index not ready yet"),
    // it's dead — it does not retry on its own even after the
    // underlying problem (like a still-building index) resolves.
    // Without this, the only way to recover was a full page reload.
  }, [workspaceId, retryCount]);

  // Reset to page 1 whenever the visible set could change shape.
  useEffect(() => {
    setPage(1);
  }, [section, searchQuery, filters, sort]);

  const uid = firebaseUser?.uid ?? "";

  const sectioned = useMemo(() => {
    switch (section) {
      case "archived":
        return allProjects.filter((p) => p.isArchived);
      case "favorites":
        return allProjects.filter((p) => !p.isArchived && p.favoritedBy.includes(uid));
      case "pinned":
        return allProjects.filter((p) => !p.isArchived && p.pinnedBy.includes(uid));
      case "recent":
        return allProjects.filter((p) => !p.isArchived).slice(0, 12);
      case "all":
      default:
        return allProjects.filter((p) => !p.isArchived);
    }
  }, [allProjects, section, uid]);

  const searched = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sectioned;
    return sectioned.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        p.members.some((m) => m.displayName.toLowerCase().includes(q)) ||
        p.statusId.toLowerCase().includes(q)
    );
  }, [sectioned, searchQuery]);

  const filtered = useMemo(() => {
    return searched.filter((p) => {
      if (filters.statusIds.length && !filters.statusIds.includes(p.statusId)) return false;
      if (filters.priorityIds.length && !filters.priorityIds.includes(p.priorityId)) return false;
      if (filters.ownerIds.length && !filters.ownerIds.includes(p.ownerId)) return false;
      if (filters.dueBefore && (!p.dueDate || p.dueDate > filters.dueBefore)) return false;
      if (filters.dueAfter && (!p.dueDate || p.dueDate < filters.dueAfter)) return false;
      if (filters.createdAfter && p.createdAt < filters.createdAfter) return false;
      return true;
    });
  }, [searched, filters]);

  const sorted = useMemo(() => {
    const items = [...filtered];
    const dir = sort.direction === "asc" ? 1 : -1;
    items.sort((a, b) => {
      switch (sort.field) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "dueDate":
          return ((a.dueDate ?? "").localeCompare(b.dueDate ?? "")) * dir;
        case "progress":
          return (a.progress - b.progress) * dir;
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
    projects: paginated,
    totalCount: sorted.length,
    isLoading,
    error,
    retry: () => setRetryCount((c) => c + 1),
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
    allProjectsForCounts: allProjects,
  };
}
