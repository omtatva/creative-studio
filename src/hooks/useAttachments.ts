"use client";

import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { taskAttachmentsCol } from "@/lib/firebase/firestore";
import { TaskAttachment } from "@/types/task.types";

/** Realtime attachments (each with its own version history) for a task. */
export function useAttachments(taskId: string | undefined) {
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!taskId) {
      setAttachments([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const unsubscribe = onSnapshot(taskAttachmentsCol(taskId), (snapshot) => {
      setAttachments(snapshot.docs.map((d) => d.data()));
      setIsLoading(false);
    });
    return unsubscribe;
  }, [taskId]);

  return { attachments, isLoading };
}
