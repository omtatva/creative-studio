"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { boardActivityCol } from "@/lib/firebase/firestore";
import { BoardActivityEntry } from "@/types/board.types";

/** Realtime board-level activity feed (column changes + task moves), newest first. */
export function useBoardActivity(boardId: string | undefined) {
  const [entries, setEntries] = useState<BoardActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!boardId) {
      setEntries([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(boardActivityCol(boardId), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEntries(snapshot.docs.map((d) => d.data()));
      setIsLoading(false);
    });
    return unsubscribe;
  }, [boardId]);

  return { entries, isLoading };
}
