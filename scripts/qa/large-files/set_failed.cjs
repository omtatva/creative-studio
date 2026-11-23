// Test helper: marks ONE test file's processing as failed (so the UI shows "Processing failed" + Retry).  node set_failed.cjs <fileId>
const { db } = require("./qalib.cjs");
(async () => {
  await db.doc(`files/${process.argv[2]}`).update({ processing: { status: "failed", attempts: 1, error: "Processing failed.", leaseUntil: null, updatedAt: Date.now() } });
  console.log("marked failed");
  process.exit(0);
})();
