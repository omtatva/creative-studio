// REAL end-to-end regression test of DOWNLOAD HISTORY: real routes (dev server), real bucket + Firestore, disposable workspace.
//   HISTORY_MODE=direct (default)  server as usual                      -> direct signed-URL downloads, idempotency, authorization, versions, external reviewer policy
//   HISTORY_MODE=proxy             server started with DIRECT_DOWNLOADS=0 -> ticketed streaming: completed / cancelled / expired / failed outcomes
// The invariant under test: handing out a signed URL is NOT a completed download — a direct download stays "started"; only a fully streamed proxy download is "completed".
const { db, bucket, BASE, MB, state, check, tok, post, mkUser, mkWorkspace, sha256Buf, purge, crypto } = require("./qalib.cjs");
const MODE = process.env.HISTORY_MODE || "direct";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const owner = await mkUser("owner"), viewer = await mkUser("viewer"), outsider = await mkUser("outsider");
  const { W, P } = await mkWorkspace("hist", owner);
  const t0 = new Date().toISOString();
  for (const [u, role] of [[viewer, "member"], [outsider, "member"]]) await db.doc(`members/${W}_${u.uid}`).set({ id: `${W}_${u.uid}`, workspaceId: W, userId: u.uid, role, email: u.email, displayName: "QA", status: "active", createdAt: t0, updatedAt: t0 });
  await db.doc(`project_members/${P}_${viewer.uid}`).set({ id: `${P}_${viewer.uid}`, projectId: P, uid: viewer.uid, workspaceId: W, role: "viewer", createdAt: t0 });
  const T = await tok(owner.uid), TV = await tok(viewer.uid), TO = await tok(outsider.uid);

  const feed = async (bucketKey) => (await db.collection(`workspaces/${W}/download_history/${bucketKey}/items`).get()).docs.map((d) => d.data());
  const waitFor = async (bucketKey, id, pred, ms = 10000) => { const end = Date.now() + ms; for (;;) { const s = await db.doc(`workspaces/${W}/download_history/${bucketKey}/items/${id}`).get(); const d = s.data(); if (d && pred(d)) return d; if (Date.now() > end) return d ?? null; await sleep(300); } };

  async function seed(name, bytes, versionNumber = 1, group = null) {
    const buf = crypto.randomBytes(bytes);
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const storagePath = `workspaces/${W}/projects/${P}/files/${id}/${name}`;
    await bucket.file(storagePath).save(buf, { contentType: "video/mp4" });
    const now = new Date().toISOString();
    await db.doc(`files/${id}`).set({ id, workspaceId: W, projectId: P, fileName: name, originalName: name, contentType: "video/mp4", assetType: "video", sizeBytes: buf.length, url: "", thumbnailUrl: null, storagePath, uploadedBy: { uid: owner.uid, displayName: "QA", email: owner.email, photoURL: null }, reviewStatus: "none", statusId: "x", stageId: null, assetGroupId: group ?? id, versionNumber, previousVersionId: null, isLatestVersion: true, durationSeconds: 3, shareSettings: null, createdAt: now, updatedAt: now });
    return { id, buf, sha: sha256Buf(buf), storagePath, group: group ?? id };
  }
  const dl = (token, fileId, extra = {}) => post(token, "/api/files/download", { kind: "file", workspaceId: W, fileId, ...extra });

  const f1 = await seed("clip v1.mp4", 2 * MB + 321);
  const f2 = await seed("clip v2.mp4", 3 * MB + 17, 2, f1.group);
  // external-reviewer link helpers
  const makeLink = async (fileId, permissions) => { const r = await post(T, "/api/review-shares", { action: "create", workspaceId: W, fileId, accessMode: "anyone_with_link", permissions, title: "QA" }); if (r.status !== 200) throw new Error(`link ${r.status}`); return { token: r.body.token }; };
  const open = async (link) => { const res = await fetch(`${BASE}/api/review/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: link.token }) }); return (res.headers.get("set-cookie") || "").split(";")[0]; };
  const extDl = async (link, cookie, body = {}) => { const r = await fetch(`${BASE}/api/review/download`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ token: link.token, ...body }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

  if (MODE === "direct") {
    // ---- 1. a successful member download records ONE correctly-scoped event
    const r1 = await dl(T, f1.id, { requestId: "req-aaaaaaaa-1" });
    check("member download authorized: 200 + direct signed URL + downloadId", [r1.status, r1.body.direct, typeof r1.body.downloadId], [200, true, "string"]);
    const e1 = await waitFor(owner.uid, r1.body.downloadId, () => true);
    check("event stored against the right user / workspace / project / file / version / name / size", [e1?.uid, e1?.workspaceId, e1?.projectId, e1?.fileId, e1?.versionNumber, e1?.fileName, e1?.sizeBytes, e1?.kind, e1?.actorType], [owner.uid, W, P, f1.id, 1, "clip v1.mp4", f1.buf.length, "file", "member"]);
    check("a signed URL is NOT a completed download: status is 'started', method 'direct', no completedAt", [e1?.status, e1?.method, e1?.completedAt], ["started", "direct", null]);
    const got = Buffer.from(await (await fetch(r1.body.url)).arrayBuffer());
    check("the direct URL really delivers the original bytes (SHA-256 identical)", sha256Buf(got) === f1.sha, true);
    check("…and the event is STILL 'started' (the server can't observe direct delivery, so it never claims 'completed')", (await waitFor(owner.uid, r1.body.downloadId, () => true))?.status, "started");

    // ---- 2. versions are recorded separately and correctly
    const r2 = await dl(T, f2.id, { requestId: "req-aaaaaaaa-2" });
    const e2 = await waitFor(owner.uid, r2.body.downloadId, () => true);
    check("downloading v2 creates its OWN event (fileId v2, versionNumber 2, same assetGroupId); v1's event untouched", [e2?.fileId, e2?.versionNumber, e2?.assetGroupId, e2?.id !== e1?.id, (await db.doc(`workspaces/${W}/download_history/${owner.uid}/items/${e1.id}`).get()).data().fileId], [f2.id, 2, f1.group, true, f1.id]);

    // ---- 3. duplicate prevention
    const r1b = await dl(T, f1.id, { requestId: "req-aaaaaaaa-1" });
    check("same requestId again (retry) -> same downloadId, still ONE event for it", [r1b.body.downloadId === r1.body.downloadId, (await feed(owner.uid)).filter((e) => e.id === r1.body.downloadId).length], [true, 1]);
    const before = (await feed(owner.uid)).length;
    const msToBoundary = 5000 - (Date.now() % 5000); if (msToBoundary < 1500) await sleep(msToBoundary + 50);
    const [d1, d2] = await Promise.all([dl(T, f2.id), dl(T, f2.id)]);
    check("double-click without a requestId (two requests inside the dedupe window) -> ONE new event", [d1.body.downloadId === d2.body.downloadId, (await feed(owner.uid)).length - before], [true, 1]);
    const r1c = await dl(T, f1.id, { requestId: "req-aaaaaaaa-3" });
    check("a genuinely new download (new requestId) is a new event", [r1c.body.downloadId !== r1.body.downloadId, (await feed(owner.uid)).filter((e) => e.fileId === f1.id).length], [true, 2]);

    // ---- 4. refused downloads never create events
    const nBefore = (await feed(owner.uid)).length + (await feed(outsider.uid)).length + (await feed(viewer.uid)).length;
    const ro = await dl(TO, f1.id, { requestId: "req-outsider-1" });
    const rn = await dl(T, "does-not-exist-123", { requestId: "req-missing-1" });
    const ru = await fetch(`${BASE}/api/files/download`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "file", workspaceId: W, fileId: f1.id }) });
    const rw = await post(T, "/api/files/download", { kind: "file", workspaceId: "some-other-workspace", fileId: f1.id });
    check("UNAUTHORIZED (no project access) 403, missing file 404, no sign-in 401, wrong workspace 404", [ro.status, rn.status, ru.status, rw.status], [403, 404, 401, 404]);
    await sleep(800);
    check("none of the refused requests created a history event anywhere", (await feed(owner.uid)).length + (await feed(outsider.uid)).length + (await feed(viewer.uid)).length, nBefore);

    // ---- 5. feed isolation: each person's events are their own
    const rv = await dl(TV, f1.id, { requestId: "req-viewer-1" });
    const ev = await waitFor(viewer.uid, rv.body.downloadId, () => true);
    check("a project viewer's download is in THEIR feed only (uid = viewer), not the owner's", [ev?.uid, (await feed(owner.uid)).some((e) => e.uid !== owner.uid), (await feed(viewer.uid)).every((e) => e.uid === viewer.uid)], [viewer.uid, false, true]);

    // ---- 6. EXTERNAL reviewer: audit event in the reserved bucket, no internal data, not in anyone's personal feed
    const link = await makeLink(f1.id, { canDownload: true });
    const cookie = await open(link);
    const ownerBefore = (await feed(owner.uid)).length;
    const x1 = await extDl(link, cookie, { requestId: "req-ext-0001" });
    const ex = await waitFor("_external", x1.body.downloadId, () => true);
    check("external reviewer download: 200 direct; event recorded in the reserved _external bucket as actorType 'external', uid null, status 'started'", [x1.status, x1.body.direct, ex?.actorType, ex?.uid, ex?.status, ex?.fileId, ex?.versionNumber], [200, true, "external", null, "started", f1.id, 1]);
    const blob = JSON.stringify(ex);
    check("the external event leaks NO internal user data (no owner uid/e-mail/display name, no uploader, no reviewer e-mail)", [blob.includes(owner.uid), blob.includes(owner.email), blob.includes("QA owner"), "uploadedBy" in ex, "email" in ex], [false, false, false, false, false]);
    check("external events do NOT appear in any member's personal feed", [(await feed(owner.uid)).length, (await feed(viewer.uid)).some((e) => e.actorType === "external")], [ownerBefore, false]);
    const x1b = await extDl(link, cookie, { requestId: "req-ext-0001" });
    check("external retry with the same requestId -> one event", [x1b.body.downloadId === x1.body.downloadId, (await feed("_external")).length], [true, 1]);
    const noPerm = await makeLink(f1.id, { canDownload: false });
    const cookie2 = await open(noPerm);
    const x2 = await extDl(noPerm, cookie2);
    await sleep(500);
    check("external link WITHOUT download permission: 403 and NO event", [x2.status, (await feed("_external")).length], [403, 1]);
  }

  if (MODE === "proxy") {
    const big = await seed("big proxy.mp4", 24 * MB + 5);
    const p1 = await dl(T, f1.id, { requestId: "px-aaaaaaaa-1" });
    check("proxy mode: POST returns a ticket (no direct URL) + downloadId", [p1.status, typeof p1.body.ticket, p1.body.url, typeof p1.body.downloadId], [200, "string", undefined, "string"]);
    const e0 = await waitFor(owner.uid, p1.body.downloadId, () => true);
    check("before the bytes are fetched the event is 'started' (a ticket is not a download), method 'proxy'", [e0?.status, e0?.method], ["started", "proxy"]);
    const g = await fetch(`${BASE}/api/files/download?t=${p1.body.ticket}`);
    const body = Buffer.from(await g.arrayBuffer());
    check("streaming GET delivers the ORIGINAL bytes (200, SHA-256 identical, attachment)", [g.status, sha256Buf(body) === f1.sha, /attachment/.test(g.headers.get("content-disposition") || "")], [200, true, true]);
    const e1 = await waitFor(owner.uid, p1.body.downloadId, (d) => d.status !== "started");
    check("after every byte was streamed the event is 'completed' with completedAt set", [e1?.status, typeof e1?.completedAt], ["completed", "number"]);
    const g2 = await fetch(`${BASE}/api/files/download?t=${p1.body.ticket}`);
    await g2.arrayBuffer();
    await sleep(500);
    check("replaying the single-use ticket -> 410, and the completed event is NOT flipped to a failure", [g2.status, (await db.doc(`workspaces/${W}/download_history/${owner.uid}/items/${p1.body.downloadId}`).get()).data().status], [410, "completed"]);

    // cancelled mid-stream
    const pc = await dl(T, big.id, { requestId: "px-cancel-01" });
    const ac = new AbortController();
    const gc = await fetch(`${BASE}/api/files/download?t=${pc.body.ticket}`, { signal: ac.signal });
    const rd = gc.body.getReader(); await rd.read(); ac.abort(); await rd.cancel().catch(() => undefined);
    const ecan = await waitFor(owner.uid, pc.body.downloadId, (d) => d.status !== "started", 15000);
    check("client aborts mid-stream -> event 'cancelled' (never 'completed')", [ecan?.status, ecan?.completedAt], ["cancelled", null]);

    // expired ticket
    const pe = await dl(T, f2.id, { requestId: "px-expire-01" });
    await db.doc(`download_tickets/${pe.body.ticket}`).update({ expiresAt: Date.now() - 1000 });
    const ge = await fetch(`${BASE}/api/files/download?t=${pe.body.ticket}`); await ge.arrayBuffer();
    const eexp = await waitFor(owner.uid, pe.body.downloadId, (d) => d.status !== "started");
    check("expired ticket -> 410 and event 'expired' (not successful)", [ge.status, eexp?.status, eexp?.completedAt], [410, "expired", null]);

    // access removed between ticket and redemption
    const pv = await dl(TV, f1.id, { requestId: "px-revoke-01" });
    await db.doc(`project_members/${P}_${viewer.uid}`).delete(); await db.doc(`members/${W}_${viewer.uid}`).delete();
    const gv = await fetch(`${BASE}/api/files/download?t=${pv.body.ticket}`); await gv.arrayBuffer();
    const erev = await waitFor(viewer.uid, pv.body.downloadId, (d) => d.status !== "started");
    check("member removed after the ticket was issued -> 403 and event 'failed' (access_revoked)", [gv.status, erev?.status, erev?.reason], [403, "failed", "access_revoked"]);

    // object deleted before redemption
    const pm = await dl(T, f2.id, { requestId: "px-missing-01" });
    await bucket.file(f2.storagePath).delete();
    const gm = await fetch(`${BASE}/api/files/download?t=${pm.body.ticket}`); await gm.arrayBuffer();
    const emis = await waitFor(owner.uid, pm.body.downloadId, (d) => d.status !== "started");
    check("file removed before redemption -> 404 and event 'failed' (missing)", [gm.status, emis?.status, emis?.reason], [404, "failed", "missing"]);

    // external reviewer, proxied
    const link = await makeLink(f1.id, { canDownload: true });
    const cookie = await open(link);
    const xp = await extDl(link, cookie, { requestId: "px-ext-00001" });
    const gx = await fetch(`${BASE}/api/files/download?t=${xp.body.ticket}`); const xb = Buffer.from(await gx.arrayBuffer());
    const exx = await waitFor("_external", xp.body.downloadId, (d) => d.status !== "started");
    check("external proxied download: bytes identical; event resolved to 'completed' in the _external bucket, uid null", [gx.status, sha256Buf(xb) === f1.sha, exx?.status, exx?.uid], [200, true, "completed", null]);
  }

  console.log(state.failed ? `\n${state.failed} FAILED` : "\nALL PASSED");
  await purge();
  process.exit(state.failed ? 1 : 0);
})().catch(async (e) => { console.error(String(e.stack || e.message).slice(0, 900)); await purge().catch(() => undefined); process.exit(1); });
