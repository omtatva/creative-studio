// REAL tests of invite acceptance + email verification (disposable users/workspaces on the real Firebase project, cleaned up afterwards; dev server must be running):
//   A. the ACTUAL client code in src/lib/firebase/auth.ts (signUpWithEmail / resendVerificationEmail / refreshEmailVerified) run against real Firebase Auth
//   B. the pure helpers in src/lib/auth/emailVerification.ts
//   C. the REAL /api/invites/accept route: unverified rejection, server-side (not client-claim) verification, verified acceptance, Google-provider acceptance, expired / used /
//      cancelled invites, unauthorized, cross-workspace / wrong-account, allowed-domain, already-member, duplicate clicks.
// Note: the Firebase verification EMAIL itself goes to a reserved example.com address; "the person clicked the link" is simulated with the Admin SDK (updateUser emailVerified:true).
const path = require("path"), fs = require("fs");
const { db, env, BASE, state, check, tok, post, mkUser, mkWorkspace, purge, now, crypto, RUN } = require("../large-files/qalib.cjs");
const adminAuth = require(path.resolve(__dirname, "../../../node_modules/firebase-admin/lib/auth/index.js")).getAuth();
const { pathToFileURL } = require("url");
const GEN = path.join(__dirname, "_gen");
const decodeClaims = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ================= A. real client auth code against real Firebase Auth =================
  fs.mkdirSync(GEN, { recursive: true });
  fs.writeFileSync(path.join(GEN, "config.ts"), `import { initializeApp } from "firebase/app"; import { getAuth, inMemoryPersistence } from "firebase/auth";
const app = initializeApp({ apiKey: ${JSON.stringify(env.NEXT_PUBLIC_FIREBASE_API_KEY)}, authDomain: ${JSON.stringify(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN)}, projectId: ${JSON.stringify(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)} });
export const auth = getAuth(app); auth.setPersistence(inMemoryPersistence);`);
  fs.writeFileSync(path.join(GEN, "auth.ts"), fs.readFileSync(path.resolve(__dirname, "../../../src/lib/firebase/auth.ts"), "utf8").replace('from "./config"', 'from "./config.ts"'));
  // record every Identity Toolkit call the SDK makes (to prove a VERIFY_EMAIL mail was requested) and optionally make the send fail
  const calls = []; let failSend = false; const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (/accounts:sendOobCode/.test(url)) {
      const body = JSON.parse(init?.body || "{}");
      if (failSend) { calls.push({ type: body.requestType, status: 400 }); return new Response(JSON.stringify({ error: { code: 400, message: "TOO_MANY_ATTEMPTS_TRY_LATER" } }), { status: 400, headers: { "Content-Type": "application/json" } }); }
      const res = await realFetch(input, init); calls.push({ type: body.requestType, status: res.status }); return res;
    }
    return realFetch(input, init);
  };
  const A = await import(pathToFileURL(path.join(GEN, "auth.ts")).href);
  const { auth } = await import(pathToFileURL(path.join(GEN, "config.ts")).href);
  const H = await import(pathToFileURL(path.resolve(__dirname, "../../../src/lib/auth/emailVerification.ts")).href);

  const emailA = `qa-signup-${RUN}@example.com`;
  const user = await A.signUpWithEmail(emailA, crypto.randomUUID() + "Aa1!", "QA Signup");
  state.users.push(user.uid);
  const rec = await adminAuth.getUser(user.uid);
  check("NEW email/password signup creates the account (display name set)", [rec.email, rec.displayName, rec.providerData.map((p) => p.providerId)], [emailA, "QA Signup", ["password"]]);
  check("signup starts UNVERIFIED (the invite step has something to enforce)", rec.emailVerified, false);
  check("verification email SENT at signup (Identity Toolkit sendOobCode VERIFY_EMAIL, HTTP 200, exactly one)", calls.filter((c) => c.type === "VERIFY_EMAIL"), [{ type: "VERIFY_EMAIL", status: 200 }]);

  failSend = true;
  const user2 = await A.signUpWithEmail(`qa-signup2-${RUN}@example.com`, crypto.randomUUID() + "Aa1!", "QA Signup 2");
  state.users.push(user2.uid);
  failSend = false;
  check("signup still SUCCEEDS when the verification email can't be sent (best-effort; Resend is available later)", [(await adminAuth.getUser(user2.uid)).email, calls.at(-1)], [`qa-signup2-${RUN}@example.com`, { type: "VERIFY_EMAIL", status: 400 }]);

  // RESEND: user2 never actually received a mail (its signup send was made to fail above), so a resend succeeds for them.
  await auth.updateCurrentUser(user2);
  const before = calls.filter((c) => c.type === "VERIFY_EMAIL" && c.status === 200).length;
  await A.resendVerificationEmail();
  check("RESEND verification: a new VERIFY_EMAIL request succeeds for the signed-in user", calls.filter((c) => c.type === "VERIFY_EMAIL" && c.status === 200).length, before + 1);
  // The first user was sent a mail seconds ago: REAL Firebase throttles an immediate second one (the reason the page enforces a 60 s cooldown and maps this error).
  await auth.updateCurrentUser(user);
  let throttled = null; try { await A.resendVerificationEmail(); } catch (e) { throttled = e.code; }
  check("an IMMEDIATE second resend for the same user is throttled by Firebase (auth/too-many-requests) — surfaced as a readable message, not a crash", [throttled, /Too many/.test(H.mapVerificationError({ code: throttled }))], ["auth/too-many-requests", true]);

  check("refreshEmailVerified() before the link is clicked -> false", await A.refreshEmailVerified(), false);
  await adminAuth.updateUser(user.uid, { emailVerified: true }); // = the person clicked the link in the email
  check("after the link is clicked, the SDK's CACHED user is still stale (that's why reload() is needed)", auth.currentUser.emailVerified, false);
  check("refreshEmailVerified() (user.reload() + fresh ID token) -> true", await A.refreshEmailVerified(), true);
  check("…the SDK user and the NEW ID token now both say verified", [auth.currentUser.emailVerified, decodeClaims(await auth.currentUser.getIdToken()).email_verified], [true, true]);
  await auth.signOut();
  let threw = null; try { await A.refreshEmailVerified(); } catch (e) { threw = e.message; }
  check("refreshEmailVerified() with nobody signed in throws 'Not signed in.'", threw, "Not signed in.");

  // ================= B. pure helpers =================
  check("cooldown: allowed when nothing was sent", H.cooldownRemainingMs(null, 1000), 0);
  check("cooldown: 60 s after a send, 45 s left at +15 s, 0 at +60 s", [H.cooldownRemainingMs(1000, 1000), H.cooldownRemainingMs(1000, 16000), H.cooldownRemainingMs(1000, 61000)], [60000, 45000, 0]);
  const t = Date.now();
  check("a brand-new account (signup email just sent) starts inside the cooldown; an old one doesn't", [H.initialLastSentAt(new Date(t - 5000).toISOString(), t) !== null, H.initialLastSentAt(new Date(t - 3600000).toISOString(), t), H.initialLastSentAt(undefined, t)], [true, null, null]);
  check("Firebase errors map to readable messages (too-many-requests / network / expired session / unknown)", [/Too many/.test(H.mapVerificationError({ code: "auth/too-many-requests" })), /connection/.test(H.mapVerificationError({ code: "auth/network-request-failed" })), /session has expired/.test(H.mapVerificationError({ code: "auth/user-token-expired" })), /Something went wrong/.test(H.mapVerificationError(new Error("x")))], [true, true, true, true]);
  check("server failure codes classify correctly for the invite page", [H.classifyAcceptFailure("EMAIL_NOT_VERIFIED", 403), H.classifyAcceptFailure("INVITE_ALREADY_USED", 409), H.classifyAcceptFailure("INVITE_CANCELLED", 409), H.classifyAcceptFailure("ALREADY_MEMBER", 409), H.classifyAcceptFailure("EMAIL_DOMAIN_NOT_ALLOWED", 403), H.classifyAcceptFailure("WORKSPACE_MEMBER_LIMIT_REACHED", 403), H.classifyAcceptFailure("WORKSPACE_ACCESS_DENIED", 403), H.classifyAcceptFailure(undefined, 410), H.classifyAcceptFailure(undefined, 500)],
    ["email_not_verified", "already_used", "cancelled", "already_member", "domain_not_allowed", "member_limit", "wrong_account", "expired", "other"]);

  // ================= C. the real accept route =================
  const owner = await mkUser("owner"), owner2 = await mkUser("owner2");
  const { W } = await mkWorkspace("inv1", owner);
  const { W: W2 } = await mkWorkspace("inv2", owner2);
  const mkAuthUser = async (label, { verified, google = false }) => {
    const email = `qa-${label}-${RUN}@example.com`; const uid = `qa-${label}-${RUN}`;
    if (google) { await adminAuth.importUsers([{ uid, email, emailVerified: true, displayName: `QA ${label}`, providerData: [{ uid: `g-${uid}`, email, providerId: "google.com", displayName: `QA ${label}` }] }]); }
    else await adminAuth.createUser({ uid, email, password: crypto.randomUUID() + "Aa1!", emailVerified: verified, displayName: `QA ${label}` });
    state.users.push(uid); return { uid, email };
  };
  const mkInvite = async (workspaceId, email, extra = {}) => {
    const id = `qa-inv-${RUN}-${crypto.randomBytes(4).toString("hex")}`;
    await db.doc(`workspace_invites/${id}`).set({ id, workspaceId, workspaceName: "QA ws", email, role: "member", invitedBy: owner.uid, invitedByName: "QA owner", status: "pending", expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(), createdAt: now(), updatedAt: now(), ...extra });
    return id;
  };
  const accept = (token, inviteId, extra = {}) => post(token, "/api/invites/accept", { inviteId, displayName: "QA", photoURL: null, ...extra });
  const memberDoc = async (w, uid) => (await db.doc(`members/${w}_${uid}`).get());
  const inviteStatus = async (id) => (await db.doc(`workspace_invites/${id}`).get()).data().status;

  // --- unverified email/password user
  const unv = await mkAuthUser("unv", { verified: false });
  const invUnv = await mkInvite(W, unv.email);
  const tUnv = await tok(unv.uid);
  check("the unverified user's token really carries email_verified=false", decodeClaims(tUnv).email_verified, false);
  const r1 = await accept(tUnv, invUnv);
  check("UNVERIFIED invite acceptance is rejected: 403 EMAIL_NOT_VERIFIED", [r1.status, r1.body.code], [403, "EMAIL_NOT_VERIFIED"]);
  check("…no member was created and the invitation is still pending (nothing consumed)", [(await memberDoc(W, unv.uid)).exists, await inviteStatus(invUnv)], [false, "pending"]);
  const r2 = await accept(tUnv, invUnv, { emailVerified: true, email_verified: true, verified: true });
  check("a CLIENT-SUPPLIED 'verified' flag in the request body is ignored (still 403)", [r2.status, r2.body.code], [403, "EMAIL_NOT_VERIFIED"]);
  const fake = await fetch(`${BASE}/api/invites/accept`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tUnv}`, "X-Email-Verified": "true" }, body: JSON.stringify({ inviteId: invUnv, displayName: "QA", photoURL: null }) });
  check("…and so is a spoofed 'X-Email-Verified' header", fake.status, 403);

  // --- the person verifies; the OLD token (still claiming unverified) must now work because the server reads the live record
  await adminAuth.updateUser(unv.uid, { emailVerified: true });
  const r3 = await accept(tUnv, invUnv);
  check("after verification, acceptance succeeds even with the STALE token (the server re-reads the Firebase Auth record, not the token claim)", [r3.status, r3.body.success], [200, true]);
  const m3 = (await memberDoc(W, unv.uid)).data();
  check("verified acceptance: active member with the invited role, bound to this invitation; invitation accepted; onboarding complete", [m3?.status, m3?.role, m3?.sourceInviteId, m3?.workspaceId, await inviteStatus(invUnv), (await db.doc(`users/${unv.uid}`).get()).data()?.onboardingComplete], ["active", "member", invUnv, W, "accepted", true]);

  // --- the opposite: a token claiming verified, but the record is NOT verified (e.g. verification revoked) -> the server must trust the record
  const rev = await mkAuthUser("rev", { verified: true });
  const invRev = await mkInvite(W, rev.email);
  const tRev = await tok(rev.uid);
  await adminAuth.updateUser(rev.uid, { emailVerified: false });
  check("token says verified but the Auth RECORD is unverified -> 403 (the token claim is not trusted)", [decodeClaims(tRev).email_verified, (await accept(tRev, invRev)).status], [true, 403]);

  // --- already-verified existing user: no extra steps
  const ok = await mkAuthUser("ok", { verified: true });
  const invOk = await mkInvite(W, ok.email, { role: "viewer" });
  const rOk = await accept(await tok(ok.uid), invOk);
  check("an ALREADY-VERIFIED user accepts in one call (no extra verification step); invited role applied", [rOk.status, (await memberDoc(W, ok.uid)).data()?.role], [200, "viewer"]);

  // --- Google-provider account (emailVerified true from the provider)
  const goog = await mkAuthUser("goog", { verified: true, google: true });
  const invG = await mkInvite(W, goog.email);
  const rec2 = await adminAuth.getUser(goog.uid);
  const rG = await accept(await tok(goog.uid), invG);
  check("GOOGLE-provider account (google.com provider, provider-verified email) accepts directly [simulated provider account — no live Google sign-in was performed]", [rec2.providerData[0].providerId, rG.status, (await memberDoc(W, goog.uid)).exists], ["google.com", 200, true]);

  // --- duplicate clicks
  const dup = await mkAuthUser("dup", { verified: true });
  const invD = await mkInvite(W, dup.email); const tD = await tok(dup.uid);
  const [d1, d2] = await Promise.all([accept(tD, invD), accept(tD, invD)]);
  const members = (await db.collection("members").where("workspaceId", "==", W).where("userId", "==", dup.uid).get()).size;
  check("DUPLICATE concurrent accepts: both answer 200 (one is 'alreadyAccepted'); exactly ONE member record", [[d1.status, d2.status], [d1.body.alreadyAccepted, d2.body.alreadyAccepted].filter(Boolean).length <= 1, members], [[200, 200], true, 1]);
  const d3 = await accept(tD, invD);
  check("a later retry of the same invitation by the same person -> 200 alreadyAccepted (not an error)", [d3.status, d3.body.alreadyAccepted], [200, true]);

  // --- expired / used / cancelled / missing
  const exp = await mkAuthUser("exp", { verified: true });
  const invE = await mkInvite(W, exp.email, { expiresAt: new Date(Date.now() - 60000).toISOString() });
  const rE = await accept(await tok(exp.uid), invE);
  check("EXPIRED invitation -> 410", [rE.status, (await memberDoc(W, exp.uid)).exists], [410, false]);
  const used = await mkAuthUser("used", { verified: true });
  const invU = await mkInvite(W, used.email, { status: "accepted" });
  const rU = await accept(await tok(used.uid), invU);
  check("ALREADY-USED invitation (accepted by someone else) -> 409 INVITE_ALREADY_USED, no member", [rU.status, rU.body.code, (await memberDoc(W, used.uid)).exists], [409, "INVITE_ALREADY_USED", false]);
  const canc = await mkAuthUser("canc", { verified: true });
  const invC = await mkInvite(W, canc.email, { status: "cancelled" });
  const rC = await accept(await tok(canc.uid), invC);
  check("CANCELLED invitation -> 409 INVITE_CANCELLED", [rC.status, rC.body.code], [409, "INVITE_CANCELLED"]);
  const gone = await accept(await tok(canc.uid), "qa-does-not-exist-123");
  check("nonexistent invitation -> 404", gone.status, 404);

  // --- unauthorized
  const noAuth = await fetch(`${BASE}/api/invites/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inviteId: invUnv }) });
  const badTok = await accept("not-a-real-token", invUnv);
  const noId = await post(await tok(ok.uid), "/api/invites/accept", {});
  check("UNAUTHORIZED: no token 401, garbage token 401; missing inviteId 400", [noAuth.status, badTok.status, noId.status], [401, 401, 400]);

  // --- wrong account / cross-workspace
  const victim = await mkAuthUser("victim", { verified: true });
  const attacker = await mkAuthUser("attacker", { verified: true });
  const invV = await mkInvite(W, victim.email);
  const rA = await accept(await tok(attacker.uid), invV);
  check("WRONG ACCOUNT (a verified user tries someone else's invitation): 403, no member in any workspace, invitation untouched", [rA.status, rA.body.code, (await memberDoc(W, attacker.uid)).exists, (await memberDoc(W2, attacker.uid)).exists, await inviteStatus(invV)], [403, "WORKSPACE_ACCESS_DENIED", false, false, "pending"]);
  const cross = await mkAuthUser("cross", { verified: true });
  await db.doc(`members/${W2}_${cross.uid}`).set({ id: `${W2}_${cross.uid}`, workspaceId: W2, userId: cross.uid, role: "admin", email: cross.email, displayName: "X", status: "active", createdAt: now(), updatedAt: now() });
  const invX = await mkInvite(W, cross.email);
  const rX = await accept(await tok(cross.uid), invX);
  check("CROSS-WORKSPACE: accepting a ws1 invitation creates a member ONLY in ws1; the user's ws2 admin membership is untouched", [rX.status, (await memberDoc(W, cross.uid)).data()?.role, (await memberDoc(W2, cross.uid)).data()?.role], [200, "member", "admin"]);

  // --- already a member of THIS workspace: no second seat, role not overwritten
  const am = await mkAuthUser("am", { verified: true });
  await db.doc(`members/${W}_${am.uid}`).set({ id: `${W}_${am.uid}`, workspaceId: W, userId: am.uid, role: "admin", email: am.email, displayName: "A", status: "active", createdAt: now(), updatedAt: now() });
  const invAm = await mkInvite(W, am.email);
  const rAm = await accept(await tok(am.uid), invAm);
  check("an EXISTING member can't use an invitation to change their role: 409 ALREADY_MEMBER, role stays admin, invitation pending", [rAm.status, rAm.body.code, (await memberDoc(W, am.uid)).data()?.role, await inviteStatus(invAm)], [409, "ALREADY_MEMBER", "admin", "pending"]);

  // --- allowed email domains are still enforced (even for a verified user)
  await db.doc(`settings/${W2}`).set({ workspaceId: W2, security: { allowedEmailDomains: ["corp.example"] } }, { merge: true });
  const dom = await mkAuthUser("dom", { verified: true });
  const invDom = await mkInvite(W2, dom.email);
  const rDom = await accept(await tok(dom.uid), invDom);
  check("ALLOWED-EMAIL-DOMAIN still enforced for a verified user: 403 EMAIL_DOMAIN_NOT_ALLOWED, no member, invitation pending", [rDom.status, rDom.body.code, (await memberDoc(W2, dom.uid)).exists, await inviteStatus(invDom)], [403, "EMAIL_DOMAIN_NOT_ALLOWED", false, "pending"]);

  fs.rmSync(GEN, { recursive: true, force: true });
  globalThis.fetch = realFetch;
  for (const col of ["workspace_invites"]) for (const w of [W, W2]) for (const d of (await db.collection(col).where("workspaceId", "==", w).get()).docs) await d.ref.delete();
  await db.doc(`settings/${W2}`).delete().catch(() => undefined);
  console.log(state.failed ? `\n${state.failed} FAILED` : "\nALL PASSED");
  await purge();
  process.exit(state.failed ? 1 : 0);
})().catch(async (e) => { console.error(String(e.stack || e.message).slice(0, 900)); fs.rmSync(GEN, { recursive: true, force: true }); await purge().catch(() => undefined); process.exit(1); });
