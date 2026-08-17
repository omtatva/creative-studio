"use client";

import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { stageDoc } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { Stage } from "@/types/stage.types";

/** Realtime single-stage subscription — mirrors useProject/useTask. Re-validates workspaceId on every snapshot. */
export function useStage(stageId: string | undefined) {
  const { workspaceId } = useWorkspaceContext();
  const [stage, setStage] = useState<Stage | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!stageId || !workspaceId) {
      setStage(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const unsubscribe = onSnapshot(
      stageDoc(stageId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setStage(null);
        } else {
          const data = snapshot.data();
          setStage(data.workspaceId === workspaceId ? data : null);
        }
        setIsLoading(false);
      },
      () => setIsLoading(false)
    );
    return unsubscribe;
  }, [stageId, workspaceId]);

  return { stage, isLoading };
}
