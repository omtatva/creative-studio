"use client";

import { useState } from "react";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import * as fileService from "@/services/fileService";
import * as fileCommentService from "@/services/fileCommentService";
import * as fileAnnotationService from "@/services/fileAnnotationService";
import { AnnotationData, AnnotationType } from "@/types/file.types";
import { TaskActor } from "@/types/task.types";

export function useFileActions() {
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

  async function upload(projectId: string, file: File) {
    if (!workspaceId) return null;
    return run(() => fileService.uploadProjectFile(workspaceId, projectId, file, currentActor()));
  }

  // Uploads with progress (new files AND new versions) live in the app-level upload manager — see contexts/UploadContext.tsx — so they
  // survive navigation and always finalize into the workspace/project they were started in, not whichever workspace is selected later.

  async function remove(fileId: string) {
    if (!workspaceId) return null;
    return run(() => fileService.deleteProjectFile(workspaceId, fileId));
  }

  async function archive(fileId: string) {
    if (!workspaceId) return null;
    return run(() => fileService.archiveProjectFile(workspaceId, fileId, currentActor()));
  }

  async function assignToStage(fileId: string, stageId: string | null) {
    if (!workspaceId) return;
    await run(() => fileService.assignFileToStage(workspaceId, fileId, stageId));
  }

  async function setStatus(fileId: string, statusId: string, previousLabel: string, nextLabel: string) {
    if (!workspaceId) return;
    await run(() => fileService.setFileStatusId(workspaceId, fileId, statusId, previousLabel, nextLabel, currentActor()));
  }

  async function logDownload(fileId: string, fileName: string) {
    if (!workspaceId) return;
    // Fire-and-forget — a download shouldn't block on activity logging or surface a loading state.
    fileService.logFileDownload(workspaceId, fileId, fileName, currentActor()).catch((err) => console.error("[useFileActions] logFileDownload failed:", err));
  }

  interface AddCommentOptions {
    timestampSeconds?: number | null;
    positionX?: number | null;
    positionY?: number | null;
    pageNumber?: number | null;
  }

  async function addComment(
    projectId: string,
    fileId: string,
    version: number,
    body: string,
    parentCommentId: string | null = null,
    options?: AddCommentOptions
  ) {
    if (!workspaceId) return null;
    return run(() =>
      fileCommentService.addAssetComment({
        workspaceId,
        projectId,
        fileId,
        version,
        author: currentActor(),
        body,
        parentCommentId,
        ...options,
      })
    );
  }

  async function resolveComment(fileId: string, commentId: string, isResolved = true) {
    if (!workspaceId) return;
    await run(() => fileCommentService.resolveAssetComment(workspaceId, fileId, commentId, currentActor(), isResolved));
  }

  async function editComment(fileId: string, commentId: string, body: string) {
    await run(() => fileCommentService.editAssetComment(fileId, commentId, body));
  }

  async function deleteComment(fileId: string, commentId: string) {
    await run(() => fileCommentService.deleteAssetComment(fileId, commentId));
  }

  async function addAnnotation(
    projectId: string,
    fileId: string,
    version: number,
    type: AnnotationType,
    data: AnnotationData,
    color: string,
    options?: { timestampSeconds?: number | null; pageNumber?: number | null }
  ) {
    if (!workspaceId) return null;
    return run(() =>
      fileAnnotationService.addAnnotation({
        workspaceId,
        projectId,
        fileId,
        version,
        author: currentActor(),
        type,
        data,
        color,
        ...options,
      })
    );
  }

  async function deleteAnnotation(fileId: string, annotationId: string) {
    await run(() => fileAnnotationService.deleteAnnotation(fileId, annotationId));
  }

  return {
    isSubmitting,
    error,
    upload,
    remove,
    archive,
    assignToStage,
    setStatus,
    logDownload,
    addComment,
    resolveComment,
    editComment,
    deleteComment,
    addAnnotation,
    deleteAnnotation,
    currentActor,
  };
}
