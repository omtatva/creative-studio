import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { assetTypeFromContentType } from "@/lib/constants/creativeFiles";
import { DEFAULT_ASSET_STATUS_ID } from "@/lib/constants/assetOptions";

export interface FileRecordInput {
  fileId: string;
  workspaceId: string;
  projectId: string;
  fileName: string;
  contentType: string;
  /** The verified size of the ORIGINAL object, read from storage itself. */
  sizeBytes: number;
  /** Legacy permanent download URL (classic uploads only). Multipart uploads never mint one — playback and download are ticketed/signed. */
  url: string;
  thumbnailUrl: string | null;
  /** The ORIGINAL object. Thumbnails and any future preview/proxy derivatives are separate objects and are never stored here. */
  storagePath: string;
  uploadedBy: { uid: string; displayName?: string; photoURL?: string | null; email?: string };
  stageId: string | null;
  assetGroupId: string;
  versionNumber: number;
  previousVersionId: string | null;
  durationSeconds: number | null;
  uploadMethod: "resumable" | "multipart";
}

/** The ONE shape of a `files/{id}` document, used by both /api/files/finalize (classic uploads) and /api/uploads/complete (multipart) so the two can never drift. */
export function buildFileDocument(input: FileRecordInput) {
  const now = FieldValue.serverTimestamp();
  return {
    id: input.fileId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    fileName: input.fileName,
    originalName: input.fileName,
    contentType: input.contentType || "application/octet-stream",
    // Recomputed from the verified contentType/fileName, never trusted from the client.
    assetType: assetTypeFromContentType(input.contentType || "application/octet-stream", input.fileName),
    sizeBytes: input.sizeBytes,
    url: input.url,
    thumbnailUrl: input.thumbnailUrl,
    storagePath: input.storagePath,
    uploadMethod: input.uploadMethod,
    uploadedBy: {
      uid: input.uploadedBy.uid,
      displayName: input.uploadedBy.displayName || "Unknown",
      photoURL: input.uploadedBy.photoURL ?? null,
      email: input.uploadedBy.email || "",
    },
    reviewStatus: "none",
    statusId: DEFAULT_ASSET_STATUS_ID,
    stageId: input.stageId,
    assetGroupId: input.assetGroupId || input.fileId,
    versionNumber: input.versionNumber,
    previousVersionId: input.previousVersionId,
    isLatestVersion: true,
    durationSeconds: input.durationSeconds,
    shareSettings: null,
    createdAt: now,
    updatedAt: now,
  };
}
