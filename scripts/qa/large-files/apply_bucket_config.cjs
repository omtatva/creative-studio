// Applies ONLY bucket CORS + lifecycle from the committed files via the Cloud Storage JSON API (equivalent to `gcloud storage buckets update --cors-file/--lifecycle-file`), after printing the BEFORE state,
// then reads both back and checks they equal the files. Touches no other bucket setting.   node apply_bucket_config.cjs [--rollback]  (rollback clears both)
const { bucket } = require("./qalib.cjs");
const fs = require("fs"), path = require("path");
const docs = path.resolve(__dirname, "../../../docs/infra");
const wantCors = JSON.parse(fs.readFileSync(path.join(docs, "cors.production.json"), "utf8"));
const wantLife = JSON.parse(fs.readFileSync(path.join(docs, "lifecycle.json"), "utf8"));
(async () => {
  const token = await bucket.storage.authClient.getAccessToken();
  const url = `https://storage.googleapis.com/storage/v1/b/${bucket.name}`;
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const read = async () => (await (await fetch(`${url}?fields=cors,lifecycle,location,name`, { headers: H })).json());
  const before = await read();
  console.log("BEFORE:", JSON.stringify({ cors: before.cors ?? null, lifecycle: before.lifecycle ?? null }));
  const rollback = process.argv.includes("--rollback");
  const r = await fetch(`${url}?fields=cors,lifecycle`, { method: "PATCH", headers: H, body: JSON.stringify(rollback ? { cors: [], lifecycle: { rule: [] } } : { cors: wantCors, lifecycle: wantLife }) });
  if (!r.ok) { console.error("PATCH failed:", r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  const after = await read();
  console.log("AFTER: ", JSON.stringify({ cors: after.cors ?? null, lifecycle: after.lifecycle ?? null }));
  if (!rollback) {
    const sameCors = JSON.stringify(after.cors) === JSON.stringify(wantCors);
    const sameLife = JSON.stringify(after.lifecycle?.rule) === JSON.stringify(wantLife.rule);
    console.log("read-back equals files:", { cors: sameCors, lifecycle: sameLife });
    process.exit(sameCors && sameLife ? 0 : 1);
  }
  process.exit(0);
})().catch((e) => { console.error(String(e.message).slice(0, 300)); process.exit(1); });
