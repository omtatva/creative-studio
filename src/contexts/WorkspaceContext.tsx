"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onSnapshot } from "firebase/firestore";
import { useAuthContext } from "./AuthContext";
import { clearActiveWorkspace, getWorkspace, markOnboardingComplete, setActiveWorkspace } from "@/services/workspaceService";
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
  // False until the workspace LIST (not just the active workspace) has been resolved for the current identity.
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);
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
      // A workspace the user is really a member of just loaded => they are onboarded (fixes accounts stuck as "Pending" in Super Admin > Users).
      if (ws && firebaseUser && profile && profile.onboardingComplete === false) {
        markOnboardingComplete(firebaseUser.uid).then(() => refreshProfile()).catch((err) => console.error("[WorkspaceContext] couldn't mark onboarding complete (non-fatal):", err));
      }
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

  /** The workspaces this (non-Super-Admin) user belongs to. `isCurrent` lets the caller discard a result that arrives after the identity changed. */
  async function loadMemberships(uid: string, isCurrent: () => boolean) {
    try {
      const memberships = await getUserWorkspaceMemberships(uid);
      const results = await Promise.all(memberships.map((m) => getWorkspace(m.workspaceId)));
      if (isCurrent()) setWorkspaces(results.filter((w): w is Workspace => w !== null));
    } catch (err) {
      console.error("[WorkspaceContext] failed to load workspace memberships:", err);
      // Non-fatal — the switcher just shows only the active workspace if this fails.
    } finally {
      if (isCurrent()) setWorkspacesLoaded(true);
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

  const isSuperAdmin = isSuperAdminUser(profile);
  const firebaseUid = firebaseUser?.uid ?? null;

  useEffect(() => {
    if (!firebaseUid) {
      setWorkspaces([]);
      setWorkspacesLoaded(false);
      return;
    }
    setWorkspacesLoaded(false);
    let current = true;
    const isCurrent = () => current;

    if (isSuperAdmin) {
      // Super Admin (see lib/constants/itSupport.ts) sees EVERY workspace, live — matches firestore.rules' isSuperAdmin() bypass on the
      // `workspaces` read rule. A realtime subscription (not a one-time read) is what makes a newly created workspace appear without a
      // refresh. This effect depends on `isSuperAdmin`: previously it did not, so whether the list was "all workspaces" or only "the ones
      // I'm a member of" depended on whether the profile (which carries platformRole) had loaded yet when the page did — which is why a
      // refresh could show 2 workspaces one time and 5 the next.
      const unsubscribe = onSnapshot(
        workspacesCol(),
        (snapshot) => {
          if (!current) return;
          setWorkspaces(snapshot.docs.map((d) => d.data()));
          setWorkspacesLoaded(true);
        },
        (err) => {
          console.error("[WorkspaceContext] workspace list subscription failed:", err);
          if (current) setWorkspacesLoaded(true);
        }
      );
      return () => {
        current = false;
        unsubscribe();
      };
    }

    // Everyone else: only workspaces they actually belong to. Re-run when the active workspace changes so a newly created workspace shows up.
    void loadMemberships(firebaseUid, isCurrent);
    return () => {
      current = false;
    };
  }, [firebaseUid, profile?.activeWorkspaceId, isSuperAdmin]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      workspaceId: workspace?.id ?? null,
      workspaces,
      // For the Super Admin, "loading" also covers the workspace LIST, so Customers/Billing pages don't flash an empty list.
      isLoading: isLoading || (isSuperAdmin && !workspacesLoaded),
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
    [workspace, workspaces, isLoading, isSuperAdmin, workspacesLoaded, isSwitching, error, profile?.activeWorkspaceId, firebaseUser, refreshProfile]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspaceContext must be used within WorkspaceProvider");
  return ctx;
}
