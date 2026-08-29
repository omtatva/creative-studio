"use client";

import { useEffect, useMemo, useState } from "react";
import { documentId, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { projectsCol, projectMembersCol } from "@/lib/firebase/firestore";
import { backfillProjectMemberships } from "@/services/projectService";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { isSuperAdminUser } from "@/lib/constants/itSupport";
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
// One-time-per-app-session guard so the (idempotent, purely additive)
// project_members backfill migration — see
// projectService.backfillProjectMemberships's doc comment — doesn't
// re-run on every mount/re-render of every component that calls
// useProjects() for the same workspace.
const backfilledWorkspaces = new Set<string>();
// Firestore's `in`/documentId() query caps at 30 values per query —
// chunk membership-filtered project fetches into groups this size.
const ID_QUERY_CHUNK_SIZE = 30;

/**
 * Realtime, WORKSPACE- AND MEMBERSHIP-scoped project list.
 *
 * Workspace owners/admins and the designated Super Admin account see
 * every project in the workspace (unchanged from before) — see
 * ProjectMembership's doc comment in project.types.ts for why that's
 * the deliberate bypass, not an oversight: someone has to be able to
 * see a workspace's projects to add other people to them. Every
 * other workspace member sees ONLY projects they have an explicit
 * `project_members` record for, which is queried FIRST — this never
 * fetches a project document the caller isn't authorized to have,
 * even transiently, unlike a "fetch everything, filter in React"
 * approach. (Firestore rules — see firestore.rules's `canReadProject`
 * — are still the real backend enforcement; this query shape is what
 * keeps the client from even attempting to over-fetch.)
 */
export function useProjects() {
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser, profile } = useAuthContext();
  const { canManageWorkspace, isLoading: isLoadingRole } = useCurrentMemberRole();
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [section, setSection] = useState<ProjectSection>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<ProjectFilters>(EMPTY_PROJECT_FILTERS);
  const [sort, setSort] = useState<ProjectSort>(DEFAULT_PROJECT_SORT);
  const [page, setPage] = useState(1);
  const [retryCount, setRetryCount] = useState(0);

  const uid = firebaseUser?.uid ?? "";
  const hasWorkspaceWideAccess = canManageWorkspace || isSuperAdminUser(profile);

  // Migration: backfill project_members from each existing project's
  // Project.members[] array, once per workspace per app session. Only
  // an owner/admin/Super-Admin visit can trigger it — they're the only
  // ones who (a) still see every project under the new model without
  // this having run yet, and (b) are authorized to write
  // project_members under firestore.rules either way. Purely additive
  // and idempotent — see backfillProjectMemberships's doc comment.
  useEffect(() => {
    if (!workspaceId || !uid || !hasWorkspaceWideAccess) return;
    if (backfilledWorkspaces.has(workspaceId)) return;
    backfilledWorkspaces.add(workspaceId);
    backfillProjectMemberships(workspaceId, uid).catch((err) => {
      console.error("[useProjects] project_members backfill failed:", err);
      backfilledWorkspaces.delete(workspaceId); // allow a retry on next mount rather than silently giving up forever
    });
  }, [workspaceId, uid, hasWorkspaceWideAccess]);

  useEffect(() => {
    if (!workspaceId || !uid || isLoadingRole) {
      if (!isLoadingRole) {
        setAllProjects([]);
        setIsLoading(false);
      }
      return;
    }
    setIsLoading(true);
    setError(null);

    // Workspace owner/admin/Super Admin: same query as before — every
    // project in the workspace.
    if (hasWorkspaceWideAccess) {
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
    }

    // Regular member/viewer: first find WHICH projects this uid has
    // explicit access to, then subscribe only to those documents.
    // Realtime on the membership query too, so being added to or
    // removed from a project updates this list without a reload
    // (Scenario D/E from the access-model spec).
    const membershipQuery = query(projectMembersCol(), where("workspaceId", "==", workspaceId), where("uid", "==", uid));
    let projectUnsubscribe: (() => void) | null = null;

    const membershipUnsubscribe = onSnapshot(
      membershipQuery,
      (membershipSnapshot) => {
        projectUnsubscribe?.();
        projectUnsubscribe = null;

        const projectIds = membershipSnapshot.docs.map((d) => d.data().projectId);
        if (projectIds.length === 0) {
          // TEMPORARY DIAGNOSTIC — remove once confirmed fixed. This is
          // the CORRECT, expected state for an employee who accepted a
          // WORKSPACE invite but hasn't been added to any PROJECT yet —
          // an empty list here, not a permission error.
          console.log("[diag:projects] no project_members records for this uid — projectsReturned: 0", { uid, activeWorkspaceId: workspaceId });
          setAllProjects([]);
          setIsLoading(false);
          setError(null);
          return;
        }

        // documentId() `in` queries cap at 30 ids — chunk and merge.
        // Each chunk is its own onSnapshot; results are combined by
        // project id so one chunk's update doesn't drop another
        // chunk's projects.
        const chunks: string[][] = [];
        for (let i = 0; i < projectIds.length; i += ID_QUERY_CHUNK_SIZE) {
          chunks.push(projectIds.slice(i, i + ID_QUERY_CHUNK_SIZE));
        }

        const resultsByChunk = new Map<number, Project[]>();
        const unsubscribers = chunks.map((chunk, index) =>
          onSnapshot(
            // workspaceId included alongside the id-list filter — every
            // matched project already belongs to this workspace (its id
            // came from a project_members record scoped to it), but
            // including the filter explicitly keeps this query's shape
            // consistent with useTasks/useFiles/useReviews's equivalent
            // chunked fetches, all of which need it for Firestore's
            // rule-vs-query compatibility check (see the project_members
            // rule's doc comment in firestore.rules for why an
            // unfiltered field a security rule depends on can silently
            // reject an otherwise-valid query).
            query(projectsCol(), where("workspaceId", "==", workspaceId), where(documentId(), "in", chunk)),
            (snapshot) => {
              resultsByChunk.set(index, snapshot.docs.map((d) => d.data()));
              const merged = Array.from(resultsByChunk.values()).flat();
              merged.sort((a, b) => toDateSafe(b.updatedAt).getTime() - toDateSafe(a.updatedAt).getTime());
              // TEMPORARY DIAGNOSTIC — remove once confirmed fixed.
              console.log("[diag:projects] read OK", { uid, activeWorkspaceId: workspaceId, requestedIds: chunk, projectsReturned: merged.length });
              setAllProjects(merged);
              setIsLoading(false);
              setError(null);
            },
            (err) => {
              console.error("[diag:projects] READ FAILED (scenario C/D from the debugging checklist)", {
                uid,
                activeWorkspaceId: workspaceId,
                requestedIds: chunk,
                code: (err as { code?: string }).code,
                message: err.message,
              });
              setError(err.message);
              setIsLoading(false);
            }
          )
        );
        projectUnsubscribe = () => unsubscribers.forEach((u) => u());
      },
      (err) => {
        setError(err.message);
        setIsLoading(false);
      }
    );

    return () => {
      membershipUnsubscribe();
      projectUnsubscribe?.();
    };
    // retryCount is a manual bump, not real data — its only job is
    // forcing this effect to re-run and open a FRESH onSnapshot
    // listener. Once a listener errors (e.g. "index not ready yet"),
    // it's dead — it does not retry on its own even after the
    // underlying problem (like a still-building index) resolves.
    // Without this, the only way to recover was a full page reload.
  }, [workspaceId, uid, hasWorkspaceWideAccess, isLoadingRole, retryCount]);

  // Reset to page 1 whenever the visible set could change shape.
  useEffect(() => {
    setPage(1);
  }, [section, searchQuery, filters, sort]);

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
