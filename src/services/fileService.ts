import { deleteDoc, doc, getDoc, getDocs, increment, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { filesCol, fileDoc, fileShareDoc, settingsDoc } from "@/lib/firebase/firestore";
import {
  projectAssetRef,
  projectAssetThumbRef,
  uploadFile as uploadToStorage,
  uploadFileWithProgress,
  deleteFile as deleteFromStorage,
} from "@/lib/firebase/storage";
import { ref } from "firebase/storage";
import { storage } from "@/lib/firebase/config";
import { logActivity } from "@/services/activityService";
import { addFileToStage, getOrCreateDefaultStage } from "@/services/stageService";
import { assetTypeFromContentType } from "@/lib/constants/creativeFiles";
import { DEFAULT_ASSET_STATUS_ID } from "@/lib/constants/assetOptions";
import { captureVideoThumbnail, readMediaDuration } from "@/lib/utils/videoThumbnail";
import { AssetStatus, FileShareSettings, FileShareVisibility, FileSharePermission, ProjectFile } from "@/types/file.types";
import { TaskActor } from "@/types/task.types";

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
  onProgress?: (percent: number) => void;
}

export async function uploadProjectFile(
  workspaceId: string,
  projectId: string,
  file: File,
  uploadedBy: TaskActor,
  options: UploadOptions = {}
): Promise<string> {
  const { stageId: requestedStageId, newVersionOf, onProgress } = options;

  // A file must always belong to a real stage — never write stageId:
  // null. If the caller (or a new version) didn't specify one,
  // resolve the project's existing stage or create its default
  // "General" stage. This is the single choke point every upload path
  // (Creative Workspace, Files tab, future callers) goes through, so
  // an orphaned asset can no longer be created here even if some UI
  // forgets to pass a stageId.
  const stageId = requestedStageId ?? newVersionOf?.stageId ?? (await getOrCreateDefaultStage(workspaceId, projectId, uploadedBy));

  const docRef = doc(filesCol());
  const fileId = docRef.id;
  const fileRef = projectAssetRef(workspaceId, projectId, fileId, file.name);

  const url = onProgress
    ? await uploadFileWithProgress(fileRef, file, onProgress).promise
    : await uploadToStorage(fileRef, file);

  const assetType = assetTypeFromContentType(file.type || "application/octet-stream", file.name);

  let thumbnailUrl: string | null = null;
  if (assetType === "image") {
    thumbnailUrl = url;
  } else if (assetType === "video") {
    try {
      const thumbBlob = await captureVideoThumbnail(file);
      if (thumbBlob) thumbnailUrl = await uploadToStorage(projectAssetThumbRef(workspaceId, projectId, fileId), thumbBlob);
    } catch {
      // Best-effort — a missing thumbnail falls back to the file-type icon in the UI.
    }
  }

  let durationSeconds: number | null = null;
  if (assetType === "video" || assetType === "audio") {
    try {
      durationSeconds = await readMediaDuration(file);
    } catch {
      durationSeconds = null;
    }
  }

  const assetGroupId = newVersionOf?.assetGroupId ?? fileId;
  const versionNumber = newVersionOf ? newVersionOf.versionNumber + 1 : 1;

  const record: Omit<ProjectFile, "createdAt" | "updatedAt"> = {
    id: fileId,
    workspaceId,
    projectId,
    fileName: file.name,
    originalName: file.name,
    contentType: file.type || "application/octet-stream",
    assetType,
    sizeBytes: file.size,
    url,
    thumbnailUrl,
    storagePath: fileRef.fullPath,
    uploadedBy,
    reviewStatus: "none",
    statusId: DEFAULT_ASSET_STATUS_ID,
    stageId,
    assetGroupId,
    versionNumber,
    previousVersionId: newVersionOf?.id ?? null,
    isLatestVersion: true,
    durationSeconds,
    shareSettings: null,
  };

  await setDoc(docRef, { ...record, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await updateDoc(settingsDoc(workspaceId), { "storage.usedBytes": increment(file.size) } as never);

  if (newVersionOf) {
    await updateDoc(fileDoc(newVersionOf.id), { isLatestVersion: false, updatedAt: serverTimestamp() });
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
 * Enables/updates/disables link-sharing for one file — the Share dialog's
 * only write path (see ShareFileModal.tsx). Reuses the existing
 * `shareToken` across permission/visibility tweaks so a link someone
 * already copied keeps working; only generates a fresh one the first
 * time sharing is turned on, or after it was explicitly turned back to
 * "restricted" and re-enabled (an old copied link must NOT silently
 * start working again once disabled). Keeps the `file_shares/{shareToken}`
 * lookup doc (see FileShareLookup) in sync with the file's own
 * `shareSettings` — deletes the OLD lookup doc when disabling/rotating
 * so a stale copied link's token no longer resolves to anything.
 */
export async function updateFileShareSettings(
  file: Pick<ProjectFile, "id" | "workspaceId" | "projectId">,
  current: FileShareSettings | null,
  patch: { visibility: FileShareVisibility; permission: FileSharePermission },
  actor: TaskActor
): Promise<FileShareSettings | null> {
  const previousToken = current && current.visibility !== "restricted" ? current.shareToken : null;

  if (patch.visibility === "restricted") {
    await updateDoc(fileDoc(file.id), { shareSettings: null, updatedAt: serverTimestamp() });
    if (previousToken) await deleteDoc(fileShareDoc(previousToken));
    return null;
  }

  const shareToken = previousToken ?? crypto.randomUUID();
  const shareSettings: FileShareSettings = {
    visibility: patch.visibility,
    permission: patch.permission,
    shareToken,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.uid,
  };
  await updateDoc(fileDoc(file.id), { shareSettings, updatedAt: serverTimestamp() });
  await setDoc(fileShareDoc(shareToken), {
    shareToken,
    fileId: file.id,
    workspaceId: file.workspaceId,
    projectId: file.projectId,
  });
  return shareSettings;
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

export async function deleteProjectFile(workspaceId: string, fileId: string, actor: TaskActor): Promise<void> {
  const existing = await getFile(workspaceId, fileId);
  if (!existing) throw new Error("File not found in this workspace.");

  try {
    await deleteFromStorage(ref(storage, existing.storagePath));
  } catch {
    // Best-effort — don't block deleting the record if storage cleanup fails.
  }

  await deleteDoc(fileDoc(fileId));
  await updateDoc(settingsDoc(workspaceId), { "storage.usedBytes": increment(-existing.sizeBytes) } as never);
  await logActivity(workspaceId, {
    actorId: actor.uid,
    actorName: actor.displayName,
    action: `deleted "${existing.fileName}"`,
    targetType: "file",
    targetId: fileId,
  });
}
