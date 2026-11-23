"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query, limit as fbLimit } from "firebase/firestore";
import { downloadHistoryCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { useAccessibleProjectIds } from "@/hooks/useAccessibleProjectIds";
import type { DownloadEvent } from "@/types/download.types";

/**
 * Realtime read side of the signed-in member's OWN download history (written only by the server — see lib/server/downloadHistory.ts). It is a live listener, so a download
 * shows up in the Downloads page the moment the server records it, with no refresh; and a proxied download's status flips from "started" to its final outcome by itself.
 * Events for a project the member can no longer open are hidden, like notifications.
 */
export function useDownloadHistory(take = 100) {
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser } = useAuthContext();
  const { projectIds: accessibleProjectIds, isLoading: isLoadingAccess } = useAccessibleProjectIds();
  const [all, setAll] = useState<DownloadEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId || !firebaseUser) {
      setAll([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const q = query(downloadHistoryCol(workspaceId, firebaseUser.uid), orderBy("createdAt", "desc"), fbLimit(take));
    return onSnapshot(
      q,
      (snap) => {
        setAll(snap.docs.map((d) => ({ ...(d.data() as DownloadEvent), id: d.id })));
        setIsLoading(false);
      },
      (err) => {
        console.error("[useDownloadHistory] snapshot error:", err);
        setAll([]);
        setError("Couldn't load your download history.");
        setIsLoading(false);
      }
    );
  }, [workspaceId, firebaseUser, take]);

  const events = all.filter((e) => accessibleProjectIds === null || (!isLoadingAccess && accessibleProjectIds.includes(e.projectId)));
  return { events, isLoading: isLoading || (accessibleProjectIds !== null && isLoadingAccess), error };
}
