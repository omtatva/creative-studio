"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { fileAnnotationsCol } from "@/lib/firebase/firestore";
import { AssetAnnotation } from "@/types/file.types";

/** Realtime annotations for a creative asset — mirrors useFileComments. */
export function useFileAnnotations(fileId: string | undefined) {
  const [annotations, setAnnotations] = useState<AssetAnnotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!fileId) {
      setAnnotations([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(fileAnnotationsCol(fileId), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAnnotations(snapshot.docs.map((d) => d.data()));
      setIsLoading(false);
    });
    return unsubscribe;
  }, [fileId]);

  return { annotations, isLoading };
}
