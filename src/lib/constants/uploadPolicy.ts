/**
 * PLATFORM SAFETY LIMITS for uploads — the ONLY place an absolute file-size number lives in application code.
 *
 * These are NOT business entitlements. What a workspace is actually allowed (its total storage, its seats, its per-file entitlement) is
 * resolved by lib/entitlements.ts + lib/server/workspaceEntitlements.ts (plan -> Super Admin override -> workspace choice), and every
 * consumer (uploader, Settings, finalize route, quota reservation) reads that one resolved policy. The numbers below are only the
 * outer fence that protects the platform if application logic ever fails, and they are mirrored — by hand, with a comment — in
 * firebase-config/storage.rules, which cannot read per-workspace entitlements:
 *
 *   PLATFORM_MAX_FILE_BYTES   <-> storage.rules isAllowedCreativeUpload()  (100 GB)
 *   UPLOAD_CLASSES.*          <-> storage.rules isAllowedBrandingUpload() / isAllowedCoverUpload() / isSafeAttachmentUpload()
 *
 * Change one, change the other. Nothing else in the app may hard-code a storage size.
 */

export const MB = 1024 * 1024;
export const GB = 1024 * MB;

/** Absolute ceiling for ONE project media file (video/image/pdf/audio). No workspace entitlement or setting can exceed it. */
export const PLATFORM_MAX_FILE_BYTES = 100 * GB;

/**
 * Upload classes. A class decides which safety ceiling an upload path uses, so small UI assets are never given the project-media ceiling
 * and project media is never held to a small one. "entitlement" classes additionally go through the workspace's resolved file policy and
 * storage quota (/api/files/finalize); the fixed classes are small UI/auxiliary assets with a fixed ceiling and no quota accounting.
 */
export type UploadClass = "project_media" | "task_attachment" | "project_cover" | "branding";

export const UPLOAD_CLASSES: Record<UploadClass, { label: string; maxBytes: number; governedByEntitlement: boolean }> = {
  project_media: { label: "project file", maxBytes: PLATFORM_MAX_FILE_BYTES, governedByEntitlement: true },
  task_attachment: { label: "task attachment", maxBytes: 500 * MB, governedByEntitlement: false },
  project_cover: { label: "project cover image", maxBytes: 10 * MB, governedByEntitlement: false },
  branding: { label: "branding image", maxBytes: 5 * MB, governedByEntitlement: false },
};

/** "100 GB", "1.5 GB", "250 MB". */
export function formatBytesShort(bytes: number): string {
  if (bytes >= GB) return `${Number((bytes / GB).toFixed(2))} GB`;
  return `${Number((bytes / MB).toFixed(1))} MB`;
}

/** Size check for the fixed-ceiling classes (attachments, covers, branding). Returns a user-facing message, or null if the file fits. */
export function getFixedClassSizeError(uploadClass: Exclude<UploadClass, "project_media">, file: { name: string; size: number }): string | null {
  const { label, maxBytes } = UPLOAD_CLASSES[uploadClass];
  return file.size > maxBytes ? `"${file.name}" is too large for a ${label} (max ${formatBytesShort(maxBytes)}).` : null;
}
