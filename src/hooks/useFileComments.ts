"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { fileCommentsCol } from "@/lib/firebase/firestore";
import { AssetComment } from "@/types/file.types";

/** Realtime comments for a creative asset, oldest first — mirrors useComments (task comments). */
export function useFileComments(fileId: string | undefined) {
  const [comments, setComments] = useState<AssetComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!fileId) {
      setComments([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(fileCommentsCol(fileId), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setComments(snapshot.docs.map((d) => d.data()));
      setIsLoading(false);
    });
    return unsubscribe;
  }, [fileId]);

  return { comments, isLoading };
}
