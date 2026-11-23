// LATENCY audit of every step of the multipart upload path, one at a time (no parallel bandwidth competition):
//   ALPN/HTTP version at storage.googleapis.com, connection reuse during an upload, local signing cost, /api/uploads/{init,parts,complete} latency (p50/p95), small-part PUT latency (RTT-bound),
//   and object availability after completion. Disposable workspace; results -> latency_diag.json
const { db, bucket, BASE, MB, state, tok, post, mkUser, mkWorkspace, purge, crypto } = require("./qalib.cjs");
const { pathToFileURL } = require("url");
const http2 = require("http2"), dc = require("diagnostics_channel"), tls = require("tls");
const fs = require("fs"), path = require("path");
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const stats = (a) => ({ n: a.length, p50: Math.round(pct(a, 50)), p95: Math.round(pct(a, 95)), min: Math.round(Math.min(...a)), max: Math.round(Math.max(...a)) });
const out = {};

(async () => {
  const E = await import(pathToFileURL(path.resolve(__dirname, "../../../src/lib/uploads/multipartEngine.ts")).href);

  // ---- 1. which HTTP version does GCS negotiate? (ALPN)
  out.alpn = await new Promise((resolve) => { const s = tls.connect({ host: "storage.googleapis.com", port: 443, servername: "storage.googleapis.com", ALPNProtocols: ["h2", "http/1.1"] }, () => { resolve({ negotiated: s.alpnProtocol, tlsVersion: s.getProtocol() }); s.end(); }); s.on("error", (e) => resolve({ error: e.message })); });
  const h2 = await new Promise((resolve) => { const c = http2.connect("https://storage.googleapis.com"); c.on("connect", () => { resolve({ h2: true, maxConcurrentStreams: c.remoteSettings?.maxConcurrentStreams ?? null }); c.close(); }); c.on("error", (e) => resolve({ h2: false, error: e.message })); });
  out.http2 = h2;
  console.log("ALPN:", JSON.stringify(out.alpn), "| HTTP/2:", JSON.stringify(h2));

  // ---- 2. local V4 signing cost
  const times = [];
  for (let i = 0; i < 100; i++) { const t = performance.now(); await bucket.file(`qa-bw/sign-${i}`).getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 60000, queryParams: { partNumber: "1", uploadId: "x" } }); times.push(performance.now() - t); }
  out.localSigningMs = stats(times);
  console.log("local V4 signing (key in memory):", JSON.stringify(out.localSigningMs));

  // ---- 3. route latencies + 4. connection reuse during a real upload
  const owner = await mkUser("owner");
  const { W, P } = await mkWorkspace("lat", owner);
  const T = await tok(owner.uid);
  const connects = []; dc.subscribe("undici:client:connected", (m) => connects.push(m.connectParams?.host ?? "?")); dc.subscribe("undici:client:sendHeaders", () => {});
  const lat = { init: [], parts: [], status: [], complete: [], putPart: [] };
  const timed = async (bucketKey, fn) => { const t = performance.now(); const r = await fn(); lat[bucketKey].push(performance.now() - t); return r; };

  const SIZE = 96 * MB, PART = 8 * MB;     // 12 parts
  const buf = crypto.randomBytes(SIZE); const blob = new Blob([buf], { type: "video/mp4" }); blob.name = "lat.mp4"; blob.lastModified = 1;
  const api = {
    init: async () => timed("init", async () => (await post(T, "/api/uploads/init", { workspaceId: W, projectId: P, fileName: "lat.mp4", contentType: "video/mp4", sizeBytes: blob.size, lastModified: 1, partSizeBytes: PART })).body),
    getUrls: async (sessionId, partNumbers) => timed("parts", async () => (await post(T, "/api/uploads/parts", { sessionId, partNumbers })).body.urls),
    status: async (sessionId) => timed("status", async () => (await post(T, "/api/uploads/status", { sessionId })).body),
    complete: async (sessionId) => timed("complete", async () => (await post(T, "/api/uploads/complete", { sessionId })).body),
    abort: async () => {},
    putPart: async (url, body, onProgress, signal) => timed("putPart", async () => { const r = await fetch(url, { method: "PUT", body, signal }); const t = await r.text(); if (!r.ok) throw E.classifyGcsError(r.status, t); onProgress(body.size); }),
  };
  const before = connects.length;
  const res = await new E.MultipartUpload(blob, api, { concurrency: 4 }).start();
  out.upload = { sizeMB: SIZE / MB, partMB: PART / MB, parts: res.partTimings.length, initMs: res.initMs, uploadMs: res.uploadMs, finalizeMs: res.finalizeMs, MBps: +((SIZE / MB) / (res.uploadMs / 1000)).toFixed(2) };
  out.routeLatencyMs = Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, v.length ? stats(v) : null]));
  out.newConnectionsForOneUpload = connects.length - before;
  console.log("upload:", JSON.stringify(out.upload));
  console.log("route/part latency (ms):", JSON.stringify(out.routeLatencyMs));
  console.log("new TCP/TLS connections opened by the Node client during 12 parts at concurrency 4:", out.newConnectionsForOneUpload);

  // ---- 5. object availability after completion (strong consistency?)
  const rec = (await db.doc(`files/${res.fileId}`).get()).data();
  const t0 = performance.now(); let tries = 0, ok = false;
  while (!ok && tries < 50) { tries++; const [exists] = await bucket.file(rec.storagePath).exists(); ok = exists; if (!ok) await new Promise((r) => setTimeout(r, 50)); }
  out.availabilityAfterComplete = { readableAfterMs: Math.round(performance.now() - t0), attempts: tries };
  console.log("object readable after complete:", JSON.stringify(out.availabilityAfterComplete));

  // ---- 6. RTT-bound small PUTs (1 part = 5 MiB min) sequential on a kept-alive connection vs a fresh connection each
  const sessionUrls = [];
  const sess = await post(T, "/api/uploads/init", { workspaceId: W, projectId: P, fileName: "rtt.mp4", contentType: "video/mp4", sizeBytes: 5 * MB * 10, lastModified: 2, partSizeBytes: 5 * MB });
  const urls = (await post(T, "/api/uploads/parts", { sessionId: sess.body.sessionId, partNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] })).body.urls;
  const small = Buffer.alloc(5 * MB, 1); const seqT = [];
  for (const u of urls.slice(0, 5)) { const t = performance.now(); const r = await fetch(u.url, { method: "PUT", body: small }); await r.text(); seqT.push(performance.now() - t); }
  out.sequential5MiBPutMs = stats(seqT);
  await post(T, "/api/uploads/abort", { sessionId: sess.body.sessionId });
  console.log("sequential 5 MiB part PUT (ms):", JSON.stringify(out.sequential5MiBPutMs), `=> ${(5 / (pct(seqT, 50) / 1000)).toFixed(1)} MB/s per connection`);

  fs.writeFileSync(path.join(__dirname, "latency_diag.json"), JSON.stringify(out, null, 1));
  await purge();
  process.exit(0);
})().catch(async (e) => { console.error(String(e.stack || e.message).slice(0, 700)); await purge().catch(() => undefined); process.exit(1); });
