// REAL upload benchmark, same machine / network / bucket / file: classic Firebase web SDK uploadBytesResumable vs the multipart engine at several concurrencies.
// Interleaved so network drift shows up. Disposable workspace; everything deleted. Writes results to bench_up.json.
const { db, bucket, BASE, MB, state, tok, post, mkUser, mkWorkspace, sha256Buf, purge, now, crypto, env } = require("./qalib.cjs");
const { pathToFileURL } = require("url");
const fs = require("fs");
const SIZE_MB = Number(process.env.BENCH_MB || 96);
const PART_MB = Number(process.env.BENCH_PART_MB || 8);

(async () => {
  const E = await import(pathToFileURL(require("path").resolve(__dirname, "../../../src/lib/uploads/multipartEngine.ts")).href);
  const fbApp = await import(pathToFileURL(require("path").resolve(__dirname, "../../../node_modules/firebase/app/dist/index.mjs")).href);
  const fbAuth = await import(pathToFileURL(require("path").resolve(__dirname, "../../../node_modules/firebase/auth/dist/index.mjs")).href);
  const fbStorage = await import(pathToFileURL(require("path").resolve(__dirname, "../../../node_modules/firebase/storage/dist/index.mjs")).href);
  const cfg = { apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, appId: env.NEXT_PUBLIC_FIREBASE_APP_ID };
  const owner = await mkUser("owner");
  const { W, P } = await mkWorkspace("bench", owner);
  const T = await tok(owner.uid);
  const app = fbApp.initializeApp(cfg, "bench");
  const auth = fbAuth.getAuth(app);
  const authm = require(require("path").resolve(__dirname, "../../../node_modules/firebase-admin/lib/auth/index.js"));
  await fbAuth.signInWithCustomToken(auth, await authm.getAuth().createCustomToken(owner.uid));
  const storage = fbStorage.getStorage(app);

  const buf = crypto.randomBytes(SIZE_MB * MB);
  const blob = new Blob([buf], { type: "video/mp4" }); blob.name = "bench.mp4"; blob.lastModified = 1;
  const results = [];

  async function classic(label) {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const ref = fbStorage.ref(storage, `workspaces/${W}/projects/${P}/files/${id}/bench.mp4`);
    const t0 = Date.now(); let peak = 0, lastAt = t0, lastB = 0, events = 0;
    const task = fbStorage.uploadBytesResumable(ref, blob, { contentType: "video/mp4" });
    await new Promise((res, rej) => task.on("state_changed", (s) => { events++; const n = Date.now(); if (n - lastAt >= 2000) { peak = Math.max(peak, ((s.bytesTransferred - lastB) * 1000) / (n - lastAt)); lastAt = n; lastB = s.bytesTransferred; } }, rej, res));
    const ms = Date.now() - t0;
    results.push({ label, method: "classic-firebase-sdk", ms, avgMBps: +(SIZE_MB / (ms / 1000)).toFixed(2), peakMBps: +(peak / MB).toFixed(2), retries: 0 });
    await bucket.file(`workspaces/${W}/projects/${P}/files/${id}/bench.mp4`).delete({ ignoreNotFound: true });
  }
  async function multi(label, concurrency) {
    const api = (() => {
      const base = {
        init: async () => { const r = await post(T, "/api/uploads/init", { workspaceId: W, projectId: P, fileName: "bench.mp4", contentType: "video/mp4", sizeBytes: blob.size, lastModified: 1 + results.length, partSizeBytes: PART_MB * MB }); if (r.status !== 200) throw new Error(`init ${r.status} ${JSON.stringify(r.body)}`); return r.body; },
        getUrls: async (sessionId, partNumbers) => (await post(T, "/api/uploads/parts", { sessionId, partNumbers })).body.urls,
        status: async (sessionId) => (await post(T, "/api/uploads/status", { sessionId })).body,
        complete: async (sessionId) => { const r = await post(T, "/api/uploads/complete", { sessionId }); if (r.status !== 200) throw new Error(`complete ${r.status}`); return r.body; },
        abort: async (sessionId) => { await post(T, "/api/uploads/abort", { sessionId }); },
        putPart: async (url, body, onProgress, signal) => { const res = await fetch(url, { method: "PUT", body, signal }); const text = await res.text(); if (!res.ok) throw E.classifyGcsError(res.status, text); onProgress(body.size); },
      };
      return base;
    })();
    const t0 = Date.now();
    const r = await new E.MultipartUpload(blob, api, { concurrency, sleep: undefined }).start();
    const ms = Date.now() - t0;
    results.push({ label, method: `multipart-c${concurrency}`, ms, uploadMs: r.uploadMs, initMs: r.initMs, finalizeMs: r.finalizeMs, avgMBps: +(SIZE_MB / (r.uploadMs / 1000)).toFixed(2), wholeMBps: +(SIZE_MB / (ms / 1000)).toFixed(2), peakMBps: +(r.peakBps / MB).toFixed(2), retries: r.retries, parts: r.partTimings.length });
    const doc = (await db.collection("files").where("workspaceId", "==", W).get()).docs.pop();
    const [dl] = await bucket.file(doc.data().storagePath).download();
    results[results.length - 1].integrity = sha256Buf(dl) === sha256Buf(buf);
    await post(T, "/api/files/delete", { workspaceId: W, fileId: doc.id });
  }
  const plan = [["classic#1", () => classic("classic#1")], ["c1", () => multi("c1", 1)], ["c2", () => multi("c2", 2)], ["c4", () => multi("c4", 4)], ["c8", () => multi("c8", 8)], ["classic#2", () => classic("classic#2")], ["c4#2", () => multi("c4#2", 4)], ["c1#2", () => multi("c1#2", 1)]];
  for (const [name, fn] of plan) {
    try { await fn(); console.log(JSON.stringify(results[results.length - 1])); fs.writeFileSync("bench_up.json", JSON.stringify({ SIZE_MB, PART_MB, results }, null, 1)); } catch (e) { console.log("run failed:", name, String(e.message).slice(0, 200)); }
  }
  await purge();
  process.exit(0);
})().catch(async (e) => { console.error(String(e.stack || e.message).slice(0, 700)); await purge().catch(() => undefined); process.exit(1); });
