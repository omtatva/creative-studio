import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
  uploadBytesResumable,
  type StorageReference,
} from "firebase/storage";
import { storage } from "./config";

/**
 * Storage paths are namespaced by workspaceId so tenants never
 * share a folder. Mirrors the Firestore multi-tenancy convention.
 */

export function workspaceLogoRef(workspaceId: string, fileName: string): StorageReference {
  return ref(storage, `workspaces/${workspaceId}/branding/logo-${fileName}`);
}

/**
 * FIXED (non-timestamped) path for the Settings > Branding page's own
 * logo upload (settings.branding.logoUrl) — deliberately a separate,
 * stable object key from workspaceLogoRef above, which is a DIFFERENT
 * logo concept (workspace.companyLogoUrl, shown in the sidebar's
 * workspace switcher, uploaded from Settings > Workspace). Using one
 * fixed path per workspace means every re-upload overwrites the same
 * Storage object in place — no orphaned old logo files accumulating,
 * and no separate delete-then-upload step needed.
 */
export function workspaceBrandingLogoRef(workspaceId: string): StorageReference {
  return ref(storage, `workspaces/${workspaceId}/branding/logo`);
}

export function workspaceFileRef(workspaceId: string, path: string): StorageReference {
  return ref(storage, `workspaces/${workspaceId}/files/${path}`);
}

export function projectCoverRef(workspaceId: string, projectId: string, fileName: string): StorageReference {
  return ref(storage, `workspaces/${workspaceId}/projects/${projectId}/cover-${fileName}`);
}

export function taskAttachmentRef(
  workspaceId: string,
  taskId: string,
  attachmentId: string,
  versionNumber: number,
  fileName: string
): StorageReference {
  return ref(
    storage,
    `workspaces/${workspaceId}/tasks/${taskId}/attachments/${attachmentId}/v${versionNumber}-${fileName}`
  );
}

export function projectFileRef(workspaceId: string, projectId: string, fileName: string): StorageReference {
  return ref(storage, `workspaces/${workspaceId}/projects/${projectId}/files/${Date.now()}-${fileName}`);
}

/**
 * Predictable per-asset storage path used by the Creative Workspace
 * (and, by extension, Project → Files — they're the same upload
 * path): `workspaces/{workspaceId}/projects/{projectId}/files/{fileId}/{filename}`.
 * Keyed by a Firestore-generated `fileId` (assigned before upload,
 * via `doc(filesCol()).id`) rather than a timestamp so every version
 * of the same asset AND its thumbnail live under one predictable
 * prefix, and so the Firestore doc + Storage object can be created in
 * either order without a naming collision.
 */
export function projectAssetRef(workspaceId: string, projectId: string, fileId: string, fileName: string): StorageReference {
  return ref(storage, `workspaces/${workspaceId}/projects/${projectId}/files/${fileId}/${fileName}`);
}

export function projectAssetThumbRef(workspaceId: string, projectId: string, fileId: string): StorageReference {
  return ref(storage, `workspaces/${workspaceId}/projects/${projectId}/files/${fileId}/thumb.jpg`);
}

export async function uploadFile(fileRef: StorageReference, file: File | Blob): Promise<string> {
  const snapshot = await uploadBytes(fileRef, file);
  return getDownloadURL(snapshot.ref);
}

/**
 * Real upload-progress tracking for the Creative Workspace's uploader
 * — `uploadBytes` above has no progress events, so large video/audio
 * files would otherwise show no feedback until they finish outright.
 * `onProgress` receives 0-100 on every Storage `state_changed` tick.
 */
export function uploadFileWithProgress(
  fileRef: StorageReference,
  file: File,
  onProgress: (percent: number) => void
): { promise: Promise<string>; cancel: () => void } {
  const task = uploadBytesResumable(fileRef, file);

  const promise = new Promise<string>((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        const percent = snapshot.totalBytes > 0 ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0;
        onProgress(percent);
      },
      (err) => reject(err),
      () => {
        getDownloadURL(task.snapshot.ref).then(resolve).catch(reject);
      }
    );
  });

  return { promise, cancel: () => task.cancel() };
}

export async function deleteFile(fileRef: StorageReference): Promise<void> {
  await deleteObject(fileRef);
}

/** Resolves a stored `fullPath` (see AttachmentVersion.storagePath) back into a StorageReference for cleanup. */
export function fileRefFromPath(path: string): StorageReference {
  return ref(storage, path);
}
