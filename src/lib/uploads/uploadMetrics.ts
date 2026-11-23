/**
 * Measurements of what a REAL browser upload actually did — bytes, elapsed time, average and peak throughput, stalls, main-thread blocking and heap — recorded
 * by the app-level upload store for every upload and exposed on `window.__uploadMetrics` plus a `[upload-metrics]` console line, so slow uploads can be
 * diagnosed from facts rather than guesses. Nothing here changes how the upload runs.
 */

export interface PhaseTimings {
  /** Bytes on the wire: from the start of the resumable upload until its last byte was acknowledged. */
  uploadMs: number;
  /** Waiting for the thumbnail frame + uploading the thumbnail (video only), after the main bytes were done. */
  thumbnailMs: number;
  /** Waiting for the media duration read (it runs concurrently with the upload, so this is only the remaining wait). */
  metadataMs: number;
  /** The server round trip to /api/files/finalize (size + quota verification, record creation). */
  finalizeMs: number;
  /** Activity log + stage bookkeeping after finalize. */
  postMs: number;
}

export interface UploadMetrics extends PhaseTimings {
  uploadId: string;
  fileName: string;
  fileBytes: number;
  bytesTransferred: number;
  totalMs: number;
  /** bytes / uploadMs. */
  avgBytesPerSec: number;
  /** Fastest sustained rate over any window of at least 2 s. */
  peakBytesPerSec: number;
  /** Gaps of 10 s or more with no byte progress at all. */
  stalls: number;
  longestStallMs: number;
  progressEvents: number;
  /** Main thread: tasks over 50 ms during the upload, and their total blocking time. */
  longTasks: number;
  longTaskBlockingMs: number;
  /** JS heap (Chrome only) at start and at its highest during the upload, in MB. */
  heapStartMB: number | null;
  heapPeakMB: number | null;
  /** Requests the page made to Google storage endpoints while uploading (from Resource Timing). */
  storageRequests: number;
  storageRequestMaxMs: number;
  finishedAt: string;
  /** Multipart uploads only: part layout, concurrency, retries, per-part durations. */
  multipart?: { parts: number; concurrency: number; partSizeBytes: number; retries: number; initMs: number; peakBytesPerSec: number; partDurationsMs: number[] };
}

declare global {
  interface Window {
    __uploadMetrics?: UploadMetrics[];
  }
}

const STALL_MS = 10_000;
const PEAK_WINDOW_MS = 2_000;

const heapMB = (): number | null => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round((m.usedJSHeapSize / (1024 * 1024)) * 10) / 10 : null;
};

export class UploadMetricsRecorder {
  private readonly startedAt = performance.now();
  private readonly startedEpoch = Date.now();
  private lastEventAt = performance.now();
  private windowStartAt = performance.now();
  private windowStartBytes = 0;
  private bytes = 0;
  private peak = 0;
  private stalls = 0;
  private longestStall = 0;
  private events = 0;
  private longTasks = 0;
  private longTaskMs = 0;
  private heapStart = heapMB();
  private heapPeak = this.heapStart;
  private observer: PerformanceObserver | null = null;
  private uploadDoneAt: number | null = null;

  private readonly uploadId: string;
  private readonly fileName: string;
  private readonly fileBytes: number;

  constructor(uploadId: string, fileName: string, fileBytes: number) {
    this.uploadId = uploadId;
    this.fileName = fileName;
    this.fileBytes = fileBytes;
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTasks++;
          this.longTaskMs += Math.max(0, entry.duration - 50);
        }
      });
      this.observer.observe({ entryTypes: ["longtask"] });
    } catch {
      this.observer = null; // Long Task API not available in this browser.
    }
  }

  onProgress(bytesTransferred: number) {
    const now = performance.now();
    const gap = now - this.lastEventAt;
    if (this.events > 0 && gap >= STALL_MS) {
      this.stalls++;
      this.longestStall = Math.max(this.longestStall, gap);
    }
    this.lastEventAt = now;
    this.events++;
    this.bytes = bytesTransferred;
    if (now - this.windowStartAt >= PEAK_WINDOW_MS) {
      const rate = ((bytesTransferred - this.windowStartBytes) * 1000) / (now - this.windowStartAt);
      if (rate > this.peak) this.peak = rate;
      this.windowStartAt = now;
      this.windowStartBytes = bytesTransferred;
    }
    const h = heapMB();
    if (h !== null && (this.heapPeak === null || h > this.heapPeak)) this.heapPeak = h;
  }

  markUploadDone() {
    this.uploadDoneAt = performance.now();
  }

  finish(timings: PhaseTimings, multipart?: UploadMetrics["multipart"]): UploadMetrics {
    this.observer?.disconnect();
    const uploadMs = timings.uploadMs || (this.uploadDoneAt ?? performance.now()) - this.startedAt;
    let storageRequests = 0;
    let storageRequestMaxMs = 0;
    try {
      for (const e of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
        if (e.startTime < this.startedAt - 1) continue;
        if (/firebasestorage\.googleapis\.com|storage\.googleapis\.com/.test(e.name) && (e.initiatorType === "xmlhttprequest" || e.initiatorType === "fetch")) {
          storageRequests++;
          storageRequestMaxMs = Math.max(storageRequestMaxMs, e.duration);
        }
      }
    } catch {
      // Resource Timing unavailable.
    }
    const metrics: UploadMetrics = {
      uploadId: this.uploadId,
      fileName: this.fileName,
      fileBytes: this.fileBytes,
      bytesTransferred: this.bytes || this.fileBytes,
      ...timings,
      uploadMs,
      totalMs: Date.now() - this.startedEpoch,
      avgBytesPerSec: uploadMs > 0 ? ((this.bytes || this.fileBytes) * 1000) / uploadMs : 0,
      peakBytesPerSec: Math.max(this.peak, 0),
      stalls: this.stalls,
      longestStallMs: Math.round(this.longestStall),
      progressEvents: this.events,
      longTasks: this.longTasks,
      longTaskBlockingMs: Math.round(this.longTaskMs),
      heapStartMB: this.heapStart,
      heapPeakMB: this.heapPeak,
      storageRequests,
      storageRequestMaxMs: Math.round(storageRequestMaxMs),
      finishedAt: new Date().toISOString(),
      ...(multipart ? { multipart } : {}),
    };
    try {
      (window.__uploadMetrics ??= []).push(metrics);
      console.info("[upload-metrics]", JSON.stringify(metrics));
    } catch {
      // Not in a browser.
    }
    return metrics;
  }

  dispose() {
    this.observer?.disconnect();
  }
}
