"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import * as projectService from "@/services/projectService";
import { checkWorkspaceLimit } from "@/services/planService";
import { CreateProjectPayload, ProjectMember, UpdateProjectPayload } from "@/types/project.types";
import { ROUTES, projectRoute } from "@/lib/constants/routes";

/**
 * UI-facing mutation hook: wraps projectService calls with
 * loading/error state so ProjectFormModal, ProjectQuickActionsMenu,
 * and the Settings tab don't each re-implement try/catch. The
 * project LIST re-renders itself via useProjects' onSnapshot
 * subscription, so callers here don't need to manually refetch.
 */
export function useProjectActions() {
  const router = useRouter();
  const { workspaceId, workspace } = useWorkspaceContext();
  const { firebaseUser, profile } = useAuthContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function currentActor(): ProjectMember {
    return {
      uid: firebaseUser?.uid ?? "",
      displayName: profile?.displayName ?? firebaseUser?.displayName ?? "Unknown",
      photoURL: profile?.photoURL ?? firebaseUser?.photoURL ?? null,
      email: profile?.email ?? firebaseUser?.email ?? "",
      role: "owner",
    };
  }

  async function run<T>(fn: () => Promise<T>): Promise<{ data: T | null; error: string | null }> {
    setIsSubmitting(true);
    setError(null);
    try {
      const data = await fn();
      return { data, error: null };
    } catch (err) {
      // STEP 2: never hide the original Firebase error. Log everything
      // available on it, and surface the real code+message (not a
      // generic fallback) so a permission-denied / invalid-argument /
      // etc. is immediately visible instead of masked.
      const firebaseErr = err as { code?: string; message?: string; stack?: string };
      console.error("[useProjectActions] mutation failed:", err);
      console.error("[useProjectActions] error.code:", firebaseErr?.code);
      console.error("[useProjectActions] error.message:", firebaseErr?.message);
      console.error("[useProjectActions] error.stack:", firebaseErr?.stack);

      const readableMessage = firebaseErr?.code
        ? `${firebaseErr.code}: ${firebaseErr.message ?? "Unknown error"}`
        : err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      // `error` state is kept for any UI that wants to display the
      // last error reactively, but callers of run() should NOT rely on
      // reading it back out afterward — see the note in create() below
      // for why that doesn't work. Use the returned `error` instead.
      setError(readableMessage);
      return { data: null, error: readableMessage };
    } finally {
      setIsSubmitting(false);
    }
  }

  async function create(payload: CreateProjectPayload) {
    // STEP 3: verify auth before attempting anything — previously this
    // only checked workspaceId, so a stale/null auth state would still
    // reach the Firestore write and fail there with a confusing error.
    if (!firebaseUser || !firebaseUser.uid) {
      console.error("[useProjectActions] create() blocked: no authenticated user.", { firebaseUser });
      const message = "You're not signed in. Please refresh and log in again.";
      setError(message);
      return { data: null, error: message };
    }
    // STEP 4: verify workspaceId before attempting anything.
    if (!workspaceId || !workspace) {
      console.error("[useProjectActions] create() blocked: no active workspaceId.", { workspaceId });
      const message = "No active workspace found. Please refresh the page and try again.";
      setError(message);
      return { data: null, error: message };
    }

    // Real plan-limit check (see planService.ts) — pre-flight, before
    // any Storage/Firestore write, so a workspace at its project cap
    // gets a clear message instead of a half-created project.
    const limitCheck = await checkWorkspaceLimit(workspace, "projects");
    if (!limitCheck.allowed) {
      setError(limitCheck.reason);
      return { data: null, error: limitCheck.reason };
    }

    console.log("[useProjectActions] create() starting", {
      workspaceId,
      userId: firebaseUser.uid,
      payload,
    });

    const result = await run(() =>
      projectService.createProject({ workspaceId, owner: currentActor(), payload })
    );
    // Read the error from `result`/the catch block directly, NOT from
    // `error` state — `setError()` inside run() schedules a state
    // update for the NEXT render, but this function's `actions` object
    // (and therefore `actions.error`) was captured on the PREVIOUS
    // render and never updates within this same call. Callers must use
    // the returned `error` field, not `actions.error`, to get the real
    // message synchronously.
    // Straight to Members, not Overview — a brand-new project starts
    // with ONLY its creator as a project member (see
    // projectService.createProject), so the natural next step is
    // adding the rest of the team, reusing the existing Members tab
    // (ProjectMembersTab.tsx) rather than a separate "onboarding" flow.
    if (result.data) router.push(projectRoute(result.data, "members"));
    return result;
  }

  async function update(projectId: string, patch: UpdateProjectPayload) {
    if (!workspaceId) return { data: null, error: "No active workspace found. Please refresh and try again." };
    return run(() => projectService.updateProject(workspaceId, projectId, patch));
  }

  async function archive(projectId: string) {
    if (!workspaceId) return { data: null, error: "No active workspace found. Please refresh and try again." };
    return run(() => projectService.archiveProject(workspaceId, projectId));
  }

  async function restore(projectId: string) {
    if (!workspaceId) return { data: null, error: "No active workspace found. Please refresh and try again." };
    return run(() => projectService.restoreProject(workspaceId, projectId));
  }

  async function remove(projectId: string, redirectAfter = false) {
    if (!workspaceId) return { data: null, error: "No active workspace found. Please refresh and try again." };
    const result = await run(() => projectService.deleteProject(workspaceId, projectId));
    if (result.error === null && redirectAfter) router.push(ROUTES.projects);
    return result;
  }

  async function duplicate(projectId: string) {
    if (!workspaceId) return { data: null, error: "No active workspace found. Please refresh and try again." };
    return run(() => projectService.duplicateProject(workspaceId, projectId, currentActor()));
  }

  async function toggleFavorite(projectId: string, isFavorited: boolean) {
    if (!workspaceId || !firebaseUser) return { data: null, error: "You're not signed in. Please refresh and log in again." };
    return run(() => projectService.toggleFavorite(workspaceId, projectId, firebaseUser.uid, isFavorited));
  }

  async function togglePinned(projectId: string, isPinned: boolean) {
    if (!workspaceId || !firebaseUser) return { data: null, error: "You're not signed in. Please refresh and log in again." };
    return run(() => projectService.togglePinned(workspaceId, projectId, firebaseUser.uid, isPinned));
  }

  async function addMember(projectId: string, member: ProjectMember) {
    if (!workspaceId) return { data: null, error: "No active workspace found. Please refresh and try again." };
    if (!firebaseUser) return { data: null, error: "You're not signed in. Please refresh and log in again." };
    return run(() => projectService.addProjectMember(workspaceId, projectId, member, firebaseUser.uid));
  }

  async function removeMember(projectId: string, member: ProjectMember) {
    if (!workspaceId) return { data: null, error: "No active workspace found. Please refresh and try again." };
    return run(() => projectService.removeProjectMember(workspaceId, projectId, member));
  }

  async function updateMemberRole(projectId: string, uid: string, role: ProjectMember["role"]) {
    if (!workspaceId) return { data: null, error: "No active workspace found. Please refresh and try again." };
    return run(() => projectService.updateProjectMemberRole(workspaceId, projectId, uid, role));
  }

  return {
    isSubmitting,
    error,
    currentActor,
    create,
    update,
    archive,
    restore,
    remove,
    duplicate,
    toggleFavorite,
    togglePinned,
    addMember,
    removeMember,
    updateMemberRole,
  };
}
