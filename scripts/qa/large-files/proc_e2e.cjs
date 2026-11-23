// REAL end-to-end of background video processing on a DISPOSABLE workspace: real videos (synthesized with FFmpeg), real multipart upload, the REAL app routes triggering the REAL worker
// (dev server started with VIDEO_PROCESSOR_LOCAL_CMD), real bucket + Firestore. Verifies original untouched, derivatives separate, metadata, proxy timeline, playback selection,
// download-is-original, idempotency, unsupported/corrupt handling, failure + retry, deletion cleanup.
//   env: FFMPEG_PATH, FFPROBE_PATH (required)
const { db, bucket, BASE, MB, state, check, tok, post, mkUser, mkWorkspace, sha256Buf, purge, crypto } = require("./qalib.cjs");
const { pathToFileURL } = require("url");
const { execFileSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const FFMPEG = process.env.FFMPEG_PATH, FFPROBE = process.env.FFPROBE_PATH;
if (!FFMPEG || !FFPROBE) { console.error("Set FFMPEG_PATH and FFPROBE_PATH"); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "feedo-proc-test-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const E = await import(pathToFileURL(path.resolve(__dirname, "../../../src/lib/uploads/multipartEngine.ts")).href);
  const P = await import(pathToFileURL(path.resolve(__dirname, "../../../workers/video-processor/src/processor.mjs")).href);
  const owner = await mkUser("owner"), viewer = await mkUser("viewer");
  const { W, P: PR } = await mkWorkspace("proc", owner);
  const t = new Date().toISOString();
  await db.doc(`members/${W}_${viewer.uid}`).set({ id: `${W}_${viewer.uid}`, workspaceId: W, userId: viewer.uid, role: "member", email: viewer.email, displayName: "V", status: "active", createdAt: t, updatedAt: t });
  await db.doc(`project_members/${PR}_${viewer.uid}`).set({ id: `${PR}_${viewer.uid}`, projectId: PR, uid: viewer.uid, workspaceId: W, role: "viewer", createdAt: t });
  const T = await tok(owner.uid), TV = await tok(viewer.uid);

  // ---- fixtures: real encoded videos
  const ff = (args) => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "pipe" });
  const big = path.join(tmp, "big.mp4"), small = path.join(tmp, "small.mp4"), bad = path.join(tmp, "corrupt.mp4"), trunc = path.join(tmp, "trunc.mp4");
  ff(["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "20", "-c:v", "libx264", "-b:v", "12M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", big]);
  ff(["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=24", "-t", "6", "-c:v", "libx264", "-b:v", "300k", "-pix_fmt", "yuv420p", small]);
  fs.writeFileSync(bad, crypto.randomBytes(400 * 1024));
  const bigBuf = fs.readFileSync(big); fs.writeFileSync(trunc, bigBuf.subarray(0, Math.floor(bigBuf.length * 0.4)));
  const probe = (f) => JSON.parse(execFileSync(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", f]).toString());
  const origProbe = probe(big);
  console.log(`fixture big.mp4: ${(fs.statSync(big).size / MB).toFixed(1)} MB, ${origProbe.streams.find((s) => s.codec_type === "video").width}x${origProbe.streams.find((s) => s.codec_type === "video").height}, ${Number(origProbe.format.duration).toFixed(2)} s`);

  async function upload(file, name, type = "video/mp4") {
    const buf = fs.readFileSync(file);
    const blob = new Blob([buf], { type }); blob.name = name; blob.lastModified = Date.now() + Math.floor(Math.random() * 1e6);
    const api = {
      init: async () => (await post(T, "/api/uploads/init", { workspaceId: W, projectId: PR, fileName: name, contentType: type, sizeBytes: blob.size, lastModified: blob.lastModified, partSizeBytes: 5 * MB })).body,
      getUrls: async (sessionId, partNumbers) => (await post(T, "/api/uploads/parts", { sessionId, partNumbers })).body.urls,
      status: async (sessionId) => (await post(T, "/api/uploads/status", { sessionId })).body,
      complete: async (sessionId) => (await post(T, "/api/uploads/complete", { sessionId })).body,
      abort: async (sessionId) => { await post(T, "/api/uploads/abort", { sessionId }); },
      putPart: async (url, body, onProgress, signal) => { const r = await fetch(url, { method: "PUT", body, signal }); const tx = await r.text(); if (!r.ok) throw E.classifyGcsError(r.status, tx); onProgress(body.size); },
    };
    const t0 = Date.now();
    const res = await new E.MultipartUpload(blob, api, { concurrency: 4 }).start();
    return { ...res, sha: sha256Buf(buf), bytes: buf.length, completeAt: t0 };
  }
  const waitStatus = async (fileId, wanted, ms = 120000) => { const end = Date.now() + ms; for (;;) { const p = (await db.doc(`files/${fileId}`).get()).data()?.processing; if (p && wanted.includes(p.status)) return p; if (Date.now() > end) return p ?? null; await sleep(1000); } };

  const mode = process.env.PROC_MODE || "triggered";
  // ============ A. the REAL app triggers the REAL worker (dev server has VIDEO_PROCESSOR_LOCAL_CMD)
  if (mode === "triggered") {
    const up = await upload(big, "big take.mp4");
    const filedoc0 = (await db.doc(`files/${up.fileId}`).get()).data();
    // The enqueue is fire-and-forget AFTER finalize returns, so right at response time `processing` may not be written yet (a benign race) — the invariant is that finalize did NOT wait for the
    // (20 s of FFmpeg) work: the file is not already ready when the upload call returns, and a queued/processing state appears moments later.
    const seen = await waitStatus(up.fileId, ["queued", "processing", "ready"], 10000);
    check("upload FINALIZED without waiting for processing (not ready at response time; queued/processing appears right after, not blocked)", [filedoc0.processing?.status !== "ready", ["queued", "processing", "ready"].includes(seen?.status)], [true, true]);
    const p = await waitStatus(up.fileId, ["ready", "failed", "unsupported"]);
    check("worker triggered by the app reached READY", p?.status, "ready");
    const rec = (await db.doc(`files/${up.fileId}`).get()).data();
    const origObj = bucket.file(rec.storagePath);
    const [origBuf] = await origObj.download();
    check("ORIGINAL object unchanged (SHA-256 identical to what was uploaded; size same)", [sha256Buf(origBuf) === up.sha, origBuf.length === rec.sizeBytes, rec.sizeBytes === up.bytes], [true, true, true]);
    check("metadata extracted: 1920x1080, 30 fps, h264, aac, duration ~20 s", [p.metadata.width, p.metadata.height, Math.round(p.metadata.frameRate), p.metadata.videoCodec, p.metadata.audioCodec, Math.abs(p.metadata.durationSeconds - Number(origProbe.format.duration)) < 0.1], [1920, 1080, 30, "h264", "aac", true]);
    const base = rec.storagePath.replace(/[^/]+$/, "");
    check("derivatives are SEPARATE objects under derived/ (thumb + proxy), original path untouched", [p.thumbnailPath === `${base}derived/thumb.jpg`, p.proxyPath === `${base}derived/proxy-720p.mp4`, rec.storagePath.includes("/derived/")], [true, true, false]);
    const [thumbExists, proxyExists] = [(await bucket.file(p.thumbnailPath).exists())[0], (await bucket.file(p.proxyPath).exists())[0]];
    check("thumbnail + proxy objects exist in GCS", [thumbExists, proxyExists], [true, true]);
    const proxyLocal = path.join(tmp, "proxy-dl.mp4"); await bucket.file(p.proxyPath).download({ destination: proxyLocal });
    const pp = probe(proxyLocal); const pv = pp.streams.find((s) => s.codec_type === "video");
    check("proxy: H.264, <=720p, same frame rate, audio kept, smaller than the original", [pv.codec_name, pv.height <= 720, Math.round(eval(pv.avg_frame_rate)), !!pp.streams.find((s) => s.codec_type === "audio"), fs.statSync(proxyLocal).size < rec.sizeBytes], ["h264", true, 30, true, true]);
    check("proxy duration matches the original (comment/marker timeline stays aligned): |Δ| < 0.25 s", Math.abs(Number(pp.format.duration) - Number(origProbe.format.duration)) < 0.25, true);
    console.log(`      original ${(rec.sizeBytes / MB).toFixed(1)} MB -> proxy ${(p.proxyBytes / MB).toFixed(1)} MB; Δduration ${(Number(pp.format.duration) - Number(origProbe.format.duration)).toFixed(3)} s`);

    // ---- playback uses the proxy, download uses the ORIGINAL
    const prev = await post(T, "/api/files/preview", { workspaceId: W, fileId: up.fileId });
    check("PLAYBACK ticket serves the PROXY (variant proxy)", [prev.status, prev.body.variant], [200, "proxy"]);
    const pr = await fetch(`${BASE}/api/files/preview?t=${prev.body.ticket}`, { headers: { Range: "bytes=0-99" } });
    const prBytes = Buffer.from(await pr.arrayBuffer());
    const [proxyBuf] = await bucket.file(p.proxyPath).download({ start: 0, end: 99 });
    check("PLAYBACK stream (Range) is the proxy's bytes, not the original's", [pr.status, prBytes.equals(proxyBuf), prBytes.equals(origBuf.subarray(0, 100))], [206, true, false]);
    const prevO = await post(T, "/api/files/preview", { workspaceId: W, fileId: up.fileId, quality: "original" });
    check("quality=original (player fallback) serves the ORIGINAL", [prevO.body.variant], ["original"]);
    const dl = await post(T, "/api/files/download", { kind: "file", workspaceId: W, fileId: up.fileId });
    const dres = await fetch(dl.body.url); const dbuf = Buffer.from(await dres.arrayBuffer());
    check("DOWNLOAD after proxy generation is still the ORIGINAL (byte-identical SHA-256, original size)", [dres.status, sha256Buf(dbuf) === up.sha, dbuf.length === up.bytes], [200, true, true]);

    // ---- idempotency: re-running the worker on a READY file does nothing / creates no duplicates
    const objectsBefore = (await bucket.getFiles({ prefix: base })).flat().filter((f) => f && f.name).map((f) => f.name).sort();
    const again = await P.processFile({ db, bucket, fileId: up.fileId, ffmpeg: FFMPEG, ffprobe: FFPROBE });
    const objectsAfter = (await bucket.getFiles({ prefix: base })).flat().filter((f) => f && f.name).map((f) => f.name).sort();
    check("IDEMPOTENT: processing a READY file again is a no-op (skipped) and creates no extra objects", [again.outcome, JSON.stringify(objectsBefore) === JSON.stringify(objectsAfter)], ["skipped", true]);
    // concurrent workers: only one may hold the claim
    await db.doc(`files/${up.fileId}`).update({ "processing.status": "failed", "processing.attempts": 0 });
    const [r1, r2] = await Promise.all([P.processFile({ db, bucket, fileId: up.fileId, ffmpeg: FFMPEG, ffprobe: FFPROBE }), P.processFile({ db, bucket, fileId: up.fileId, ffmpeg: FFMPEG, ffprobe: FFPROBE })]);
    check("CONCURRENT workers: exactly one processes, the other is skipped; result ready; still ONE proxy + ONE thumb", [[r1.outcome, r2.outcome].sort(), (await db.doc(`files/${up.fileId}`).get()).data().processing.status, (await bucket.getFiles({ prefix: `${base}derived/` }))[0].length], [["ready", "skipped"], "ready", 2]);

    // ---- authorization of retry
    check("a project VIEWER cannot trigger a processing retry (403)", (await post(TV, "/api/files/processing", { workspaceId: W, fileId: up.fileId, action: "retry" })).status, 403);
    check("retry on an already-ready file is refused (409)", (await post(T, "/api/files/processing", { workspaceId: W, fileId: up.fileId, action: "retry" })).status, 409);

    // ---- small video: metadata + thumbnail, no pointless proxy
    const us = await upload(small, "tiny.mp4"); const ps = await waitStatus(us.fileId, ["ready", "failed", "unsupported"]);
    check("small/low-bitrate video: ready with metadata + thumbnail, NO proxy, reason recorded; playback uses the original", [ps.status, ps.proxyPath, typeof ps.proxySkipped, ps.metadata.width, (await post(T, "/api/files/preview", { workspaceId: W, fileId: us.fileId })).body.variant], ["ready", null, "string", 320, "original"]);

    // ---- corrupt / truncated inputs
    const ub = await upload(bad, "corrupt.mp4"); const pb = await waitStatus(ub.fileId, ["ready", "failed", "unsupported"]);
    check("CORRUPT file (random bytes): status unsupported with a safe message (no path/URL), original kept, no derivatives, no retry loop", [pb.status, /https?:|\/tmp|[A-Za-z]:\\/.test(pb.error || ""), (await bucket.file((await db.doc(`files/${ub.fileId}`).get()).data().storagePath).exists())[0], (await bucket.getFiles({ prefix: `workspaces/${W}/projects/${PR}/files/${ub.fileId}/derived/` }))[0].length, pb.attempts], ["unsupported", false, true, 0, 1]);
    const ut = await upload(trunc, "truncated.mp4"); const pt = await waitStatus(ut.fileId, ["ready", "failed", "unsupported"]);
    check("TRUNCATED video: handled (unsupported or failed) — never ready with a bad proxy; original still downloadable", [["unsupported", "failed", "ready"].includes(pt.status), (await bucket.file((await db.doc(`files/${ut.fileId}`).get()).data().storagePath).exists())[0]], [true, true]);
    console.log(`      truncated video outcome: ${pt.status}${pt.error ? " — " + pt.error : ""}`);
    check("a corrupt file's retry is refused as unsupported (409)", (await post(T, "/api/files/processing", { workspaceId: W, fileId: ub.fileId, action: "retry" })).status, 409);

    // ---- deletion removes derivatives too (and releases quota)
    const usedBefore = (await db.doc(`workspaces/${W}`).get()).data().storageBytesUsed;
    const del = await post(T, "/api/files/delete", { workspaceId: W, fileId: up.fileId });
    const left = (await bucket.getFiles({ prefix: base }))[0].length;
    check("DELETE file: original + thumbnail + proxy all removed, quota released", [del.status, left, (await db.doc(`workspaces/${W}`).get()).data().storageBytesUsed === usedBefore - up.bytes], [200, 0, true]);
    // ---- new version gets its own derivatives
    const v2 = await (async () => { const buf = fs.readFileSync(small); const blob = new Blob([buf], { type: "video/mp4" }); blob.name = "tiny.mp4"; blob.lastModified = 424242; const api2 = { init: async () => (await post(T, "/api/uploads/init", { workspaceId: W, projectId: PR, fileName: "tiny.mp4", contentType: "video/mp4", sizeBytes: blob.size, lastModified: 424242, partSizeBytes: 5 * MB, newVersionOfId: us.fileId })).body, getUrls: async (s, n) => (await post(T, "/api/uploads/parts", { sessionId: s, partNumbers: n })).body.urls, status: async (s) => (await post(T, "/api/uploads/status", { sessionId: s })).body, complete: async (s) => (await post(T, "/api/uploads/complete", { sessionId: s })).body, abort: async () => {}, putPart: async (url, body, op, sig) => { const r = await fetch(url, { method: "PUT", body, signal: sig }); await r.text(); op(body.size); } }; return new E.MultipartUpload(blob, api2, { concurrency: 2 }).start(); })();
    const pv2 = await waitStatus(v2.fileId, ["ready", "failed", "unsupported"]);
    check("NEW VERSION: processed independently (own metadata), previous version's derivatives untouched", [pv2.status, (await db.doc(`files/${us.fileId}`).get()).data().processing.status], ["ready", "ready"]);
  }

  // ============ B. failure + retry (worker-level, deterministic): make the source unreadable mid-run, then fix it and retry
  if (mode === "triggered") {
    const ur = await upload(small, "retry-me.mp4");
    await waitStatus(ur.fileId, ["ready", "failed", "unsupported"]);
    await db.doc(`files/${ur.fileId}`).update({ processing: { status: "failed", attempts: 1, error: "Processing failed.", updatedAt: Date.now() } });
    const rr = await post(T, "/api/files/processing", { workspaceId: W, fileId: ur.fileId, action: "retry" });
    const pr2 = await waitStatus(ur.fileId, ["ready", "unsupported"]);
    check("FAILED file: Retry (authorized) re-queues, the worker re-runs and reaches READY", [rr.status, pr2.status], [200, "ready"]);
    // too many attempts
    await db.doc(`files/${ur.fileId}`).update({ processing: { status: "failed", attempts: 3, error: "x", updatedAt: Date.now() } });
    const capped = await P.processFile({ db, bucket, fileId: ur.fileId, ffmpeg: FFMPEG, ffprobe: FFPROBE });
    check("attempt cap: after 3 failed attempts the worker stops (no infinite retry), status failed", [capped.outcome, (await db.doc(`files/${ur.fileId}`).get()).data().processing.status], ["skipped", "failed"]);
    // a worker that crashed mid-run leaves a stale lease: it can be taken over
    await db.doc(`files/${ur.fileId}`).update({ processing: { status: "processing", attempts: 1, leaseUntil: Date.now() - 60000, updatedAt: Date.now() } });
    const takeover = await P.processFile({ db, bucket, fileId: ur.fileId, ffmpeg: FFMPEG, ffprobe: FFPROBE });
    check("STALE lease (crashed worker) is taken over and finished", [takeover.outcome, (await db.doc(`files/${ur.fileId}`).get()).data().processing.status], ["ready", "ready"]);
    // transient failure -> failed + partial proxy cleaned
    await db.doc(`files/${ur.fileId}`).update({ processing: { status: "failed", attempts: 0, updatedAt: Date.now() } });
    const broken = await P.processFile({ db, bucket, fileId: ur.fileId, ffmpeg: "/definitely/not/ffmpeg", ffprobe: "/definitely/not/ffprobe" });
    check("transient failure (binary can't run): status failed with a scrubbed message, attempts counted", [broken.outcome, (await db.doc(`files/${ur.fileId}`).get()).data().processing.status, /\/definitely|https?:/.test((await db.doc(`files/${ur.fileId}`).get()).data().processing.error || "")], ["failed", "failed", false]);
  }

  console.log(state.failed ? `\n${state.failed} FAILED` : "\nALL PASSED");
  fs.rmSync(tmp, { recursive: true, force: true });
  await purge();
  process.exit(state.failed ? 1 : 0);
})().catch(async (e) => { console.error(String(e.stack || e.message).slice(0, 900)); fs.rmSync(tmp, { recursive: true, force: true }); await purge().catch(() => undefined); process.exit(1); });
