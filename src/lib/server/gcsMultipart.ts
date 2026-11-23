import "server-only";
import { adminStorage } from "@/lib/server/firebaseAdmin";

/**
 * Google Cloud Storage XML API MULTIPART UPLOADS — the server half. (Why this API: see docs/large-file-transfer.md.)
 *
 * The server does the sensitive calls with its own credentials — INITIATE, LIST PARTS, COMPLETE and ABORT — and hands the browser only short-lived
 * V4 signed URLs that can do ONE thing: PUT one numbered part of one specific upload of one specific object. The bytes of the file therefore travel
 * browser -> storage.googleapis.com directly; nothing in this file (or any route) ever receives them.
 *
 * Addressing is path-style (https://storage.googleapis.com/BUCKET/OBJECT) because the default bucket name contains dots, which breaks the
 * virtual-hosted TLS certificate.
 */

const HOST = "https://storage.googleapis.com";

/** GCS limits: every part except the last is at least 5 MiB; at most 10,000 parts; an object up to 5 TiB. */
export const MIN_PART_BYTES = 5 * 1024 * 1024;
export const MAX_PARTS = 10_000;

export interface PartInfo {
  partNumber: number;
  size: number;
  etag: string;
}

const bucketName = () => adminStorage().name;

function objectUrl(objectPath: string, query: string): string {
  return `${HOST}/${bucketName()}/${objectPath.split("/").map(encodeURIComponent).join("/")}?${query}`;
}

async function authHeader(): Promise<Record<string, string>> {
  // The same service-account credential the Admin SDK uses (key file locally, the runtime service account in production).
  const token = await (adminStorage().storage as unknown as { authClient: { getAccessToken(): Promise<string | null | undefined> } }).authClient.getAccessToken();
  if (!token) throw new Error("Couldn't obtain a storage access token.");
  return { Authorization: `Bearer ${token}` };
}

async function gcs(method: string, url: string, headers: Record<string, string> = {}, body?: string): Promise<Response> {
  return fetch(url, { method, headers: { ...(await authHeader()), ...headers }, body });
}

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? (m[1] ?? null) : null;
};

/** Starts a multipart upload for `objectPath` and returns GCS's UploadId. The session id is stored as object metadata so a finished object can be proven to be ours. */
export async function initiateMultipart(objectPath: string, contentType: string, sessionId: string): Promise<string> {
  const res = await gcs("POST", objectUrl(objectPath, "uploads"), {
    "Content-Type": contentType || "application/octet-stream",
    "Content-Length": "0",
    "x-goog-meta-feedo-session": sessionId,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GCS initiate failed (${res.status}).`);
  const uploadId = tag(text, "UploadId");
  if (!uploadId) throw new Error("GCS initiate returned no UploadId.");
  return uploadId;
}

/** A short-lived V4 signed URL that may ONLY `PUT` part `partNumber` of upload `uploadId` of `objectPath` — nothing else in the bucket. */
export async function signPartUrl(objectPath: string, uploadId: string, partNumber: number, ttlSeconds: number): Promise<string> {
  const [url] = await adminStorage()
    .file(objectPath)
    .getSignedUrl({ version: "v4", action: "write", expires: Date.now() + ttlSeconds * 1000, queryParams: { partNumber: String(partNumber), uploadId } });
  return url;
}

/** What GCS actually holds for this upload right now — the server's source of truth, never the client's claim. */
export async function listParts(objectPath: string, uploadId: string): Promise<PartInfo[]> {
  const parts: PartInfo[] = [];
  let marker = 0;
  for (let page = 0; page < 20; page++) {
    const res = await gcs("GET", objectUrl(objectPath, `uploadId=${encodeURIComponent(uploadId)}&max-parts=1000&part-number-marker=${marker}`));
    const text = await res.text();
    if (res.status === 404) throw new MultipartGone();
    if (!res.ok) throw new Error(`GCS list-parts failed (${res.status}).`);
    for (const m of text.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
      const inner = m[1] ?? "";
      const n = Number(tag(inner, "PartNumber"));
      const size = Number(tag(inner, "Size"));
      const etag = (tag(inner, "ETag") ?? "").replace(/&quot;/g, '"');
      if (Number.isInteger(n) && Number.isFinite(size)) parts.push({ partNumber: n, size, etag });
    }
    const next = Number(tag(text, "NextPartNumberMarker") ?? 0);
    if (tag(text, "IsTruncated") !== "true" || !next) break;
    marker = next;
  }
  return parts.sort((a, b) => a.partNumber - b.partNumber);
}

export class MultipartGone extends Error {
  constructor() {
    super("The multipart upload no longer exists in storage.");
  }
}

/** Assembles the parts. `parts` come from listParts (verified), never from the browser. Idempotency is the caller's job (see /api/uploads/complete). */
export async function completeMultipart(objectPath: string, uploadId: string, parts: PartInfo[]): Promise<void> {
  const body = `<CompleteMultipartUpload>${parts.map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${xmlEscape(p.etag)}</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
  const res = await gcs("POST", objectUrl(objectPath, `uploadId=${encodeURIComponent(uploadId)}`), { "Content-Type": "application/xml" }, body);
  const text = await res.text();
  if (res.status === 404) throw new MultipartGone();
  if (!res.ok || /<Error>/.test(text)) throw new Error(`GCS complete failed (${res.status}).`);
}

export async function abortMultipart(objectPath: string, uploadId: string): Promise<void> {
  const res = await gcs("DELETE", objectUrl(objectPath, `uploadId=${encodeURIComponent(uploadId)}`));
  await res.arrayBuffer().catch(() => undefined);
  if (!res.ok && res.status !== 404) throw new Error(`GCS abort failed (${res.status}).`);
}

/** The finished object's real size + our session tag (undefined/null if it doesn't exist). */
export async function objectFacts(objectPath: string): Promise<{ size: number; sessionTag: string | null; contentType: string } | null> {
  const file = adminStorage().file(objectPath);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [meta] = await file.getMetadata();
  return { size: Number(meta.size ?? 0), sessionTag: (meta.metadata as Record<string, string> | undefined)?.["feedo-session"] ?? null, contentType: String(meta.contentType ?? "") };
}

/** Picks a part size: the requested one if sane, else the default, always large enough that the file fits in 10,000 parts and never below GCS's 5 MiB minimum. */
export function choosePartSize(totalBytes: number, requested: number | undefined, defaultBytes: number): number {
  const MB = 1024 * 1024;
  const floor = Math.max(MIN_PART_BYTES, Math.ceil(totalBytes / MAX_PARTS / MB) * MB);
  const want = typeof requested === "number" && Number.isFinite(requested) && requested >= MIN_PART_BYTES && requested <= 5 * 1024 * MB ? Math.floor(requested / MB) * MB : defaultBytes;
  return Math.max(floor, want);
}
