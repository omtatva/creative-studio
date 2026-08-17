"use client";

import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { taskDoc } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { Task } from "@/types/task.types";

/** Realtime single-task subscription, re-validates workspaceId on every snapshot — mirrors useProject. */
export function useTask(taskId: string | undefined) {
  const { workspaceId } = useWorkspaceContext();
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId || !workspaceId) {
      setTask(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const unsubscribe = onSnapshot(
      taskDoc(taskId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setTask(null);
        } else {
          const data = snapshot.data();
          setTask(data.workspaceId === workspaceId ? data : null);
        }
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setIsLoading(false);
      }
    );
    return unsubscribe;
  }, [taskId, workspaceId]);

  return { task, isLoading, error };
}
