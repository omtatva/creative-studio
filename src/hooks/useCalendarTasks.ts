"use client";

import { useEffect, useState } from "react";
import { onSnapshot, query, where } from "firebase/firestore";
import { tasksCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { Task } from "@/types/task.types";

/** Every non-archived, dated task across the workspace (not just one project) — the Calendar module's data source, reusing the same `tasks` collection as Tasks/Board. */
export function useCalendarTasks() {
  const { workspaceId } = useWorkspaceContext();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setTasks([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(tasksCol(), where("workspaceId", "==", workspaceId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTasks(snapshot.docs.map((d) => d.data()).filter((t) => !t.isArchived && t.dueDate));
      setIsLoading(false);
    });
    return unsubscribe;
  }, [workspaceId]);

  return { tasks, isLoading };
}
