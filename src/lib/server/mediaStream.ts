import "server-only";
import { Readable } from "stream";
import { adminStorage } from "@/lib/server/firebaseAdmin";

/** Only these render inline; anything else is forced to download semantics so a hostile upload can never run as a page on our origin. */
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf)$/i;

/**
 * Streams ONE Storage object to the browser with HTTP Range support (video
 * seeking), using the Admin SDK's read stream — the object is piped, never
 * buffered in memory, so two simultaneous video streams (version compare)
 * cost two open streams, not two file-sized buffers. The CALLER must already
 * have authorized the request; this only moves bytes. Never reveals or uses
 * the permanent Firebase token URL.
 */
export async function streamStorageObject(request: Request, storagePath: string, contentType: string, options: { allowNonInline?: boolean } = {}): Promise<Response> {
  // PREVIEW is not DOWNLOAD. A type the browser can't render inline (a zip, an office file...) would otherwise be served
  // as an attachment — i.e. handed over as a download without going through the download permission. Previews refuse
  // those; only a caller that has itself verified download rights may pass `allowNonInline`.
  if (!INLINE_TYPES.test(contentType ?? "") && !options.allowNonInline) {
    return new Response(JSON.stringify({ error: "No preview is available for this file type.", code: "UNSUPPORTED_MEDIA" }), { status: 415, headers: { "Content-Type": "application/json" } });
  }
  const object = adminStorage().file(storagePath);
  const [exists] = await object.exists();
  if (!exists) return new Response(JSON.stringify({ error: "This file is no longer available.", code: "STORAGE_OBJECT_NOT_FOUND" }), { status: 404, headers: { "Content-Type": "application/json" } });
  const [metadata] = await object.getMetadata();
  const size = Number(metadata.size ?? 0);

  const type = INLINE_TYPES.test(contentType ?? "") ? contentType : "application/octet-stream";
  const headers = new Headers({
    "Content-Type": type,
    "Content-Disposition": INLINE_TYPES.test(type) ? "inline" : "attachment",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });

  const range = request.headers.get("range");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (match && size > 0) {
    let start = match[1] === "" ? NaN : Number(match[1]);
    let end = match[2] === "" ? NaN : Number(match[2]);
    if (Number.isNaN(start)) {
      // suffix range: the last N bytes
      start = Math.max(0, size - end);
      end = size - 1;
    } else if (Number.isNaN(end) || end >= size) {
      end = size - 1;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
      return new Response(JSON.stringify({ error: "That byte range can't be served.", code: "RANGE_ERROR" }), { status: 416, headers: { "Content-Range": `bytes */${size}`, "Content-Type": "application/json" } });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(Readable.toWeb(object.createReadStream({ start, end })) as ReadableStream, { status: 206, headers });
  }

  if (size > 0) headers.set("Content-Length", String(size));
  return new Response(Readable.toWeb(object.createReadStream()) as ReadableStream, { status: 200, headers });
}
