import { getCurrentUser } from "@/lib/firebase/auth";
import { PartUploadError, classifyGcsError, type EngineApi, type PartUrl, type SessionInfo } from "@/lib/uploads/multipartEngine";

/** Error carrying the server's user-facing message + machine code (e.g. FILE_TOO_LARGE, STORAGE_LIMIT_REACHED). */
export class UploadApiError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function api<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const user = getCurrentUser();
  if (!user) throw new UploadApiError("You must be signed in.", 401, null);
  const idToken = await user.getIdToken(); // fresh every call — the token itself is never stored
  let res: Response;
  try {
    res = await fetch(`/api/uploads/${action}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify(body) });
  } catch {
    throw new UploadApiError("Couldn't reach the server. Check your connection.", 0, null);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string } & T;
  if (!res.ok) throw new UploadApiError(data.error ?? "The upload request failed.", res.status, data.code ?? null);
  return data;
}

export interface BrowserApiContext {
  workspaceId: string;
  projectId: string;
  stageId: string | null;
  newVersionOfId: string | null;
  partSizeBytes?: number;
  /** Runs once all parts are uploaded and right before completion — e.g. uploads the thumbnail and reads the duration. */
  beforeComplete?: () => Promise<{ thumbnailUrl: string | null; durationSeconds: number | null }>;
  /** Called with what the server decided at init (part layout, session id). */
  onSession?: (session: SessionInfo) => void;
}

/** The engine's world in the browser: our authenticated routes + a direct XHR PUT of each part to its signed GCS URL (XHR, because fetch can't report upload progress). */
export function createBrowserApi(file: File, ctx: BrowserApiContext): EngineApi {
  return {
    async init() {
      const session = await api<SessionInfo>("init", {
        workspaceId: ctx.workspaceId, projectId: ctx.projectId, fileName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size,
        lastModified: file.lastModified, stageId: ctx.stageId, newVersionOfId: ctx.newVersionOfId, partSizeBytes: ctx.partSizeBytes,
      });
      ctx.onSession?.(session);
      return session;
    },
    async getUrls(sessionId, partNumbers) {
      try {
        return (await api<{ urls: PartUrl[] }>("parts", { sessionId, partNumbers })).urls;
      } catch (err) {
        // A network blip or a 5xx asking for a URL is retried like a failed part; an authorization/session error is not.
        if (err instanceof UploadApiError && (err.status === 0 || err.status >= 500 || err.status === 429)) throw new PartUploadError(err.message, err.status, true);
        throw err;
      }
    },
    status: (sessionId) => api("status", { sessionId }),
    async complete(sessionId) {
      const extra = (await ctx.beforeComplete?.()) ?? { thumbnailUrl: null, durationSeconds: null };
      return api("complete", { sessionId, thumbnailUrl: extra.thumbnailUrl, durationSeconds: extra.durationSeconds });
    },
    async abort(sessionId) {
      await api("abort", { sessionId });
    },
    putPart(url, body, onProgress, signal) {
      return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        xhr.upload.onprogress = (e) => onProgress(e.loaded);
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(classifyGcsError(xhr.status, xhr.responseText ?? "")));
        xhr.onerror = () => reject(new PartUploadError("Network error while uploading a part.", 0, true));
        xhr.ontimeout = () => reject(new PartUploadError("Timed out while uploading a part.", 0, true));
        xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
        signal.addEventListener("abort", () => xhr.abort(), { once: true });
        if (signal.aborted) return xhr.abort();
        xhr.send(body);
      });
    },
  };
}

/** Aborts a server-side upload session (used to cancel an upload that was restored after a refresh and has no live engine). */
export async function abortUploadSession(sessionId: string): Promise<void> {
  await api("abort", { sessionId });
}

/** Resolves when the browser is online again — used by the engine after a network-level failure so it doesn't burn retries while offline. */
export function waitOnline(signal?: AbortSignal): Promise<void> {
  if (typeof navigator === "undefined" || navigator.onLine !== false) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { window.removeEventListener("online", done); resolve(); };
    window.addEventListener("online", done, { once: true });
    signal?.addEventListener("abort", done, { once: true });
  });
}
