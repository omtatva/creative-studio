"use client";

import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { memberDoc } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
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
  const { firebaseUser } = useAuthContext();
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
          console.warn(`[useCurrentMemberRole] no membership doc at ${path} — role checks will all be false.`);
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
  const canManageMembers = role === "owner" || role === "admin";
  /** Same owner/admin check as canManageMembers, under a name that reads correctly at non-member-management call sites (e.g. gating the AI API key config in Settings). */
  const canManageWorkspace = role === "owner" || role === "admin";

  return { role, isLoading, error, canApproveReviews, canManageMembers, canManageWorkspace };
}
