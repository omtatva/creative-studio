import { AssetType } from "@/types/file.types";

/**
 * Every extension/MIME pair the Creative Workspace's uploader
 * accepts, per the spec's supported-files list. Extension is checked
 * as a fallback for files whose browser-reported `file.type` is
 * empty (common for .mov and some .svg exports on Windows).
 */
export const SUPPORTED_CREATIVE_MIME_TYPES: Record<string, AssetType> = {
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/webm": "video",
  "image/jpeg": "image",
  "image/png": "image",
  "image/svg+xml": "image",
  "image/gif": "image",
  "application/pdf": "pdf",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/x-wav": "audio",
};

export const SUPPORTED_CREATIVE_EXTENSIONS: Record<string, AssetType> = {
  mp4: "video",
  mov: "video",
  webm: "video",
  jpg: "image",
  jpeg: "image",
  png: "image",
  svg: "image",
  gif: "image",
  pdf: "pdf",
  mp3: "audio",
  wav: "audio",
};

export const ACCEPTED_FILE_INPUT = ".mp4,.mov,.webm,.jpg,.jpeg,.png,.svg,.gif,.pdf,.mp3,.wav";

// Size constants and the platform safety ceiling live in ONE place (constants/uploadPolicy.ts); the per-workspace limit is resolved by
// lib/entitlements.ts (resolveFilePolicy) and served by /api/workspaces/entitlements. Nothing here decides a limit.
export { MB, GB, PLATFORM_MAX_FILE_BYTES } from "@/lib/constants/uploadPolicy";
import { formatBytesShort } from "@/lib/constants/uploadPolicy";

/** "100 GB", "1.5 GB", "250 MB". */
export const formatFileLimit = formatBytesShort;

function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

/** Same rule as isSupportedCreativeFile, from a name + content type (used server-side, where there is no File). */
export function isSupportedCreativeType(contentType: string, fileName: string): boolean {
  if (contentType && SUPPORTED_CREATIVE_MIME_TYPES[contentType]) return true;
  return extensionOf(fileName) in SUPPORTED_CREATIVE_EXTENSIONS;
}

export function isSupportedCreativeFile(file: File): boolean {
  return isSupportedCreativeType(file.type, file.name);
}

/** What an upload is checked against: the workspace's resolved per-file limit and (when known) the storage it has left. Built from the entitlement policy, never from constants. */
export interface UploadPolicy {
  maxFileBytes: number;
  /** null = unknown or unlimited. */
  remainingStorageBytes: number | null;
}

/** Single validation entry point for every project-media upload path (initial upload, new version) — returns a user-facing message, or null if the file is fine. */
export function getUploadValidationError(file: File, policy: UploadPolicy): string | null {
  if (!isSupportedCreativeFile(file)) return `"${file.name}" isn't a supported creative file type.`;
  if (file.size > policy.maxFileBytes) return `"${file.name}" is too large — this workspace allows files up to ${formatFileLimit(policy.maxFileBytes)}.`;
  if (policy.remainingStorageBytes !== null && file.size > policy.remainingStorageBytes) {
    return `"${file.name}" (${formatFileLimit(file.size)}) doesn't fit — this workspace has ${formatFileLimit(policy.remainingStorageBytes)} of storage left.`;
  }
  return null;
}

/** Resolves an AssetType from a File the same way for upload, display, and preview dispatch — single source of truth. */
export function detectAssetType(file: File): AssetType {
  const byMime = file.type ? SUPPORTED_CREATIVE_MIME_TYPES[file.type] : undefined;
  if (byMime) return byMime;
  return SUPPORTED_CREATIVE_EXTENSIONS[extensionOf(file.name)] ?? "other";
}

export function assetTypeFromContentType(contentType: string, fileName: string): AssetType {
  const byMime = SUPPORTED_CREATIVE_MIME_TYPES[contentType];
  if (byMime) return byMime;
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.includes("pdf")) return "pdf";
  return SUPPORTED_CREATIVE_EXTENSIONS[extensionOf(fileName)] ?? "other";
}
