"use client";

import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { boardPreferenceDoc } from "@/lib/firebase/firestore";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { getOrCreateBoardPreference } from "@/services/boardPreferenceService";
import { BoardPreference, DEFAULT_BOARD_PREFERENCE } from "@/types/board.types";

/** Realtime per-user board preferences, created on first read so every board visit has a preference doc to subscribe to. */
export function useBoardPreferences(boardId: string | undefined) {
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser } = useAuthContext();
  const [preference, setPreference] = useState<BoardPreference | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!boardId || !workspaceId || !firebaseUser) {
      setPreference(null);
      setIsLoading(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;
    setIsLoading(true);

    getOrCreateBoardPreference(workspaceId, boardId, firebaseUser.uid).then(() => {
      unsubscribe = onSnapshot(boardPreferenceDoc(boardId, firebaseUser.uid), (snapshot) => {
        setPreference(snapshot.exists() ? snapshot.data() : null);
        setIsLoading(false);
      });
    });

    return () => unsubscribe?.();
  }, [boardId, workspaceId, firebaseUser]);

  return {
    preference,
    isLoading,
    viewDensity: preference?.viewDensity ?? DEFAULT_BOARD_PREFERENCE.viewDensity,
    cardSize: preference?.cardSize ?? null,
    collapsedColumnIds: preference?.collapsedColumnIds ?? [],
  };
}
