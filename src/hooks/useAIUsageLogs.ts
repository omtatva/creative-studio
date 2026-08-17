"use client";

import { useEffect, useState } from "react";
import { limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { aiUsageLogsCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { AIGeneration } from "@/types/ai.types";

/** Realtime recent AI Studio generation history for the active workspace — powers the Dashboard's "AI Activity" widget. */
export function useAIUsageLogs(take = 5) {
  const { workspaceId } = useWorkspaceContext();
  const [logs, setLogs] = useState<AIGeneration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setLogs([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(aiUsageLogsCol(), where("workspaceId", "==", workspaceId), orderBy("createdAt", "desc"), limit(take));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setLogs(snapshot.docs.map((d) => d.data()));
        setIsLoading(false);
      },
      () => setIsLoading(false)
    );
    return unsubscribe;
  }, [workspaceId, take]);

  return { logs, isLoading };
}
