// REAL external-reviewer download test through the app's OWN flow: the owner creates the review link with /api/review-shares, the reviewer opens it with /api/review/status
// (which mints the HttpOnly session cookie), then downloads with /api/review/download. Valid, expired, revoked, no-permission, wrong-token, out-of-scope-version and
// password-gated links are all exercised against the real bucket. The reviewer's download must be a SHORT-LIVED DIRECT URL for the ORIGINAL file, byte-identical.
const { db, bucket, BASE, MB, state, check, tok, post, mkUser, mkWorkspace, sha256Buf, purge, crypto } = require("./qalib.cjs");

(async () => {
  const owner = await mkUser("owner");
  const { W, P } = await mkWorkspace("rdl", owner);
  const T = await tok(owner.uid);
  const buf = crypto.randomBytes(3 * MB + 777), sha = sha256Buf(buf);
  const fileId = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const fileName = "reviewer clip (v1).mp4";
  const storagePath = `workspaces/${W}/projects/${P}/files/${fileId}/${fileName}`;
  await bucket.file(storagePath).save(buf, { contentType: "video/mp4" });
  const now = new Date().toISOString();
  await db.doc(`files/${fileId}`).set({ id: fileId, workspaceId: W, projectId: P, fileName, originalName: fileName, contentType: "video/mp4", assetType: "video", sizeBytes: buf.length, url: "", thumbnailUrl: null, storagePath, uploadedBy: { uid: owner.uid, displayName: "QA", email: owner.email, photoURL: null }, reviewStatus: "none", statusId: "x", stageId: null, assetGroupId: fileId, versionNumber: 1, previousVersionId: null, isLatestVersion: true, durationSeconds: 3, shareSettings: null, createdAt: now, updatedAt: now });

  async function makeLink(permissions) {
    const r = await post(T, "/api/review-shares", { action: "create", workspaceId: W, fileId, accessMode: "anyone_with_link", permissions, title: "QA link" });
    if (r.status !== 200) throw new Error(`create link ${r.status} ${JSON.stringify(r.body)}`);
    return { token: r.body.token, id: r.body.share.id };
  }
  /** The reviewer opens the link exactly like the browser does; the server answers with the session cookie. */
  async function openAsReviewer(link) {
    const res = await fetch(`${BASE}/api/review/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: link.token }) });
    const setCookie = res.headers.get("set-cookie") || "";
    return { status: res.status, cookie: setCookie.split(";")[0], body: await res.json().catch(() => ({})) };
  }
  const download = async (link, cookie, body = {}) => { const r = await fetch(`${BASE}/api/review/download`, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify({ token: link.token, ...body }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

  // ---- VALID link with download permission
  const ok = await makeLink({ canDownload: true });
  const s1 = await openAsReviewer(ok);
  check("reviewer opens the valid link: session cookie issued, state ready", [s1.status, s1.body.state, /^ofr_/.test(s1.cookie)], [200, "ready", true]);
  const d1 = await download(ok, s1.cookie);
  check("VALID link with download permission: 200 and a DIRECT signed URL (no proxy ticket)", [d1.status, typeof d1.body.url, d1.body.direct, d1.body.ticket], [200, "string", true, undefined]);
  const u = new URL(d1.body.url);
  check("URL: storage.googleapis.com, V4 signed, TTL <= 60 s (shorter than a member's 120 s), bound to this one object", [u.host, u.searchParams.get("X-Goog-Algorithm"), Number(u.searchParams.get("X-Goog-Expires")) <= 60, decodeURIComponent(u.pathname).endsWith(fileName)], ["storage.googleapis.com", "GOOG4-RSA-SHA256", true, true]);
  const res = await fetch(d1.body.url); const got = Buffer.from(await res.arrayBuffer());
  check("external DOWNLOAD is the ORIGINAL: 200, exact size, SHA-256 byte-identical, attachment + original filename, video/mp4", [res.status, got.length === buf.length, sha256Buf(got) === sha, /^attachment;.*reviewer clip/.test(res.headers.get("content-disposition") || ""), res.headers.get("content-type")], [200, true, true, true, "video/mp4"]);
  const rg = await fetch(d1.body.url, { headers: { Range: "bytes=0-99" } });
  check("Range works on the reviewer's direct download (206, 100 bytes)", [rg.status, (await rg.arrayBuffer()).byteLength], [206, 100]);
  const other = new URL(d1.body.url); other.pathname = other.pathname.replace(/[^/]+$/, "someone-elses-file.mp4");
  check("the URL can't be re-pointed at another object (403)", (await fetch(other)).status, 403);
  check("the URL can't write/overwrite (PUT refused)", (await fetch(d1.body.url, { method: "PUT", body: "x" })).status >= 400, true);

  // ---- URL expiry (real GCS): a signed URL that has passed its TTL is refused; a NEW authorized request still works while the link is valid
  const [shortUrl] = await bucket.file(storagePath).getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 3000 });
  await new Promise((r) => setTimeout(r, 20000));
  const exp = await fetch(shortUrl); const expText = await exp.text();
  check("an EXPIRED direct URL is refused by GCS (400 ExpiredToken)", [exp.status, expText.includes("ExpiredToken")], [400, true]);
  const again = await download(ok, s1.cookie);
  check("...and a fresh URL is issued only through the authorized endpoint while the link is still valid", [again.status, typeof again.body.url], [200, "string"]);

  // ---- NO download permission
  const noDl = await makeLink({ canDownload: false });
  const sNo = await openAsReviewer(noDl);
  check("link WITHOUT download permission: 403 permission_denied, no URL and no ticket", await download(noDl, sNo.cookie).then((x) => [x.status, x.body.code, x.body.url, x.body.ticket]), [403, "permission_denied", undefined, undefined]);

  // ---- unauthorized variants
  check("no reviewer session cookie: 401 auth_required", await download(ok, "").then((x) => [x.status, x.body.code]), [401, "auth_required"]);
  check("another link's cookie does NOT work for this link (401)", (await download(ok, sNo.cookie)).status, 401);
  check("garbage token: 404, nothing leaked", await download({ token: crypto.randomBytes(32).toString("base64url") }, s1.cookie).then((x) => [x.status, x.body.url]), [404, undefined]);
  check("a version outside the share's scope is refused (403)", await download(ok, s1.cookie, { version: 7 }).then((x) => [x.status, x.body.url]), [403, undefined]);

  // ---- password-protected link: the session hasn't passed the password gate
  const pw = await post(T, "/api/review-shares", { action: "create", workspaceId: W, fileId, accessMode: "anyone_with_link", permissions: { canDownload: true }, password: "correct horse battery" });
  const pwLink = { token: pw.body.token, id: pw.body.share.id };
  const sPw = await openAsReviewer(pwLink);
  check("password-protected link: opening it requires the password; download before the gate is refused (401)", [sPw.body.state, (await download(pwLink, sPw.cookie)).status], ["password", 401]);

  // ---- EXPIRED link (expiry lowered after creation, as time passing would)
  const exLink = await makeLink({ canDownload: true });
  const sEx = await openAsReviewer(exLink);
  await db.doc(`review_shares/${exLink.id}`).update({ expiresAt: new Date(Date.now() - 1000).toISOString() });
  check("EXPIRED link: 410 and no URL, even with a previously valid session", await download(exLink, sEx.cookie).then((x) => [x.status, x.body.url]), [410, undefined]);

  // ---- REVOKED link (through the real revoke route)
  const rev = await makeLink({ canDownload: true });
  const sRev = await openAsReviewer(rev);
  check("before revoking, this link downloads fine", (await download(rev, sRev.cookie)).status, 200);
  const rv = await post(T, "/api/review-shares", { action: "revoke", workspaceId: W, shareId: rev.id });
  check("owner revokes the link", rv.status, 200);
  check("REVOKED link: the next request is refused (410) — no new URL is issued", await download(rev, sRev.cookie).then((x) => [x.status, x.body.url]), [410, undefined]);

  check("no permanent public URL was exposed or stored (file.url stays empty)", (await db.doc(`files/${fileId}`).get()).data().url, "");

  console.log(state.failed ? `\n${state.failed} FAILED` : "\nALL PASSED");
  for (const col of ["review_shares", "reviews"]) for (const d of (await db.collection(col).where("workspaceId", "==", W).get()).docs) await d.ref.delete();
  await purge();
  process.exit(state.failed ? 1 : 0);
})().catch(async (e) => { console.error(String(e.stack || e.message).slice(0, 800)); await purge().catch(() => undefined); process.exit(1); });
