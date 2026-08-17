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

/** Firebase Storage / most browsers comfortably handle this; a real limit avoids the upload silently hanging on a huge file. */
export const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function isSupportedCreativeFile(file: File): boolean {
  if (file.type && SUPPORTED_CREATIVE_MIME_TYPES[file.type]) return true;
  return extensionOf(file.name) in SUPPORTED_CREATIVE_EXTENSIONS;
}

/** Single validation entry point for every upload path (initial upload, new version) — returns a user-facing message, or null if the file is fine. */
export function getUploadValidationError(file: File): string | null {
  if (!isSupportedCreativeFile(file)) return `"${file.name}" isn't a supported creative file type.`;
  if (file.size > MAX_UPLOAD_SIZE_BYTES) return `"${file.name}" is too large (max ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)} MB).`;
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
