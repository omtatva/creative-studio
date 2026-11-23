// Shared helpers for the real-Firebase QA scripts: disposable users/workspace, token minting, object upload via the Admin SDK, cleanup.
const path = require("path"), fs = require("fs"), crypto = require("crypto");
const root = require("path").resolve(__dirname, "../../..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const app = require(path.join(root, "node_modules/firebase-admin/lib/app/index.js"));
const authm = require(path.join(root, "node_modules/firebase-admin/lib/auth/index.js"));
const fsm = require(path.join(root, "node_modules/firebase-admin/lib/firestore/index.js"));
const stm = require(path.join(root, "node_modules/firebase-admin/lib/storage/index.js"));
app.initializeApp({ credential: app.cert(JSON.parse(fs.readFileSync(path.resolve(root, env.FIREBASE_SERVICE_ACCOUNT_PATH), "utf8"))), storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET });
const db = fsm.getFirestore();
const bucket = stm.getStorage().bucket();
const BASE = process.env.QA_BASE || "http://localhost:3000";
const RUN = Date.now();
const MB = 1024 * 1024, GB = 1024 * MB;
const state = { failed: 0, users: [], workspaces: [] };
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) state.failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`); return ok; };
const tok = async (uid) => { const c = await authm.getAuth().createCustomToken(uid); return (await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: c, returnSecureToken: true }) })).json()).idToken; };
const post = async (t, p, body) => { const r = await fetch(`${BASE}${p}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: JSON.stringify(body) }); return { status: r.status, headers: r.headers, body: await r.json().catch(() => ({})) }; };
const mkUser = async (label) => { const email = `qa-${label}-${RUN}@example.com`; const u = await authm.getAuth().createUser({ email, password: crypto.randomUUID() + "Aa1!", emailVerified: true, displayName: `QA ${label}` }); state.users.push(u.uid); return { uid: u.uid, email }; };
const now = () => new Date().toISOString();
async function mkWorkspace(label, owner, planId = "pro", custom = null) {
  const W = `qa-ws-${RUN}-${label}`;
  state.workspaces.push(W);
  const t = now();
  await db.doc(`workspaces/${W}`).set({ id: W, name: `QA ${label}`, ownerId: owner.uid, plan: planId, storageBytesUsed: 0, createdAt: t, updatedAt: t });
  await db.doc(`settings/${W}`).set({ workspaceId: W });
  await db.doc(`workspaces/${W}/billing/subscription`).set({ workspaceId: W, planId, status: "active", billingProvider: "manual", customEntitlements: custom, createdAt: t, updatedAt: t, trialEnd: null, trialStart: null });
  await db.doc(`members/${W}_${owner.uid}`).set({ id: `${W}_${owner.uid}`, workspaceId: W, userId: owner.uid, role: "owner", email: owner.email, displayName: "QA owner", status: "active", createdAt: t, updatedAt: t });
  const P = `${W}-p`;
  await db.doc(`projects/${P}`).set({ id: P, workspaceId: W, name: "QA project", isArchived: false, members: [], ownerId: owner.uid, createdAt: t, updatedAt: t });
  return { W, P };
}
const sha256Buf = (b) => crypto.createHash("sha256").update(b).digest("hex");
async function purge() {
  for (const W of state.workspaces) {
    await bucket.deleteFiles({ prefix: `workspaces/${W}/` }).catch(() => undefined);
    for (const col of ["members", "files", "projects", "workspace_invites", "tasks", "project_members", "upload_sessions"]) for (const d of (await db.collection(col).where("workspaceId", "==", W).get().catch(() => ({ docs: [] }))).docs) await d.ref.delete();
    for (const d of (await db.collection("platform_audit_logs").where("workspaceId", "==", W).get()).docs) await d.ref.delete();
    for (const d of (await db.collection("download_tickets").where("workspaceId", "==", W).get().catch(() => ({ docs: [] }))).docs) await d.ref.delete();
    await db.recursiveDelete(db.doc(`workspaces/${W}`)).catch(() => undefined); // also removes subcollections (download history, billing, ...)
    await db.doc(`settings/${W}`).delete().catch(() => undefined);
  }
  for (const uid of state.users) { await db.doc(`users/${uid}`).delete().catch(() => undefined); await authm.getAuth().deleteUser(uid).catch(() => undefined); }
  console.log("cleanup done");
}
module.exports = { env, db, bucket, BASE, RUN, MB, GB, state, check, tok, post, mkUser, mkWorkspace, sha256Buf, purge, now, crypto };
