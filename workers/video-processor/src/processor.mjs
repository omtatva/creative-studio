// Background video processor — the core, with every external dependency injected so the exact same code runs in the Cloud Run Job and in tests.
//
// GUARANTEES
//  - The ORIGINAL object is only READ (via a short-lived signed URL that FFmpeg streams over HTTP with seeking — the multi-GB source is never copied to local disk).
//  - Derivatives are SEPARATE objects with DETERMINISTIC names (files/{id}/derived/thumb.jpg, proxy-720p.mp4) — overwriting on retry, never duplicating.
//  - Idempotent: the claim is a Firestore transaction. A file already `ready` (with its derivatives) is a no-op; a live `processing` lease belongs to someone else;
//    a stale lease (crashed worker) or `failed`/`queued` may be (re)claimed, up to MAX_ATTEMPTS.
//  - The proxy is only published after its duration is verified against the original's (comments/markers are stored in SECONDS on the original timeline); otherwise it is
//    discarded and playback falls back to the original.
//  - Corrupt / non-video input ends as `unsupported` (final, no retry); transient failures end as `failed` (retryable).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_LIMITS = {
  maxAttempts: 3,
  /** A claim is considered abandoned after this long without a heartbeat. */
  leaseMs: 15 * 60 * 1000,
  heartbeatMs: 5 * 60 * 1000,
  probeTimeoutMs: 120_000,
  thumbTimeoutMs: 180_000,
  /** The whole proxy transcode must finish within this (the Cloud Run Job's own task timeout is the outer bound). */
  proxyTimeoutMs: 6 * 60 * 60 * 1000,
  /** Longer sources get metadata + thumbnail but no proxy (the proxy is built in the job's memory-backed temp disk; see docs/video-processing.md). */
  maxProxySeconds: 4 * 60 * 60,
  proxyHeight: 720,
  proxyMaxrateKbps: 3000,
  /** Already-small sources (<= proxyHeight and under this bitrate) are played from the original: a proxy would add cost for no gain. */
  skipProxyBelowKbps: 3500,
  durationToleranceSeconds: 0.25,
  durationToleranceRatio: 0.01,
  threads: Number(process.env.FFMPEG_THREADS || 2),
  signTtlMs: 12 * 60 * 60 * 1000,
};

const nowMs = () => Date.now();
const scrub = (msg) => String(msg ?? "").replace(/https?:\/\/\S+/g, "[url]").replace(/[A-Za-z]:[\\/][^\s'"`]+|(?<![\w.])\/[^\s'"`:;,)]+/g, "[path]").slice(0, 200);

/** Runs a binary, collects stdout (bounded), enforces a timeout, never uses a shell. */
export function run(bin, args, { timeoutMs, maxStdout = 5_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = timeoutMs ? setTimeout(() => { child.kill("SIGKILL"); reject(Object.assign(new Error("timed out"), { code: "TIMEOUT" })); }, timeoutMs) : null;
    child.stdout.on("data", (d) => { if (out.length < maxStdout) out += d; });
    child.stderr.on("data", (d) => { err = (err + d).slice(-4000); });
    child.on("error", (e) => { if (timer) clearTimeout(timer); reject(e); });
    child.on("close", (code) => { if (timer) clearTimeout(timer); code === 0 ? resolve({ stdout: out, stderr: err }) : reject(Object.assign(new Error(err.trim().split("\n").pop() || `exit ${code}`), { code, stderr: err })); });
  });
}

const parseRate = (r) => { if (!r || typeof r !== "string") return null; const [a, b] = r.split("/").map(Number); return b ? Math.round((a / b) * 1000) / 1000 : Number.isFinite(a) ? a : null; };

export function extractMetadata(probe) {
  const v = (probe.streams || []).find((s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1) ?? null;
  const a = (probe.streams || []).find((s) => s.codec_type === "audio") ?? null;
  const duration = Number(probe.format?.duration ?? v?.duration);
  return {
    hasVideo: !!v,
    metadata: {
      durationSeconds: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) / 1000 : null,
      width: v?.width ?? null, height: v?.height ?? null, frameRate: parseRate(v?.avg_frame_rate) ?? parseRate(v?.r_frame_rate),
      videoCodec: v?.codec_name ?? null, audioCodec: a?.codec_name ?? null, container: probe.format?.format_name ?? null,
      bitRate: probe.format?.bit_rate ? Number(probe.format.bit_rate) : null,
    },
  };
}

export function proxyArgs(inputUrl, outPath, limits) {
  return [
    "-hide_banner", "-nostdin", "-y", "-i", inputUrl,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", `scale=-2:'min(${limits.proxyHeight},ih)'`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-maxrate", `${limits.proxyMaxrateKbps}k`, "-bufsize", `${limits.proxyMaxrateKbps * 2}k`, "-pix_fmt", "yuv420p",
    // keep the source's frame timing: the proxy must stay on the SAME timeline as the original (comment markers are stored in seconds)
    "-fps_mode", "passthrough",
    "-c:a", "aac", "-b:a", "128k", "-ac", "2",
    "-movflags", "+faststart", "-threads", String(limits.threads),
    outPath,
  ];
}

/**
 * @param deps { db, bucket, fileId, ffmpeg, ffprobe, limits?, log? }   db = Firestore (Admin), bucket = GCS bucket (Admin/@google-cloud/storage)
 * @returns { outcome: "ready"|"unsupported"|"failed"|"skipped", detail? }
 */
export async function processFile({ db, bucket, fileId, ffmpeg = "ffmpeg", ffprobe = "ffprobe", limits: override = {}, log = () => {} }) {
  const limits = { ...DEFAULT_LIMITS, ...override };
  const ref = db.collection("files").doc(fileId);

  // ---- 1. claim (transaction) — the idempotency gate
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const file = snap.data();
    if (!snap.exists || !file) return { skip: "missing" };
    if (file.assetType !== "video" || typeof file.storagePath !== "string") return { skip: "not a video" };
    const p = file.processing;
    if (p?.status === "ready" && (p.thumbnailPath || p.proxyPath || p.proxySkipped)) return { skip: "already ready" };
    if (p?.status === "unsupported") return { skip: "unsupported" };
    if (p?.status === "processing" && (p.leaseUntil ?? 0) > nowMs()) return { skip: "another worker holds a live lease" };
    const attempts = (p?.attempts ?? 0) + 1;
    if (attempts > limits.maxAttempts) {
      tx.update(ref, { processing: { ...(p ?? {}), status: "failed", attempts: p?.attempts ?? 0, error: "Processing failed too many times.", leaseUntil: null, updatedAt: nowMs() } });
      return { skip: "too many attempts" };
    }
    tx.update(ref, { processing: { status: "processing", attempts, leaseUntil: nowMs() + limits.leaseMs, startedAt: nowMs(), finishedAt: null, updatedAt: nowMs(), error: null } });
    return { file, attempts };
  });
  if (claim.skip) { log(`skip ${fileId}: ${claim.skip}`); return { outcome: "skipped", detail: claim.skip }; }
  const { file } = claim;
  const base = file.storagePath.replace(/[^/]+$/, "");
  const thumbPath = `${base}derived/thumb.jpg`;
  const proxyPath = `${base}derived/proxy-${limits.proxyHeight}p.mp4`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "feedo-proc-"));

  // keep the lease alive while working so a long transcode isn't taken over
  const beat = setInterval(() => { ref.update({ "processing.leaseUntil": nowMs() + limits.leaseMs, "processing.updatedAt": nowMs() }).catch(() => {}); }, limits.heartbeatMs);
  beat.unref?.();

  const fail = async (status, error) => {
    await ref.update({ processing: { status, attempts: claim.attempts, error: scrub(error), leaseUntil: null, startedAt: null, finishedAt: nowMs(), updatedAt: nowMs() } });
    return { outcome: status, detail: scrub(error) };
  };

  try {
    // ---- 2. read the ORIGINAL through a short-lived signed URL (never copied locally, never stored/logged)
    const [src] = await bucket.file(file.storagePath).getSignedUrl({ version: "v4", action: "read", expires: nowMs() + limits.signTtlMs });

    // ---- 3. metadata
    let probe;
    try {
      probe = JSON.parse((await run(ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", src], { timeoutMs: limits.probeTimeoutMs })).stdout);
    } catch (err) {
      const text = `${err?.message ?? ""} ${err?.stderr ?? ""}`;
      if (/Invalid data|moov atom not found|could not find codec|End of file|Invalid argument|not supported|No such file/i.test(text)) return await fail("unsupported", "This video is corrupted or in a format that can't be processed.");
      throw err; // transient (network, timeout) -> retryable
    }
    const { hasVideo, metadata } = extractMetadata(probe);
    if (!hasVideo || !metadata.durationSeconds) return await fail("unsupported", "No playable video stream was found in this file.");

    // ---- 4. thumbnail (separate object, deterministic name)
    const thumbLocal = path.join(tmp, "thumb.jpg");
    const at = Math.min(Math.max(metadata.durationSeconds * 0.1, 0.5), 10, Math.max(metadata.durationSeconds - 0.1, 0));
    await run(ffmpeg, ["-hide_banner", "-nostdin", "-y", "-ss", String(at), "-i", src, "-frames:v", "1", "-vf", "scale='min(640,iw)':-2", "-q:v", "4", thumbLocal], { timeoutMs: limits.thumbTimeoutMs });
    await bucket.upload(thumbLocal, { destination: thumbPath, resumable: false, metadata: { contentType: "image/jpeg", cacheControl: "private, max-age=0" } });

    // ---- 5. proxy (separate object) — or a recorded reason why there isn't one
    let proxyOut = { proxyPath: null, proxyContentType: null, proxyBytes: null, proxySkipped: null };
    const smallAlready = (metadata.height ?? 0) <= limits.proxyHeight && (metadata.bitRate ?? 0) / 1000 < limits.skipProxyBelowKbps;
    if (metadata.durationSeconds > limits.maxProxySeconds) proxyOut.proxySkipped = `Source is longer than ${Math.round(limits.maxProxySeconds / 3600)} h; played from the original.`;
    else if (smallAlready) proxyOut.proxySkipped = "Source is already small enough to play smoothly.";
    else {
      const proxyLocal = path.join(tmp, "proxy.mp4");
      await run(ffmpeg, proxyArgs(src, proxyLocal, limits), { timeoutMs: limits.proxyTimeoutMs, maxStdout: 10_000 });
      // verify the proxy is on the SAME timeline before anyone can play it
      const outProbe = extractMetadata(JSON.parse((await run(ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", proxyLocal], { timeoutMs: limits.probeTimeoutMs })).stdout));
      const tol = Math.max(limits.durationToleranceSeconds, metadata.durationSeconds * limits.durationToleranceRatio);
      if (!outProbe.hasVideo || outProbe.metadata.durationSeconds === null || Math.abs(outProbe.metadata.durationSeconds - metadata.durationSeconds) > tol) {
        proxyOut.proxySkipped = "The generated proxy didn't match the original's duration, so the original is used for playback.";
      } else {
        await bucket.upload(proxyLocal, { destination: proxyPath, resumable: true, metadata: { contentType: "video/mp4", cacheControl: "private, max-age=0" } });
        proxyOut = { proxyPath, proxyContentType: "video/mp4", proxyBytes: fs.statSync(proxyLocal).size, proxySkipped: null };
      }
    }

    // ---- 6. publish (transaction): the original's metadata is never altered; the file's duration is filled ONLY if it was unknown
    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data();
      if (!cur) return;
      const update = { processing: { status: "ready", attempts: claim.attempts, leaseUntil: null, startedAt: cur.processing?.startedAt ?? null, finishedAt: nowMs(), updatedAt: nowMs(), error: null, metadata, thumbnailPath: thumbPath, ...proxyOut } };
      if (cur.durationSeconds == null && metadata.durationSeconds != null) update.durationSeconds = metadata.durationSeconds;
      tx.update(ref, update);
    });
    log(`ready ${fileId}: proxy=${proxyOut.proxyPath ? "yes" : proxyOut.proxySkipped}`);
    return { outcome: "ready", detail: proxyOut.proxySkipped ?? "proxy generated" };
  } catch (err) {
    log(`failed ${fileId}: ${scrub(err?.message)}`);
    // partial derivative cleanup — a half-written proxy must never be left behind
    await bucket.file(proxyPath).delete({ ignoreNotFound: true }).catch(() => {});
    return await fail("failed", err?.code === "TIMEOUT" ? "Processing timed out." : err?.message || "Processing failed.");
  } finally {
    clearInterval(beat);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
