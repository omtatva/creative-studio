"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { filesCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { ProjectFile } from "@/types/file.types";

/** Realtime files list — workspace-wide when `projectId` is omitted, project-scoped when provided. Same optional-scope pattern as useTasks. */
export function useFiles(projectId?: string) {
  const { workspaceId } = useWorkspaceContext();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setFiles([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const clauses = [where("workspaceId", "==", workspaceId)];
    if (projectId) clauses.push(where("projectId", "==", projectId));
    const q = query(filesCol(), ...clauses, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setFiles(snapshot.docs.map((d) => d.data()));
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setIsLoading(false);
      }
    );
    return unsubscribe;
  }, [workspaceId, projectId]);

  return { files, isLoading, error };
}
