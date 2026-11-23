import * as fileService from "@/services/fileService";
import type { ProjectFile } from "@/types/file.types";
import type { TaskActor } from "@/types/task.types";
import { UploadMetricsRecorder, type UploadMetrics } from "@/lib/uploads/uploadMetrics";
import { matchesPersisted, fingerprintFile } from "@/lib/uploads/multipartEngine";
import { uploadPersistence } from "@/lib/uploads/uploadPersistence";

/**
 * The ONE place a file upload's lifecycle lives. It is a plain module-level store (not React state), so it survives every client-side
 * navigation: a page component can unmount and remount while the Firebase resumable task keeps running here, and any component can
 * re-attach to the same upload by reading this store (see UploadContext.tsx for the React bindings).
 *
 * Every upload remembers the workspaceId/projectId it was STARTED in and finalizes into exactly those — switching workspace
 * mid-upload never redirects it. It still goes through fileService.uploadProjectFile (same stage resolution, same /api/files/finalize
 * size + quota verification), so this adds no second upload path.
 */

export type UploadStatus = "queued" | "preparing" | "uploading" | "retrying" | "paused" | "finalizing" | "completed" | "failed" | "cancelled";

/** How the bytes travel: the classic Firebase resumable uploader, or direct-to-GCS multipart parts (feature flag NEXT_PUBLIC_MULTIPART_UPLOADS). */
export type UploadMethod = "resumable" | "multipart";

export interface UploadItem {
  uploadId: string;
  /** Who started it — the list is filtered to the signed-in user, and wiped when the account changes. */
  userId: string;
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  stageId: string | null;
  /** Set when this upload is a NEW VERSION of an existing asset (the doc id of the version it follows). */
  newVersionOfId: string | null;
  newVersionNumber: number | null;
  /** null only for an upload restored after a page refresh — the browser lost the File, so the user must pick it again (needsFile). */
  file: File | null;
  fileName: string;
  fileSize: number;
  contentType: string;
  method: UploadMethod;
  /** Multipart: the server-side upload session + part layout (identifiers only). */
  sessionId: string | null;
  totalParts: number | null;
  completedParts: number;
  activeParts: number;
  retries: number;
  partSizeBytes: number | null;
  needsFile: boolean;
  bytesTransferred: number;
  progress: number;
  speedBps: number | null;
  etaSeconds: number | null;
  status: UploadStatus;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
  /** The created file doc id, once the server finalized it. */
  fileId: string | null;
  /** What this upload really did (throughput, phases, stalls, main-thread blocking) — set when it completes. */
  metrics: UploadMetrics | null;
}

export interface EnqueueParams {
  userId: string;
  actor: TaskActor;
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  stageId?: string | null;
  newVersionOf?: ProjectFile | null;
  file: File;
  /** Called once, after the server finalized the file. May fire after the page that started it has unmounted — guard any navigation. */
  onSuccess?: (fileId: string) => void;
}

interface Job {
  actor: TaskActor;
  newVersionOf: ProjectFile | null;
  onSuccess?: (fileId: string) => void;
  cancel: (() => void) | null;
  controls: { pause: () => void; resume: () => void } | null;
  cancelRequested: boolean;
  recorder: UploadMetricsRecorder | null;
  /** Smoothing state for speed/ETA. */
  at: number;
  bytes: number;
  speed: number;
}

export type UploadEvent = { type: "completed" | "failed"; item: UploadItem };

/** Two at a time: a huge upload must not block a small one, but parallel uploads just split the same bandwidth. */
const MAX_CONCURRENT = 2;

let items: UploadItem[] = [];
/** useSyncExternalStore requires the SAME array every time for the server snapshot. */
const NO_UPLOADS: UploadItem[] = [];
const jobs = new Map<string, Job>();
const listeners = new Set<() => void>();
const eventListeners = new Set<(event: UploadEvent) => void>();
let offline = false;

function emit() {
  for (const l of listeners) l();
}

function patch(uploadId: string, changes: Partial<UploadItem>) {
  items = items.map((i) => (i.uploadId === uploadId ? { ...i, ...changes } : i));
  emit();
}

/** Anything in progress or about to be (a paused upload is neither — it holds no slot and doesn't block leaving the page). */
const isActive = (s: UploadStatus) => s === "queued" || s === "preparing" || s === "uploading" || s === "retrying" || s === "finalizing";
const isRunning = (s: UploadStatus) => s === "preparing" || s === "uploading" || s === "retrying" || s === "finalizing";

export const uploadStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => items,
  getServerSnapshot: () => NO_UPLOADS,
  onEvent(listener: (event: UploadEvent) => void) {
    eventListeners.add(listener);
    return () => {
      eventListeners.delete(listener);
    };
  },

  isOffline: () => offline,
  setOffline(value: boolean) {
    if (offline === value) return;
    offline = value;
    emit();
  },

  /** Starts (or queues) an upload. If this exact file is already uploading into this project/stage it returns that upload instead of starting a second one. */
  enqueue(params: EnqueueParams): string {
    const duplicate = items.find(
      (i) =>
        isActive(i.status) &&
        i.userId === params.userId &&
        i.workspaceId === params.workspaceId &&
        i.projectId === params.projectId &&
        i.stageId === (params.stageId ?? null) &&
        i.newVersionOfId === (params.newVersionOf?.id ?? null) &&
        i.fileName === params.file.name &&
        i.fileSize === params.file.size &&
        i.file?.lastModified === params.file.lastModified
    );
    if (duplicate) return duplicate.uploadId;

    const uploadId = crypto.randomUUID();
    const item: UploadItem = {
      uploadId,
      userId: params.userId,
      workspaceId: params.workspaceId,
      workspaceName: params.workspaceName,
      projectId: params.projectId,
      stageId: params.stageId ?? null,
      newVersionOfId: params.newVersionOf?.id ?? null,
      newVersionNumber: params.newVersionOf ? params.newVersionOf.versionNumber + 1 : null,
      file: params.file,
      fileName: params.file.name,
      fileSize: params.file.size,
      contentType: params.file.type || "application/octet-stream",
      method: fileService.isMultipartEnabled() ? "multipart" : "resumable",
      sessionId: null,
      totalParts: null,
      completedParts: 0,
      activeParts: 0,
      retries: 0,
      partSizeBytes: null,
      needsFile: false,
      bytesTransferred: 0,
      progress: 0,
      speedBps: null,
      etaSeconds: null,
      status: "queued",
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
      fileId: null,
      metrics: null,
    };
    jobs.set(uploadId, {
      actor: params.actor,
      newVersionOf: params.newVersionOf ?? null,
      onSuccess: params.onSuccess,
      cancel: null,
      controls: null,
      cancelRequested: false,
      recorder: null,
      at: 0,
      bytes: 0,
      speed: 0,
    });
    items = [...items, item];
    emit();
    pump();
    return uploadId;
  },

  /** Cancels a queued, preparing, uploading, retrying or paused file (the server releases its storage reservation). A file that is already finalizing can't be cancelled — the server is writing its record. */
  cancel(uploadId: string) {
    const item = items.find((i) => i.uploadId === uploadId);
    const job = jobs.get(uploadId);
    if (!item) return;
    if (item.needsFile && item.sessionId) {
      const sessionIdToAbort = item.sessionId;
      // Restored after a refresh, no live engine: tell the server to abort the session and drop the saved record.
      void import("@/lib/uploads/multipartTransport").then((m) => m.abortUploadSession(sessionIdToAbort)).catch(() => undefined);
      void uploadPersistence.remove(item.sessionId);
      patch(uploadId, { status: "cancelled", needsFile: false, finishedAt: Date.now() });
      return;
    }
    if (!job) return;
    if (item.status === "queued") {
      patch(uploadId, { status: "cancelled", finishedAt: Date.now() });
    } else if (item.status === "uploading" || item.status === "preparing" || item.status === "retrying" || item.status === "paused") {
      job.cancelRequested = true;
      job.cancel?.();
    }
  },

  /** Multipart only: stops sending; finished parts are kept, nothing is lost. */
  pause(uploadId: string) {
    const item = items.find((i) => i.uploadId === uploadId);
    const job = jobs.get(uploadId);
    if (!item || !job || item.method !== "multipart" || !job.controls) return;
    if (item.status !== "uploading" && item.status !== "retrying" && item.status !== "preparing") return;
    job.controls.pause();
    patch(uploadId, { status: "paused", speedBps: null, etaSeconds: null, activeParts: 0 });
    pump(); // a paused upload frees its slot
  },

  /** Continues a paused upload; only the parts the server doesn't hold are sent. */
  resume(uploadId: string) {
    const item = items.find((i) => i.uploadId === uploadId);
    const job = jobs.get(uploadId);
    if (!item || !job?.controls || item.status !== "paused") return;
    patch(uploadId, { status: "uploading" });
    job.controls.resume();
  },

  /**
   * After a refresh the browser no longer has the File. Unfinished multipart uploads are restored from IndexedDB (identifiers only) as "paused — select the file";
   * the user picks the file again, it is checked against the stored identity, and the upload continues with only the missing parts.
   */
  async restorePersisted(userId: string): Promise<void> {
    if (typeof window === "undefined") return;
    const stored = await uploadPersistence.listFor(userId);
    for (const r of stored) {
      if (items.some((i) => i.sessionId === r.sessionId)) continue;
      const uploadId = crypto.randomUUID();
      const bytes = Math.min(r.sizeBytes, r.completedParts.length * r.partSizeBytes);
      items = [
        ...items,
        {
          uploadId, userId, workspaceId: r.workspaceId, workspaceName: r.workspaceName, projectId: r.projectId, stageId: r.stageId, newVersionOfId: r.newVersionOfId, newVersionNumber: null,
          file: null, fileName: r.fileName, fileSize: r.sizeBytes, contentType: r.contentType, method: "multipart", sessionId: r.sessionId, totalParts: r.totalParts,
          completedParts: r.completedParts.length, activeParts: 0, retries: 0, partSizeBytes: r.partSizeBytes, needsFile: true, bytesTransferred: bytes,
          progress: r.sizeBytes > 0 ? Math.round((bytes / r.sizeBytes) * 100) : 0, speedBps: null, etaSeconds: null, status: "paused",
          error: "This upload was interrupted. Select the same file again to continue.", startedAt: r.createdAt, finishedAt: null, fileId: r.fileId, metrics: null,
        },
      ];
    }
    emit();
  },

  /** Re-attaches a File to a restored upload. Refuses a different file (name/size/modified date + hashes of its first and last MiB must match). */
  async resumeWithFile(uploadId: string, file: File, actor: TaskActor): Promise<{ ok: boolean; message?: string }> {
    const item = items.find((i) => i.uploadId === uploadId);
    if (!item || !item.needsFile || !item.sessionId) return { ok: false, message: "This upload can't be resumed." };
    const rec = (await uploadPersistence.listFor(item.userId)).find((r) => r.sessionId === item.sessionId);
    if (!rec) return { ok: false, message: "This upload expired. Start it again." };
    const hashes = await fingerprintFile(file, (d) => crypto.subtle.digest("SHA-256", d));
    if (!matchesPersisted(file, hashes, rec)) return { ok: false, message: "That isn't the same file that was being uploaded." };
    jobs.set(uploadId, { actor, newVersionOf: null, cancel: null, controls: null, cancelRequested: false, recorder: null, at: 0, bytes: 0, speed: 0 });
    patch(uploadId, { file, needsFile: false, status: "queued", error: null });
    pump();
    return { ok: true };
  },

  /** Restarts a failed/cancelled upload from the file the user already picked (a new resumable session — Firebase can't re-attach to the old one). */
  retry(uploadId: string) {
    const item = items.find((i) => i.uploadId === uploadId);
    const job = jobs.get(uploadId);
    if (!item || !job || !item.file || (item.status !== "failed" && item.status !== "cancelled")) return;
    job.cancel = null;
    job.controls = null;
    job.cancelRequested = false;
    job.at = 0;
    job.bytes = 0;
    job.speed = 0;
    patch(uploadId, {
      status: "queued",
      error: null,
      bytesTransferred: 0,
      progress: 0,
      speedBps: null,
      etaSeconds: null,
      startedAt: Date.now(),
      finishedAt: null,
    });
    pump();
  },

  /** Removes a finished (completed/failed/cancelled) row from the list. */
  dismiss(uploadId: string) {
    const item = items.find((i) => i.uploadId === uploadId);
    if (!item || isActive(item.status)) return;
    releaseServerSession(item);
    jobs.delete(uploadId);
    items = items.filter((i) => i.uploadId !== uploadId);
    emit();
  },

  clearFinished() {
    const keep = items.filter((i) => isActive(i.status));
    for (const i of items) if (!isActive(i.status)) { releaseServerSession(i); jobs.delete(i.uploadId); }
    items = keep;
    emit();
  },

  /** Signed-in account changed (or signed out): cancel anything that belongs to someone else and forget it. */
  resetForUser(userId: string | null) {
    const foreign = items.filter((i) => i.userId !== userId);
    if (foreign.length === 0) return;
    for (const i of foreign) {
      const job = jobs.get(i.uploadId);
      if (job && (i.status === "uploading" || i.status === "preparing" || i.status === "retrying" || i.status === "paused")) {
        job.cancelRequested = true;
        job.cancel?.();
      }
      jobs.delete(i.uploadId);
    }
    items = items.filter((i) => i.userId === userId);
    emit();
  },

  activeCount: () => items.filter((i) => isActive(i.status)).length,
};

/** A FAILED multipart upload that is dismissed will never be retried: release its storage reservation now instead of letting it sit until the session expires. */
function releaseServerSession(item: UploadItem) {
  if (item.method !== "multipart" || !item.sessionId || item.status !== "failed") return;
  const id = item.sessionId;
  void import("@/lib/uploads/multipartTransport").then((m) => m.abortUploadSession(id)).catch(() => undefined);
  void uploadPersistence.remove(id);
}

function pump() {
  let running = items.filter((i) => isRunning(i.status)).length;
  for (const item of items) {
    if (running >= MAX_CONCURRENT) break;
    if (item.status === "queued") {
      running++;
      void run(item.uploadId);
    }
  }
}

async function run(uploadId: string) {
  const job = jobs.get(uploadId);
  const item = items.find((i) => i.uploadId === uploadId);
  if (!job || !item) return;

  const file = item.file;
  if (!file) return; // a restored upload waits for the user to pick the file again
  patch(uploadId, { status: item.method === "multipart" ? "preparing" : "uploading", startedAt: Date.now() });
  job.recorder?.dispose();
  const recorder = typeof window !== "undefined" ? new UploadMetricsRecorder(uploadId, item.fileName, item.fileSize) : null;
  job.recorder = recorder;
  let metrics: UploadMetrics | null = null;

  try {
    const fileId = await fileService.uploadProjectFile(item.workspaceId, item.projectId, file, job.actor, {
      stageId: item.stageId,
      newVersionOf: job.newVersionOf ?? undefined,
      persistFor: { userId: item.userId, workspaceName: item.workspaceName },
      onControlsReady: (controls) => {
        job.controls = controls;
      },
      onSession: (s) => patch(uploadId, { sessionId: s.sessionId, totalParts: s.totalParts, partSizeBytes: s.partSizeBytes }),
      onEngine: (s) => {
        const current = items.find((i) => i.uploadId === uploadId)?.status;
        if (current === "paused" || current === "finalizing" || current === "cancelled") {
          patch(uploadId, { completedParts: s.completedParts, activeParts: s.activeParts, retries: s.retries });
          return;
        }
        patch(uploadId, {
          completedParts: s.completedParts, activeParts: s.activeParts, retries: s.retries,
          status: s.status === "retrying" ? "retrying" : s.status === "preparing" ? "preparing" : "uploading",
        });
      },
      onCancelReady: (cancel) => {
        job.cancel = cancel;
        if (job.cancelRequested) cancel();
      },
      onTimings: (timings, multipart) => {
        metrics = recorder?.finish(timings, multipart) ?? null;
      },
      onPhase: (phase) => {
        if (phase === "finalizing") recorder?.markUploadDone();
        if (phase === "finalizing") patch(uploadId, { status: "finalizing", progress: 100, bytesTransferred: item.fileSize, speedBps: null, etaSeconds: null });
      },
      onProgress: (percent, transferred, total) => {
        if (transferred !== undefined) recorder?.onProgress(transferred);
        // Smoothed speed + ETA from real bytes (exponential average, so one slow tick doesn't make the estimate jump).
        const now = Date.now();
        let speed = job.speed;
        if (job.at && transferred !== undefined && now > job.at) {
          const inst = ((transferred - job.bytes) * 1000) / (now - job.at);
          if (inst >= 0) speed = job.speed ? job.speed * 0.8 + inst * 0.2 : inst;
        }
        if (transferred !== undefined) {
          job.at = now;
          job.bytes = transferred;
          job.speed = speed;
        }
        patch(uploadId, {
          progress: percent,
          bytesTransferred: transferred ?? 0,
          speedBps: speed || null,
          etaSeconds: speed > 0 && total && transferred !== undefined ? (total - transferred) / speed : null,
        });
      },
    });

    patch(uploadId, { status: "completed", progress: 100, bytesTransferred: item.fileSize, speedBps: null, etaSeconds: null, fileId, finishedAt: Date.now(), metrics });
    const done = items.find((i) => i.uploadId === uploadId);
    if (done) for (const l of eventListeners) l({ type: "completed", item: done });
    try {
      job.onSuccess?.(fileId);
    } catch {
      // A caller's follow-up (e.g. navigation) must never turn a finished upload into a failed one.
    }
  } catch (err) {
    recorder?.dispose();
    const cancelled = job.cancelRequested || (err as { code?: string } | null)?.code === "storage/canceled";
    patch(uploadId, {
      status: cancelled ? "cancelled" : "failed",
      error: cancelled ? null : err instanceof Error ? err.message : "Upload failed",
      speedBps: null,
      etaSeconds: null,
      finishedAt: Date.now(),
    });
    const done = items.find((i) => i.uploadId === uploadId);
    if (done && !cancelled) for (const l of eventListeners) l({ type: "failed", item: done });
  } finally {
    job.cancel = null;
    pump();
  }
}
