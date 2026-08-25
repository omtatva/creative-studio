"use client";

import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { projectMemberDoc } from "@/lib/firebase/firestore";
import { useAuthContext } from "@/contexts/AuthContext";
import { ProjectMembership } from "@/types/project.types";

/**
 * Realtime subscription to the SIGNED-IN user's own project_members
 * record for one project — never another uid's. Used by
 * ProjectDetailsContext.tsx's authorization gate; being realtime
 * means a member removed from a project mid-session loses access
 * immediately (Scenario E in the access-model spec) rather than only
 * on next page load.
 */
export function useProjectMembership(projectId: string | undefined) {
  const { firebaseUser } = useAuthContext();
  const [membership, setMembership] = useState<ProjectMembership | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!projectId || !firebaseUser) {
      setMembership(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const unsubscribe = onSnapshot(
      projectMemberDoc(projectId, firebaseUser.uid),
      (snapshot) => {
        setMembership(snapshot.exists() ? snapshot.data() : null);
        setIsLoading(false);
      },
      () => {
        // A permission-denied read here (e.g. rules reject it because
        // the caller genuinely has no membership doc and isn't
        // owner/admin/IT support) is itself the "no access" signal —
        // treat it the same as "doc doesn't exist" rather than as an
        // error state blocking the page.
        setMembership(null);
        setIsLoading(false);
      }
    );
    return unsubscribe;
  }, [projectId, firebaseUser]);

  return { membership, isLoading };
}
