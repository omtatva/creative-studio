"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getDocs } from "firebase/firestore";
import { useAuthContext } from "./AuthContext";
import { clearActiveWorkspace, getWorkspace, setActiveWorkspace } from "@/services/workspaceService";
import { resyncBillingCache } from "@/services/billingService";
import { getUserWorkspaceMemberships } from "@/services/userService";
import { workspacesCol } from "@/lib/firebase/firestore";
import { isSuperAdminUser } from "@/lib/constants/itSupport";
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

  // Workspaces whose billing display cache has been verified against
  // the authoritative subscription this session — see resolveBillingCache.
  const billingResolvedFor = useRef<Set<string>>(new Set());

  /**
   * The workspace doc's `plan`/`limits`/`subscriptionStatus`/
   * `pendingPlan`/`trialEnd` are a display cache that nothing refreshes
   * on a timer, and workspaces last synced before `trialEnd` was cached
   * carry no way to tell a live trial from an expired one. So the first
   * time THIS session loads a workspace, ask the server to resolve it
   * from the authoritative subscription (a trusted Admin-SDK path that
   * takes no billing input from here) and repair the cache — so every
   * surface reading `workspace.plan`/`.limits` (planService, aiService,
   * limit checks, settings pages, ...) is correct from the member's OWN
   * session, without waiting for an owner/admin/Super Admin to visit.
   * A no-op round trip (no write) when the cache is already right; any
   * failure just leaves the cache as it was — the display layer
   * (billingDisplay.ts) never shows an unverifiable trial as active.
   */
  async function resolveBillingCache(workspaceId: string) {
    if (billingResolvedFor.current.has(workspaceId)) return;
    billingResolvedFor.current.add(workspaceId);
    const result = await resyncBillingCache(workspaceId).catch(() => null);
    if (!result?.ok || !result.data?.changed) return;
    const fresh = await getWorkspace(workspaceId).catch(() => null);
    if (fresh) setWorkspace((prev) => (prev && prev.id === fresh.id ? fresh : prev));
  }

  // Pointers already repaired this session (guards against a loop if the repair itself can't stick).
  const healedPointers = useRef<Set<string>>(new Set());

  /**
   * `users/{uid}.activeWorkspaceId` can be STALE: deleting a workspace removes its members/settings/workspace docs but never the
   * other members' pointers, and removing a member doesn't clear theirs either. Reading a workspace you are not (or no longer) a
   * member of is a Firestore permission-denied — NOT "not found" — so such an account used to land on a dead-end "Couldn't load
   * your workspace" screen on every sign-in (a first-time user with an invite to a since-deleted workspace, for example).
   * Recovery: switch to another workspace the user really belongs to, else clear the pointer so they get the normal
   * "no workspace yet" experience (create one / accept an invite). Only for permission-denied / missing docs — a network
   * error still shows the retry screen. Returns true when the pointer was repaired (the profile change reloads everything).
   */
  async function repairStalePointer(staleId: string): Promise<boolean> {
    if (!firebaseUser || healedPointers.current.has(staleId)) return false;
    healedPointers.current.add(staleId);
    try {
      const memberships = await getUserWorkspaceMemberships(firebaseUser.uid);
      for (const m of memberships) {
        if (m.workspaceId === staleId) continue;
        const ws = await getWorkspace(m.workspaceId).catch(() => null);
        if (ws) {
          await setActiveWorkspace(firebaseUser.uid, ws.id);
          await refreshProfile();
          return true;
        }
      }
      await clearActiveWorkspace(firebaseUser.uid);
      await refreshProfile();
      setWorkspace(null);
      setError(null);
      return true;
    } catch (err) {
      console.error("[WorkspaceContext] couldn't repair a stale active workspace pointer:", err);
      return false;
    }
  }

  async function load(workspaceId: string) {
    try {
      const ws = await getWorkspace(workspaceId);
      setWorkspace(ws);
      setError(null);
      if (ws) void resolveBillingCache(ws.id);
      if (!ws) {
        if (isSuperAdminUser(profile)) {
          // Super Admin (itSupport.ts) is a platform-wide admin identity,
          // not a tenant member — it's expected and permanent for this
          // account to have no valid activeWorkspaceId (never created
          // one, or deleted one while testing the delete flow). Not a
          // bug: no console.error (Next's dev overlay treats that as a
          // crash) and no user-facing error — MainLayout already skips
          // the workspace-required block for this account, and every
          // page it actually uses (Super Admin > Customers/Sales/etc.)
          // reads the `workspaces` list, never this `workspace`.
          return;
        }
        // The doc doesn't exist (deleted, or activeWorkspaceId is stale): repair the pointer instead of trapping the account.
        if (await repairStalePointer(workspaceId)) return;
        console.error("[WorkspaceContext] workspace document not found:", workspaceId);
        setError(`Workspace "${workspaceId}" was not found. It may have been deleted, or your account is pointing at an invalid workspace.`);
      }
    } catch (err) {
      // Previously this rejection was uncaught: .finally() still ran,
      // isLoading became false, but `workspace` (and therefore
      // workspaceId) silently stayed null forever with zero visible
      // error anywhere in the app.
      const firebaseErr = err as { code?: string; message?: string; stack?: string };
      // permission-denied on the active workspace = not (or no longer) a member of it = a stale pointer (see repairStalePointer).
      if (firebaseErr?.code === "permission-denied" && !isSuperAdminUser(profile) && (await repairStalePointer(workspaceId))) return;
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
      // Super Admin (see lib/constants/itSupport.ts) gets every
      // workspace, not just ones they hold a `members` doc for —
      // matches firestore.rules' isSuperAdmin() bypass on the
      // `workspaces` collection's read rule. Everyone else keeps the
      // exact existing behavior: only workspaces they actually belong
      // to.
      if (isSuperAdminUser(profile)) {
        const snapshot = await getDocs(workspacesCol());
        setWorkspaces(snapshot.docs.map((d) => d.data()));
        return;
      }
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
