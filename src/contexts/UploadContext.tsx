"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useToastStore } from "@/store/useToastStore";
import { uploadStore, type EnqueueParams, type UploadItem } from "@/lib/uploads/uploadStore";
import type { ProjectFile } from "@/types/file.types";

export const UPLOADS_IN_PROGRESS_WARNING = "Uploads are still in progress. Leaving or refreshing this page may interrupt them.";

export interface StartUploadParams {
  /** The workspace/project the file belongs to — taken from the project/asset being worked on, NEVER from whichever workspace is selected later. */
  workspaceId: string;
  projectId: string;
  stageId?: string | null;
  newVersionOf?: ProjectFile | null;
  file: File;
  onSuccess?: (fileId: string) => void;
}

interface UploadContextValue {
  /** The signed-in user's uploads (all workspaces), oldest first. */
  uploads: UploadItem[];
  activeCount: number;
  isOffline: boolean;
  start: (params: StartUploadParams) => string | null;
  cancel: (uploadId: string) => void;
  retry: (uploadId: string) => void;
  /** Multipart uploads: stop sending (finished parts are kept) / continue with only the missing parts. */
  pause: (uploadId: string) => void;
  resume: (uploadId: string) => void;
  /** After a refresh the browser lost the File: re-attach it (checked against the stored identity). Returns a user-facing message on refusal. */
  resumeWithFile: (uploadId: string, file: File) => Promise<void>;
  dismiss: (uploadId: string) => void;
  clearFinished: () => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

const isActive = (i: UploadItem) => i.status === "queued" || i.status === "preparing" || i.status === "uploading" || i.status === "retrying" || i.status === "finalizing";

/**
 * Mounted once in the root layout (above every route), so upload state outlives any page. It binds the module-level uploadStore to React,
 * warns before a real page unload while uploads are active (client-side navigation never fires beforeunload, so moving between
 * Dashboard / Settings / Profile / projects doesn't trigger it), reports connection loss, toasts failures, and drops another account's uploads on sign-out.
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const { firebaseUser, profile } = useAuthContext();
  const { workspaces } = useWorkspaceContext();
  const push = useToastStore((s) => s.push);
  const userId = firebaseUser?.uid ?? null;

  const all = useSyncExternalStore(uploadStore.subscribe, uploadStore.getSnapshot, uploadStore.getServerSnapshot);
  const isOffline = useSyncExternalStore(uploadStore.subscribe, uploadStore.isOffline, () => false);
  const uploads = useMemo(() => all.filter((i) => i.userId === userId), [all, userId]);
  const activeCount = useMemo(() => uploads.filter(isActive).length, [uploads]);

  useEffect(() => {
    uploadStore.resetForUser(userId);
    // Unfinished multipart uploads from before a refresh come back as "select the file to continue" (identifiers only; no File, no tokens, no URLs).
    if (userId) void uploadStore.restorePersisted(userId);
  }, [userId]);

  useEffect(() => {
    if (activeCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = UPLOADS_IN_PROGRESS_WARNING;
      return UPLOADS_IN_PROGRESS_WARNING;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [activeCount]);

  useEffect(() => {
    uploadStore.setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    const off = () => uploadStore.setOffline(true);
    const on = () => uploadStore.setOffline(false);
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
    };
  }, []);

  useEffect(
    () =>
      uploadStore.onEvent((event) => {
        const onProjectPage = typeof window !== "undefined" && window.location.pathname.startsWith(`/projects/${event.item.projectId}`);
        if (event.type === "failed") push("error", `"${event.item.fileName}" failed to upload${event.item.error ? `: ${event.item.error}` : "."}`);
        else if (!onProjectPage) push("success", `"${event.item.fileName}" finished uploading`);
      }),
    [push]
  );

  const start = useCallback(
    (params: StartUploadParams) => {
      if (!userId || !firebaseUser) return null;
      const params2: EnqueueParams = {
        userId,
        actor: {
          uid: userId,
          displayName: profile?.displayName ?? firebaseUser.displayName ?? "Unknown",
          photoURL: profile?.photoURL ?? firebaseUser.photoURL ?? null,
          email: profile?.email ?? firebaseUser.email ?? "",
        },
        workspaceId: params.workspaceId,
        workspaceName: workspaces.find((w) => w.id === params.workspaceId)?.name ?? "Workspace",
        projectId: params.projectId,
        stageId: params.stageId,
        newVersionOf: params.newVersionOf,
        file: params.file,
        onSuccess: params.onSuccess,
      };
      return uploadStore.enqueue(params2);
    },
    [userId, firebaseUser, profile, workspaces]
  );

  const value = useMemo<UploadContextValue>(
    () => ({
      uploads,
      activeCount,
      isOffline,
      start,
      cancel: uploadStore.cancel,
      retry: uploadStore.retry,
      pause: uploadStore.pause,
      resume: uploadStore.resume,
      resumeWithFile: async (uploadId: string, file: File) => {
        if (!userId || !firebaseUser) return;
        const actor = {
          uid: userId,
          displayName: profile?.displayName ?? firebaseUser.displayName ?? "Unknown",
          photoURL: profile?.photoURL ?? firebaseUser.photoURL ?? null,
          email: profile?.email ?? firebaseUser.email ?? "",
        };
        const result = await uploadStore.resumeWithFile(uploadId, file, actor);
        if (!result.ok) push("error", result.message ?? "Couldn't resume this upload.");
      },
      dismiss: uploadStore.dismiss,
      clearFinished: uploadStore.clearFinished,
    }),
    [uploads, activeCount, isOffline, start, userId, firebaseUser, profile, push]
  );

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUploads(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUploads must be used inside <UploadProvider>.");
  return ctx;
}

/** Just the uploads that belong to one project — what a project page shows when you come back to it. */
export function useProjectUploads(workspaceId: string | null | undefined, projectId: string): UploadItem[] {
  const { uploads } = useUploads();
  return useMemo(() => uploads.filter((u) => u.projectId === projectId && (!workspaceId || u.workspaceId === workspaceId)), [uploads, projectId, workspaceId]);
}
