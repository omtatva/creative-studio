"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query, limit as fbLimit } from "firebase/firestore";
import { activityLogsCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { ActivityLogEntry } from "@/services/activityService";

export interface ActivityEntryWithId extends ActivityLogEntry {
  id: string;
  createdAt: string;
}

/**
 * Realtime read side of the Foundation's `activityLogsCol` — that
 * collection and its `logActivity()` writer already existed but had
 * no UI reader. This hook is what finally surfaces it, powering both
 * /activity and the dashboard's Recent Activity card.
 */
export function useWorkspaceActivity(take = 30) {
  const { workspaceId } = useWorkspaceContext();
  const [entries, setEntries] = useState<ActivityEntryWithId[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setEntries([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(activityLogsCol(workspaceId), orderBy("createdAt", "desc"), fbLimit(take));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEntries(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as ActivityLogEntry & { createdAt: string }) })));
      setIsLoading(false);
    });
    return unsubscribe;
  }, [workspaceId, take]);

  return { entries, isLoading };
}
