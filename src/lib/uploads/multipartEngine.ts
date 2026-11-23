/**
 * Browser-side engine for direct-to-GCS multipart uploads. Pure logic with every side effect injected (HTTP, persistence, timers, randomness), so the exact
 * code that runs in the browser is exercised against the real bucket in tests.
 *
 * - The file is read with File.slice(): a part is a lazy view of the file on disk, never loaded into memory (a 100 GB file costs a few KB of bookkeeping).
 * - Parts upload with BOUNDED concurrency; the count is a tunable, not an assumption that more is faster.
 * - Each part retries on its own (network error, 408/429/5xx, expired signature -> fresh URL) with exponential backoff and full jitter. A part that
 *   succeeded is never sent again, even after a retry of its neighbours, a pause, or a page reload (the SERVER lists what it holds and only the gaps upload).
 * - Never stores a token or a signed URL: only identifiers and which part numbers are done (see EnginePersistence).
 */

export type EngineStatus = "preparing" | "uploading" | "retrying" | "paused" | "finalizing" | "completed" | "failed" | "cancelled";

export interface PartUrl {
  partNumber: number;
  url: string;
  offset: number;
  length: number;
}

export interface SessionInfo {
  sessionId: string;
  fileId: string;
  partSizeBytes: number;
  totalParts: number;
  sizeBytes: number;
  expiresAt: number;
  resumed: boolean;
  uploadedParts: number[];
}

export class PartUploadError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

/** The injected world. In the app these call /api/uploads/* and PUT to GCS with XHR (for per-part progress); tests call the same routes with fetch. */
export interface EngineApi {
  init(): Promise<SessionInfo>;
  getUrls(sessionId: string, partNumbers: number[]): Promise<PartUrl[]>;
  status(sessionId: string): Promise<{ status: string; uploadedParts: number[] }>;
  complete(sessionId: string): Promise<{ fileId: string; sizeBytes: number }>;
  abort(sessionId: string): Promise<void>;
  /** PUT one part's bytes straight to GCS. Reports bytes sent so far. Must reject with PartUploadError (status 0 for network errors). */
  putPart(url: string, body: Blob, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<void>;
}

/** What may be persisted across a refresh. No tokens, no signed URLs. */
export interface PersistedUpload {
  sessionId: string;
  fileId: string;
  workspaceId: string;
  projectId: string;
  fileName: string;
  sizeBytes: number;
  contentType: string;
  lastModified: number;
  headHash: string;
  tailHash: string;
  partSizeBytes: number;
  totalParts: number;
  completedParts: number[];
  state: EngineStatus;
  createdAt: number;
  expiresAt: number;
}

export interface EnginePersistence {
  save(record: PersistedUpload): Promise<void>;
  remove(sessionId: string): Promise<void>;
}

export interface EngineOptions {
  concurrency: number;
  /** Attempts per part before the whole upload fails. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Rounds of "server says parts are missing -> send just those" before giving up. */
  maxRepairRounds: number;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  random: () => number;
  /** Resolves when the browser is online again (called only after a network-level failure). */
  waitOnline: (signal?: AbortSignal) => Promise<void>;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  concurrency: 4,
  maxAttempts: 8,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  maxRepairRounds: 3,
  sleep: (ms, signal) =>
    new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
    }),
  random: Math.random,
  waitOnline: async () => undefined,
};

export interface PartTiming {
  partNumber: number;
  bytes: number;
  ms: number;
  attempts: number;
}

export interface EngineSnapshot {
  status: EngineStatus;
  bytesUploaded: number;
  totalBytes: number;
  completedParts: number;
  totalParts: number;
  activeParts: number;
  retries: number;
  speedBps: number | null;
  peakBps: number;
  error: string | null;
}

export interface EngineHooks {
  onSnapshot?: (s: EngineSnapshot) => void;
  /** Called after every part that finished, with everything worth persisting. */
  onPartDone?: (completedParts: number[]) => void;
}

export interface EngineResult {
  fileId: string;
  sizeBytes: number;
  sessionId: string;
  partTimings: PartTiming[];
  retries: number;
  /** Time spent in each phase, for diagnostics. */
  initMs: number;
  uploadMs: number;
  finalizeMs: number;
  peakBps: number;
}

/** Thrown by start()/resume() when pause() was called. The finished parts are kept; resume() sends only what is missing. */
export class Paused extends Error {}
/** Thrown by start()/resume() after cancel(). */
export class Cancelled extends Error {}

export class MultipartUpload {
  private readonly file: Blob;
  private readonly api: EngineApi;
  private readonly opts: EngineOptions;
  private readonly hooks: EngineHooks;
  private session: SessionInfo | null = null;
  private done = new Set<number>();
  private inflight = new Map<number, number>();
  private controllers = new Map<number, AbortController>();
  private timings: PartTiming[] = [];
  private status: EngineStatus = "preparing";
  private retries = 0;
  private error: string | null = null;
  private control: "run" | "pause" | "cancel" = "run";
  private pauseWaiters: Array<() => void> = [];
  private speed: { at: number; bytes: number; bps: number } | null = null;
  private peak = 0;
  private windowAt = 0;
  private windowBytes = 0;

  constructor(file: Blob, api: EngineApi, opts: Partial<EngineOptions> = {}, hooks: EngineHooks = {}) {
    this.file = file;
    this.api = api;
    this.opts = { ...DEFAULT_ENGINE_OPTIONS, ...opts };
    this.hooks = hooks;
  }

  /** (A method, so TypeScript doesn't narrow `control` across awaits — pause/cancel can be flipped at any time.) */
  private is(c: "run" | "pause" | "cancel"): boolean {
    return this.control === c;
  }

  getSession(): SessionInfo | null {
    return this.session;
  }

  snapshot(): EngineSnapshot {
    const total = this.file.size;
    const completed = this.completedBytes();
    const inflight = Array.from(this.inflight.values()).reduce((a, b) => a + b, 0);
    return {
      status: this.status,
      bytesUploaded: Math.min(total, completed + inflight),
      totalBytes: total,
      completedParts: this.done.size,
      totalParts: this.session?.totalParts ?? 0,
      activeParts: this.controllers.size,
      retries: this.retries,
      speedBps: this.speed?.bps ?? null,
      peakBps: this.peak,
      error: this.error,
    };
  }

  /** Stops sending (in-flight parts are abandoned; finished parts are kept). Call resume() to continue with only the missing parts. */
  pause() {
    if (this.control !== "run") return;
    this.control = "pause";
    for (const c of this.controllers.values()) c.abort();
  }

  /** Continues a paused upload. */
  resume(): Promise<EngineResult> {
    this.control = "run";
    for (const w of this.pauseWaiters.splice(0)) w();
    return this.start();
  }

  async cancel(): Promise<void> {
    this.control = "cancel";
    for (const c of this.controllers.values()) c.abort();
    for (const w of this.pauseWaiters.splice(0)) w();
    if (this.session) await this.api.abort(this.session.sessionId).catch(() => undefined);
    this.setStatus("cancelled");
  }

  private completedBytes(): number {
    const s = this.session;
    if (!s) return 0;
    let bytes = 0;
    for (const n of this.done) bytes += this.partLength(n);
    return bytes;
  }

  private partLength(n: number): number {
    const s = this.session as SessionInfo;
    return n < s.totalParts ? s.partSizeBytes : s.sizeBytes - s.partSizeBytes * (s.totalParts - 1);
  }

  private setStatus(s: EngineStatus) {
    if (this.status === s) return;
    this.status = s;
    this.emit();
  }

  private emit() {
    this.hooks.onSnapshot?.(this.snapshot());
  }

  private trackSpeed() {
    const now = Date.now();
    const bytes = this.snapshot().bytesUploaded;
    if (!this.speed) {
      this.speed = { at: now, bytes, bps: 0 };
      this.windowAt = now;
      this.windowBytes = bytes;
      return;
    }
    if (now > this.speed.at) {
      const inst = ((bytes - this.speed.bytes) * 1000) / (now - this.speed.at);
      if (inst >= 0) this.speed.bps = this.speed.bps ? this.speed.bps * 0.8 + inst * 0.2 : inst;
      this.speed.at = now;
      this.speed.bytes = bytes;
    }
    if (now - this.windowAt >= 2000) {
      const rate = ((bytes - this.windowBytes) * 1000) / (now - this.windowAt);
      if (rate > this.peak) this.peak = rate;
      this.windowAt = now;
      this.windowBytes = bytes;
    }
  }

  /** Runs (or continues) the upload to completion. Safe to call again after a pause or a failure: only missing parts are sent. */
  async start(): Promise<EngineResult> {
    const t0 = Date.now();
    this.error = null;
    try {
      this.control = "run";
      if (!this.session) {
        this.setStatus("preparing");
        this.session = await this.api.init();
        for (const n of this.session.uploadedParts) this.done.add(n);
      } else {
        // continuing: believe the SERVER about which parts it holds
        const st = await this.api.status(this.session.sessionId);
        this.done = new Set(st.uploadedParts);
      }
      const initMs = Date.now() - t0;
      const session = this.session;
      this.emit();

      const tUpload = Date.now();
      for (let round = 0; round <= this.opts.maxRepairRounds; round++) {
        await this.uploadMissing(session);
        if (this.is("cancel")) throw new Cancelled();
        const st = await this.api.status(session.sessionId);
        this.done = new Set(st.uploadedParts);
        if (this.done.size === session.totalParts) break;
        if (round === this.opts.maxRepairRounds) throw new Error(`The server is still missing ${session.totalParts - this.done.size} part(s) after ${round} repair rounds.`);
      }
      const uploadMs = Date.now() - tUpload;

      this.setStatus("finalizing");
      const tFin = Date.now();
      const result = await this.api.complete(session.sessionId);
      const finalizeMs = Date.now() - tFin;
      this.setStatus("completed");
      return { ...result, sessionId: session.sessionId, partTimings: this.timings, retries: this.retries, initMs, uploadMs, finalizeMs, peakBps: this.peak };
    } catch (err) {
      if (err instanceof Paused || (this.is("pause"))) {
        this.setStatus("paused");
        throw err instanceof Paused ? err : new Paused("paused");
      }
      if (err instanceof Cancelled || this.is("cancel")) {
        this.setStatus("cancelled");
        throw err instanceof Cancelled ? err : new Cancelled("cancelled");
      }
      this.error = err instanceof Error ? err.message : "Upload failed";
      this.setStatus("failed");
      throw err;
    }
  }

  private async uploadMissing(session: SessionInfo): Promise<void> {
    const queue: number[] = [];
    for (let n = 1; n <= session.totalParts; n++) if (!this.done.has(n)) queue.push(n);
    this.setStatus("uploading");
    let failure: unknown = null;

    const worker = async () => {
      while (failure === null) {
        if (this.is("pause")) throw new Paused("paused");
        if (this.is("cancel")) throw new Cancelled("cancelled");
        const n = queue.shift();
        if (n === undefined) return;
        try {
          await this.uploadPart(session, n);
        } catch (err) {
          if (err instanceof Paused || err instanceof Cancelled) throw err;
          failure = err;
          for (const c of this.controllers.values()) c.abort();
          throw err;
        }
      }
    };

    const workers = Array.from({ length: Math.max(1, Math.min(this.opts.concurrency, queue.length || 1)) }, () => worker());
    const results = await Promise.allSettled(workers);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (rejected) throw failure ?? rejected.reason;
  }

  private async uploadPart(session: SessionInfo, n: number): Promise<void> {
    const offset = (n - 1) * session.partSizeBytes;
    const length = this.partLength(n);
    const started = Date.now();
    let attempts = 0;
    let url: string | null = null;

    for (;;) {
      attempts++;
      if (this.is("pause")) throw new Paused("paused");
      if (this.is("cancel")) throw new Cancelled("cancelled");
      const controller = new AbortController();
      this.controllers.set(n, controller);
      try {
        if (!url) {
          const urls = await this.api.getUrls(session.sessionId, [n]);
          url = urls[0]?.url ?? null;
          if (!url) throw new PartUploadError("The server didn't return an upload URL.", 0, true);
        }
        this.inflight.set(n, 0);
        const body = this.file.slice(offset, offset + length);
        await this.api.putPart(url, body, (loaded) => {
          this.inflight.set(n, Math.min(loaded, length));
          this.trackSpeed();
          this.emit();
        }, controller.signal);
        this.inflight.delete(n);
        this.controllers.delete(n);
        this.done.add(n);
        this.timings.push({ partNumber: n, bytes: length, ms: Date.now() - started, attempts });
        this.trackSpeed();
        this.hooks.onPartDone?.(Array.from(this.done));
        this.emit();
        return;
      } catch (err) {
        this.inflight.delete(n);
        this.controllers.delete(n);
        if (this.is("pause")) throw new Paused("paused");
        if (this.is("cancel")) throw new Cancelled("cancelled");
        const apiStatus = typeof (err as { status?: unknown })?.status === "number" ? ((err as { status: number }).status) : 0;
        const e = err instanceof PartUploadError ? err : new PartUploadError(err instanceof Error ? err.message : "Part upload failed", apiStatus, isRetryableStatus(apiStatus));
        // 403 on a signed URL = it expired or was rejected: ask for a fresh one (the server re-authorizes), then retry.
        if (e.status === 403) url = null;
        if (!e.retryable && e.status !== 403) throw e;
        if (attempts >= this.opts.maxAttempts) throw new PartUploadError(`Part ${n} failed after ${attempts} attempts: ${e.message}`, e.status, false);
        this.retries++;
        this.setStatus("retrying");
        if (e.status === 0) await this.opts.waitOnline(controller.signal);
        const cap = Math.min(this.opts.maxDelayMs, this.opts.baseDelayMs * 2 ** (attempts - 1));
        await this.opts.sleep(Math.floor(this.opts.random() * cap), controller.signal); // full jitter
        this.setStatus("uploading");
      }
    }
  }
}

/**
 * Turns a failed GCS part response into the engine's error. Measured on the real bucket: an EXPIRED signed URL is answered with HTTP 400 + <Code>ExpiredToken</Code>
 * (not 403), so it is mapped to status 403 = "ask the server for a fresh URL". Everything else follows isRetryableStatus.
 */
export function classifyGcsError(status: number, bodyText: string): PartUploadError {
  if (bodyText.includes("<Code>ExpiredToken</Code>")) return new PartUploadError("The upload URL expired", 403, true);
  return new PartUploadError(`Storage responded ${status}`, status, isRetryableStatus(status));
}

/** True for statuses worth retrying (and the 403 that means "URL expired"). */
export const isRetryableStatus = (status: number): boolean => status === 0 || status === 408 || status === 429 || status >= 500 || status === 403;

/** Cheap identity of a file: name, size, mtime and a SHA-256 of its first and last MiB (never the whole file). */
export async function fingerprintFile(file: Blob & { name?: string; lastModified?: number }, digest: (data: ArrayBuffer) => Promise<ArrayBuffer>): Promise<{ headHash: string; tailHash: string }> {
  const MiB = 1024 * 1024;
  const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const head = await digest(await file.slice(0, Math.min(MiB, file.size)).arrayBuffer());
  const tail = await digest(await file.slice(Math.max(0, file.size - MiB), file.size).arrayBuffer());
  return { headHash: hex(head), tailHash: hex(tail) };
}

/** Is `file` the same file that was persisted? (Used when a refresh lost the File object and the user re-selects it.) */
export function matchesPersisted(file: { name: string; size: number; lastModified: number }, hashes: { headHash: string; tailHash: string }, rec: PersistedUpload): boolean {
  return file.name === rec.fileName && file.size === rec.sizeBytes && file.lastModified === rec.lastModified && hashes.headHash === rec.headHash && hashes.tailHash === rec.tailHash;
}
