// READ-ONLY: prints a file record's key fields, processing state, the GCS object size, and (with --sha) streams the object to compute its SHA-256.  node inspect_file.cjs <fileId> [--sha]
const { db, bucket, crypto } = require("./qalib.cjs");
(async () => {
  let id = process.argv[2];
  if (id.includes(".")) { const q = await db.collection("files").where("fileName", "==", id).get(); const newest = q.docs.sort((a, b) => (b.data().createdAt?._seconds ?? 0) - (a.data().createdAt?._seconds ?? 0))[0]; if (!newest) { console.log("no file named", id); process.exit(1); } id = newest.id; console.log("fileId:", id); } // a file NAME instead of an id: newest match
  const snap = await db.doc(`files/${id}`).get();
  if (!snap.exists) { console.log("no such file"); process.exit(1); }
  const f = snap.data(); const p = f.processing || null;
  const [meta] = await bucket.file(f.storagePath).getMetadata();
  const out = { fileName: f.fileName, sizeBytes: f.sizeBytes, objectBytes: Number(meta.size), uploadMethod: f.uploadMethod ?? "resumable", versionNumber: f.versionNumber, url: f.url ? "(has permanent url)" : "", createdAt: f.createdAt,
    processing: p && { status: p.status, attempts: p.attempts, error: p.error, startedAt: p.startedAt && new Date(p.startedAt).toISOString(), finishedAt: p.finishedAt && new Date(p.finishedAt).toISOString(), seconds: p.startedAt && p.finishedAt ? +((p.finishedAt - p.startedAt) / 1000).toFixed(1) : null, metadata: p.metadata, thumbnailPath: !!p.thumbnailPath, proxyPath: !!p.proxyPath, proxyBytes: p.proxyBytes, proxySkipped: p.proxySkipped } };
  if (process.argv.includes("--sha")) { const h = crypto.createHash("sha256"); await new Promise((res, rej) => bucket.file(f.storagePath).createReadStream().on("data", (c) => h.update(c)).on("end", res).on("error", rej)); out.sha256 = h.digest("hex"); }
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
