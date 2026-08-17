"use client";

import { useEffect, useState } from "react";
import { onSnapshot, query, where } from "firebase/firestore";
import { tasksCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { Task } from "@/types/task.types";

/** Realtime children of a task (Task.parentTaskId == parentTaskId) — unlimited depth since subtasks are plain tasks. */
export function useSubtasks(parentTaskId: string | undefined) {
  const { workspaceId } = useWorkspaceContext();
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!parentTaskId || !workspaceId) {
      setSubtasks([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(tasksCol(), where("workspaceId", "==", workspaceId), where("parentTaskId", "==", parentTaskId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSubtasks(snapshot.docs.map((d) => d.data()));
      setIsLoading(false);
    });
    return unsubscribe;
  }, [parentTaskId, workspaceId]);

  return { subtasks, isLoading };
}
