// REAL download tests against the running app + the real bucket on a DISPOSABLE workspace. Records status, headers, sizes and SHA-256 for every case.
// Usage: node dl_e2e.cjs            (current behaviour)
const { db, bucket, BASE, MB, state, check, tok, post, mkUser, mkWorkspace, sha256Buf, purge, now, crypto, RUN } = require("./qalib.cjs");

(async () => {
  const owner = await mkUser("owner"), outsider = await mkUser("outsider"), member = await mkUser("member");
  const { W, P } = await mkWorkspace("dl", owner);
  const t = now();
  await db.doc(`members/${W}_${member.uid}`).set({ id: `${W}_${member.uid}`, workspaceId: W, userId: member.uid, role: "member", email: member.email, displayName: "QA member", status: "active", createdAt: t, updatedAt: t });
  await db.doc(`project_members/${P}_${member.uid}`).set({ id: `${P}_${member.uid}`, projectId: P, uid: member.uid, workspaceId: W, role: "viewer", createdAt: t });
  const [tOwner, tOut, tMember] = [await tok(owner.uid), await tok(outsider.uid), await tok(member.uid)];

  // --- fixtures: real objects in the real bucket + file records created through the REAL finalize route (the "old upload" path)
  const fixtures = [
    { key: "video-small", name: "small clip.mp4", type: "video/mp4", bytes: 1 * MB },
    { key: "video-50", name: "big take 01.mp4", type: "video/mp4", bytes: 50 * MB },
    { key: "image", name: "poster.png", type: "image/png", bytes: 300 * 1024 },
    { key: "pdf", name: "brief.pdf", type: "application/pdf", bytes: 200 * 1024 },
    { key: "special", name: "My Final Cut (v2) — é ü #1 & more [draft].mp4", type: "video/mp4", bytes: 700 * 1024 },
  ];
  for (const f of fixtures) {
    f.buf = crypto.randomBytes(f.bytes);
    f.sha = sha256Buf(f.buf);
    f.fileId = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    f.storagePath = `workspaces/${W}/projects/${P}/files/${f.fileId}/${f.name}`;
    const token = crypto.randomUUID();
    await bucket.file(f.storagePath).save(f.buf, { contentType: f.type, metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(f.storagePath)}?alt=media&token=${token}`;
    const r = await post(tOwner, "/api/files/finalize", { workspaceId: W, projectId: P, fileId: f.fileId, fileName: f.name, contentType: f.type, storagePath: f.storagePath, url, thumbnailUrl: null, stageId: null, assetGroupId: f.fileId, versionNumber: 1, uploadedBy: { uid: owner.uid, displayName: "QA owner", email: owner.email } });
    check(`fixture ${f.key} finalized via the real route`, [r.status, r.body.success], [200, true]);
  }
  // a file with a generated "proxy"/thumbnail derivative stored separately: the default download must still be the ORIGINAL
  const orig = fixtures[1];
  await bucket.file(`workspaces/${W}/projects/${P}/files/${orig.fileId}/thumb.jpg`).save(crypto.randomBytes(20 * 1024), { contentType: "image/jpeg" });
  await bucket.file(`workspaces/${W}/projects/${P}/files/${orig.fileId}/proxy-720p.mp4`).save(crypto.randomBytes(2 * MB), { contentType: "video/mp4" });

  async function download(token, f, label, rangeHeader) {
    const t0 = Date.now();
    const r1 = await post(token, "/api/files/download", { kind: "file", workspaceId: W, fileId: f.fileId });
    if (r1.status !== 200) return { stage: "post", status: r1.status, body: r1.body };
    const direct = typeof r1.body.url === "string";
    const res = await fetch(direct ? r1.body.url : `${BASE}/api/files/download?t=${r1.body.ticket}`, { headers: rangeHeader ? { Range: rangeHeader } : {} });
    const buf = Buffer.from(await res.arrayBuffer());
    return { stage: "get", status: res.status, headers: res.headers, size: buf.length, sha: sha256Buf(buf), ms: Date.now() - t0, ticket: r1.body.ticket, url: r1.body.url, direct, post: r1 };
  }

  for (const f of fixtures) {
    const d = await download(tOwner, f, f.key);
    check(`DOWNLOAD ${f.key}: 200, size matches, SHA-256 identical to the uploaded original`, [d.status, d.size === f.bytes, d.sha === f.sha], [200, true, true]);
    check(`DOWNLOAD ${f.key}: Content-Type + attachment disposition`, [d.headers.get("content-type"), /^attachment;/.test(d.headers.get("content-disposition") || "")], [f.type, true]);
    if (f.key === "special") {
      const cd = d.headers.get("content-disposition") || "";
      check("special filename: RFC 5987 filename* decodes to the exact original name", decodeURIComponent((/filename\*=UTF-8''([^;]+)/.exec(cd) || [])[1] || ""), f.name);
      console.log(`      (header: ${cd})`);
    }
    console.log(`      ${f.key}: ${d.direct ? "DIRECT-from-GCS" : "proxied"} ${d.status} ${(d.size / MB).toFixed(2)} MB in ${d.ms} ms; content-length=${d.headers.get("content-length")}; accept-ranges=${d.headers.get("accept-ranges")}`);
  }
  const proxyCase = await download(tOwner, orig, "proxy-sibling");
  check("file WITH a proxy + thumbnail stored beside it: default download is still the ORIGINAL bytes", [proxyCase.size === orig.bytes, proxyCase.sha === orig.sha], [true, true]);

  // authorization
  check("outsider (no membership) cannot get a ticket (403)", (await download(tOut, fixtures[0], "x")).status, 403);
  check("workspace member who is a project viewer MAY download (feature allowing)", [200, 403].includes((await download(tMember, fixtures[0], "x")).status), true);
  const unauth = await fetch(`${BASE}/api/files/download`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "file", workspaceId: W, fileId: fixtures[0].fileId }) });
  check("no token -> 401", unauth.status, 401);
  // ticket semantics
  const d1 = await download(tOwner, fixtures[0], "ticket");
  const DIRECT = d1.direct; console.log(`      (download mode this run: ${DIRECT ? "DIRECT signed GCS URL" : "ticketed proxy"})`);
  if (DIRECT) { const u = new URL(d1.url); check("direct URL: V4 signed, host is storage.googleapis.com, TTL <= 120 s, read-only to ONE object", [u.host, u.searchParams.get("X-Goog-Algorithm"), Number(u.searchParams.get("X-Goog-Expires")) <= 120, decodeURIComponent(u.pathname).endsWith(fixtures[0].name)], ["storage.googleapis.com", "GOOG4-RSA-SHA256", true, true]); check("direct URL: response-content-disposition + type are part of the signature", [u.searchParams.has("response-content-disposition"), u.searchParams.get("response-content-type")], [true, "video/mp4"]); const other = new URL(d1.url); other.pathname = other.pathname.replace(fixtures[0].fileId, fixtures[1].fileId).replace(encodeURIComponent(fixtures[0].name), encodeURIComponent(fixtures[1].name)); check("direct URL can NOT be re-pointed at a different object (signature mismatch -> 403)", (await fetch(other)).status, 403); const wrongMethod = await fetch(d1.url, { method: "PUT", body: "x" }); check("direct URL can NOT be used to write/overwrite (PUT refused)", wrongMethod.status >= 400, true); }
  if (!DIRECT) { const reuse = await fetch(`${BASE}/api/files/download?t=${d1.ticket}`); check("ticket is single-use (second redemption -> 410)", reuse.status, 410); const r2 = await post(tOwner, "/api/files/download", { kind: "file", workspaceId: W, fileId: fixtures[0].fileId }); await db.doc(`download_tickets/${r2.body.ticket}`).update({ expiresAt: Date.now() - 1000 }); check("expired ticket -> 410, and a NEW authorized ticket works (regeneration)", [(await fetch(`${BASE}/api/files/download?t=${r2.body.ticket}`)).status, (await download(tOwner, fixtures[0], "regen")).status], [410, 200]); }
  else { const sU = await bucket.file(fixtures[0].storagePath).getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 3000 }); await new Promise((r) => setTimeout(r, 20000)); const ex = await fetch(sU[0]); const exText = await ex.text(); check("EXPIRED signed download URL is refused by GCS (400 ExpiredToken); a NEW authorized URL then works (regeneration)", [ex.status, exText.includes("ExpiredToken"), (await download(tOwner, fixtures[0], "regen")).status], [400, true, 200]); }
  // cross-workspace: another workspace's owner can't download this file
  const owner2 = await mkUser("owner2"); const other = await mkWorkspace("dl2", owner2); const tOwner2 = await tok(owner2.uid);
  const cross = await post(tOwner2, "/api/files/download", { kind: "file", workspaceId: other.W, fileId: fixtures[0].fileId });
  check("cross-workspace: B's owner asking for A's file via B's workspaceId -> 404", cross.status, 404);
  const cross2 = await post(tOwner2, "/api/files/download", { kind: "file", workspaceId: W, fileId: fixtures[0].fileId });
  check("cross-workspace: B's owner naming A's workspace -> 403", cross2.status, 403);

  // HTTP Range on the current ticket GET
  const rg = await download(tOwner, orig, "range", "bytes=0-1023");
  check("Range request: ", [rg.status, rg.size], [206, 1024]);
  console.log(`      Range result on the app download route: status=${rg.status} bytes=${rg.size} content-range=${rg.headers?.get("content-range")}`);

  console.log(state.failed ? `\n${state.failed} FAILED` : "\nALL PASSED");
  await purge();
  process.exit(state.failed ? 1 : 0);
})().catch(async (e) => { console.error(String(e.stack || e.message).slice(0, 700)); await purge().catch(() => undefined); process.exit(1); });
