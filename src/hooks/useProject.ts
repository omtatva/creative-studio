"use client";

import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { projectDoc } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { Project } from "@/types/project.types";

/**
 * Realtime single-project subscription for the project details
 * screens. Re-validates `workspaceId` on every snapshot (not just
 * once) so if a project is ever moved/deleted out from under a
 * stale tab, it stops resolving instead of leaking cross-tenant
 * data.
 */
export function useProject(projectId: string | undefined) {
  const { workspaceId } = useWorkspaceContext();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !workspaceId) {
      setProject(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const unsubscribe = onSnapshot(
      projectDoc(projectId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setProject(null);
        } else {
          const data = snapshot.data();
          setProject(data.workspaceId === workspaceId ? data : null);
        }
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setIsLoading(false);
      }
    );
    return unsubscribe;
  }, [projectId, workspaceId]);

  return { project, isLoading, error };
}
