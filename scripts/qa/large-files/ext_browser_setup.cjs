// Seeds a DISPOSABLE workspace + a real 3 MB video file + an external review link (download allowed) for a REAL-BROWSER test of the public reviewer page, and leaves them in place.
//   node ext_browser_setup.cjs setup   -> writes ext_browser_state.json (file sha/size, share url)      node ext_browser_setup.cjs cleanup -> removes everything it created
const { db, bucket, BASE, MB, state, tok, post, mkUser, mkWorkspace, sha256Buf, purge, crypto } = require("./qalib.cjs");
const fs = require("fs"), path = require("path");
const STATE = path.join(__dirname, "ext_browser_state.json");

(async () => {
  if (process.argv[2] === "cleanup") {
    const s = JSON.parse(fs.readFileSync(STATE, "utf8"));
    state.workspaces.push(s.W); state.users.push(...s.uids);
    for (const d of (await db.collection("review_shares").where("workspaceId", "==", s.W).get()).docs) await d.ref.delete();
    for (const col of ["review_sessions", "review_requests", "audit_logs"]) for (const d of (await db.collection(col).where("workspaceId", "==", s.W).get().catch(() => ({ docs: [] }))).docs) await d.ref.delete();
    await purge(); fs.unlinkSync(STATE); process.exit(0);
  }
  const owner = await mkUser("owner");
  const { W, P } = await mkWorkspace("extbrowser", owner);
  const T = await tok(owner.uid);
  const buf = crypto.randomBytes(3 * MB + 777);
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20), fileName = "browser-reviewer-clip.mp4";
  const storagePath = `workspaces/${W}/projects/${P}/files/${id}/${fileName}`;
  await bucket.file(storagePath).save(buf, { contentType: "video/mp4" });
  const now = new Date().toISOString();
  await db.doc(`files/${id}`).set({ id, workspaceId: W, projectId: P, fileName, originalName: fileName, contentType: "video/mp4", assetType: "video", sizeBytes: buf.length, url: "", thumbnailUrl: null, storagePath, uploadedBy: { uid: owner.uid, displayName: "QA", email: owner.email, photoURL: null }, reviewStatus: "none", statusId: "x", stageId: null, assetGroupId: id, versionNumber: 1, previousVersionId: null, isLatestVersion: true, durationSeconds: 3, shareSettings: null, createdAt: now, updatedAt: now });
  const r = await post(T, "/api/review-shares", { action: "create", workspaceId: W, fileId: id, accessMode: "anyone_with_link", permissions: { canDownload: true }, title: "Browser QA" });
  if (r.status !== 200) throw new Error(`link ${r.status} ${JSON.stringify(r.body)}`);
  fs.writeFileSync(STATE, JSON.stringify({ W, P, uids: [owner.uid], fileId: id, fileName, sizeBytes: buf.length, sha256: sha256Buf(buf), url: `${BASE}/share/${r.body.token}`, ownerUid: owner.uid }, null, 1));
  console.log(JSON.stringify({ url: `${BASE}/share/${r.body.token}`, sizeBytes: buf.length, sha256: sha256Buf(buf) }));
  process.exit(0);
})().catch((e) => { console.error(String(e.stack || e.message).slice(0, 600)); process.exit(1); });
