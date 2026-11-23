// READ-ONLY: lists download-history events in a workspace (optionally only for one fileId).  node show_history.cjs <workspaceId> [fileId]
const { db } = require("./qalib.cjs");
(async () => {
  const [W, fileId] = process.argv.slice(2);
  const buckets = await db.collection(`workspaces/${W}/download_history`).listDocuments();
  const rows = [];
  for (const b of buckets) for (const d of (await b.collection("items").get()).docs) { const e = d.data(); if (!fileId || e.fileId === fileId) rows.push({ bucket: b.id === "_external" ? "_external" : "uid:" + b.id.slice(0, 6) + "…", id: e.id.slice(0, 8), status: e.status, method: e.method, actorType: e.actorType, fileName: e.fileName, v: e.versionNumber, size: e.sizeBytes, project: e.projectId, at: new Date(e.createdAt).toISOString() }); }
  rows.sort((a, b) => a.at.localeCompare(b.at));
  console.log(JSON.stringify(rows, null, 1));
  process.exit(0);
})();
