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

  useEffect(() => {
    if (!workspaceId || !firebaseUser) {
      setRole(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const unsubscribe = onSnapshot(
      memberDoc(workspaceId, firebaseUser.uid),
      (snapshot) => {
        setRole(snapshot.exists() ? snapshot.data().role : null);
        setIsLoading(false);
      },
      () => setIsLoading(false)
    );
    return unsubscribe;
  }, [workspaceId, firebaseUser]);

  const canApproveReviews = role === "owner" || role === "admin";
  const canManageMembers = role === "owner" || role === "admin";
  /** Same owner/admin check as canManageMembers, under a name that reads correctly at non-member-management call sites (e.g. gating the AI API key config in Settings). */
  const canManageWorkspace = role === "owner" || role === "admin";

  return { role, isLoading, canApproveReviews, canManageMembers, canManageWorkspace };
}
