// Fallback test helper for ONE test file: overwrites ONLY its derived proxy object with junk bytes (or restores nothing — re-run the processor retry to regenerate). The original is never touched.
//   node break_proxy.cjs <fileId>
const { db, bucket, crypto } = require("./qalib.cjs");
(async () => {
  const f = (await db.doc(`files/${process.argv[2]}`).get()).data();
  if (!f?.processing?.proxyPath || !f.processing.proxyPath.includes("/derived/")) { console.log("no derived proxy on this file"); process.exit(1); }
  const before = await bucket.file(f.storagePath).getMetadata().then(([m]) => m.md5Hash);
  await bucket.file(f.processing.proxyPath).save(crypto.randomBytes(200 * 1024), { contentType: "video/mp4" });
  const after = await bucket.file(f.storagePath).getMetadata().then(([m]) => m.md5Hash);
  console.log("proxy overwritten with junk; original md5 unchanged:", before === after);
  process.exit(0);
})();
