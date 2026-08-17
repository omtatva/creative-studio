"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { taskCommentsCol } from "@/lib/firebase/firestore";
import { TaskComment } from "@/types/task.types";

/** Realtime comments for a task, oldest first (natural reading order for a thread). */
export function useComments(taskId: string | undefined) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!taskId) {
      setComments([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(taskCommentsCol(taskId), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setComments(snapshot.docs.map((d) => d.data()));
      setIsLoading(false);
    });
    return unsubscribe;
  }, [taskId]);

  return { comments, isLoading };
}
