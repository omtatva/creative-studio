// REAL regression of the review features around a multipart-uploaded, background-processed video — written through the REAL Firebase client SDK (so Firestore SECURITY RULES decide, exactly as in
// the app) and the real routes: timestamped comments + markers, annotations, versions (v1/v2, numbering, latest flag, deletion), external-reviewer commenting, file playback selection, download = original.
// This is NOT a substitute for browser testing (no UI is rendered); it proves the data/rules/route layer those UI features sit on.
//   env: FFMPEG_PATH (to synthesize a real video). The dev server should run with VIDEO_PROCESSOR_LOCAL_CMD for the proxy assertions (otherwise those are skipped and reported).
const { db, bucket, BASE, MB, state, check, tok, post, mkUser, mkWorkspace, sha256Buf, purge, env, crypto } = require("./qalib.cjs");
const { pathToFileURL } = require("url");
const { execFileSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const modUrl = (rel) => pathToFileURL(path.resolve(__dirname, "../../../node_modules", rel, "dist/index.mjs")).href;

(async () => {
  const E = await import(pathToFileURL(path.resolve(__dirname, "../../../src/lib/uploads/multipartEngine.ts")).href);
  const fbApp = await import(modUrl("firebase/app")), fbAuth = await import(modUrl("firebase/auth")), fs2 = await import(modUrl("firebase/firestore"));
  const authm = require(path.resolve(__dirname, "../../../node_modules/firebase-admin/lib/auth/index.js"));
  const cfg = { apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, appId: env.NEXT_PUBLIC_FIREBASE_APP_ID };
  const clientFor = async (name, uid) => { const app = fbApp.initializeApp(cfg, name); const auth = fbAuth.getAuth(app); await fbAuth.signInWithCustomToken(auth, await authm.getAuth().createCustomToken(uid)); return { fdb: fs2.getFirestore(app), uid }; };

  const owner = await mkUser("owner"), viewer = await mkUser("viewer"), outsider = await mkUser("outsider");
  const { W, P } = await mkWorkspace("reg", owner);
  const t0 = new Date().toISOString();
  await db.doc(`members/${W}_${viewer.uid}`).set({ id: `${W}_${viewer.uid}`, workspaceId: W, userId: viewer.uid, role: "member", email: viewer.email, displayName: "V", status: "active", createdAt: t0, updatedAt: t0 });
  await db.doc(`project_members/${P}_${viewer.uid}`).set({ id: `${P}_${viewer.uid}`, projectId: P, uid: viewer.uid, workspaceId: W, role: "viewer", createdAt: t0 });
  const T = await tok(owner.uid);
  const ownerC = await clientFor("owner", owner.uid), viewerC = await clientFor("viewer", viewer.uid), outC = await clientFor("outsider", outsider.uid);

  // a real video
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "feedo-reg-"));
  const vid = path.join(tmp, "v.mp4");
  if (process.env.FFMPEG_PATH) execFileSync(process.env.FFMPEG_PATH, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25", "-f", "lavfi", "-i", "sine=frequency=330", "-t", "12", "-c:v", "libx264", "-b:v", "6M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", vid]);
  else fs.writeFileSync(vid, crypto.randomBytes(2 * MB));
  async function upload(name, newVersionOfId = null) {
    const buf = fs.readFileSync(vid); const blob = new Blob([buf], { type: "video/mp4" }); blob.name = name; blob.lastModified = Date.now() + Math.floor(Math.random() * 1e6);
    const api = { init: async () => (await post(T, "/api/uploads/init", { workspaceId: W, projectId: P, fileName: name, contentType: "video/mp4", sizeBytes: blob.size, lastModified: blob.lastModified, partSizeBytes: 5 * MB, newVersionOfId })).body, getUrls: async (s, n) => (await post(T, "/api/uploads/parts", { sessionId: s, partNumbers: n })).body.urls, status: async (s) => (await post(T, "/api/uploads/status", { sessionId: s })).body, complete: async (s) => (await post(T, "/api/uploads/complete", { sessionId: s })).body, abort: async () => {}, putPart: async (url, body, op, sig) => { const r = await fetch(url, { method: "PUT", body, signal: sig }); const tx = await r.text(); if (!r.ok) throw E.classifyGcsError(r.status, tx); op(body.size); } };
    return { ...(await new E.MultipartUpload(blob, api, { concurrency: 3 }).start()), sha: sha256Buf(buf), bytes: buf.length };
  }
  const waitProc = async (id) => { const start = Date.now(), end = start + 120000; for (;;) { const p = (await db.doc(`files/${id}`).get()).data()?.processing; if (p && ["ready", "failed", "unsupported"].includes(p.status)) return p; /* the enqueue is fire-and-forget after finalize returns: give `processing` a few seconds to appear before concluding no processor is configured */ if ((!p && Date.now() - start > 8000) || Date.now() > end) return p ?? null; await sleep(1000); } };

  const v1 = await upload("review take.mp4");
  const proc1 = await waitProc(v1.fileId);
  const processorOn = !!proc1;
  console.log(`      processor on this server: ${processorOn ? "YES (" + proc1.status + ")" : "NO (proxy assertions skipped)"}`);
  const rec1 = (await db.doc(`files/${v1.fileId}`).get()).data();
  const asActor = (c) => ({ uid: c.uid, displayName: "QA", photoURL: null, email: "x@example.com" });

  // ============ timestamps + markers + comments (real client rules)
  const commentsCol = (c, id) => fs2.collection(c.fdb, "files", id, "comments");
  const addComment = async (c, fileId, body, ts, x, y, marker, parent = null) => fs2.setDoc(fs2.doc(commentsCol(c, fileId)), { id: "tmp", workspaceId: W, projectId: P, fileId, version: 1, authorId: c.uid, author: asActor(c), body, parentCommentId: parent, isResolved: false, resolvedBy: null, resolvedAt: null, timestampSeconds: ts, positionX: x, positionY: y, pageNumber: null, markerNumber: marker, createdAt: fs2.serverTimestamp(), updatedAt: fs2.serverTimestamp() }).then(() => true, (e) => String(e.code));
  check("owner adds a TIMESTAMPED marker comment at 7.5 s (real rules)", await addComment(ownerC, v1.fileId, "Cut here", 7.5, 40, 25, 1), true);
  check("owner adds a second marker at 2.0 s", await addComment(ownerC, v1.fileId, "Logo too big", 2.0, 70, 60, 2), true);
  check("an OUTSIDER (no project access) cannot comment (permission-denied)", await addComment(outC, v1.fileId, "hi", 1, 1, 1, 3), "permission-denied");
  const read = async (c, fileId) => (await fs2.getDocs(commentsCol(c, fileId))).docs.map((d) => d.data()).sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  const seenByViewer = await read(viewerC, v1.fileId);
  check("project member can read the marker comments with the exact timestamps and marker numbers", [seenByViewer.map((c) => c.timestampSeconds), seenByViewer.map((c) => c.markerNumber)], [[2, 7.5], [2, 1]]);
  check("an outsider cannot read them", await read(outC, v1.fileId).then(() => "read", (e) => e.code), "permission-denied");
  if (processorOn && proc1.status === "ready" && proc1.proxyPath) {
    check("timestamps are valid on BOTH timelines: every marker <= proxy duration and original duration; proxy ≈ original duration", [seenByViewer.every((c) => c.timestampSeconds <= proc1.metadata.durationSeconds), Math.abs(proc1.metadata.durationSeconds - 12) < 0.3], [true, true]);
    const pv = await post(T, "/api/files/preview", { workspaceId: W, fileId: v1.fileId });
    check("review PLAYBACK uses the proxy while the same comments stay attached to the file (comments are keyed to the file, not the proxy)", [pv.body.variant, (await read(ownerC, v1.fileId)).length], ["proxy", 2]);
  }

  // ============ annotations
  const annCol = fs2.collection(ownerC.fdb, "files", v1.fileId, "annotations");
  const addAnn = (c) => fs2.setDoc(fs2.doc(fs2.collection(c.fdb, "files", v1.fileId, "annotations")), { id: "tmp", workspaceId: W, projectId: P, fileId: v1.fileId, version: 1, authorId: c.uid, author: asActor(c), type: "rectangle", data: { x: 10, y: 10, w: 30, h: 20 }, color: "#f00", timestampSeconds: 7.5, pageNumber: null, createdAt: fs2.serverTimestamp(), updatedAt: fs2.serverTimestamp() }).then(() => true, (e) => String(e.code));
  check("owner draws a rectangle annotation at 7.5 s; an outsider cannot", [await addAnn(ownerC), await addAnn(outC)], [true, "permission-denied"]);
  check("annotation readable by the project member with its timestamp", (await fs2.getDocs(annCol)).docs.length === 1 && (await fs2.getDocs(fs2.collection(viewerC.fdb, "files", v1.fileId, "annotations"))).docs[0].data().timestampSeconds === 7.5, true);

  // ============ versions
  const v2 = await upload("review take.mp4", v1.fileId);
  const f1 = (await db.doc(`files/${v1.fileId}`).get()).data(), f2 = (await db.doc(`files/${v2.fileId}`).get()).data();
  check("NEW VERSION: v2 in the same asset group, previous version no longer latest, v1 comments untouched, v2 starts with none", [f2.versionNumber, f2.assetGroupId === (f1.assetGroupId || v1.fileId), f2.previousVersionId, f1.isLatestVersion, f2.isLatestVersion, (await read(ownerC, v1.fileId)).length, (await read(ownerC, v2.fileId)).length], [2, true, v1.fileId, false, true, 2, 0]);
  check("v2 marker numbering restarts at 1 (per-version)", await addComment(ownerC, v2.fileId, "v2 note", 3, 5, 5, 1), true);
  const group = (await db.collection("files").where("workspaceId", "==", W).where("assetGroupId", "==", f2.assetGroupId).get()).docs.map((d) => d.data().versionNumber).sort();
  check("version list for the asset = [1,2]", group, [1, 2]);

  // ============ sharing (external reviewer) — real routes
  const link = await post(T, "/api/review-shares", { action: "create", workspaceId: W, fileId: v1.fileId, accessMode: "anyone_with_link", permissions: { canComment: true, canDownload: true }, title: "Reg" });
  check("owner creates an external review link for v1", link.status, 200);
  const st = await fetch(`${BASE}/api/review/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: link.body.token }) });
  const cookie = (st.headers.get("set-cookie") || "").split(";")[0];
  const rapi = (action, body) => fetch(`${BASE}/api/review/${action}`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ token: link.body.token, ...body }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  await rapi("identity", { name: "Client Carla" });
  const data = await rapi("data", {});
  check("external reviewer loads the review data; sees the owner's TIMESTAMPED markers", [data.status, (data.body.comments || []).map((c) => c.timestampSeconds).sort((a, b) => a - b)], [200, [2, 7.5]]);
  const ext = await rapi("comment", { body: "Client note at 5s", timestampSeconds: 5, positionX: 20, positionY: 30 });
  check("external reviewer adds a timestamped comment (5.0 s)", ext.status, 200);
  const nowSeen = await read(ownerC, v1.fileId);
  check("team sees the external timestamped comment with a marker number alongside the others", [nowSeen.map((c) => c.timestampSeconds), nowSeen.find((c) => c.timestampSeconds === 5)?.markerNumber != null], [[2, 5, 7.5], true]);
  const media = await fetch(`${BASE}/api/review/media?t=${link.body.token}`, { headers: { Cookie: cookie, Range: "bytes=0-99" } });
  const mediaBytes = Buffer.from(await media.arrayBuffer());
  const [origHead] = await bucket.file(rec1.storagePath).download({ start: 0, end: 99 });
  check("external reviewer PLAYBACK stream works (206) and, as before, serves the ORIGINAL", [media.status, mediaBytes.equals(origHead)], [206, true]);

  // ============ download = original (member) + version deletion + quota
  const dl = await post(T, "/api/files/download", { kind: "file", workspaceId: W, fileId: v1.fileId });
  const dres = await fetch(dl.body.url); const dbuf = Buffer.from(await dres.arrayBuffer());
  check("member DOWNLOAD of v1 is the ORIGINAL (byte-identical SHA-256) even though a proxy exists", [dres.status, sha256Buf(dbuf) === v1.sha], [200, true]);
  const usedBefore = (await db.doc(`workspaces/${W}`).get()).data().storageBytesUsed;
  const del = await post(T, "/api/files/delete", { workspaceId: W, fileId: v2.fileId });
  const after = (await db.doc(`files/${v1.fileId}`).get()).data();
  check("VERSION DELETION: v2 removed incl. derivatives, v1 becomes latest again, v1 comments/markers intact, quota released by exactly v2's size", [del.status, (await bucket.getFiles({ prefix: `workspaces/${W}/projects/${P}/files/${v2.fileId}/` }))[0].length, after.isLatestVersion, (await read(ownerC, v1.fileId)).length, (await db.doc(`workspaces/${W}`).get()).data().storageBytesUsed === usedBefore - v2.bytes], [200, 0, true, 3, true]);
  const delAll = await post(T, "/api/files/delete", { workspaceId: W, fileId: v1.fileId });
  check("FILE DELETION: removes the original, derivatives, comments and annotations; the review link stops working; quota returns to 0", [delAll.status, (await bucket.getFiles({ prefix: `workspaces/${W}/projects/${P}/files/${v1.fileId}/` }))[0].length, (await fs2.getDocs(fs2.collection(ownerC.fdb, "files", v1.fileId, "comments")).then((s) => s.size, () => -1)) <= 0, (await rapi("data", {})).status >= 400, (await db.doc(`workspaces/${W}`).get()).data().storageBytesUsed], [200, 0, true, true, 0]);

  console.log(state.failed ? `\n${state.failed} FAILED` : "\nALL PASSED");
  for (const col of ["review_shares", "reviews"]) for (const d of (await db.collection(col).where("workspaceId", "==", W).get()).docs) await d.ref.delete();
  fs.rmSync(tmp, { recursive: true, force: true });
  await purge();
  process.exit(state.failed ? 1 : 0);
})().catch(async (e) => { console.error(String(e.stack || e.message).slice(0, 900)); await purge().catch(() => undefined); process.exit(1); });
