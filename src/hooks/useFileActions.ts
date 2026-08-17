"use client";

import { useState } from "react";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import * as fileService from "@/services/fileService";
import * as fileCommentService from "@/services/fileCommentService";
import * as fileAnnotationService from "@/services/fileAnnotationService";
import { AnnotationData, AnnotationType, ProjectFile } from "@/types/file.types";
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

  /** Uploads a file with live progress — does not toggle the shared `isSubmitting` flag, since callers track per-file progress themselves (see CreativeUploadZone). */
  async function uploadWithProgress(
    projectId: string,
    file: File,
    onProgress: (percent: number) => void,
    opts?: { stageId?: string | null }
  ) {
    if (!workspaceId) return null;
    return fileService.uploadProjectFile(workspaceId, projectId, file, currentActor(), { onProgress, stageId: opts?.stageId ?? null });
  }

  /** Uploads a new version of an existing asset — see ProjectFile's doc comment in file.types.ts for the version-chain model. */
  async function uploadNewVersion(
    projectId: string,
    existingAsset: ProjectFile,
    file: File,
    onProgress?: (percent: number) => void
  ) {
    if (!workspaceId) return null;
    return fileService.uploadProjectFile(workspaceId, projectId, file, currentActor(), { newVersionOf: existingAsset, onProgress });
  }

  async function remove(fileId: string) {
    if (!workspaceId) return null;
    return run(() => fileService.deleteProjectFile(workspaceId, fileId, currentActor()));
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
    uploadWithProgress,
    uploadNewVersion,
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
