"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { workspaceInvitesCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { WorkspaceInvite } from "@/types/workspace.types";

/**
 * Realtime pending-invites list for the Users settings page. This
 * query needs a composite index (workspaceId + status + createdAt —
 * see firebase-config/firestore.indexes.json); without it, or on any
 * other read failure, onSnapshot's error callback fires. Previously
 * there was no error callback at all, so a missing/still-building
 * index left `invites` permanently empty with `isLoading` stuck true
 * and zero visible sign anything was wrong — Send Invitation could
 * genuinely succeed in Firestore and the Pending Invites section
 * would still never appear. Surfacing `error` is what makes that
 * failure mode visible instead of silent.
 */
export function useInvites() {
  const { workspaceId } = useWorkspaceContext();
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setInvites([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    const q = query(workspaceInvitesCol(), where("workspaceId", "==", workspaceId), where("status", "==", "pending"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setInvites(snapshot.docs.map((d) => d.data()));
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("[useInvites] pending-invites query failed:", err);
        setError(err.message);
        setIsLoading(false);
      }
    );
    return unsubscribe;
  }, [workspaceId]);

  return { invites, isLoading, error };
}
