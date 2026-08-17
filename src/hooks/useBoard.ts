"use client";

import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { boardDoc } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { getOrCreateBoard } from "@/services/boardService";
import { Board } from "@/types/board.types";

/**
 * Resolves (creating on first visit) the one board for a project,
 * then subscribes to it in realtime. Mirrors useProject/useTask's
 * "realtime doc, re-validated against workspaceId" pattern.
 */
export function useBoard(projectId: string | undefined) {
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser, profile } = useAuthContext();
  const [board, setBoard] = useState<Board | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !workspaceId || !firebaseUser) {
      setBoard(null);
      setIsLoading(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;
    setIsLoading(true);

    getOrCreateBoard(workspaceId, projectId, {
      uid: firebaseUser.uid,
      displayName: profile?.displayName ?? firebaseUser.displayName ?? "Unknown",
      photoURL: profile?.photoURL ?? firebaseUser.photoURL ?? null,
    })
      .then((created) => {
        unsubscribe = onSnapshot(
          boardDoc(created.id),
          (snapshot) => {
            const data = snapshot.data();
            setBoard(data && data.workspaceId === workspaceId ? data : null);
            setIsLoading(false);
          },
          (err) => {
            setError(err.message);
            setIsLoading(false);
          }
        );
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load the board.");
        setIsLoading(false);
      });

    return () => unsubscribe?.();
  }, [projectId, workspaceId, firebaseUser, profile]);

  return { board, isLoading, error };
}
