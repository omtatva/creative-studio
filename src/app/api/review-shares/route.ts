import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { resolveProjectAccess } from "@/lib/server/projectAccess";
import { effectiveShareStatus, generateToken, hashPassword, sha256Hex, writeAudit } from "@/lib/server/reviewShare";
import { parseEmails, parseExpiry, parsePermissions, createShareDoc } from "@/lib/server/reviewShareInput";
import { ensureRoundForLink, fileInfo, loadRound, mutateRound, newReviewer, reviewerKeyEmail, saveIdentity } from "@/lib/server/reviewRounds";
import { isRoundOpen, normalizeRoundStatus } from "@/lib/reviewRounds";
import type { Review } from "@/types/review.types";
import type { ReviewShare, ReviewShareAccessMode, ReviewShareSummary } from "@/types/reviewShare.types";

export const runtime = "nodejs";

/**
 * INTERNAL management of external review links — create / list / update (incl.
 * regenerate) / revoke. Authenticated users only, authorized by PROJECT access
 * (the same canWrite/canManage the Firestore rules use) — an external reviewer
 * can never reach this route. Shares are Admin-SDK-only documents; the raw token
 * exists only in the response to create/regenerate and is never stored (only its
 * SHA-256), and the password only as a scrypt hash.
 *
 * Every link belongs to ONE review ROUND (a `reviews` document, schemaVersion 2):
 * creating a link on its own reuses the asset's open round for this version or starts
 * a new one; the richer "Send for review" flow (reviewers, required/optional, emails)
 * is /api/review-rounds. Named (specific-email) addresses become NAMED reviewers of
 * the round — required by default.
 */

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

function summarize(share: ReviewShare, round: Review | undefined): ReviewShareSummary {
  return {
    id: share.id, fileId: share.fileId, version: share.version, status: effectiveShareStatus(share), accessMode: share.accessMode,
    allowedEmails: share.allowedEmails, passwordProtected: !!share.passwordHash, expiresAt: share.expiresAt, permissions: share.permissions,
    title: share.title, message: share.message, createdBy: share.createdBy, createdByName: share.createdByName, createdAt: share.createdAt,
    roundNumber: round?.roundNumber ?? 1, roundStatus: normalizeRoundStatus(round?.status), firstViewedAt: share.firstViewedAt,
  };
}

export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    return bad(err instanceof Error ? err.message : "Authentication failed.", err instanceof AuthVerificationError ? err.status : 401);
  }
  try {
    await enforceRateLimit(`review-share-admin:${uid}`, 60, 3600);
  } catch (err) {
    if (err instanceof RateLimitExceededError) return bad(err.message, 429);
    throw err;
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request body.");
  }
  const db = adminDb();
  const action = body.action;
  const memberSnap = typeof body.workspaceId === "string" ? await db.collection("members").doc(`${body.workspaceId}_${uid}`).get() : null;
  const actorName = (memberSnap?.data()?.displayName as string | undefined) ?? "A teammate";

  /* ───────── create ───────── */
  if (action === "create") {
    const { workspaceId, fileId } = body;
    if (typeof workspaceId !== "string" || typeof fileId !== "string") return bad("workspaceId and fileId are required.");
    const fileSnap = await db.collection("files").doc(fileId).get();
    const file = fileSnap.data();
    if (!fileSnap.exists || !file || file.workspaceId !== workspaceId) return bad("File not found.", 404);
    const access = await resolveProjectAccess(uid, workspaceId, file.projectId);
    if (!access.canWrite) return bad("You don't have permission to share this file for review.", 403);
    if (file.reviewStatus === "archived") return bad("Archived files can't be shared.");

    const accessMode = body.accessMode as ReviewShareAccessMode;
    if (accessMode !== "anyone_with_link" && accessMode !== "specific_emails") return bad("Choose who can open the link.");
    let allowedEmails: string[] = [];
    if (accessMode === "specific_emails") {
      const parsed = parseEmails(body.emails);
      if (!parsed) return bad("Enter 1–20 valid email addresses.");
      allowedEmails = parsed;
      // Specific-email access is verified with a one-time code EMAILED from the sender's own connected Gmail — refuse to create a link that couldn't actually deliver codes.
      const gmail = await db.collection("gmail_connections").doc(uid).get();
      if (!gmail.exists) return bad("Specific-email links send a verification code from your Gmail. Connect Gmail in Settings > Email first, or use \"Anyone with the link\".", 409);
    }
    const title = body.title == null || body.title === "" ? null : typeof body.title === "string" && body.title.length <= 120 ? body.title.trim() : undefined;
    const message = body.message == null || body.message === "" ? null : typeof body.message === "string" && body.message.length <= 1000 ? body.message.trim() : undefined;
    if (title === undefined || message === undefined) return bad("Title or message is too long.");

    const info = fileInfo(fileSnap.id, file);
    const actor = { uid, displayName: actorName, photoURL: null, email: "" };
    // Attach to the round the caller named (it must be THIS version's open round) or reuse/start the asset's current one.
    let round: Review;
    if (typeof body.reviewId === "string" && body.reviewId) {
      const named = await loadRound(body.reviewId);
      if (!named || named.workspaceId !== workspaceId || named.fileId !== fileSnap.id || !isRoundOpen({ status: normalizeRoundStatus(named.status), supersededByRoundId: named.supersededByRoundId })) {
        return bad("That review round isn't open for this version.", 409);
      }
      round = named;
    } else {
      round = await ensureRoundForLink(info, actor);
    }

    const created = await createShareDoc({
      uid, actorName, file: info, reviewId: round.id, accessMode, allowedEmails,
      password: body.password, expiresAt: body.expiresAt, permissions: body.permissions, title, message,
    });
    if (!created.ok) return bad(created.error, created.status);

    // Named addresses become NAMED reviewers of the round (required unless the sender says otherwise).
    if (accessMode === "specific_emails") {
      const required = body.requiredEmails !== false;
      await mutateRound(round.id, (r) => {
        const reviewers = { ...(r.reviewers ?? {}) };
        for (const email of allowedEmails) {
          const key = reviewerKeyEmail(round.id, email);
          if (!reviewers[key] || reviewers[key]!.removedAt) reviewers[key] = newReviewer({ key, type: "external", displayName: `External reviewer ${Object.values(reviewers).filter((x) => x.type === "external" && !x.guest).length + 1}`, required });
        }
        return { reviewers };
      });
      for (const email of allowedEmails) await saveIdentity(round, reviewerKeyEmail(round.id, email), email); // the address stays server-only
    }
    const fresh = (await loadRound(round.id)) ?? round;
    return NextResponse.json({ success: true, token: created.token, share: summarize(created.share, fresh) });
  }

  /* ───────── list (for one asset) ───────── */
  if (action === "list") {
    const { workspaceId, fileId } = body;
    if (typeof workspaceId !== "string" || typeof fileId !== "string") return bad("workspaceId and fileId are required.");
    const fileSnap = await db.collection("files").doc(fileId).get();
    const file = fileSnap.data();
    if (!fileSnap.exists || !file || file.workspaceId !== workspaceId) return bad("File not found.", 404);
    const access = await resolveProjectAccess(uid, workspaceId, file.projectId);
    if (!access.canRead) return bad("You don't have access to this project.", 403);
    const assetGroupId = (file.assetGroupId as string | undefined) || fileSnap.id;
    const shares = (await db.collection("review_shares").where("assetGroupId", "==", assetGroupId).get()).docs
      .map((d) => d.data() as ReviewShare)
      // Links the caller may manage: project managers/Owner/Admin see all; others only their own.
      .filter((s) => s.workspaceId === workspaceId && s.projectId === file.projectId && (access.canManage || s.createdBy === uid))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const rounds = new Map<string, Review>();
    await Promise.all(shares.map(async (s) => { const r = await loadRound(s.reviewId); if (r) rounds.set(s.id, r); }));
    return NextResponse.json({ shares: shares.map((s) => summarize(s, rounds.get(s.id))) });
  }

  /* ───────── update / regenerate / revoke (one share) ───────── */
  if (action === "update" || action === "revoke") {
    const { shareId } = body;
    if (typeof shareId !== "string") return bad("shareId is required.");
    const shareRef = db.collection("review_shares").doc(shareId);
    const snap = await shareRef.get();
    const share = snap.data() as ReviewShare | undefined;
    if (!snap.exists || !share) return bad("Review link not found.", 404);
    const access = await resolveProjectAccess(uid, share.workspaceId, share.projectId);
    if (!(access.canManage || (share.createdBy === uid && access.canWrite))) return bad("You don't have permission to manage this link.", 403);
    const creatorName = (await db.collection("members").doc(`${share.workspaceId}_${uid}`).get()).data()?.displayName as string | undefined;
    const name = creatorName ?? "A teammate";

    if (action === "revoke") {
      if (share.status === "revoked") return NextResponse.json({ success: true });
      const now = new Date().toISOString();
      await shareRef.update({ status: "revoked", revokedAt: now, revokedBy: uid, updatedAt: now });
      await writeAudit(share, { action: "review_link_revoked", actorId: uid, actorName: name });
      return NextResponse.json({ success: true });
    }

    if (share.status === "revoked") return bad("This link was revoked. Create a new one.", 409);
    const patch: Partial<ReviewShare> = { updatedAt: new Date().toISOString() };
    let epochBump = false;
    let newToken: string | null = null;
    let emailsChanged = false;

    if (body.permissions !== undefined) {
      const p = parsePermissions(body.permissions, share.permissions);
      if (!p) return bad("Invalid permissions.");
      patch.permissions = p;
    }
    if (body.expiresAt !== undefined) {
      const e = parseExpiry(body.expiresAt);
      if (!e.ok) return bad("Expiration must be a future date within 2 years.");
      patch.expiresAt = e.value;
    }
    if (body.title !== undefined) patch.title = typeof body.title === "string" && body.title.trim() && body.title.length <= 120 ? body.title.trim() : null;
    if (body.message !== undefined) patch.message = typeof body.message === "string" && body.message.trim() && body.message.length <= 1000 ? body.message.trim() : null;
    if (body.password !== undefined) {
      if (body.password === null || body.password === "") patch.passwordHash = null;
      else if (typeof body.password === "string" && body.password.length >= 6 && body.password.length <= 128) patch.passwordHash = await hashPassword(body.password);
      else return bad("Password must be 6–128 characters.");
      epochBump = true;
    }
    if (body.accessMode !== undefined || body.emails !== undefined) {
      const mode = (body.accessMode ?? share.accessMode) as ReviewShareAccessMode;
      if (mode !== "anyone_with_link" && mode !== "specific_emails") return bad("Choose who can open the link.");
      if (mode === "specific_emails") {
        const parsed = parseEmails(body.emails ?? share.allowedEmails);
        if (!parsed) return bad("Enter 1–20 valid email addresses.");
        const gmail = await db.collection("gmail_connections").doc(share.createdBy).get();
        if (!gmail.exists) return bad("Specific-email links need the link creator's Gmail connected (Settings > Email).", 409);
        patch.allowedEmails = parsed;
      } else {
        patch.allowedEmails = [];
      }
      patch.accessMode = mode;
      epochBump = true;
      emailsChanged = true;
    }
    if (body.regenerate === true) {
      newToken = generateToken();
      patch.tokenHash = sha256Hex(newToken); // the old link stops resolving immediately
      epochBump = true;
    }
    if (epochBump) patch.authEpoch = share.authEpoch + 1; // existing reviewer sessions stop working
    await shareRef.update(patch);
    const updated = { ...share, ...patch } as ReviewShare;

    // Keep the round's NAMED reviewers in step with the link's address list (only while the round is open; history is never erased).
    if (emailsChanged) {
      const before = new Set(share.allowedEmails);
      const after = new Set(updated.allowedEmails);
      await mutateRound(share.reviewId, (r) => {
        if (!isRoundOpen({ status: normalizeRoundStatus(r.status), supersededByRoundId: r.supersededByRoundId })) return { noop: true };
        const reviewers = { ...(r.reviewers ?? {}) };
        const now = new Date().toISOString();
        for (const email of after) {
          const key = reviewerKeyEmail(share.reviewId, email);
          if (!reviewers[key] || reviewers[key]!.removedAt) reviewers[key] = newReviewer({ key, type: "external", displayName: `External reviewer ${Object.values(reviewers).filter((x) => x.type === "external" && !x.guest).length + 1}`, required: true });
        }
        for (const email of before) {
          if (after.has(email)) continue;
          const key = reviewerKeyEmail(share.reviewId, email);
          const cur = reviewers[key];
          if (!cur) continue;
          // Never acted → vanishes. Already viewed/commented/decided → kept, marked removed, so history stays truthful.
          if (cur.firstViewedAt || cur.commentedAt || cur.decision) reviewers[key] = { ...cur, removedAt: now };
          else delete reviewers[key];
        }
        return { reviewers };
      });
      for (const email of after) await saveIdentity({ id: share.reviewId, workspaceId: share.workspaceId, projectId: share.projectId }, reviewerKeyEmail(share.reviewId, email), email);
    }
    await writeAudit(share, {
      action: "review_link_updated", actorId: uid, actorName: name,
      details: { fields: Object.keys(patch).filter((k) => !["updatedAt", "tokenHash", "passwordHash", "authEpoch"].includes(k)), passwordChanged: body.password !== undefined, regenerated: body.regenerate === true },
    });
    const round = (await loadRound(share.reviewId)) ?? undefined;
    return NextResponse.json({ success: true, token: newToken, share: summarize(updated, round) });
  }

  return bad("Unknown action.", 404);
}
