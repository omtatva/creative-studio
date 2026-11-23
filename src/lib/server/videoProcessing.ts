import "server-only";
import { spawn } from "child_process";
import { adminDb, adminStorage } from "@/lib/server/firebaseAdmin";
import type { FileProcessing } from "@/types/file.types";

/**
 * Hands an uploaded video to the BACKGROUND processor (workers/video-processor) — never inline: the upload/finalize APIs return first and processing
 * happens in a separate scale-to-zero Cloud Run Job (FFmpeg). The ORIGINAL object is only ever read.
 *
 *   VIDEO_PROCESSOR_JOB     name of the Cloud Run Job (production). Unset = no processor configured: files get NO `processing` field and behave exactly as before.
 *   VIDEO_PROCESSOR_REGION  Cloud Run region of the job (default asia-south1, next to the bucket)
 *   VIDEO_PROCESSOR_LOCAL_CMD  development/testing only: a shell command run locally with FILE_ID in its environment instead of the Cloud Run Job
 *
 * Idempotent: enqueueing a file that is already queued / processing (live lease) / ready does nothing, so a retried or duplicated request can't start duplicate work.
 */
export const processorConfigured = () => !!(process.env.VIDEO_PROCESSOR_JOB || process.env.VIDEO_PROCESSOR_LOCAL_CMD);

const LEASE_GRACE_MS = 5 * 60 * 1000;

async function trigger(fileId: string): Promise<{ ok: boolean; error?: string }> {
  const local = process.env.VIDEO_PROCESSOR_LOCAL_CMD;
  if (local) {
    try {
      const child = spawn(local, { shell: true, detached: true, stdio: "ignore", env: { ...process.env, FILE_ID: fileId } });
      child.unref();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Couldn't start the local processor." };
    }
  }
  const job = process.env.VIDEO_PROCESSOR_JOB;
  if (!job) return { ok: false, error: "No video processor is configured." };
  try {
    const client = adminStorage().storage.authClient as unknown as { getAccessToken(): Promise<string | null | undefined>; getProjectId(): Promise<string> };
    const [token, project] = await Promise.all([client.getAccessToken(), client.getProjectId()]);
    const region = process.env.VIDEO_PROCESSOR_REGION || "asia-south1";
    const res = await fetch(`https://run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${encodeURIComponent(job)}:run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ overrides: { containerOverrides: [{ env: [{ name: "FILE_ID", value: fileId }] }] } }),
    });
    await res.arrayBuffer().catch(() => undefined);
    return res.ok ? { ok: true } : { ok: false, error: `The processor couldn't be started (${res.status}).` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "The processor couldn't be started." };
  }
}

/** Marks a video file `queued` (once) and starts the processor. Best-effort and non-fatal: a failure here must never fail an upload. */
export async function enqueueVideoProcessing(fileId: string): Promise<void> {
  if (!processorConfigured()) return;
  const ref = adminDb().collection("files").doc(fileId);
  const claimed = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const file = snap.data();
    if (!snap.exists || !file || file.assetType !== "video" || typeof file.storagePath !== "string") return false;
    const p = file.processing as FileProcessing | undefined;
    if (p && (p.status === "queued" || p.status === "ready" || p.status === "unsupported" || (p.status === "processing" && (p.leaseUntil ?? 0) > Date.now()))) return false;
    const next: FileProcessing = { status: "queued", attempts: p?.attempts ?? 0, updatedAt: Date.now(), error: null, leaseUntil: null };
    tx.update(ref, { processing: next });
    return true;
  });
  if (!claimed) return;
  const started = await trigger(fileId);
  if (!started.ok) await ref.update({ "processing.error": started.error ?? "The processor couldn't be started.", "processing.updatedAt": Date.now() }).catch(() => undefined);
}

/**
 * A person asked to retry a FAILED (or stuck-queued) file: reset it to `queued` and start the processor again. `unsupported` is final (the file can't be processed).
 * Returns the refusal reason, or null when it was (re)started.
 */
export async function retryVideoProcessing(fileId: string): Promise<string | null> {
  if (!processorConfigured()) return "Video processing isn't enabled.";
  const ref = adminDb().collection("files").doc(fileId);
  const outcome = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const file = snap.data();
    if (!snap.exists || !file || file.assetType !== "video") return "This file can't be processed.";
    const p = file.processing as FileProcessing | undefined;
    if (p?.status === "ready") return "This file is already processed.";
    if (p?.status === "unsupported") return "This video format can't be processed.";
    if (p?.status === "processing" && (p.leaseUntil ?? 0) + LEASE_GRACE_MS > Date.now()) return "Processing is already running.";
    tx.update(ref, { processing: { status: "queued", attempts: 0, updatedAt: Date.now(), error: null, leaseUntil: null } satisfies FileProcessing });
    return null;
  });
  if (outcome) return outcome;
  const started = await trigger(fileId);
  if (!started.ok) {
    await ref.update({ "processing.error": started.error ?? "The processor couldn't be started.", "processing.updatedAt": Date.now() }).catch(() => undefined);
    return started.error ?? "The processor couldn't be started.";
  }
  return null;
}
