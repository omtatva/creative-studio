"use client";

import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { memberDoc } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { isSuperAdminUser } from "@/lib/constants/itSupport";
import { MemberRole } from "@/types/workspace.types";

/**
 * The signed-in user's own role in the active workspace — realtime,
 * single-doc read of `members/{workspaceId}_{uid}` (see
 * lib/firebase/firestore.ts). Used to gate role-restricted actions in
 * the UI (e.g. approving a review) the same way Firestore rules gate
 * them server-side via `isWorkspaceMemberWithRole` — see
 * firebase-config/firestore.rules.
 */
export function useCurrentMemberRole() {
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser, profile } = useAuthContext();
  const [role, setRole] = useState<MemberRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId || !firebaseUser) {
      setRole(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const path = `members/${workspaceId}_${firebaseUser.uid}`;
    const unsubscribe = onSnapshot(
      memberDoc(workspaceId, firebaseUser.uid),
      (snapshot) => {
        if (!snapshot.exists()) {
          // A real, actionable state — this signed-in user has no
          // membership doc for the workspace they're currently
          // "in", so every role check below will (correctly) come
          // back false. Previously this failed the exact same way
          // as an actual permission error, with nothing in the
          // console to tell them apart.
          // A Super Admin administering a customer workspace is EXPECTED to have no
          // membership doc (platform authority is not membership) — don't warn for that.
          if (!isSuperAdminUser(profile)) {
            console.warn(`[useCurrentMemberRole] no membership doc at ${path} — role checks will all be false.`);
          }
          setRole(null);
          setIsLoading(false);
          return;
        }
        setRole(snapshot.data().role);
        setIsLoading(false);
      },
      (err) => {
        // Previously swallowed entirely — role silently stayed null
        // forever with zero indication anything had gone wrong, which
        // is indistinguishable in the UI from "you're just a member".
        console.error(`[useCurrentMemberRole] failed to read ${path}:`, err);
        setError(err.message);
        setIsLoading(false);
      }
    );
    return unsubscribe;
  }, [workspaceId, firebaseUser]);

  const canApproveReviews = role === "owner" || role === "admin";
  // Workspace MEMBER ADMINISTRATION (invite, change role, disable/
  // remove/restore, roles & access policy) is platform Super Admin only
  // — NOT the workspace owner/admin. The real boundary is server-side
  // (/api/workspaces/members, /api/invites/send, firestore.rules); this
  // only decides what UI to show. Uses the existing Super Admin
  // mechanism (the server-synced `platformRole`), not a second role
  // system. Deliberately separate from canManageWorkspace below, which
  // keeps meaning "workspace owner/admin" for project access and the
  // customization settings they legitimately retain.
  const isSuperAdmin = isSuperAdminUser(profile);
  const canManageMembers = isSuperAdmin;
  /** Workspace owner/admin — project access and the customization settings they retain (e.g. the AI API key config). NOT member administration; see canManageMembers. */
  const canManageWorkspace = role === "owner" || role === "admin";
  /**
   * May use the workspace's Settings UI: its Owner/Admin, OR the platform Super Admin
   * (platform authority — they are NOT a member of the customer's workspace and are never
   * given a members record). Use this ONLY to decide Settings visibility/editability; it
   * deliberately does not replace canManageWorkspace for project-access logic, and it grants
   * nothing server-side (rules and routes make their own Super Admin decision).
   */
  const canAdministerWorkspace = canManageWorkspace || isSuperAdmin;
  /** A Super Admin looking at a workspace they are not a member of (no members doc). */
  const isViewingAsSuperAdmin = isSuperAdmin && !isLoading && role === null;

  return { role, isLoading, error, canApproveReviews, canManageMembers, canManageWorkspace, canAdministerWorkspace, isViewingAsSuperAdmin, isSuperAdmin };
}
