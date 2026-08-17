"use client";

import { useState } from "react";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import * as stageService from "@/services/stageService";
import { CreateStagePayload } from "@/types/stage.types";
import { TaskActor } from "@/types/task.types";

export function useStageActions() {
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser, profile } = useAuthContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function currentActor(): TaskActor {
    return {
      uid: firebaseUser?.uid ?? "",
      displayName: profile?.displayName ?? firebaseUser?.displayName ?? "Unknown",
      photoURL: profile?.photoURL ?? firebaseUser?.photoURL ?? null,
      email: profile?.email ?? firebaseUser?.email ?? "",
    };
  }

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setIsSubmitting(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function create(projectId: string, payload: CreateStagePayload) {
    if (!workspaceId) return null;
    return run(() => stageService.createStage(workspaceId, projectId, payload, currentActor()));
  }

  async function archive(stageId: string) {
    if (!workspaceId) return;
    await run(() => stageService.archiveStage(workspaceId, stageId, currentActor()));
  }

  async function rename(stageId: string, name: string) {
    if (!workspaceId) return;
    await run(() => stageService.renameStage(workspaceId, stageId, name, currentActor()));
  }

  async function removeFile(stageId: string, fileId: string) {
    await run(() => stageService.removeFileFromStage(stageId, fileId));
  }

  return { isSubmitting, error, create, archive, rename, removeFile };
}
