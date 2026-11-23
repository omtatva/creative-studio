// REAL large-file benchmark: a FILE-BACKED source (fs.openAsBlob — slices come from disk like a browser File, nothing is held in memory), uploaded with the real multipart
// engine at several concurrencies, then downloaded back from GCS (direct signed URL) with a streaming SHA-256. Measures upload speed, download speed, retries, init/finalize
// time, peak process memory and integrity. One run per (size, concurrency); results appended to bench_large.json.
//   BENCH_GB=1 BENCH_CONC=4,2,8,6 BENCH_PART_MB=64 node bench_large.cjs
const { db, bucket, BASE, MB, state, tok, post, mkUser, mkWorkspace, purge, crypto } = require("./qalib.cjs");
const { pathToFileURL } = require("url");
const fs = require("fs"), os = require("os"), path = require("path");
const GB = Number(process.env.BENCH_GB || 1);
// Either BENCH_CONC (list) + BENCH_PART_MB, or an explicit BENCH_CONFIGS="conc:partMB,conc:partMB,..." run in order, BENCH_REPS times (rep-major, so configurations interleave and network drift is spread across them).
const CONFIGS = process.env.BENCH_CONFIGS ? process.env.BENCH_CONFIGS.split(",").map((x) => x.split(":").map(Number)) : (process.env.BENCH_CONC || "4,2,8,6").split(",").map((c) => [Number(c), Number(process.env.BENCH_PART_MB || 64)]);
const REPS = Number(process.env.BENCH_REPS || 1);
const OUT = path.join(__dirname, process.env.BENCH_OUT || "bench_large.json");

/** A file-backed source that works above 4 GiB (Node's fs.openAsBlob wraps sizes past 2^32). Only what the engine uses: `size` and `slice()` (each part is read from disk on demand — a browser File behaves the same way). */
class DiskBlob {
  constructor(file, size, name, lastModified) { this.file = file; this.size = size; this.name = name; this.lastModified = lastModified; this.type = "video/mp4"; }
  /** A LAZY view of [a, b): nothing is read until the transport streams it — exactly how a browser File slice behaves (bounded memory regardless of file size). */
  slice(a = 0, b = this.size) {
    const file = this.file, end = Math.min(b, this.size), len = Math.max(0, end - a);
    return { size: len, fsStream: () => fs.createReadStream(file, { start: a, end: end - 1, highWaterMark: 1024 * 1024 }) };
  }
}

async function makeFile(file, bytes) {
  const h = crypto.createHash("sha256");
  const fd = fs.openSync(file, "w");
  const chunk = Buffer.alloc(8 * MB);
  for (let written = 0; written < bytes; ) {
    const n = Math.min(chunk.length, bytes - written);
    crypto.randomFillSync(chunk, 0, n);
    fs.writeSync(fd, chunk, 0, n); h.update(chunk.subarray(0, n)); written += n;
  }
  fs.closeSync(fd);
  return h.digest("hex");
}

(async () => {
  const E = await import(pathToFileURL(path.resolve(__dirname, "../../../src/lib/uploads/multipartEngine.ts")).href);
  const owner = await mkUser("owner");
  const { W, P } = await mkWorkspace("lbench", owner);
  const T = await tok(owner.uid);
  const bytes = Math.round(GB * 1024 * MB);
  const file = path.join(os.tmpdir(), `feedo-bench-${GB}gb.bin`);
  const t0 = Date.now();
  const srcSha = await makeFile(file, bytes);
  console.log(`generated ${GB} GB source on disk in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : [];
  let peakRss = 0; const mem = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 500);

  const plan = []; for (let rep = 1; rep <= REPS; rep++) for (const [c, partMb] of CONFIGS) plan.push({ c, partMb, rep });
  for (const { c, partMb, rep } of plan) {
    const PART_MB = partMb;
    const blob = new DiskBlob(file, bytes, `bench-${GB}gb-c${c}-p${PART_MB}-r${rep}.mp4`, 1000 + plan.indexOf(plan.find((p) => p.c === c && p.partMb === partMb && p.rep === rep)) + Date.now() % 100000);
    if (blob.size !== bytes) throw new Error("source size mismatch");
    const baseRss = process.memoryUsage().rss; peakRss = baseRss;
    const api = {
      init: async () => { const r = await post(T, "/api/uploads/init", { workspaceId: W, projectId: P, fileName: blob.name, contentType: "video/mp4", sizeBytes: blob.size, lastModified: blob.lastModified, partSizeBytes: PART_MB * MB }); if (r.status !== 200) throw new Error(`init ${r.status} ${JSON.stringify(r.body)}`); return r.body; },
      getUrls: async (sessionId, partNumbers) => (await post(T, "/api/uploads/parts", { sessionId, partNumbers })).body.urls,
      status: async (sessionId) => (await post(T, "/api/uploads/status", { sessionId })).body,
      complete: async (sessionId) => { const r = await post(T, "/api/uploads/complete", { sessionId }); if (r.status !== 200) throw new Error(`complete ${r.status} ${JSON.stringify(r.body)}`); return r.body; },
      abort: async (sessionId) => { await post(T, "/api/uploads/abort", { sessionId }); },
      putPart: async (url, body, onProgress, signal) => { const res = await fetch(url, { method: "PUT", body: body.fsStream(), duplex: "half", headers: { "Content-Length": String(body.size) }, signal }); const text = await res.text(); if (!res.ok) throw E.classifyGcsError(res.status, text); onProgress(body.size); },
    };
    const row = { harness: "streaming-from-disk", rep, sizeGB: GB, concurrency: c, partMB: PART_MB, at: new Date().toISOString() };
    try {
      const wall0 = Date.now();
      const up = await new E.MultipartUpload(blob, api, { concurrency: c }).start();
      row.uploadSec = +(up.uploadMs / 1000).toFixed(1); row.uploadMBps = +((bytes / MB) / (up.uploadMs / 1000)).toFixed(2); row.uploadMbps = +(row.uploadMBps * 8).toFixed(0);
      row.peakMBps = +(up.peakBps / MB).toFixed(1); row.retries = up.retries; row.parts = up.partTimings.length; row.initMs = up.initMs; row.finalizeMs = up.finalizeMs; row.wallSec = +((Date.now() - wall0) / 1000).toFixed(1);
      row.peakRssMB = +(peakRss / MB).toFixed(0); row.rssGrowthMB = +((peakRss - baseRss) / MB).toFixed(0);
      const dl = await post(T, "/api/files/download", { kind: "file", workspaceId: W, fileId: up.fileId });
      const d0 = Date.now(); const res = await fetch(dl.body.url); const h = crypto.createHash("sha256"); let got = 0;
      for await (const chunk of res.body) { h.update(chunk); got += chunk.length; }
      const dSec = (Date.now() - d0) / 1000;
      row.downloadSec = +dSec.toFixed(1); row.downloadMBps = +((got / MB) / dSec).toFixed(2); row.downloadMbps = +(row.downloadMBps * 8).toFixed(0);
      const rec = (await db.doc(`files/${up.fileId}`).get()).data();
      const [meta] = await bucket.file(rec.storagePath).getMetadata();
      row.sourceBytes = fs.statSync(file).size; row.objectBytes = Number(meta.size); row.recordBytes = rec.sizeBytes; row.downloadedBytes = got;
      row.sizeMatch = got === bytes && row.sourceBytes === bytes && row.objectBytes === bytes && row.recordBytes === bytes; row.sha256Match = h.digest("hex") === srcSha;
      await post(T, "/api/files/delete", { workspaceId: W, fileId: up.fileId });
    } catch (e) { row.error = String(e.message).slice(0, 200); }
    results.push(row); fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
    console.log(JSON.stringify(row));
  }
  clearInterval(mem);
  fs.unlinkSync(file);
  await purge();
  process.exit(0);
})().catch(async (e) => { console.error(String(e.stack || e.message).slice(0, 800)); await purge().catch(() => undefined); process.exit(1); });
