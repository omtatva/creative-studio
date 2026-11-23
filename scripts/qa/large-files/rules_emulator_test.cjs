// Firestore RULES tests on the REAL Firestore emulator (the rules in firebase-config/firestore.rules), no production access.
//   PATH=<jre>/bin:$PATH RULES_TEST_MODULES=<dir with node_modules/@firebase/rules-unit-testing + firebase> \
//     firebase emulators:exec --only firestore --project demo-feedo "node scripts/qa/large-files/rules_emulator_test.cjs"
const path = require("path"), fs = require("fs");
const mods = process.env.RULES_TEST_MODULES;
if (!mods) { console.error("Set RULES_TEST_MODULES"); process.exit(2); }
const req = (m) => require(path.join(mods, "node_modules", m));
const { initializeTestEnvironment, assertSucceeds, assertFails } = req("@firebase/rules-unit-testing");
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, limit } = req("firebase/firestore");
let failed = 0, passed = 0;
const t = async (name, p) => { try { await p; passed++; console.log(`PASS  ${name}`); } catch (e) { failed++; console.log(`FAIL  ${name}  ${String(e.message).slice(0, 140)}`); } };

(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
  const env = await initializeTestEnvironment({ projectId: "demo-feedo", firestore: { rules: fs.readFileSync(path.resolve(__dirname, "../../../firebase-config/firestore.rules"), "utf8"), host, port: Number(port) } });
  const T = "2026-01-01T00:00:00.000Z";
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const S = (p, d) => setDoc(doc(db, p), d);
    await S("workspaces/ws1", { id: "ws1", ownerId: "owner1", name: "W1" });
    await S("workspaces/ws2", { id: "ws2", ownerId: "owner2", name: "W2" });
    for (const [w, u, role] of [["ws1", "owner1", "owner"], ["ws1", "userA", "member"], ["ws1", "userB", "member"], ["ws1", "userV", "member"], ["ws2", "owner2", "owner"], ["ws2", "userC", "member"]])
      await S(`members/${w}_${u}`, { id: `${w}_${u}`, workspaceId: w, userId: u, role, status: "active", createdAt: T });
    await S("projects/p1", { id: "p1", workspaceId: "ws1", name: "P1", members: [], ownerId: "owner1", isArchived: false });
    await S("project_members/p1_userA", { id: "p1_userA", projectId: "p1", uid: "userA", workspaceId: "ws1", role: "editor", createdAt: T });
    await S("project_members/p1_userV", { id: "p1_userV", projectId: "p1", uid: "userV", workspaceId: "ws1", role: "viewer", createdAt: T });
    await S("files/f1", { id: "f1", workspaceId: "ws1", projectId: "p1", fileName: "a.mp4", shareSettings: null, uploadedBy: { uid: "userA" } });
    await S("files/f1/comments/c1", { id: "c1", text: "hi", authorId: "userA" });
    for (const [bucket, id] of [["userA", "e1"], ["userB", "e1"], ["_external", "x1"]]) await S(`workspaces/ws1/download_history/${bucket}/items/${id}`, { id, workspaceId: "ws1", uid: bucket === "_external" ? null : bucket, status: "started", fileName: "a.mp4" });
    await S("workspaces/ws2/download_history/userC/items/e1", { id: "e1", workspaceId: "ws2", uid: "userC", status: "started" });
    await S("upload_sessions/s1", { id: "s1", workspaceId: "ws1" });
    await S("download_tickets/k1", { uid: "userA" });
    await S("review_shares/r1", { workspaceId: "ws1" });
  });
  const as = (uid, token = {}) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...token }).firestore();
  const anon = () => env.unauthenticatedContext().firestore();
  const hist = (w, b, id = "e1") => `workspaces/${w}/download_history/${b}/items/${id}`;

  console.log("--- download_history");
  await t("member reads THEIR OWN history doc", assertSucceeds(getDoc(doc(as("userA"), hist("ws1", "userA")))));
  await t("member lists THEIR OWN feed (the live listener's query)", assertSucceeds(getDocs(query(collection(as("userA"), `workspaces/ws1/download_history/userA/items`), limit(100)))));
  await t("member CANNOT read another member's history", assertFails(getDoc(doc(as("userA"), hist("ws1", "userB")))));
  await t("member CANNOT list another member's feed", assertFails(getDocs(collection(as("userA"), `workspaces/ws1/download_history/userB/items`))));
  await t("member CANNOT read the _external reviewer bucket", assertFails(getDoc(doc(as("userA"), hist("ws1", "_external", "x1")))));
  await t("member CANNOT list the _external reviewer bucket", assertFails(getDocs(collection(as("userA"), `workspaces/ws1/download_history/_external/items`))));
  await t("even the WORKSPACE OWNER cannot read the _external bucket or members' feeds", Promise.all([assertFails(getDoc(doc(as("owner1"), hist("ws1", "_external", "x1")))), assertFails(getDoc(doc(as("owner1"), hist("ws1", "userA"))))]));
  await t("even the Super Admin account cannot read others' feeds or _external via the client", Promise.all([assertFails(getDoc(doc(as("sa", { email: "itsupport@omtatvadigitals.com" }), hist("ws1", "userA")))), assertFails(getDoc(doc(as("sa", { email: "itsupport@omtatvadigitals.com" }), hist("ws1", "_external", "x1"))))]));
  await t("client CANNOT create a history event (even own feed)", assertFails(setDoc(doc(as("userA"), hist("ws1", "userA", "forged")), { status: "completed", uid: "userA" })));
  await t("client CANNOT forge-complete / edit an event", assertFails(updateDoc(doc(as("userA"), hist("ws1", "userA")), { status: "completed" })));
  await t("client CANNOT delete an event", assertFails(deleteDoc(doc(as("userA"), hist("ws1", "userA")))));
  await t("signed-out user denied", assertFails(getDoc(doc(anon(), hist("ws1", "userA")))));
  await t("a workspace member from ANOTHER workspace cannot read ws1's feed", assertFails(getDoc(doc(as("userC"), hist("ws1", "userA")))));
  await t("a user cannot read their own-uid feed path in a workspace they don't belong to", assertFails(getDoc(doc(as("userA"), hist("ws2", "userA")))));
  await t("ws2 member reads their own ws2 feed", assertSucceeds(getDoc(doc(as("userC"), hist("ws2", "userC")))));

  console.log("--- upload_sessions / other server-only collections");
  for (const [label, fn] of [["read", (d) => getDoc(d)], ["create", (d) => setDoc(doc(d.firestore, "upload_sessions/new"), { workspaceId: "ws1" })], ["update", (d) => updateDoc(d, { state: "completed" })], ["delete", (d) => deleteDoc(d)]])
    await t(`upload_sessions: authenticated member ${label} denied`, assertFails(fn(doc(as("userA"), "upload_sessions/s1"))));
  await t("upload_sessions: workspace owner and Super Admin denied too", Promise.all([assertFails(getDoc(doc(as("owner1"), "upload_sessions/s1"))), assertFails(getDoc(doc(as("sa", { email: "itsupport@omtatvadigitals.com" }), "upload_sessions/s1")))]));
  await t("upload_sessions: list denied", assertFails(getDocs(collection(as("userA"), "upload_sessions"))));
  await t("upload_sessions: signed-out denied", assertFails(getDoc(doc(anon(), "upload_sessions/s1"))));
  for (const c of ["download_tickets/k1", "review_shares/r1"]) await t(`${c.split("/")[0]}: (unchanged) server-only`, assertFails(getDoc(doc(as("userA"), c))));

  console.log("--- existing permissions unchanged (project / file / comment / workspace isolation)");
  await t("project member (editor) reads the file", assertSucceeds(getDoc(doc(as("userA"), "files/f1"))));
  await t("project viewer reads the file", assertSucceeds(getDoc(doc(as("userV"), "files/f1"))));
  await t("workspace owner reads the file", assertSucceeds(getDoc(doc(as("owner1"), "files/f1"))));
  await t("workspace member WITHOUT project membership cannot read the file", assertFails(getDoc(doc(as("userB"), "files/f1"))));
  await t("another workspace's member cannot read the file", assertFails(getDoc(doc(as("userC"), "files/f1"))));
  await t("project member reads comments; outsider cannot", Promise.all([assertSucceeds(getDoc(doc(as("userA"), "files/f1/comments/c1"))), assertFails(getDoc(doc(as("userC"), "files/f1/comments/c1")))]));
  await t("client file create is still refused (server-only)", assertFails(setDoc(doc(as("userA"), "files/new"), { workspaceId: "ws1", projectId: "p1" })));
  await t("project editor can update the file record; project viewer cannot", Promise.all([assertSucceeds(updateDoc(doc(as("userA"), "files/f1"), { fileName: "b.mp4" })), assertFails(updateDoc(doc(as("userV"), "files/f1"), { fileName: "c.mp4" }))]));
  await t("outsider cannot read another workspace's members or project", Promise.all([assertFails(getDoc(doc(as("userC"), "projects/p1"))), assertFails(getDoc(doc(as("userC"), "workspaces/ws1")))]));

  await env.cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(String(e.stack || e.message).slice(0, 600)); process.exit(1); });
