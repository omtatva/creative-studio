import { deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { filesCol, fileDoc, fileShareDoc } from "@/lib/firebase/firestore";
import {
  projectAssetRef,
  projectAssetThumbRef,
  uploadFile as uploadToStorage,
  uploadFileWithProgress,
} from "@/lib/firebase/storage";
import { getCurrentUser } from "@/lib/firebase/auth";
import { logActivity } from "@/services/activityService";
import { addFileToStage, getOrCreateDefaultStage } from "@/services/stageService";
import { assetTypeFromContentType } from "@/lib/constants/creativeFiles";
import { captureImageThumbnail, captureVideoThumbnail, readMediaDuration } from "@/lib/utils/videoThumbnail";
import { AssetStatus, FileShareSettings, ProjectFile } from "@/types/file.types";
import { TaskActor } from "@/types/task.types";
import { MultipartUpload, Cancelled, Paused, fingerprintFile, type EngineSnapshot, type PersistedUpload, type SessionInfo } from "@/lib/uploads/multipartEngine";
import { createBrowserApi, waitOnline } from "@/lib/uploads/multipartTransport";
import { persistenceFor } from "@/lib/uploads/uploadPersistence";

/**
 * SECURITY (audit Priority 4): a completed Storage upload no longer
 * automatically becomes a counted, usable file — see
 * /api/files/finalize's doc comment. This is the one call every
 * upload path routes through afterward; it independently re-verifies
 * the object's real size and the workspace's live storage quota
 * server-side before the Firestore record is created.
 */
async function finalizeUpload(body: Record<string, unknown>): Promise<{ fileId: string; sizeBytes: number }> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch("/api/files/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error ?? "Couldn't save this upload.");
  }
  return data;
}

/**
 * Project-level file storage — the "Files" module, shared unchanged
 * by the Creative Workspace (see types/file.types.ts's doc comment on
 * `ProjectFile` for the versioning model). Every function is
 * workspace-scoped like the rest of the app; files additionally carry
 * a `projectId` so both the project's own Files tab and the
 * workspace-wide /files page can query the same collection with
 * different filters. Uploads and deletes are logged to the shared
 * workspace activity_logs feed (see activityService.ts) so they show
 * up on /activity and the dashboard's Recent Activity card.
 */

interface UploadOptions {
  /** Omit (or pass null) to fall back to the project's existing/default stage — uploadProjectFile never leaves stageId unset, see below. */
  stageId?: string | null;
  /** Set to version an EXISTING asset instead of creating a new one — the id of its current latest-version doc. */
  newVersionOf?: ProjectFile;
  onProgress?: (percent: number, bytesTransferred?: number, totalBytes?: number) => void;
  /** Receives the cancel function of the resumable upload as soon as it exists (used by the app-level upload manager). */
  onCancelReady?: (cancel: () => void) => void;
  /** Called with "finalizing" once every byte is uploaded and the server-side record is being written. */
  onPhase?: (phase: "finalizing") => void;
  /** Real elapsed time of each phase, reported once everything succeeded — see lib/uploads/uploadMetrics.ts. */
  onTimings?: (timings: { uploadMs: number; thumbnailMs: number; metadataMs: number; finalizeMs: number; postMs: number }, multipart?: MultipartRunStats) => void;
  /** Multipart uploads only: pause/resume controls, as soon as the engine exists. */
  onControlsReady?: (controls: { pause: () => void; resume: () => void }) => void;
  /** Multipart uploads only: live engine state (parts, retries, active parts, status). */
  onEngine?: (snapshot: EngineSnapshot) => void;
  /** Multipart uploads only: what the server decided at init. */
  onSession?: (session: SessionInfo) => void;
  /** Multipart uploads only: who owns the upload, so unfinished sessions can be restored after a refresh. */
  persistFor?: { userId: string; workspaceName: string };
}

/** What a multipart upload measured about itself (feeds lib/uploads/uploadMetrics.ts). */
export interface MultipartRunStats {
  parts: number;
  concurrency: number;
  partSizeBytes: number;
  retries: number;
  initMs: number;
  peakBytesPerSec: number;
  partDurationsMs: number[];
}

/** Feature flag: direct-to-GCS multipart uploads (the classic Firebase resumable uploader stays as the fallback when this is off). */
export const isMultipartEnabled = () => process.env.NEXT_PUBLIC_MULTIPART_UPLOADS === "1";

const envInt = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : fallback);

/**
 * Direct browser -> Google Cloud Storage multipart upload (see docs/large-file-transfer.md). The file is sliced, never loaded into memory; the server only
 * authorizes, reserves quota, signs part URLs and finalizes. Thumbnail and duration are read from the LOCAL file while the parts upload, exactly like the
 * classic path, and are sent with completion. The original object is never modified.
 */
async function uploadViaMultipart(workspaceId: string, projectId: string, file: File, uploadedBy: TaskActor, stageId: string, options: UploadOptions): Promise<string> {
  const { newVersionOf, onProgress, onCancelReady, onPhase, onTimings, onControlsReady, onEngine, onSession, persistFor } = options;
  const clock = () => performance.now();
  const assetType = assetTypeFromContentType(file.type || "application/octet-stream", file.name);
  const thumbBlobPromise: Promise<Blob | null> = assetType === "video" ? captureVideoThumbnail(file).catch(() => null) : assetType === "image" ? captureImageThumbnail(file).catch(() => null) : Promise.resolve(null);
  const durationPromise: Promise<number | null> = assetType === "video" || assetType === "audio" ? readMediaDuration(file).catch(() => null) : Promise.resolve(null);

  const hashes = await fingerprintFile(file, (d) => crypto.subtle.digest("SHA-256", d));
  const concurrency = envInt(process.env.NEXT_PUBLIC_UPLOAD_CONCURRENCY, 4);
  const partSizeBytes = envInt(process.env.NEXT_PUBLIC_UPLOAD_PART_MB, 64) * 1024 * 1024;
  const persistence = persistFor ? persistenceFor({ userId: persistFor.userId, workspaceName: persistFor.workspaceName, stageId, newVersionOfId: newVersionOf?.id ?? null }) : null;

  let session: SessionInfo | null = null;
  let thumbnailMs = 0;
  let metadataMs = 0;
  const record = (completedParts: number[], state: PersistedUpload["state"]): PersistedUpload | null =>
    session && {
      sessionId: session.sessionId, fileId: session.fileId, workspaceId, projectId, fileName: file.name, sizeBytes: file.size, contentType: file.type || "application/octet-stream",
      lastModified: file.lastModified, headHash: hashes.headHash, tailHash: hashes.tailHash, partSizeBytes: session.partSizeBytes, totalParts: session.totalParts,
      completedParts, state, createdAt: Date.now(), expiresAt: session.expiresAt,
    };

  const api = createBrowserApi(file, {
    workspaceId, projectId, stageId, newVersionOfId: newVersionOf?.id ?? null, partSizeBytes,
    onSession: (s) => {
      session = s;
      onSession?.(s);
      const r = record(s.uploadedParts, "uploading");
      if (r) void persistence?.save(r);
    },
    beforeComplete: async () => {
      const t1 = clock();
      let thumbnailUrl: string | null = null;
      if ((assetType === "video" || assetType === "image") && session) {
        try {
          const thumbBlob = await thumbBlobPromise;
          if (thumbBlob) thumbnailUrl = await uploadToStorage(projectAssetThumbRef(workspaceId, projectId, session.fileId), thumbBlob);
        } catch {
          // Best-effort — a missing thumbnail falls back to the file-type icon in the UI.
        }
      }
      thumbnailMs = clock() - t1;
      const t2 = clock();
      const durationSeconds = await durationPromise;
      metadataMs = clock() - t2;
      return { thumbnailUrl, durationSeconds };
    },
  });

  let finalizingAnnounced = false;
  const engine = new MultipartUpload(file, api, { concurrency, waitOnline }, {
    onSnapshot: (s) => {
      onProgress?.(s.totalBytes > 0 ? Math.round((s.bytesUploaded / s.totalBytes) * 100) : 0, s.bytesUploaded, s.totalBytes);
      onEngine?.(s);
      if (s.status === "finalizing" && !finalizingAnnounced) {
        finalizingAnnounced = true;
        onPhase?.("finalizing");
      }
    },
    onPartDone: (parts) => {
      const r = record(parts, "uploading");
      if (r) void persistence?.save(r);
    },
  });

  // Pause/resume: pause() makes start() reject with Paused; this loop then WAITS (no failure, nothing retransmitted) until resume() or cancel().
  const waiters: Array<() => void> = [];
  onControlsReady?.({
    pause: () => engine.pause(),
    resume: () => { for (const w of waiters.splice(0)) w(); },
  });
  onCancelReady?.(() => { void engine.cancel().finally(() => { for (const w of waiters.splice(0)) w(); }); });

  let result;
  let first = true;
  for (;;) {
    try {
      result = await (first ? engine.start() : engine.resume());
      break;
    } catch (err) {
      if (err instanceof Paused) {
        await new Promise<void>((resolve) => waiters.push(resolve));
        first = false;
        if (engine.snapshot().status === "cancelled") throw Object.assign(new Error("Upload cancelled"), { code: "storage/canceled" });
        continue;
      }
      if (err instanceof Cancelled || engine.snapshot().status === "cancelled") throw Object.assign(new Error("Upload cancelled"), { code: "storage/canceled" });
      throw err; // a user-facing message from the server (limit reached, no permission, ...) or "failed after N attempts"
    }
  }
  void persistence?.remove(result.sessionId);

  const { fileId } = result;
  const activeStart = clock();
  const assetGroupVersion = newVersionOf ? newVersionOf.versionNumber + 1 : 1;
  if (newVersionOf) {
    await logActivity(workspaceId, { actorId: uploadedBy.uid, actorName: uploadedBy.displayName, action: `uploaded a new version of "${file.name}" (v${assetGroupVersion})`, targetType: "file", targetId: fileId });
  } else {
    await logActivity(workspaceId, { actorId: uploadedBy.uid, actorName: uploadedBy.displayName, action: "uploaded a file", targetType: "file", targetId: fileId });
  }
  await addFileToStage(stageId, fileId);

  onTimings?.(
    { uploadMs: result.uploadMs, thumbnailMs, metadataMs, finalizeMs: result.finalizeMs, postMs: clock() - activeStart },
    { parts: result.partTimings.length, concurrency, partSizeBytes: session ? (session as SessionInfo).partSizeBytes : partSizeBytes, retries: result.retries, initMs: result.initMs, peakBytesPerSec: result.peakBps, partDurationsMs: result.partTimings.map((p) => p.ms) }
  );
  return fileId;
}


export async function uploadProjectFile(
  workspaceId: string,
  projectId: string,
  file: File,
  uploadedBy: TaskActor,
  options: UploadOptions = {}
): Promise<string> {
  const { stageId: requestedStageId, newVersionOf, onProgress, onCancelReady, onPhase, onTimings } = options;
  const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  // A file must always belong to a real stage — never write stageId:
  // null. If the caller (or a new version) didn't specify one,
  // resolve the project's existing stage or create its default
  // "General" stage. This is the single choke point every upload path
  // (Creative Workspace, Files tab, future callers) goes through, so
  // an orphaned asset can no longer be created here even if some UI
  // forgets to pass a stageId.
  const stageId = requestedStageId ?? newVersionOf?.stageId ?? (await getOrCreateDefaultStage(workspaceId, projectId, uploadedBy));

  // Feature flag: large uploads go straight from the browser to Google Cloud Storage in parallel parts. Off = the classic Firebase resumable uploader below.
  if (isMultipartEnabled() && typeof window !== "undefined") return uploadViaMultipart(workspaceId, projectId, file, uploadedBy, stageId, options);

  const fileId = doc(filesCol()).id;
  const fileRef = projectAssetRef(workspaceId, projectId, fileId, file.name);

  const assetType = assetTypeFromContentType(file.type || "application/octet-stream", file.name);

  // Reading the video's thumbnail frame and duration only needs the LOCAL file, so it runs WHILE the bytes upload instead of after —
  // for a multi-GB video that removes minutes of waiting at the end (and never competes for the network: it reads from disk).
  const thumbBlobPromise: Promise<Blob | null> = assetType === "video" ? captureVideoThumbnail(file).catch(() => null) : Promise.resolve(null);
  const durationPromise: Promise<number | null> = assetType === "video" || assetType === "audio" ? readMediaDuration(file).catch(() => null) : Promise.resolve(null);

  const uploadStart = clock();
  let url: string;
  if (onProgress) {
    const task = uploadFileWithProgress(fileRef, file, onProgress);
    onCancelReady?.(task.cancel);
    url = await task.promise;
  } else {
    url = await uploadToStorage(fileRef, file);
  }
  const uploadMs = clock() - uploadStart;
  onPhase?.("finalizing");

  const thumbStart = clock();
  let thumbnailUrl: string | null = null;
  if (assetType === "image") {
    thumbnailUrl = url;
  } else if (assetType === "video") {
    try {
      const thumbBlob = await thumbBlobPromise;
      if (thumbBlob) thumbnailUrl = await uploadToStorage(projectAssetThumbRef(workspaceId, projectId, fileId), thumbBlob);
    } catch {
      // Best-effort — a missing thumbnail falls back to the file-type icon in the UI.
    }
  }

  const thumbnailMs = clock() - thumbStart;
  const metaStart = clock();
  const durationSeconds: number | null = await durationPromise;
  const metadataMs = clock() - metaStart;

  const assetGroupId = newVersionOf?.assetGroupId ?? fileId;
  const versionNumber = newVersionOf ? newVersionOf.versionNumber + 1 : 1;

  // The actual Firestore record is created server-side now (see
  // finalizeUpload's doc comment) — this call independently re-verifies
  // the uploaded object's real size and the workspace's live storage
  // quota before the file becomes real/counted/visible. The fields
  // below are the same ones the old direct setDoc() used to write;
  // assetType/statusId are recomputed server-side from verified data
  // rather than trusted from this payload.
  const finalizeStart = clock();
  await finalizeUpload({
    workspaceId,
    projectId,
    fileId,
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    storagePath: fileRef.fullPath,
    url,
    thumbnailUrl,
    stageId,
    assetGroupId,
    versionNumber,
    previousVersionId: newVersionOf?.id ?? null,
    durationSeconds,
    newVersionOfId: newVersionOf?.id ?? null,
    uploadedBy,
  });

  const finalizeMs = clock() - finalizeStart;
  const postStart = clock();

  if (newVersionOf) {
    await logActivity(workspaceId, {
      actorId: uploadedBy.uid,
      actorName: uploadedBy.displayName,
      action: `uploaded a new version of "${file.name}" (v${versionNumber})`,
      targetType: "file",
      targetId: fileId,
    });
  } else {
    await logActivity(workspaceId, {
      actorId: uploadedBy.uid,
      actorName: uploadedBy.displayName,
      action: "uploaded a file",
      targetType: "file",
      targetId: fileId,
    });
  }

  await addFileToStage(stageId, fileId);

  onTimings?.({ uploadMs, thumbnailMs, metadataMs, finalizeMs, postMs: clock() - postStart });
  return fileId;
}

export async function getWorkspaceFiles(workspaceId: string): Promise<ProjectFile[]> {
  const q = query(filesCol(), where("workspaceId", "==", workspaceId), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

export async function getProjectFiles(workspaceId: string, projectId: string): Promise<ProjectFile[]> {
  const q = query(filesCol(), where("workspaceId", "==", workspaceId), where("projectId", "==", projectId), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

/** Files whose reviewStatus is "approved" — what the Downloads page shows (see "Connect Reviews with Downloads"). */
export async function getApprovedFiles(workspaceId: string): Promise<ProjectFile[]> {
  const q = query(filesCol(), where("workspaceId", "==", workspaceId), where("reviewStatus", "==", "approved"), orderBy("updatedAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

export async function getFile(workspaceId: string, fileId: string): Promise<ProjectFile | null> {
  const snapshot = await getDoc(fileDoc(fileId));
  if (!snapshot.exists()) return null;
  const file = snapshot.data();
  return file.workspaceId === workspaceId ? file : null;
}

/**
 * Resolves a shared-link visitor's token to the file it points at — see
 * FileShareLookup's doc comment in file.types.ts for why this goes
 * through `file_shares/{shareToken}` (a cheap, always-provable `get()`)
 * instead of querying `files` directly by `shareSettings.shareToken`,
 * which Firestore rejects outright (a `list` query's rule can't depend
 * on `workspaceId`/`projectId` — see canAccessProject inside `files`'
 * own read rule — unless the query itself filters on those exact
 * fields, which this one structurally can't: the whole point is not
 * knowing them yet). The second `getDoc` below evaluates
 * isSharedFile() against the REAL file document with no such
 * restriction, since it's a plain single-document read.
 */
export async function getFileByShareToken(shareToken: string): Promise<ProjectFile | null> {
  const lookupSnap = await getDoc(fileShareDoc(shareToken));
  if (!lookupSnap.exists()) return null;
  const fileSnap = await getDoc(fileDoc(lookupSnap.data().fileId));
  return fileSnap.exists() ? fileSnap.data() : null;
}

/**
 * Turns OFF a LEGACY public file link (the old `shareSettings` + `file_shares` system).
 *
 * That system is RETIRED for new links — external sharing is now server-controlled review links (see
 * /api/review-shares and lib/server/reviewShare.ts), and firestore.rules refuses any client attempt to create or
 * change a legacy link (`file_shares` create/update are denied and `files.shareSettings` can only be cleared). What
 * remains is the clean-up path: clear the file's settings, then delete the `file_shares/{token}` lookup so the old
 * URL stops resolving at once. The old `/share/[token]` page then reports "this link doesn't work".
 */
export async function turnOffLegacyFileShare(file: Pick<ProjectFile, "id">, current: FileShareSettings | null): Promise<void> {
  const previousToken = current && current.visibility !== "restricted" ? current.shareToken : null;
  await updateDoc(fileDoc(file.id), { shareSettings: null, updatedAt: serverTimestamp() });
  if (previousToken) await deleteDoc(fileShareDoc(previousToken));
}

export async function setFileReviewStatus(workspaceId: string, fileId: string, status: AssetStatus): Promise<void> {
  const existing = await getFile(workspaceId, fileId);
  if (!existing) throw new Error("File not found in this workspace.");
  await updateDoc(fileDoc(fileId), { reviewStatus: status, updatedAt: serverTimestamp() });
}

/**
 * Sets the file's workflow `statusId` (see its doc comment on
 * ProjectFile in file.types.ts) — the caller already has the
 * workspace's configured status list in scope (via useAssetOptions)
 * so it resolves both labels for the activity message itself, the
 * same way taskService.changeTaskPriority takes a resolved label
 * rather than re-deriving it here from just an id.
 */
export async function setFileStatusId(
  workspaceId: string,
  fileId: string,
  statusId: string,
  previousLabel: string,
  nextLabel: string,
  actor: TaskActor
): Promise<void> {
  const existing = await getFile(workspaceId, fileId);
  if (!existing) throw new Error("File not found in this workspace.");
  await updateDoc(fileDoc(fileId), { statusId, updatedAt: serverTimestamp() });
  await logActivity(workspaceId, {
    actorId: actor.uid,
    actorName: actor.displayName,
    action: `changed status from ${previousLabel} to ${nextLabel}`,
    targetType: "file",
    targetId: fileId,
  });
}

export async function archiveProjectFile(workspaceId: string, fileId: string, actor: TaskActor): Promise<void> {
  const existing = await getFile(workspaceId, fileId);
  if (!existing) throw new Error("File not found in this workspace.");
  await updateDoc(fileDoc(fileId), { reviewStatus: "archived", updatedAt: serverTimestamp() });
  await logActivity(workspaceId, {
    actorId: actor.uid,
    actorName: actor.displayName,
    action: `archived "${existing.fileName}"`,
    targetType: "file",
    targetId: fileId,
  });
}

export async function logFileDownload(workspaceId: string, fileId: string, fileName: string, actor: TaskActor): Promise<void> {
  await logActivity(workspaceId, {
    actorId: actor.uid,
    actorName: actor.displayName,
    action: `downloaded "${fileName}"`,
    targetType: "file",
    targetId: fileId,
  });
}

export async function assignFileToStage(workspaceId: string, fileId: string, stageId: string | null): Promise<void> {
  const existing = await getFile(workspaceId, fileId);
  if (!existing) throw new Error("File not found in this workspace.");
  await updateDoc(fileDoc(fileId), { stageId, updatedAt: serverTimestamp() });
  if (stageId) await addFileToStage(stageId, fileId);
}

/**
 * Permanently deletes ONE file (one version). Goes through /api/files/delete, which re-checks that the caller is the uploader or a
 * project manager/admin, removes the Storage object + thumbnail, the record and its comments, revokes its review links, promotes the
 * previous version if needed, gives the storage quota back and audits it. The server derives the actor from the signed-in user.
 */
export async function deleteProjectFile(workspaceId: string, fileId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch("/api/files/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ workspaceId, fileId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? "Couldn't delete this file. Try again.");
}

