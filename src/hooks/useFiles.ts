"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { filesCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAccessibleProjectIds } from "@/hooks/useAccessibleProjectIds";
import { toDateSafe } from "@/lib/utils/date";
import { ProjectFile } from "@/types/file.types";

const ID_QUERY_CHUNK_SIZE = 30;

/**
 * Realtime files list — workspace-wide when `projectId` is omitted,
 * project-scoped when provided. The workspace-wide case is scoped to
 * the caller's accessible projects (see useAccessibleProjectIds.ts)
 * for a regular project member — same reasoning as useTasks.ts.
 */
export function useFiles(projectId?: string) {
  const { workspaceId } = useWorkspaceContext();
  const { projectIds: accessibleProjectIds, isLoading: isLoadingAccess } = useAccessibleProjectIds();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setFiles([]);
      setIsLoading(false);
      return;
    }

    if (projectId) {
      setIsLoading(true);
      const q = query(filesCol(), where("workspaceId", "==", workspaceId), where("projectId", "==", projectId), orderBy("createdAt", "desc"));
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
    }

    if (isLoadingAccess) return;

    if (accessibleProjectIds === null) {
      setIsLoading(true);
      const q = query(filesCol(), where("workspaceId", "==", workspaceId), orderBy("createdAt", "desc"));
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
    }

    if (accessibleProjectIds.length === 0) {
      setFiles([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    const chunks: string[][] = [];
    for (let i = 0; i < accessibleProjectIds.length; i += ID_QUERY_CHUNK_SIZE) {
      chunks.push(accessibleProjectIds.slice(i, i + ID_QUERY_CHUNK_SIZE));
    }

    const resultsByChunk = new Map<number, ProjectFile[]>();
    const unsubscribers = chunks.map((chunk, index) =>
      onSnapshot(
        query(filesCol(), where("workspaceId", "==", workspaceId), where("projectId", "in", chunk), orderBy("createdAt", "desc")),
        (snapshot) => {
          resultsByChunk.set(index, snapshot.docs.map((d) => d.data()));
          const merged = Array.from(resultsByChunk.values()).flat();
          merged.sort((a, b) => toDateSafe(b.createdAt).getTime() - toDateSafe(a.createdAt).getTime());
          setFiles(merged);
          setIsLoading(false);
          setError(null);
        },
        (err) => {
          setError(err.message);
          setIsLoading(false);
        }
      )
    );
    return () => unsubscribers.forEach((u) => u());
  }, [workspaceId, projectId, accessibleProjectIds, isLoadingAccess]);

  return { files, isLoading, error };
}
