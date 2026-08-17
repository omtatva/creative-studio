"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { reviewsCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { Review } from "@/types/review.types";

/** Realtime reviews list — workspace-wide when `projectId` is omitted, project-scoped when provided. */
export function useReviews(projectId?: string) {
  const { workspaceId } = useWorkspaceContext();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setReviews([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const clauses = [where("workspaceId", "==", workspaceId)];
    if (projectId) clauses.push(where("projectId", "==", projectId));
    const q = query(reviewsCol(), ...clauses, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReviews(snapshot.docs.map((d) => d.data()));
      setIsLoading(false);
    });
    return unsubscribe;
  }, [workspaceId, projectId]);

  return { reviews, isLoading };
}
