"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { stagesCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { Stage } from "@/types/stage.types";

/** Realtime stages list for one project — same subscription pattern as useFiles/useReviews. */
export function useStages(projectId: string | undefined) {
  const { workspaceId } = useWorkspaceContext();
  const [stages, setStages] = useState<Stage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId || !projectId) {
      setStages([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(
      stagesCol(),
      where("workspaceId", "==", workspaceId),
      where("projectId", "==", projectId),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Filtered client-side (not via a Firestore where clause) so this
      // doesn't need its own composite index alongside workspaceId+projectId+createdAt.
      setStages(snapshot.docs.map((d) => d.data()).filter((s) => !s.isArchived));
      setIsLoading(false);
    });
    return unsubscribe;
  }, [workspaceId, projectId]);

  return { stages, isLoading };
}
