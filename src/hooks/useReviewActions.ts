"use client";

import { useState } from "react";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import * as reviewService from "@/services/reviewService";
import { TaskActor } from "@/types/task.types";

export function useReviewActions() {
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

  async function create(projectId: string, title: string, fileIds: string[]) {
    if (!workspaceId) return null;
    return run(() => reviewService.createReview(workspaceId, projectId, title, fileIds, currentActor()));
  }

  async function approve(reviewId: string, note: string | null = null) {
    if (!workspaceId) return;
    await run(() => reviewService.decideReview(workspaceId, reviewId, "approved", note, currentActor()));
  }

  async function requestChanges(reviewId: string, note: string | null) {
    if (!workspaceId) return;
    await run(() => reviewService.decideReview(workspaceId, reviewId, "changes_requested", note, currentActor()));
  }

  return { isSubmitting, error, create, approve, requestChanges };
}
