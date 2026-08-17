"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { taskActivityCol } from "@/lib/firebase/firestore";
import { TaskActivityEntry } from "@/types/task.types";

/** Realtime activity timeline for a task, newest first — backs both the Activity tab and Task History. */
export function useTaskActivity(taskId: string | undefined) {
  const [entries, setEntries] = useState<TaskActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!taskId) {
      setEntries([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(taskActivityCol(taskId), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEntries(snapshot.docs.map((d) => d.data()));
      setIsLoading(false);
    });
    return unsubscribe;
  }, [taskId]);

  return { entries, isLoading };
}
