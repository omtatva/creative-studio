// Mints signed POST policies (V4) for disposable objects under qa-bw/ so a BROWSER can measure its own upload throughput to GCS without CORS (a no-cors form POST is a "simple" request).
//   node browser_policies.cjs make N  -> prints JSON [{url, fields}]     node browser_policies.cjs clean -> deletes qa-bw/ objects
const { bucket } = require("./qalib.cjs");
(async () => {
  if (process.argv[2] === "clean") { const [o] = await bucket.getFiles({ prefix: "qa-bw/" }); for (const f of o) await f.delete({ ignoreNotFound: true }); console.error("removed", o.length); process.exit(0); }
  const n = Number(process.argv[3] || 8); const out = [];
  for (let i = 0; i < n; i++) {
    const [p] = await bucket.file(`qa-bw/browser-${Date.now()}-${i}.bin`).generateSignedPostPolicyV4({ expires: Date.now() + 3600_000, fields: { "Content-Type": "application/octet-stream" }, conditions: [["content-length-range", 0, 200 * 1024 * 1024]] });
    out.push({ url: p.url, fields: p.fields });
  }
  console.log(JSON.stringify(out));
  process.exit(0);
})();
