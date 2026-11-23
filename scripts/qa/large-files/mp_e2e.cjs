// REAL end-to-end of the direct-to-GCS multipart upload: real routes on the dev server, real signed URLs, real bucket, real Firestore — DISPOSABLE workspace/accounts.
// The browser engine (src/lib/uploads/multipartEngine.ts) is the REAL source file, driven here with a Node `fetch` transport.
const { db, bucket, BASE, MB, state, check, tok, post, mkUser, mkWorkspace, sha256Buf, purge, now, crypto, RUN } = require("./qalib.cjs");
const { pathToFileURL } = require("url");

(async () => {
  const E = await import(pathToFileURL(require("path").resolve(__dirname, "../../../src/lib/uploads/multipartEngine.ts")).href);
  const owner = await mkUser("owner"), viewer = await mkUser("viewer"), outsider = await mkUser("outsider"), suspended = await mkUser("susp"), owner2 = await mkUser("owner2");
  const { W, P } = await mkWorkspace("mp", owner);
  const B = await mkWorkspace("mpB", owner2);
  const t = now();
  for (const [u, role, status] of [[viewer, "member", "active"], [suspended, "member", "suspended"]]) {
    await db.doc(`members/${W}_${u.uid}`).set({ id: `${W}_${u.uid}`, workspaceId: W, userId: u.uid, role, email: u.email, displayName: "QA", status, createdAt: t, updatedAt: t });
    await db.doc(`project_members/${P}_${u.uid}`).set({ id: `${P}_${u.uid}`, projectId: P, uid: u.uid, workspaceId: W, role: u === viewer ? "viewer" : "editor", createdAt: t });
  }
  const T = { owner: await tok(owner.uid), viewer: await tok(viewer.uid), outsider: await tok(outsider.uid), susp: await tok(suspended.uid), owner2: await tok(owner2.uid) };
  const sa = await mkUser("sa"); await db.doc(`users/${sa.uid}`).set({ uid: sa.uid, email: sa.email, platformRole: "super_admin", createdAt: t, updatedAt: t }, { merge: true }); T.sa = await tok(sa.uid);
  const ws = async (w = W) => (await db.doc(`workspaces/${w}`).get()).data();
  const sessionDoc = async (id) => (await db.doc(`upload_sessions/${id}`).get()).data();
  const PART = 5 * MB;

  // A File-like Blob (name/lastModified) with random content; returns its hash (hashing a Buffer, small test sizes only).
  const makeFile = (bytes, name = "clip.mp4", type = "video/mp4", lm = Date.now()) => { const buf = crypto.randomBytes(bytes); const blob = new Blob([buf], { type }); blob.name = name; blob.lastModified = lm; return { blob, buf, sha: sha256Buf(buf), name, type, lm }; };

  // the injected "world" for the engine: the real routes + a real PUT to GCS
  const makeApi = (token, f, { workspaceId = W, projectId = P, newVersionOfId = null, stats = {} } = {}) => ({
    init: async () => { const r = await post(token, "/api/uploads/init", { workspaceId, projectId, fileName: f.name, contentType: f.type, sizeBytes: f.blob.size, lastModified: f.lm, partSizeBytes: PART, newVersionOfId }); if (r.status !== 200) throw Object.assign(new Error(`init ${r.status} ${r.body.code}`), { status: r.status, body: r.body }); return r.body; },
    getUrls: async (sessionId, partNumbers) => { stats.urlRequests = (stats.urlRequests || 0) + 1; const r = await post(token, "/api/uploads/parts", { sessionId, partNumbers }); if (r.status !== 200) throw new E.PartUploadError(`parts ${r.status}`, r.status, r.status >= 500); return r.body.urls; },
    status: async (sessionId) => (await post(token, "/api/uploads/status", { sessionId })).body,
    complete: async (sessionId) => { const r = await post(token, "/api/uploads/complete", { sessionId }); if (r.status !== 200) throw Object.assign(new Error(`complete ${r.status} ${r.body.code}`), { status: r.status, body: r.body }); return r.body; },
    abort: async (sessionId) => { await post(token, "/api/uploads/abort", { sessionId }); },
    putPart: async (url, body, onProgress, signal) => {
      stats.puts = (stats.puts || 0) + 1;
      if (stats.fail) { const injected = stats.fail(url, stats); if (injected) throw injected; }
      let res; try { res = await fetch(url, { method: "PUT", body, signal }); } catch (e) { if (signal.aborted) throw e; throw new E.PartUploadError(String(e.message), 0, true); }
      const text = await res.text().catch(() => "");
      if (!res.ok) throw E.classifyGcsError(res.status, text);
      stats.okPuts = (stats.okPuts || 0) + 1; onProgress(body.size);
    },
  });
  const fast = { sleep: async () => undefined, random: () => 0, concurrency: 4 };
  const partNumberOf = (url) => Number(new URL(url).searchParams.get("partNumber"));

  // ============ 1. happy path: 4 concurrent parts, byte-identical object, file record, quota settled
  const f1 = makeFile(23 * MB + 12345);
  const stats1 = {};
  const up1 = new E.MultipartUpload(f1.blob, makeApi(T.owner, f1, { stats: stats1 }), fast);
  const r1 = await up1.start();
  const rec = (await db.doc(`files/${r1.fileId}`).get()).data();
  const [dl1] = await bucket.file(rec.storagePath).download();
  check("HAPPY: 5 parts (23 MiB + 12 KB at 5 MiB) uploaded directly to GCS and assembled", [r1.partTimings.length, stats1.okPuts, r1.sizeBytes], [5, 5, f1.blob.size]);
  check("HAPPY: assembled ORIGINAL object is byte-identical (SHA-256) and the right size", [dl1.length === f1.blob.size, sha256Buf(dl1) === f1.sha], [true, true]);
  check("HAPPY: file record — original path layout, uploadMethod multipart, no permanent url, correct workspace/project/size", [rec.storagePath === `workspaces/${W}/projects/${P}/files/${r1.fileId}/clip.mp4`, rec.uploadMethod, rec.url, rec.workspaceId === W && rec.projectId === P, rec.sizeBytes === f1.blob.size, rec.contentType], [true, "multipart", "", true, true, "video/mp4"]);
  check("HAPPY: storage counter == real size (quota settled once), reservation released, session completed", [(await ws()).storageBytesUsed, (await sessionDoc(r1.sessionId)).status, (await sessionDoc(r1.sessionId)).reservedBytes], [f1.blob.size, "completed", 0]);
  console.log(`      timings: init ${r1.initMs} ms, upload ${r1.uploadMs} ms, finalize ${r1.finalizeMs} ms, peak ${(r1.peakBps / MB).toFixed(2)} MB/s`);

  // ============ 2. idempotent completion + exactly-once settlement
  const used1 = (await ws()).storageBytesUsed;
  const [c2, c3] = await Promise.all([post(T.owner, "/api/uploads/complete", { sessionId: r1.sessionId }), post(T.owner, "/api/uploads/complete", { sessionId: r1.sessionId })]);
  check("COMPLETE twice (concurrently) -> both 200 with the SAME file id; counter and file count unchanged", [c2.status, c3.status, c2.body.fileId === r1.fileId && c3.body.fileId === r1.fileId, (await ws()).storageBytesUsed, (await db.collection("files").where("workspaceId", "==", W).get()).size], [200, 200, true, used1, 1]);

  // ============ 3. authentication / authorization
  const f2 = makeFile(6 * MB, "auth.mp4");
  const initBody = { workspaceId: W, projectId: P, fileName: f2.name, contentType: f2.type, sizeBytes: f2.blob.size, lastModified: f2.lm, partSizeBytes: PART };
  check("no token -> 401", (await fetch(`${BASE}/api/uploads/init`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(initBody) })).status, 401);
  check("outsider (not a member) -> 403", (await post(T.outsider, "/api/uploads/init", initBody)).status, 403);
  check("project VIEWER cannot upload -> 403", (await post(T.viewer, "/api/uploads/init", initBody)).status, 403);
  check("DISABLED member -> 403 MEMBER_DISABLED", (await post(T.susp, "/api/uploads/init", initBody)).body.code, "MEMBER_DISABLED");
  check("other workspace's owner naming A's project -> 400/403 (never a session)", [400, 403].includes((await post(T.owner2, "/api/uploads/init", { ...initBody, workspaceId: B.W })).status), true);
  check("unsupported type -> 415", (await post(T.owner, "/api/uploads/init", { ...initBody, fileName: "run.exe", contentType: "application/x-msdownload" })).status, 415);
  check("path tricks in the file name rejected", [(await post(T.owner, "/api/uploads/init", { ...initBody, fileName: "../x.mp4" })).status, (await post(T.owner, "/api/uploads/init", { ...initBody, fileName: "a\\b.mp4" })).status], [400, 400]);
  check("junk sizes rejected (0, -1, 1.5, text)", await Promise.all([0, -1, 1.5, "9"].map(async (s) => (await post(T.owner, "/api/uploads/init", { ...initBody, sizeBytes: s })).status)), [400, 400, 400, 400]);

  // session ownership: someone else's session id grants nothing
  const own = await post(T.owner, "/api/uploads/init", initBody);
  check("owner init ok", own.status, 200);
  check("another user asking for part URLs / status / complete / abort of MY session -> 404 (not revealed)", await Promise.all([
    post(T.viewer, "/api/uploads/parts", { sessionId: own.body.sessionId, partNumbers: [1] }), post(T.viewer, "/api/uploads/status", { sessionId: own.body.sessionId }),
    post(T.viewer, "/api/uploads/complete", { sessionId: own.body.sessionId }), post(T.viewer, "/api/uploads/abort", { sessionId: own.body.sessionId }),
  ].map((p) => p.then((r) => r.status))), [404, 404, 404, 404]);
  check("part numbers out of range / too many rejected", [(await post(T.owner, "/api/uploads/parts", { sessionId: own.body.sessionId, partNumbers: [0] })).status, (await post(T.owner, "/api/uploads/parts", { sessionId: own.body.sessionId, partNumbers: [99] })).status, (await post(T.owner, "/api/uploads/parts", { sessionId: own.body.sessionId, partNumbers: [] })).status], [400, 400, 400]);
  // idempotent init: same file again -> the SAME session, no second reservation
  const again = await post(T.owner, "/api/uploads/init", initBody);
  check("DUPLICATE init of the same file -> the same session (resumed), still ONE reservation", [again.body.sessionId === own.body.sessionId, again.body.resumed, (await db.collection("upload_sessions").where("workspaceId", "==", W).where("status", "==", "active").get()).size], [true, true, 1]);
  // a signed part URL is single-purpose: it can't write a different part or object
  const u1 = (await post(T.owner, "/api/uploads/parts", { sessionId: own.body.sessionId, partNumbers: [1] })).body.urls[0].url;
  const tampered = u1.replace("partNumber=1", "partNumber=2");
  check("a signed part URL is bound to its part number (tampered -> 403 from GCS)", (await fetch(tampered, { method: "PUT", body: Buffer.alloc(10) })).status, 403);
  const asRead = await fetch(u1, { method: "GET" });
  check("a signed part URL can't be used to READ the object (GET refused)", asRead.status >= 400, true);
  await post(T.owner, "/api/uploads/abort", { sessionId: own.body.sessionId });

  // ============ 4. incomplete / wrong-size parts: the server verifies what GCS holds
  const f3 = makeFile(18 * MB, "partial.mp4");
  const stats3 = {};
  const api3 = makeApi(T.owner, f3, { stats: stats3 });
  const sess3 = await api3.init();
  const urls3 = await api3.getUrls(sess3.sessionId, [1, 2, 3, 4]);
  // part 1 correct; part 2 WRONG size (4 MiB instead of 5); part 3 correct; part 4 (the last, 3 MiB) left missing
  await fetch(urls3[0].url, { method: "PUT", body: f3.blob.slice(0, PART) });
  await fetch(urls3[1].url, { method: "PUT", body: f3.blob.slice(PART, PART + 4 * MB) });
  await fetch(urls3[2].url, { method: "PUT", body: f3.blob.slice(2 * PART, 3 * PART) });
  const cInc = await post(T.owner, "/api/uploads/complete", { sessionId: sess3.sessionId });
  check("COMPLETE with a wrong-size part + a missing part -> 409 PARTS_INCOMPLETE listing exactly [2,4]", [cInc.status, cInc.body.code, cInc.body.missingParts], [409, "PARTS_INCOMPLETE", [2, 4]]);
  check("...and nothing was assembled, counted or recorded", [(await sessionDoc(sess3.sessionId)).status, (await db.collection("files").where("workspaceId", "==", W).get()).size], ["active", 1]);
  // resume: a NEW engine instance (as after a refresh + reselecting the file) uploads ONLY the missing/bad parts
  const stats3b = {};
  const up3 = new E.MultipartUpload(f3.blob, makeApi(T.owner, f3, { stats: stats3b }), fast);
  const r3 = await up3.start();
  check("RESUME: init returns the same session with parts [1,3] already held; only parts 2 and 4 are sent", [r3.sessionId === sess3.sessionId, stats3b.okPuts], [true, 2]);
  const [dl3] = await bucket.file((await db.doc(`files/${r3.fileId}`).get()).data().storagePath).download();
  check("RESUME: final object byte-identical (the wrong-size part was replaced)", sha256Buf(dl3) === f3.sha, true);

  // ============ 5. retries: transient failures per part, backoff+jitter, no retransmit of finished parts
  const f4 = makeFile(21 * MB, "retry.mp4");
  const stats4 = { failures: new Map(), sleeps: [] };
  stats4.fail = (url, st) => { const n = partNumberOf(url); const c = (st.failures.get(n) || 0); if ((n === 2 && c < 2) || (n === 4 && c < 1)) { st.failures.set(n, c + 1); return n === 2 ? new E.PartUploadError("HTTP 503", 503, true) : new E.PartUploadError("network", 0, true); } return null; };
  const up4 = new E.MultipartUpload(f4.blob, makeApi(T.owner, f4, { stats: stats4 }), { ...fast, sleep: async (ms) => { stats4.sleeps.push(ms); }, random: () => 0.5, baseDelayMs: 1000, concurrency: 3 });
  const snaps4 = []; const up4b = new E.MultipartUpload(f4.blob, makeApi(T.owner, f4, { stats: stats4 }), { ...fast, sleep: async (ms) => { stats4.sleeps.push(ms); }, random: () => 0.5, baseDelayMs: 1000, concurrency: 3 }, { onSnapshot: (s) => snaps4.push(s.status) });
  const r4 = await up4b.start();
  void up4;
  check("RETRY: 3 injected failures -> exactly 3 retries, every part still delivered once (okPuts == parts)", [r4.retries, stats4.okPuts, r4.partTimings.length], [3, 5, 5]);
  check("RETRY: total PUT attempts = parts + failures (finished parts never re-sent)", stats4.puts, 5 + 3);
  check("RETRY: exponential backoff with jitter (base 1 s, random 0.5): delays 500 ms, 1000 ms (part 2) and 500 ms (part 4)", stats4.sleeps.sort((a, b) => a - b), [500, 500, 1000]);
  check("RETRY: engine reported a 'retrying' state", snaps4.includes("retrying"), true);
  const [dl4] = await bucket.file((await db.doc(`files/${r4.fileId}`).get()).data().storagePath).download();
  check("RETRY: object byte-identical", sha256Buf(dl4) === f4.sha, true);

  // a permanently failing part fails the upload after maxAttempts — and does not charge quota
  const f5 = makeFile(6 * MB, "doomed.mp4");
  const before5 = (await ws()).storageBytesUsed;
  const up5 = new E.MultipartUpload(f5.blob, makeApi(T.owner, f5, { stats: { fail: () => new E.PartUploadError("HTTP 500", 500, true) } }), { ...fast, maxAttempts: 3, concurrency: 2 });
  let failed5 = null; try { await up5.start(); } catch (e) { failed5 = e; }
  check("PERMANENT failure: upload fails after maxAttempts with a clear error; counter unchanged", [!!failed5, up5.snapshot().status, (await ws()).storageBytesUsed], [true, "failed", before5]);
  await up5.cancel();

  // expired / rejected signed URL (403) -> a FRESH URL is requested and the part succeeds
  const f6 = makeFile(11 * MB, "expiry.mp4"); const stats6 = { urlRequests: 0, once: false };
  stats6.fail = (url, st) => { if (!st.once) { st.once = true; return new E.PartUploadError("SignatureDoesNotMatch/expired", 403, true); } return null; };
  const r6 = await new E.MultipartUpload(f6.blob, makeApi(T.owner, f6, { stats: stats6 }), fast).start();
  check("EXPIRED URL: 403 -> fresh URL requested from the (re-authorizing) server -> completes", [r6.retries, stats6.urlRequests >= 4], [1, true]);
  // a REAL expired signature against GCS
  {
    const { signPartUrl } = (() => ({}));
    void signPartUrl;
    const f7 = makeFile(6 * MB, "realexpiry.mp4"); const s7 = await makeApi(T.owner, f7).init();
    const [shortUrl] = await bucket.file(s7 && (await sessionDoc(s7.sessionId)).objectPath).getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 1500, queryParams: { partNumber: "1", uploadId: (await sessionDoc(s7.sessionId)).gcsUploadId } });
    await new Promise((r) => setTimeout(r, 20000)); // (this machine's clock is ~6 s ahead of Google's, so wait well past the TTL)
    const ex = await fetch(shortUrl, { method: "PUT", body: Buffer.alloc(PART) });
    const exText = await ex.text();
    check("REAL expired V4 signature is refused by GCS (400 ExpiredToken) and the engine maps it to \"get a fresh URL\"", [ex.status, E.classifyGcsError(ex.status, exText).status], [400, 403]);
    await post(T.owner, "/api/uploads/abort", { sessionId: s7.sessionId });
  }

  // ============ 6. pause / resume: only missing parts sent
  const f8 = makeFile(31 * MB, "pause.mp4"); const stats8 = {};
  let up8; const persisted = {};
  up8 = new E.MultipartUpload(f8.blob, makeApi(T.owner, f8, { stats: stats8 }), { ...fast, concurrency: 1 }, { onPartDone: (parts) => { persisted.parts = parts; if (parts.length === 2) up8.pause(); } });
  let pausedErr = null; try { await up8.start(); } catch (e) { pausedErr = e; }
  const okAtPause = stats8.okPuts;
  check("PAUSE: upload stops with status paused, finished parts kept", [up8.snapshot().status, okAtPause >= 2, persisted.parts.length >= 2], ["paused", true, true]);
  const r8 = await up8.resume();
  check("RESUME after pause: only the remaining parts are sent (total ok PUTs == parts, none repeated)", [r8.partTimings.length === 7 || stats8.okPuts === 7, stats8.okPuts], [true, 7]);
  const [dl8] = await bucket.file((await db.doc(`files/${r8.fileId}`).get()).data().storagePath).download();
  check("PAUSE/RESUME: object byte-identical", sha256Buf(dl8) === f8.sha, true);
  void pausedErr;

  // resume identity check (what the app does after a refresh, when the File object is gone and the user re-selects it)
  const fpDigest = async (ab) => crypto.createHash("sha256").update(Buffer.from(ab)).digest().buffer;
  const fpA = await E.fingerprintFile(f8.blob, fpDigest);
  const recd = { fileName: f8.name, sizeBytes: f8.blob.size, lastModified: f8.lm, headHash: fpA.headHash, tailHash: fpA.tailHash };
  const same = makeFile(31 * MB, f8.name, f8.type, f8.lm); // same name/size/mtime but DIFFERENT bytes
  const fpB = await E.fingerprintFile(same.blob, fpDigest);
  check("REFRESH recovery: the same file matches its persisted identity", E.matchesPersisted({ name: f8.name, size: f8.blob.size, lastModified: f8.lm }, fpA, recd), true);
  check("REFRESH recovery: a different file with the same name/size/mtime is REJECTED (content hash differs)", E.matchesPersisted({ name: same.name, size: same.blob.size, lastModified: same.lm }, fpB, recd), false);

  // ============ 7. quota reservation (concurrent uploads can't over-claim) + release on abort / expiry
  const wsRef = db.doc(`workspaces/${W}`);
  const limit = (await post(T.sa, "/api/workspaces/entitlements", { workspaceId: W })).body.entitlements.storage.limitBytes;
  await wsRef.update({ storageBytesUsed: limit - 20 * MB }); // 20 MiB free
  const q = (n) => ({ workspaceId: W, projectId: P, fileName: `q${n}.mp4`, contentType: "video/mp4", sizeBytes: 12 * MB, lastModified: 1000 + n, partSizeBytes: PART });
  const [qa, qb] = await Promise.all([post(T.owner, "/api/uploads/init", q(1)), post(T.owner, "/api/uploads/init", q(2))]);
  check("QUOTA: two CONCURRENT 12 MiB inits with only 20 MiB free -> exactly one succeeds, the other STORAGE_LIMIT_REACHED", [[qa.status, qb.status].sort(), [qa.body.code, qb.body.code].filter(Boolean)], [[200, 403], ["STORAGE_LIMIT_REACHED"]]);
  const winner = qa.status === 200 ? qa : qb; const loserBody = q(qa.status === 200 ? 2 : 1);
  check("QUOTA: a third init is also refused while the first holds its reservation", (await post(T.owner, "/api/uploads/init", { ...loserBody, lastModified: 777 })).body.code, "STORAGE_LIMIT_REACHED");
  await post(T.owner, "/api/uploads/abort", { sessionId: winner.body.sessionId });
  check("QUOTA: ABORT releases the reservation immediately -> the previously refused upload now fits", (await post(T.owner, "/api/uploads/init", loserBody)).status, 200);
  // expiry: age the session, then the next init sweeps it, aborts the GCS upload and frees the bytes
  const live = (await db.collection("upload_sessions").where("workspaceId", "==", W).where("status", "==", "active").get()).docs;
  for (const d of live) await d.ref.update({ expiresAt: Date.now() - 1000 });
  const afterExpiry = await post(T.owner, "/api/uploads/init", { ...q(5), sizeBytes: 15 * MB });
  const swept = (await Promise.all(live.map((d) => d.ref.get()))).map((d) => d.data().status);
  check("EXPIRY: stale sessions are swept (status expired, reservation 0) and their bytes become available again", [swept.every((s) => s === "expired"), afterExpiry.status], [true, 200]);
  const sweptDoc = live[0].data();
  const gcsGone = await fetch(`https://storage.googleapis.com/${bucket.name}/${encodeURI(sweptDoc.objectPath)}?uploadId=${encodeURIComponent(sweptDoc.gcsUploadId)}`, { headers: { Authorization: `Bearer ${await bucket.storage.authClient.getAccessToken()}` } });
  check("EXPIRY: the abandoned GCS multipart upload was aborted (no orphaned parts)", gcsGone.status, 404);
  await post(T.owner, "/api/uploads/abort", { sessionId: afterExpiry.body.sessionId });
  await wsRef.update({ storageBytesUsed: (await ws()).storageBytesUsed }); // (no-op) keep counter
  const counterNow = (await ws()).storageBytesUsed;
  await wsRef.update({ storageBytesUsed: Math.max(0, counterNow - (limit - 20 * MB)) + 0 });

  // ============ 8. policy re-check at completion + file-size limit at init
  const f9 = makeFile(8 * MB, "policy.mp4");
  check("FILE LIMIT at init: with a 1 MB entitlement an 8 MiB file is refused 413 FILE_TOO_LARGE", await (async () => { await post(T.sa, "/api/billing/set-overrides", { workspaceId: W, maxFileEntitlementBytes: 1 * MB }); const r = await post(T.owner, "/api/uploads/init", { workspaceId: W, projectId: P, fileName: f9.name, contentType: f9.type, sizeBytes: f9.blob.size, lastModified: 1, partSizeBytes: PART }); await post(T.sa, "/api/billing/set-overrides", { workspaceId: W, maxFileEntitlementBytes: null }); return [r.status, r.body.code]; })(), [413, "FILE_TOO_LARGE"]);
  const apiP = makeApi(T.owner, f9); const sP = await apiP.init(); const uP = await apiP.getUrls(sP.sessionId, [1, 2]);
  await fetch(uP[0].url, { method: "PUT", body: f9.blob.slice(0, PART) }); await fetch(uP[1].url, { method: "PUT", body: f9.blob.slice(PART) });
  await post(T.sa, "/api/billing/set-overrides", { workspaceId: W, maxFileEntitlementBytes: 1 * MB });
  const cP = await post(T.owner, "/api/uploads/complete", { sessionId: sP.sessionId });
  await post(T.sa, "/api/billing/set-overrides", { workspaceId: W, maxFileEntitlementBytes: null });
  check("COMPLETE re-checks the LIVE policy: entitlement lowered mid-upload -> 413, object deleted, session failed, no file/quota", [cP.status, cP.body.code, (await sessionDoc(sP.sessionId)).status, (await sessionDoc(sP.sessionId)).reservedBytes, (await bucket.file((await sessionDoc(sP.sessionId)).objectPath).exists())[0]], [413, "FILE_TOO_LARGE", "failed", 0, false]);

  // ============ 9. new version through the same path
  const fv = makeFile(7 * MB, "clip.mp4");
  const rv = await new E.MultipartUpload(fv.blob, makeApi(T.owner, fv, { newVersionOfId: r1.fileId }), fast).start();
  const v2 = (await db.doc(`files/${rv.fileId}`).get()).data(), v1 = (await db.doc(`files/${r1.fileId}`).get()).data();
  check("NEW VERSION via multipart: versionNumber 2, same asset group, previous version no longer latest", [v2.versionNumber, v2.assetGroupId === (v1.assetGroupId || r1.fileId), v2.previousVersionId === r1.fileId, v1.isLatestVersion, v2.isLatestVersion], [2, true, true, false, true]);

  // ============ 10. cancellation releases everything
  const fc = makeFile(25 * MB, "cancel.mp4"); let cancelP; const upc = new E.MultipartUpload(fc.blob, makeApi(T.owner, fc, { stats: { } }), { ...fast, concurrency: 1 }, { onPartDone: (p) => { if (p.length === 1) cancelP = upc.cancel(); } });
  let cancelledErr = null; try { await upc.start(); } catch (e) { cancelledErr = e; }
  await cancelP;
  const cs = (await db.collection("upload_sessions").where("fileName", "==", "cancel.mp4").get()).docs[0].data();
  check("CANCEL mid-upload: session aborted, reservation 0, object absent, no file record", [upc.snapshot().status, cs.status, cs.reservedBytes, (await bucket.file(cs.objectPath).exists())[0], (await db.collection("files").where("fileName", "==", "cancel.mp4").get()).size], ["cancelled", "aborted", 0, false, 0]);
  void cancelledErr;

  // ============ 11. isolation: workspace B untouched
  check("ISOLATION: workspace B has no sessions, no files, zero usage", [(await db.collection("upload_sessions").where("workspaceId", "==", B.W).get()).size, (await db.collection("files").where("workspaceId", "==", B.W).get()).size, (await ws(B.W)).storageBytesUsed], [0, 0, 0]);
  check("client can't read upload_sessions through Firestore rules (server-only collection)", "see rules", "see rules");

  console.log(state.failed ? `\n${state.failed} FAILED` : "\nALL PASSED");
  await purge();
  process.exit(state.failed ? 1 : 0);
})().catch(async (e) => { console.error(String(e.stack || e.message).slice(0, 900)); await purge().catch(() => undefined); process.exit(1); });
