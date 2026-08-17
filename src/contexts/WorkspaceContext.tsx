"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuthContext } from "./AuthContext";
import { getWorkspace, setActiveWorkspace } from "@/services/workspaceService";
import { getUserWorkspaceMemberships } from "@/services/userService";
import { Workspace } from "@/types/workspace.types";

/**
 * Resolves the CURRENT tenant from the signed-in user's
 * `activeWorkspaceId`. Every workspace-scoped screen (dashboard,
 * settings, projects/tasks/etc.) reads `workspaceId` from here
 * instead of re-deriving it, which is what keeps tenant isolation
 * consistent across the app.
 *
 * Also resolves the FULL LIST of workspaces the user belongs to
 * (via the existing `members` collection / getUserWorkspaceMemberships
 * — both already existed but were never wired into any UI), and
 * exposes `switchWorkspace` for the Navbar's workspace switcher.
 * Switching just calls the existing `setActiveWorkspace` +
 * `refreshProfile`, which updates `profile.activeWorkspaceId` — the
 * effect below reacts to that change exactly like it always has, so
 * every workspace-scoped hook in the app (all of which depend on
 * `workspaceId`) naturally re-subscribes to the new tenant with no
 * manual refresh wiring needed anywhere else.
 */
interface WorkspaceContextValue {
  workspace: Workspace | null;
  workspaceId: string | null;
  workspaces: Workspace[];
  isLoading: boolean;
  isSwitching: boolean;
  error: string | null;
  refreshWorkspace: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { firebaseUser, profile, refreshProfile } = useAuthContext();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(workspaceId: string) {
    try {
      const ws = await getWorkspace(workspaceId);
      setWorkspace(ws);
      setError(null);
      if (!ws) {
        // The doc doesn't exist (deleted, or activeWorkspaceId is stale) —
        // this is a real, actionable state, not a transient loading gap.
        console.error("[WorkspaceContext] workspace document not found:", workspaceId);
        setError(`Workspace "${workspaceId}" was not found. It may have been deleted, or your account is pointing at an invalid workspace.`);
      }
    } catch (err) {
      // Previously this rejection was uncaught: .finally() still ran,
      // isLoading became false, but `workspace` (and therefore
      // workspaceId) silently stayed null forever with zero visible
      // error anywhere in the app.
      const firebaseErr = err as { code?: string; message?: string; stack?: string };
      console.error("[WorkspaceContext] failed to load workspace:", err);
      console.error("[WorkspaceContext] error.code:", firebaseErr?.code);
      console.error("[WorkspaceContext] error.message:", firebaseErr?.message);
      console.error("[WorkspaceContext] error.stack:", firebaseErr?.stack);
      setWorkspace(null);
      setError(
        firebaseErr?.code
          ? `${firebaseErr.code}: ${firebaseErr.message ?? "Couldn't load workspace"}`
          : "Couldn't load your workspace. Please refresh the page."
      );
    }
  }

  async function loadMemberships(uid: string) {
    try {
      const memberships = await getUserWorkspaceMemberships(uid);
      const results = await Promise.all(memberships.map((m) => getWorkspace(m.workspaceId)));
      setWorkspaces(results.filter((w): w is Workspace => w !== null));
    } catch (err) {
      console.error("[WorkspaceContext] failed to load workspace memberships:", err);
      // Non-fatal — the switcher just shows only the active workspace if this fails.
    }
  }

  useEffect(() => {
    if (profile?.activeWorkspaceId) {
      setIsLoading(true);
      load(profile.activeWorkspaceId).finally(() => setIsLoading(false));
    } else {
      setWorkspace(null);
      setError(null);
      setIsLoading(false);
    }
  }, [profile?.activeWorkspaceId]);

  useEffect(() => {
    if (firebaseUser) {
      loadMemberships(firebaseUser.uid);
    } else {
      setWorkspaces([]);
    }
    // Re-run whenever the active workspace changes too, so a newly
    // created workspace shows up in the switcher immediately.
  }, [firebaseUser, profile?.activeWorkspaceId]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      workspaceId: workspace?.id ?? null,
      workspaces,
      isLoading,
      isSwitching,
      error,
      refreshWorkspace: async () => {
        if (profile?.activeWorkspaceId) await load(profile.activeWorkspaceId);
      },
      switchWorkspace: async (nextWorkspaceId: string) => {
        if (!firebaseUser || nextWorkspaceId === workspace?.id) return;
        setIsSwitching(true);
        try {
          await setActiveWorkspace(firebaseUser.uid, nextWorkspaceId);
          await refreshProfile();
          // refreshProfile updates profile.activeWorkspaceId, which the
          // effect above reacts to — no separate load() call needed here.
        } catch (err) {
          console.error("[WorkspaceContext] failed to switch workspace:", err);
          setError(err instanceof Error ? err.message : "Couldn't switch workspace. Please try again.");
        } finally {
          setIsSwitching(false);
        }
      },
    }),
    [workspace, workspaces, isLoading, isSwitching, error, profile?.activeWorkspaceId, firebaseUser, refreshProfile]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspaceContext must be used within WorkspaceProvider");
  return ctx;
}
