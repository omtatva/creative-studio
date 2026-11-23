import "server-only";
import { adminStorage } from "@/lib/server/firebaseAdmin";

/** A direct (signed) download URL is valid for 2 minutes: long enough to START the transfer (which then continues past expiry); a new URL needs a fresh authorization. */
export const DIRECT_URL_TTL_MS = 120_000;

const safeAsciiName = (name: string) => name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\/;]/g, "_").slice(0, 180) || "download";

/** Content-Disposition for an ORIGINAL download: attachment, the exact original name (RFC 5987 for non-ASCII). */
export const contentDisposition = (fileName: string) => `attachment; filename="${safeAsciiName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

/**
 * A short-lived, read-only V4 signed URL for ONE object, with the attachment filename and content type baked into the signature, so the browser downloads
 * the exact stored bytes straight from GCS (no app-server proxy; GCS serves HTTP Range). The CALLER must already have authorized the request.
 *
 * Returns null — and the caller falls back to its ticketed/proxied stream — when direct downloads are switched off (DIRECT_DOWNLOADS=0) or signing isn't available
 * (e.g. the runtime service account lacks IAM signBlob permission). The URL is a secret: never store it and never log it.
 */
export async function signOriginalDownloadUrl(storagePath: string, fileName: string, contentType: string, ttlMs: number = DIRECT_URL_TTL_MS): Promise<string | null> {
  if (process.env.DIRECT_DOWNLOADS === "0") return null;
  try {
    const [url] = await adminStorage().file(storagePath).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + ttlMs,
      responseDisposition: contentDisposition(fileName),
      responseType: contentType || "application/octet-stream",
    });
    return url;
  } catch (err) {
    console.error("[directDownload] couldn't sign a direct URL — falling back to the proxied download:", err instanceof Error ? err.message : err);
    return null;
  }
}
