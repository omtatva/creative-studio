// REAL large-file download benchmark + interruption/Range recovery. Uploads a file with the multipart engine, then downloads the ORIGINAL
//   (a) directly from GCS via the signed URL the app issues, and (b) through the app's proxied ticket stream (for comparison),
// hashing the bytes as they STREAM (never buffering the whole file), and finally simulates an interrupted download and resumes it with an HTTP Range request.
const { db, bucket, BASE, MB, state, check, tok, post, mkUser, mkWorkspace, purge, crypto } = require("./qalib.cjs");
const { pathToFileURL } = require("url");
const SIZE_MB = Number(process.env.BENCH_MB || 128);

async function streamHash(res, { stopAfter } = {}) {
  const h = crypto.createHash("sha256");
  let bytes = 0;
  const t0 = Date.now();
  for await (const chunk of res.body) {
    h.update(chunk); bytes += chunk.length;
    if (stopAfter && bytes >= stopAfter) break;
  }
  return { bytes, ms: Date.now() - t0, hash: h, hex: () => h.copy().digest("hex") };
}

(async () => {
  const E = await import(pathToFileURL(require("path").resolve(__dirname, "../../../src/lib/uploads/multipartEngine.ts")).href);
  const owner = await mkUser("owner");
  const { W, P } = await mkWorkspace("dlb", owner);
  const T = await tok(owner.uid);
  const buf = crypto.randomBytes(SIZE_MB * MB);
  const srcSha = crypto.createHash("sha256").update(buf).digest("hex");
  const blob = new Blob([buf], { type: "video/mp4" }); blob.name = "original take.mp4"; blob.lastModified = 5;
  const api = {
    init: async () => (await post(T, "/api/uploads/init", { workspaceId: W, projectId: P, fileName: blob.name, contentType: "video/mp4", sizeBytes: blob.size, lastModified: 5, partSizeBytes: 16 * MB })).body,
    getUrls: async (sessionId, partNumbers) => (await post(T, "/api/uploads/parts", { sessionId, partNumbers })).body.urls,
    status: async (sessionId) => (await post(T, "/api/uploads/status", { sessionId })).body,
    complete: async (sessionId) => (await post(T, "/api/uploads/complete", { sessionId })).body,
    abort: async (sessionId) => { await post(T, "/api/uploads/abort", { sessionId }); },
    putPart: async (url, body, onProgress, signal) => { const r = await fetch(url, { method: "PUT", body, signal }); const t = await r.text(); if (!r.ok) throw E.classifyGcsError(r.status, t); onProgress(body.size); },
  };
  const up = await new E.MultipartUpload(blob, api, { concurrency: 4 }).start();
  console.log(`uploaded ${SIZE_MB} MB via multipart: upload ${(up.uploadMs / 1000).toFixed(1)} s = ${(SIZE_MB / (up.uploadMs / 1000)).toFixed(2)} MB/s`);

  const dl = await post(T, "/api/files/download", { kind: "file", workspaceId: W, fileId: up.fileId });
  check("download issued as a DIRECT signed URL", [typeof dl.body.url, dl.body.direct], ["string", true]);

  // (a) direct from GCS, streamed + hashed
  const res = await fetch(dl.body.url);
  const direct = await streamHash(res);
  const hdr = Object.fromEntries(["content-type", "content-disposition", "content-length", "accept-ranges", "x-goog-hash"].map((k) => [k, res.headers.get(k)]));
  check("DIRECT download: 200, exact size, SHA-256 identical to the uploaded original (streamed, never fully buffered)", [res.status, direct.bytes === blob.size, direct.hex() === srcSha], [200, true, true]);
  check("DIRECT download headers: video/mp4, attachment with the original name, Accept-Ranges bytes", [hdr["content-type"], /^attachment;.*original take\.mp4/.test(hdr["content-disposition"] || ""), hdr["accept-ranges"]], ["video/mp4", true, "bytes"]);
  console.log(`      DIRECT: ${(direct.bytes / MB).toFixed(0)} MB in ${(direct.ms / 1000).toFixed(1)} s = ${(direct.bytes / MB / (direct.ms / 1000)).toFixed(2)} MB/s (${(direct.bytes * 8 / 1e6 / (direct.ms / 1000)).toFixed(0)} Mbps)`);

  // (b) the proxied path for comparison: mint a ticket exactly as the POST route's fallback would, redeem it through the app
  const rec = (await db.doc(`files/${up.fileId}`).get()).data();
  const ticket = crypto.randomBytes(24).toString("hex");
  await db.doc(`download_tickets/${ticket}`).set({ uid: owner.uid, workspaceId: W, projectId: P, storagePath: rec.storagePath, fileName: rec.fileName, contentType: rec.contentType, expiresAt: Date.now() + 60000, expireAt: new Date(Date.now() + 3600000) });
  const pres = await fetch(`${BASE}/api/files/download?t=${ticket}`);
  const proxied = await streamHash(pres);
  check("PROXIED download (fallback path) is also byte-identical", [pres.status, proxied.hex() === srcSha], [200, true]);
  console.log(`      PROXIED via Next.js: ${(proxied.bytes / MB).toFixed(0)} MB in ${(proxied.ms / 1000).toFixed(1)} s = ${(proxied.bytes / MB / (proxied.ms / 1000)).toFixed(2)} MB/s`);

  // interruption + resume with Range (what a download manager / retrying client does)
  const dl2 = await post(T, "/api/files/download", { kind: "file", workspaceId: W, fileId: up.fileId });
  const r1 = await fetch(dl2.body.url);
  const cut = Math.floor(blob.size * 0.4);
  const part1 = await streamHash(r1, { stopAfter: cut });
  const got1 = part1.bytes; // we hold bytes [0, got1)
  try { await r1.body.cancel(); } catch { /* connection dropped */ }
  const dl3 = await post(T, "/api/files/download", { kind: "file", workspaceId: W, fileId: up.fileId }); // a fresh authorized URL (the first may have expired)
  const r2 = await fetch(dl3.body.url, { headers: { Range: `bytes=${got1}-` } });
  const crange = r2.headers.get("content-range");
  for await (const c of r2.body) part1.hash.update(c), (part1.bytes += c.length);
  check("INTERRUPTED download resumed with a Range request: 206, Content-Range correct, reassembled file SHA-256 identical to the original", [r2.status, crange === `bytes ${got1}-${blob.size - 1}/${blob.size}`, part1.bytes === blob.size, part1.hash.digest("hex") === srcSha], [206, true, true, true]);
  console.log(`      interruption at ${(got1 / MB).toFixed(1)} MB; resumed from byte ${got1} (${crange})`);

  // unauthorized
  const out = await mkUser("out"); const tOut = await tok(out.uid);
  check("unauthorized user cannot obtain a download URL (403)", (await post(tOut, "/api/files/download", { kind: "file", workspaceId: W, fileId: up.fileId })).status, 403);

  console.log(state.failed ? `\n${state.failed} FAILED` : "\nALL PASSED");
  await purge();
  process.exit(state.failed ? 1 : 0);
})().catch(async (e) => { console.error(String(e.stack || e.message).slice(0, 800)); await purge().catch(() => undefined); process.exit(1); });
