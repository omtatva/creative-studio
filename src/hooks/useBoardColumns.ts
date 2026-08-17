"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { boardColumnsCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { BoardColumn } from "@/types/board.types";

/** Realtime, ordered columns for a board — non-archived only; hidden columns are still returned so the toolbar can offer "show hidden". */
export function useBoardColumns(boardId: string | undefined) {
  const { workspaceId } = useWorkspaceContext();
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!boardId || !workspaceId) {
      setColumns([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(
      boardColumnsCol(),
      where("workspaceId", "==", workspaceId),
      where("boardId", "==", boardId),
      orderBy("order", "asc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setColumns(snapshot.docs.map((d) => d.data()));
      setIsLoading(false);
    });
    return unsubscribe;
  }, [boardId, workspaceId]);

  return {
    columns: columns.filter((c) => !c.isArchived),
    archivedColumns: columns.filter((c) => c.isArchived),
    isLoading,
  };
}
