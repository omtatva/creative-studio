import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomInt, timingSafeEqual } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { sendGmailMessage } from "@/lib/server/gmailClient";
import { expireAt } from "@/lib/server/ttl";
import {
  authorizeShare, clientIp, createSession, denial, isVisibleToExternal, limit, loadShareByToken, notifyRequester,
  readSession, remainingGates, resolveScopedFile, sessionCookie, sha256Hex, toExternalComment, updateSession, verifyPassword, writeAudit,
} from "@/lib/server/reviewShare";
import { externalRoundView, loadRound, recordDecision, renameGuest, reviewerKeyEmail, reviewerKeyGuest, touchReviewer, type ReviewerSeed } from "@/lib/server/reviewRounds";
import type { ReviewShare, ReviewSession } from "@/types/reviewShare.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * EXTERNAL REVIEWER API. No Firebase auth: a reviewer is identified only by a
 * server-issued, HttpOnly session cookie created AFTER the link's gates
 * (password / verified email) pass. Every action re-resolves the share from
 * the token (see authorizeShare) so revocation and expiry take effect on the
 * very next request, and workspace/project/file/version are always taken from
 * the share — never from the request body.
 */

const bad = (error: string, code = "bad_request", status = 400) => NextResponse.json({ error, code }, { status });
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null);
const num = (v: unknown, min: number, max: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function withCookie(response: NextResponse, cookie: string | null): NextResponse {
  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}

const isUnit = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
function validAnnotation(data: unknown): data is Record<string, unknown> & { kind: string } {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  switch (d.kind) {
    case "circle": return isUnit(d.cx) && isUnit(d.cy) && isUnit(d.rx) && isUnit(d.ry);
    case "rectangle": return isUnit(d.x) && isUnit(d.y) && isUnit(d.width) && isUnit(d.height);
    case "arrow": return isUnit(d.x1) && isUnit(d.y1) && isUnit(d.x2) && isUnit(d.y2);
    case "freehand": return Array.isArray(d.points) && d.points.length > 0 && d.points.length <= 2000 && d.points.every((p) => p && isUnit((p as { x: unknown }).x) && isUnit((p as { y: unknown }).y));
    case "text": return isUnit(d.x) && isUnit(d.y) && typeof d.text === "string" && d.text.length > 0 && d.text.length <= 200;
    default: return false;
  }
}

/**
 * WHO is this reviewer, within the round? Derived ONLY from the verified session — never from the request body:
 *  - specific-email link → the VERIFIED email maps to the reviewer the sender named (Client A can never act as Client B;
 *    the address is trusted only because a one-time code proved the visitor controls it);
 *  - anyone-with-link → an "open guest" keyed by the session's own id. A display name is not an identity, so guests are
 *    optional reviewers (they can comment and decide, but can never be a *required* approval); clearing cookies makes a new
 *    guest row, which is why open guests never gate a round.
 */
function reviewerFor(share: ReviewShare, session: ReviewSession): { key: string; seed?: ReviewerSeed } {
  if (share.accessMode === "specific_emails" && session.email) return { key: reviewerKeyEmail(share.reviewId, session.email) };
  return { key: reviewerKeyGuest(session.reviewerId), seed: { displayName: session.displayName ?? "Guest", type: "external", guest: true } };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request body.");
  }
  if (!body || typeof body !== "object") return bad("Invalid request body.");
  const ip = clientIp(request);

  /* ───────── status: open the link. Mints a (gated) session; never counts as a "view". ───────── */
  if (action === "status") {
    const limited = await limit(`review-status:${ip}`, 120, 60);
    if (limited) return limited;
    if (typeof body.token !== "string") return denial("unavailable");
    const loaded = await loadShareByToken(body.token);
    if (!loaded.ok) return denial(loaded.reason);
    const { share } = loaded;
    let found = await readSession(request, share);
    let cookie: string | null = null;
    if (!found) {
      const created = await createSession(share, { passwordOk: !share.passwordHash });
      found = created;
      cookie = sessionCookie(share, created.sessionToken, created.session.expiresAtMs);
    }
    const requires = remainingGates(share, found.session);
    const wsSnap = await adminDb().collection("workspaces").doc(share.workspaceId).get();
    return withCookie(
      NextResponse.json({ state: requires[0] ?? "ready", requires, workspaceName: (wsSnap.data()?.name as string | undefined) ?? "", title: share.title }),
      cookie
    );
  }

  /* ───────── auth: password gate ───────── */
  if (action === "auth") {
    if (typeof body.token !== "string") return denial("unavailable");
    const loaded = await loadShareByToken(body.token);
    if (!loaded.ok) return denial(loaded.reason);
    const { share } = loaded;
    // Brute-force protection: per IP+share and per share overall.
    const l1 = await limit(`review-pw:${share.id}:${ip}`, 10, 900);
    if (l1) return l1;
    const l2 = await limit(`review-pw-share:${share.id}`, 60, 3600);
    if (l2) return l2;
    if (!share.passwordHash) return bad("This link has no password.");
    const password = typeof body.password === "string" && body.password.length <= 200 ? body.password : "";
    const found = (await readSession(request, share)) ?? null;
    if (!(await verifyPassword(password, share.passwordHash))) {
      return bad("Couldn't verify access. Check the password and try again.", "invalid_credentials", 401);
    }
    let cookie: string | null = null;
    let session = found?.session;
    if (found) await updateSession(found.sessionToken, { passwordOk: true });
    else {
      const created = await createSession(share, { passwordOk: true });
      session = created.session;
      cookie = sessionCookie(share, created.sessionToken, created.session.expiresAtMs);
    }
    const requires = remainingGates(share, session ? { ...session, passwordOk: true } : null);
    return withCookie(NextResponse.json({ state: requires[0] ?? "ready", requires }), cookie);
  }

  /* ───────── email verification (specific-email links): one-time code ───────── */
  if (action === "email-request" || action === "email-verify") {
    if (typeof body.token !== "string") return denial("unavailable");
    const loaded = await loadShareByToken(body.token);
    if (!loaded.ok) return denial(loaded.reason);
    const { share } = loaded;
    if (share.accessMode !== "specific_emails") return bad("This link doesn't use email verification.");
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL.test(email)) return bad("Enter a valid email address.");
    const codeRef = adminDb().collection("review_email_codes").doc(sha256Hex(`${share.id}|${email}`));

    if (action === "email-request") {
      const l1 = await limit(`review-email-req:${share.id}:${ip}`, 8, 3600);
      if (l1) return l1;
      const l2 = await limit(`review-email-req:${share.id}`, 40, 3600);
      if (l2) return l2;
      // Identical response whether or not the address is on the list — the list is never revealed.
      const generic = NextResponse.json({ success: true });
      if (!share.allowedEmails.includes(email)) return generic;
      const existing = (await codeRef.get()).data() as { sentAtMs?: number } | undefined;
      if (existing?.sentAtMs && Date.now() - existing.sentAtMs < 60_000) return generic;
      const code = String(randomInt(100000, 1000000));
      await codeRef.set({ codeHash: sha256Hex(`${share.id}|${email}|${code}`), expiresAtMs: Date.now() + 10 * 60_000, expireAt: expireAt(Date.now() + 10 * 60_000), attempts: 0, sentAtMs: Date.now() });
      try {
        await sendGmailMessage({
          uid: share.createdBy,
          to: email,
          subject: `Your review access code: ${code}`,
          html: `<p style="font-family:sans-serif;font-size:15px">Your verification code to open <strong>${escapeHtml(share.title ?? "a review")}</strong> is:</p><p style="font-family:monospace;font-size:28px;letter-spacing:4px"><strong>${code}</strong></p><p style="font-family:sans-serif;font-size:13px;color:#666">It expires in 10 minutes. If you didn't expect this, ignore this email.</p>`,
        });
      } catch (err) {
        console.error("[review/email-request] couldn't send the verification email:", err instanceof Error ? err.message : err);
      }
      return generic;
    }

    // email-verify
    const l1 = await limit(`review-email-verify:${share.id}:${ip}`, 20, 900);
    if (l1) return l1;
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const fail = () => bad("That code isn't valid or has expired.", "invalid_credentials", 401);
    if (!/^\d{6}$/.test(code) || !share.allowedEmails.includes(email)) return fail();
    const rec = (await codeRef.get()).data() as { codeHash: string; expiresAtMs: number; attempts: number } | undefined;
    if (!rec || rec.expiresAtMs < Date.now() || rec.attempts >= 5) {
      if (rec) await codeRef.delete();
      return fail();
    }
    const expected = Buffer.from(rec.codeHash, "hex");
    const actual = Buffer.from(sha256Hex(`${share.id}|${email}|${code}`), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      await codeRef.update({ attempts: FieldValue.increment(1) });
      return fail();
    }
    await codeRef.delete();
    const found = await readSession(request, share);
    let cookie: string | null = null;
    let session = found?.session;
    if (found) await updateSession(found.sessionToken, { email, emailVerified: true });
    else {
      const created = await createSession(share, { passwordOk: !share.passwordHash, email, emailVerified: true });
      session = created.session;
      cookie = sessionCookie(share, created.sessionToken, created.session.expiresAtMs);
    }
    const requires = remainingGates(share, session ? { ...session, email, emailVerified: true } : null);
    return withCookie(NextResponse.json({ state: requires[0] ?? "ready", requires }), cookie);
  }

  /* ───────── everything below needs a satisfied session ───────── */
  const needsWrite = action === "comment" || action === "annotation" || action === "decision";
  const permission = action === "comment" || action === "annotation" ? "canComment" : action === "download" ? "canDownload" : undefined;
  const auth = await authorizeShare(request, body.token, { permission, needsIdentity: needsWrite });
  if (!auth.ok) return auth.response;
  const { share, file, session, sessionToken } = auth.gate;
  const db = adminDb();

  // The round this link belongs to. A link can only ever act on ITS round, for ITS version.
  const round = await loadRound(share.reviewId);
  if (!round || round.fileId !== share.fileId || round.version !== share.version || round.workspaceId !== share.workspaceId) {
    return bad("This review link isn't available.", "unavailable", 404);
  }
  const me = reviewerFor(share, session);

  if (action === "identity") {
    const name = str(body.name, 60);
    if (!name) return bad("Enter your name (up to 60 characters).");
    await updateSession(sessionToken, { displayName: name });
    await renameGuest(round.id, me.key, name); // guests and verified named reviewers choose the name they are shown under
    return NextResponse.json({ success: true, displayName: name });
  }

  if (action === "data") {
    const scoped = await resolveScopedFile(share, file, body.version);
    if (!scoped) return bad("That version isn't available.", "permission_denied", 403);

    // First SUCCESSFUL open (valid token + satisfied gates + a real data fetch) — not a bot, a bad token, or the password screen.
    if (!session.openedLogged) {
      await updateSession(sessionToken, { openedLogged: true });
      if (!share.firstViewedAt) await db.collection("review_shares").doc(share.id).update({ firstViewedAt: new Date().toISOString() });
      // THIS reviewer's "Viewed" (named reviewers via their verified email; open guests get a row now). No-op on closed rounds.
      await touchReviewer(round.id, me.key, "viewed", me.seed);
      await writeAudit(share, { action: "external_review_opened", actorId: `ext:${session.reviewerId}`, actorName: session.displayName ?? "External reviewer", details: { emailVerified: session.emailVerified } });
    }

    const [commentSnap, annotationSnap, projectSnap, wsSnap, freshRound] = await Promise.all([
      db.collection("files").doc(scoped.id).collection("comments").get(),
      db.collection("files").doc(scoped.id).collection("annotations").get(),
      db.collection("projects").doc(share.projectId).get(),
      db.collection("workspaces").doc(share.workspaceId).get(),
      loadRound(round.id),
    ]);
    const comments = commentSnap.docs
      .filter((d) => isVisibleToExternal(d.data()))
      .map((d) => toExternalComment(d.id, d.data(), session.reviewerId))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const annotations = annotationSnap.docs
      .filter((d) => isVisibleToExternal(d.data()))
      .map((d) => {
        const a = d.data();
        return { id: d.id, type: a.type, data: a.data, color: a.color, timestampSeconds: a.timestampSeconds ?? null, pageNumber: a.pageNumber ?? null, authorName: a.author?.displayName ?? "Unknown", authorKind: a.authorKind === "external" ? "external" : "member", isMine: a.authorId === `ext:${session.reviewerId}` };
      });

    let versions: { versionNumber: number }[] = [{ versionNumber: share.version }];
    if (share.permissions.canViewPreviousVersions) {
      const vs = await db.collection("files").where("assetGroupId", "==", share.assetGroupId).get();
      versions = vs.docs
        .map((d) => d.data())
        .filter((f) => f.workspaceId === share.workspaceId && f.projectId === share.projectId && typeof f.versionNumber === "number" && f.versionNumber <= share.version)
        .map((f) => ({ versionNumber: f.versionNumber as number }))
        .sort((a, b) => b.versionNumber - a.versionNumber);
      if (versions.length === 0) versions = [{ versionNumber: share.version }];
    }
    const roundView = externalRoundView(freshRound ?? round, me.key);
    return NextResponse.json({
      workspaceName: (wsSnap.data()?.name as string | undefined) ?? "",
      projectName: (projectSnap.data()?.name as string | undefined) ?? "",
      title: share.title,
      message: share.message,
      expiresAt: share.expiresAt,
      permissions: share.permissions,
      sharedVersion: share.version,
      viewingVersion: scoped.id === file.id ? share.version : (scoped.versionNumber ?? 1),
      versions,
      asset: { fileName: scoped.fileName, assetType: scoped.assetType, contentType: scoped.contentType, durationSeconds: scoped.durationSeconds ?? null },
      comments,
      annotations,
      identity: { displayName: session.displayName, email: session.emailVerified ? session.email : null },
      round: roundView,
      decision: roundView.me?.decision ? { decision: roundView.me.decision, decidedAt: roundView.me.decidedAt, byMe: true } : null,
    });
  }

  if (action === "compare") {
    // Comparing is "previous versions" access: the link must allow it, and BOTH versions must be inside the
    // share's scope — the shared version or EARLIER versions of the SAME asset (never a later upload, never another
    // asset). The pair is validated here from the share; the client's selection is only a request.
    if (!share.permissions.canViewPreviousVersions) return bad("This link doesn't allow comparing versions.", "permission_denied", 403);
    const va = body.versionA;
    const vb = body.versionB;
    if (!Number.isInteger(va) || !Number.isInteger(vb) || va === vb) return bad("Pick two different versions to compare.");
    const [fa, fb] = await Promise.all([resolveScopedFile(share, file, va), resolveScopedFile(share, file, vb)]);
    if (!fa || !fb) return bad("Those versions aren't available.", "permission_denied", 403);
    const side = async (f: typeof fa, versionNumber: number) => {
      const [cs, as] = await Promise.all([db.collection("files").doc(f.id).collection("comments").get(), db.collection("files").doc(f.id).collection("annotations").get()]);
      return {
        versionNumber,
        asset: { fileName: f.fileName, assetType: f.assetType, contentType: f.contentType, durationSeconds: f.durationSeconds ?? null },
        comments: cs.docs.filter((d) => isVisibleToExternal(d.data())).map((d) => toExternalComment(d.id, d.data(), session.reviewerId)).sort((x, y) => (x.createdAt < y.createdAt ? -1 : 1)),
        annotations: as.docs.filter((d) => isVisibleToExternal(d.data())).map((d) => {
          const a = d.data();
          return { id: d.id, type: a.type, data: a.data, color: a.color, timestampSeconds: a.timestampSeconds ?? null, pageNumber: a.pageNumber ?? null };
        }),
      };
    };
    const [sa, sb] = await Promise.all([side(fa, va as number), side(fb, vb as number)]);
    return NextResponse.json({ sharedVersion: share.version, permissions: share.permissions, a: sa, b: sb });
  }

  const actor = { uid: `ext:${session.reviewerId}`, displayName: session.displayName ?? "External reviewer", photoURL: null as string | null, email: session.emailVerified ? (session.email ?? "") : "" };

  if (action === "comment") {
    const limited = await limit(`review-comment:${session.reviewerId}`, 20, 60);
    if (limited) return limited;
    const text = str(body.body, 2000);
    if (!text) return bad("Write a comment (up to 2000 characters).");
    const ts = body.timestampSeconds == null ? null : num(body.timestampSeconds, 0, 172800);
    const px = body.positionX == null ? null : num(body.positionX, 0, 100);
    const py = body.positionY == null ? null : num(body.positionY, 0, 100);
    const page = body.pageNumber == null ? null : num(body.pageNumber, 1, 10000);
    if ((body.timestampSeconds != null && ts === null) || (body.positionX != null && px === null) || (body.positionY != null && py === null) || (body.pageNumber != null && page === null)) return bad("Invalid marker position.");
    // Comments always go on the SHARED version of the SHARED file — never a client-chosen file/version.
    const commentsCol = db.collection("files").doc(file.id).collection("comments");
    let parentCommentId: string | null = null;
    if (body.parentCommentId != null) {
      if (typeof body.parentCommentId !== "string") return bad("Invalid reply target.");
      const parent = await commentsCol.doc(body.parentCommentId).get();
      if (!parent.exists || !isVisibleToExternal(parent.data() ?? {})) return bad("That comment isn't available.", "permission_denied", 403);
      parentCommentId = parent.id;
    }
    const hasMarker = px !== null || ts !== null || page !== null;
    let markerNumber: number | null = null;
    if (hasMarker && !parentCommentId) {
      const all = await commentsCol.get();
      markerNumber = all.docs.reduce((max, d) => Math.max(max, typeof d.data().markerNumber === "number" ? d.data().markerNumber : 0), 0) + 1;
    }
    const ref = commentsCol.doc();
    await ref.set({
      id: ref.id, workspaceId: share.workspaceId, projectId: share.projectId, fileId: file.id, version: share.version,
      authorId: actor.uid, author: actor, body: text, parentCommentId, isResolved: false, resolvedBy: null, resolvedAt: null,
      timestampSeconds: ts, positionX: px, positionY: py, pageNumber: page, markerNumber,
      authorKind: "external", shareId: share.id, visibility: "everyone",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    await writeAudit(share, { action: "external_comment_created", actorId: actor.uid, actorName: actor.displayName, details: { commentId: ref.id } });
    await notifyRequester(share, file, `comment:${ref.id}`, "New client comment", `${actor.displayName} commented on "${file.fileName}".`);
    // This reviewer becomes "Commented" (a later Approve / Request changes takes precedence; a comment never downgrades a decision).
    await touchReviewer(round.id, me.key, "commented", me.seed);
    return NextResponse.json({ success: true, id: ref.id });
  }

  if (action === "annotation") {
    const limited = await limit(`review-annotation:${session.reviewerId}`, 30, 60);
    if (limited) return limited;
    if (!validAnnotation(body.data)) return bad("Invalid annotation.");
    const color = typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : "#f59e0b";
    const ts = body.timestampSeconds == null ? null : num(body.timestampSeconds, 0, 172800);
    const page = body.pageNumber == null ? null : num(body.pageNumber, 1, 10000);
    if ((body.timestampSeconds != null && ts === null) || (body.pageNumber != null && page === null)) return bad("Invalid annotation position.");
    const ref = db.collection("files").doc(file.id).collection("annotations").doc();
    await ref.set({
      id: ref.id, workspaceId: share.workspaceId, projectId: share.projectId, fileId: file.id, version: share.version,
      authorId: actor.uid, author: actor, type: body.data.kind, data: body.data, color, timestampSeconds: ts, pageNumber: page,
      authorKind: "external", shareId: share.id, visibility: "everyone",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true, id: ref.id });
  }

  if (action === "decision") {
    const limited = await limit(`review-decision:${session.reviewerId}`, 10, 3600);
    if (limited) return limited;
    const decision = body.decision;
    if (decision !== "approved" && decision !== "changes_requested") return bad("Choose Approve or Request changes.");
    const allowed = decision === "approved" ? share.permissions.canApprove : share.permissions.canRequestChanges;
    if (!allowed) return bad("This link doesn't allow that action.", "permission_denied", 403);
    const note = body.note == null ? null : str(body.note, 2000);
    if (body.note != null && !note) return bad("Note is too long.");
    // The decision applies to THIS link's round and version only. The reviewer is derived from the verified session; the round,
    // version and file come from the share — nothing about them is read from the request. recordDecision refuses a closed or
    // superseded round (so an old link can never decide a newer round) and an unknown reviewer (Client A can't act as Client B).
    const res = await recordDecision(round.id, me.key, decision, note, me.seed);
    if (!res.ok) return bad(res.error, res.code, res.status);
    if (res.after !== res.before) await writeAudit(share, { action: decision === "approved" ? "external_review_approved" : "external_changes_requested", actorId: actor.uid, actorName: actor.displayName, details: { version: share.version, round: round.roundNumber } });
    return NextResponse.json({ success: true, decision, decidedAt: res.reviewer?.decidedAt ?? null, round: externalRoundView(res.after, me.key) });
  }

  if (action === "download") {
    const limited = await limit(`review-download:${session.reviewerId}`, 20, 60);
    if (limited) return limited;
    const scoped = await resolveScopedFile(share, file, body.version);
    if (!scoped || !scoped.storagePath.startsWith(`workspaces/${share.workspaceId}/`)) return bad("That version isn't available.", "permission_denied", 403);
    const ticket = randomBytes(24).toString("hex");
    await db.collection("download_tickets").doc(ticket).set({
      uid: actor.uid, shareId: share.id, workspaceId: share.workspaceId, projectId: share.projectId,
      storagePath: scoped.storagePath, fileName: scoped.fileName, contentType: scoped.contentType, expiresAt: Date.now() + 60_000, expireAt: expireAt(Date.now() + 60_000),
    });
    return NextResponse.json({ ticket, fileName: scoped.fileName });
  }

  return bad("Unknown action.", "bad_request", 404);
}
