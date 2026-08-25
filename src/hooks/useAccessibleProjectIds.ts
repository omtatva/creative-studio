"use client";

import { useEffect, useState } from "react";
import { onSnapshot, query, where } from "firebase/firestore";
import { projectMembersCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { isItSupportUser } from "@/lib/constants/itSupport";

export interface AccessibleProjectIds {
  /**
   * `null` means "unfiltered — caller has workspace-wide access, query
   * everything in the workspace as before." A real (possibly empty)
   * array means "ONLY these project ids" — the caller must filter by
   * this list, never fall back to an unfiltered workspace-wide query.
   */
  projectIds: string[] | null;
  hasWorkspaceWideAccess: boolean;
  isLoading: boolean;
}

/**
 * Shared "which projects can this uid see" resolver — the same logic
 * useProjects.ts uses for the /projects list, extracted so every
 * other workspace-wide (no explicit projectId) view — My Tasks,
 * Files, Reviews, Calendar — can scope itself by project membership
 * too, instead of fetching every workspace-wide task/file/review
 * regardless of which project it belongs to (see each hook's own doc
 * comment for why that mattered: Dashboard counts, notifications, and
 * search must not surface data from a project the user was never
 * added to, per the project-access model's requirement #14/#15).
 *
 * Workspace owner/admin and IT Support keep seeing everything
 * (`projectIds: null`) — same bypass as useProjects.ts.
 */
export function useAccessibleProjectIds(): AccessibleProjectIds {
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser } = useAuthContext();
  const { canManageWorkspace, isLoading: isLoadingRole } = useCurrentMemberRole();
  const [projectIds, setProjectIds] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const uid = firebaseUser?.uid ?? "";
  const hasWorkspaceWideAccess = canManageWorkspace || isItSupportUser(firebaseUser);

  useEffect(() => {
    if (!workspaceId || !uid || isLoadingRole) {
      if (!isLoadingRole) {
        setProjectIds(null);
        setIsLoading(false);
      }
      return;
    }

    if (hasWorkspaceWideAccess) {
      setProjectIds(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    // TEMPORARY DIAGNOSTICS (Projects-page permission-error investigation)
    // — safe fields only (uid, workspaceId, membership presence/role/
    // projectId, result counts). Never logs tokens/secrets. Remove once
    // the fix is confirmed against a real invited-employee account.
    console.log("[diag:project_members] querying", { uid, activeWorkspaceId: workspaceId });
    const q = query(projectMembersCol(), where("workspaceId", "==", workspaceId), where("uid", "==", uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const ids = snapshot.docs.map((d) => d.data().projectId);
        console.log("[diag:project_members] read OK", {
          uid,
          activeWorkspaceId: workspaceId,
          membershipFound: snapshot.docs.length > 0,
          membershipCount: snapshot.docs.length,
          memberships: snapshot.docs.map((d) => ({ projectId: d.data().projectId, role: d.data().role })),
        });
        setProjectIds(ids);
        setIsLoading(false);
      },
      (err) => {
        console.error("[diag:project_members] READ FAILED (this is scenario B/C from the debugging checklist)", {
          uid,
          activeWorkspaceId: workspaceId,
          code: (err as { code?: string }).code,
          message: err.message,
        });
        setProjectIds([]); // fail closed — an error resolving membership must never fall back to "show everything"
        setIsLoading(false);
      }
    );
    return unsubscribe;
  }, [workspaceId, uid, hasWorkspaceWideAccess, isLoadingRole]);

  return { projectIds, hasWorkspaceWideAccess, isLoading };
}
