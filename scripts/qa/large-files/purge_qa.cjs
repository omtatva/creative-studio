const { db, bucket, state, purge } = require("./qalib.cjs");
const authm = require(require("path").resolve(__dirname, "../../../node_modules/firebase-admin/lib/auth/index.js"));
(async () => {
  const ws = (await db.collection("workspaces").get()).docs.filter((d) => d.id.startsWith("qa-ws-")).map((d) => d.id);
  state.workspaces.push(...ws);
  let page; do { const r = await authm.getAuth().listUsers(1000, page); for (const u of r.users) if (/^qa-.*@(example\.com|other\.test)$/.test(u.email || "")) state.users.push(u.uid); page = r.pageToken; } while (page);
  const [objs] = await bucket.getFiles({ prefix: "qa-bw/" }); for (const o of objs) await o.delete({ ignoreNotFound: true });
  const sess = await db.collection("upload_sessions").get(); for (const d of sess.docs) if (String(d.data().workspaceId).startsWith("qa-ws-")) await d.ref.delete();
  console.log(`purging ${ws.length} QA workspaces, ${state.users.length} QA users, ${objs.length} qa-bw objects`);
  await purge(); process.exit(0);
})();
