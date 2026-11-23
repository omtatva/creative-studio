// After the REAL-BROWSER reviewer test: prints what the server recorded for the clicks (history events in the reserved _external bucket) — no internal data expected.
const { db } = require("./qalib.cjs");
const fs = require("fs"), path = require("path");
(async () => {
  const s = JSON.parse(fs.readFileSync(path.join(__dirname, "ext_browser_state.json"), "utf8"));
  const ev = (await db.collection(`workspaces/${s.W}/download_history/_external/items`).get()).docs.map((d) => d.data());
  console.log(JSON.stringify(ev.map((e) => ({ actorType: e.actorType, uid: e.uid, status: e.status, method: e.method, fileName: e.fileName, versionNumber: e.versionNumber, keys: Object.keys(e).sort().join(",") })), null, 1));
  console.log("events:", ev.length, "| in owner's personal feed:", (await db.collection(`workspaces/${s.W}/download_history/${s.ownerUid}/items`).get()).size);
  process.exit(0);
})();
