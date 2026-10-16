import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { reviewerCapabilities, listEligibleReviewers } from "@/lib/server/reviewerAccess";
import { DEFAULT_REVIEW_SHARE_PERMISSIONS } from "@/types/reviewShare.types";
import { createShareDoc, parseEmails, parseExpiry, parsePermissions } from "@/lib/server/reviewShareInput";
import { sendReviewRequestEmail } from "@/lib/server/reviewEmail";
import {
  announceRound, createRound, fileInfo, finalizeTransition, loadIdentities, loadRound, mutateRound, newReviewer, notifyInternal, recordDecision,
  reviewerKeyInternal, roundsForAsset, touchReviewer, writeRoundAudit, type InternalSpec,
} from "@/lib/server/reviewRounds";
import { aggregateRound, activeReviewers, isOutcomeReached, isRoundOpen, normalizeRoundStatus, type RoundReviewer } from "@/lib/reviewRounds";
import type { TaskActor } from "@/types/task.types";

export const runtime = "nodejs";

/**
 * INTERNAL review rounds — send a version for review to several reviewers (project members and named outside reviewers,
 * required or optional), let internal reviewers decide, manage the roster, list a version history.
 * Authenticated + PROJECT-authorized on every call; ids from the client are never trusted — the round, its version
 * and the reviewer identity are re-derived and re-checked here. External reviewers do NOT come through this route
 * (they use /api/review/*, authorized by their link).
 *
 * Who may be an internal reviewer (see lib/server/reviewerAccess.ts) follows the permission model the app already has:
 *   - to be on a round at all: an active workspace member with an explicit membership of THIS project who can open it;
 *   - to be a REQUIRED reviewer / to Approve or Request changes: additionally a non-Viewer project role and the Feature
 *     Access grant `reviews.approve` (default Owner/Admin; Super Admin can grant it to Employees). A person who can only
 *     view/comment may be an OPTIONAL reviewer, never a required one — a round must never wait on a decision nobody can make.
 * Authorization is re-checked at decision time; the round never remembers what someone "was allowed" to do.
 *
 * Reads of a round/reviewers you aren't authorized for answer 404 exactly like a round that doesn't exist.
 */

const bad = (error: string, status = 400, code?: string) => NextResponse.json({ error, ...(code ? { code } : {}) }, { status });
const notFound = () => bad("Review not found.", 404);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null);

type Resolved = { ok: true; specs: InternalSpec[] } | { ok: false; error: string };

/** Validate people being put on a round: right workspace, explicit membership of THIS project, and (when required) able to decide. */
async function resolveInternal(items: unknown[], workspaceId: string, projectId: string, defaults: Map<string, boolean> = new Map()): Promise<Resolved> {
  const specs: InternalSpec[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const uid = typeof (item as { uid?: unknown })?.uid === "string" ? (item as { uid: string }).uid : "";
    if (!uid) return { ok: false, error: "Invalid reviewer." };
    if (seen.has(uid)) continue;
    seen.add(uid);
    const caps = await reviewerCapabilities(uid, workspaceId, projectId);
    if (!caps.activeMember || !caps.onProject || !caps.canView) return { ok: false, error: "That person isn't a member of this project, so they can't be added as a reviewer." };
    const requested = (item as { required?: unknown }).required;
    const required = typeof requested === "boolean" ? requested : defaults.get(uid) ?? true;
    if (required && !caps.canDecide) {
      return { ok: false, error: `${caps.displayName} can view this project but can't approve reviews, so they can't be a required reviewer. Add them as optional, or ask an administrator to allow "Reviews — Approve" for their role.` };
    }
    specs.push({ uid, displayName: caps.displayName, required });
  }
  return { ok: true, specs };
}

export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    return bad(err instanceof Error ? err.message : "Authentication failed.", err instanceof AuthVerificationError ? err.status : 401);
  }
  try {
    await enforceRateLimit(`review-rounds:${uid}`, 120, 3600);
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
  const workspaceId = body.workspaceId;
  if (typeof workspaceId !== "string" || !workspaceId) return bad("workspaceId is required.");
  const me = (await db.collection("members").doc(`${workspaceId}_${uid}`).get()).data();
  const actor: TaskActor = { uid, displayName: (me?.displayName as string | undefined) ?? "A teammate", photoURL: (me?.photoURL as string | null | undefined) ?? null, email: (me?.email as string | undefined) ?? "" };

  /* ───────── file-scoped actions ───────── */
  if (action === "create" || action === "list" || action === "eligible") {
    if (typeof body.fileId !== "string" || !body.fileId) return bad("fileId is required.");
    const fileSnap = await db.collection("files").doc(body.fileId).get();
    const file = fileSnap.data();
    if (!fileSnap.exists || !file || file.workspaceId !== workspaceId) return notFound();
    const caps = await reviewerCapabilities(uid, workspaceId, file.projectId);
    if (!caps.canView) return notFound();
    const info = fileInfo(fileSnap.id, file);

    if (action === "list") {
      const rounds = await roundsForAsset(workspaceId, info.assetGroupId);
      return NextResponse.json({ rounds: rounds.filter((r) => r.projectId === file.projectId) });
    }
    if (!caps.access.canWrite) return bad("You don't have permission to request a review for this file.", 403);
    if (action === "eligible") return NextResponse.json({ reviewers: await listEligibleReviewers(workspaceId, file.projectId) });

    // ── create ──
    if (file.reviewStatus === "archived") return bad("Archived files can't be sent for review.");
    const draft = body.draft === true;
    const message = body.message == null || body.message === "" ? null : str(body.message, 1000);
    if (body.message != null && body.message !== "" && !message) return bad("The message is too long.");
    const title = str(body.title, 120) ?? `${info.fileName} — v${info.version} review`;

    const internalItems = Array.isArray(body.internalReviewers) ? body.internalReviewers : [];
    if (internalItems.length > 20) return bad("Add up to 20 internal reviewers.");
    const internal = await resolveInternal(internalItems, workspaceId, info.projectId);
    if (!internal.ok) return bad(internal.error);

    const externalItems = Array.isArray(body.externalReviewers) ? body.externalReviewers : [];
    const emails = externalItems.length ? parseEmails(externalItems.map((e) => (e as { email?: unknown })?.email)) : [];
    if (externalItems.length && !emails) return bad("Enter valid email addresses (up to 20).");
    const requiredByEmail = new Map<string, boolean>();
    for (const item of externalItems) requiredByEmail.set(String((item as { email?: unknown }).email ?? "").trim().toLowerCase(), (item as { required?: unknown }).required !== false);
    if (internal.specs.length + (emails?.length ?? 0) === 0) return bad("Add at least one reviewer.");

    // External delivery needs the sender's Gmail (verification codes + the invitation email); validate link settings BEFORE writing anything.
    const link = (body.link && typeof body.link === "object" ? body.link : {}) as Record<string, unknown>;
    if (emails && emails.length > 0) {
      if (draft) return bad("External reviewers can be added when you send the round — drafts hold internal reviewers only.");
      if (!(await db.collection("gmail_connections").doc(uid).get()).exists) return bad("Review invitations are emailed from your Gmail. Connect Gmail in Settings > Email first.", 409);
      if (!parseExpiry(link.expiresAt).ok) return bad("Expiration must be a future date within 2 years.");
      if (!parsePermissions(link.permissions, DEFAULT_REVIEW_SHARE_PERMISSIONS)) return bad("Invalid link permissions.");
      if (link.password != null && link.password !== "" && (typeof link.password !== "string" || link.password.length < 6 || link.password.length > 128)) return bad("Password must be 6–128 characters.");
    }

    const { review } = await createRound({ file: info, requestedBy: actor, title, message, internal: internal.specs, external: (emails ?? []).map((email) => ({ email, required: requiredByEmail.get(email) !== false })), draft });

    let token: string | null = null;
    let shareId: string | null = null;
    const emailFailures: string[] = [];
    if (emails && emails.length > 0) {
      const created = await createShareDoc({ uid, actorName: actor.displayName, file: info, reviewId: review.id, accessMode: "specific_emails", allowedEmails: emails, password: link.password, expiresAt: link.expiresAt, permissions: link.permissions, title, message });
      if (!created.ok) return bad(created.error, created.status);
      token = created.token;
      shareId = created.share.id;
      const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
      const [ws, project] = await Promise.all([db.collection("workspaces").doc(workspaceId).get(), db.collection("projects").doc(info.projectId).get()]);
      for (const to of emails) {
        try {
          await sendReviewRequestEmail({
            senderUid: uid, senderName: actor.displayName, to, workspaceName: (ws.data()?.name as string | undefined) ?? "Your team", projectName: (project.data()?.name as string | undefined) ?? "",
            assetName: info.fileName, version: info.version, roundNumber: review.roundNumber ?? 1, message, link: `${origin.replace(/\/$/, "")}/review/share/${created.token}`,
            expiresAt: created.share.expiresAt, passwordProtected: !!created.share.passwordHash,
          });
        } catch (err) {
          console.error("[review-rounds] invitation email failed:", err instanceof Error ? err.message : err);
          emailFailures.push(to);
        }
      }
    }
    return NextResponse.json({ success: true, reviewId: review.id, roundNumber: review.roundNumber, token, shareId, emailFailures });
  }

  /* ───────── everything else acts on one existing round ───────── */
  if (typeof body.reviewId !== "string" || !body.reviewId) return bad("reviewId is required.");
  const round = await loadRound(body.reviewId);
  // The round must exist IN THIS WORKSPACE and the caller must be able to open its project — otherwise it is indistinguishable
  // from a round that doesn't exist. Its project/version/asset come from the stored round, never from the request.
  if (!round || round.workspaceId !== workspaceId) return notFound();
  const caps = await reviewerCapabilities(uid, workspaceId, round.projectId);
  if (!caps.canView) return notFound();
  const access = caps.access;
  const myKey = reviewerKeyInternal(uid);
  const status = normalizeRoundStatus(round.status);
  const isOpen = isRoundOpen({ status, supersededByRoundId: round.supersededByRoundId });
  const isManager = access.canManage || (round.requestedBy.uid === uid && access.canWrite);

  if (action === "capabilities") {
    const mine = round.reviewers?.[myKey];
    const listed = !!mine && !mine.removedAt;
    return NextResponse.json({ isReviewer: listed, canDecide: listed && caps.canDecide && isOpen && status !== "draft", canManage: isManager && (isOpen || status === "draft") });
  }

  if (action === "viewed") {
    // Only an internal reviewer who actually opened the review, and only on an open round.
    const r = round.reviewers?.[myKey];
    if (!r || r.removedAt) return NextResponse.json({ success: true, tracked: false });
    await touchReviewer(round.id, myKey, "viewed");
    return NextResponse.json({ success: true, tracked: true });
  }

  if (action === "commented") {
    // "Commented" is earned, not claimed: there must be a comment by this person on the round's exact version.
    const r = round.reviewers?.[myKey];
    if (!r || r.removedAt || !round.fileId) return NextResponse.json({ success: true, tracked: false });
    const mineSnap = await db.collection("files").doc(round.fileId).collection("comments").where("authorId", "==", uid).limit(1).get();
    if (mineSnap.empty) return NextResponse.json({ success: true, tracked: false });
    await touchReviewer(round.id, myKey, "commented");
    return NextResponse.json({ success: true, tracked: true });
  }

  if (action === "decide") {
    const decision = body.decision;
    if (decision !== "approved" && decision !== "changes_requested") return bad("Choose Approve or Request changes.");
    // CURRENT authorization, every time: project access, a non-Viewer project role and the `reviews.approve` grant as they are NOW.
    if (!caps.canDecide) return bad("You don't have permission to approve or request changes on reviews in this project.", 403, "permission_denied");
    const note = body.note == null || body.note === "" ? null : str(body.note, 2000);
    if (body.note != null && body.note !== "" && !note) return bad("The note is too long.");
    // Decisions are recorded for the CALLER only, on the stored round; they must be a listed (not removed) reviewer.
    const res = await recordDecision(round.id, myKey, decision, note);
    if (!res.ok) return bad(res.error, res.status, res.code);
    return NextResponse.json({ success: true, status: res.after.status, round: res.after });
  }

  if (action === "send") {
    if (!isManager) return bad("You don't have permission to send this review.", 403);
    if (status !== "draft") return bad("This review was already sent.", 409);
    // A required reviewer who can no longer decide would stall the round — surface it BEFORE sending.
    for (const r of activeReviewers(Object.values(round.reviewers ?? {}))) {
      if (r.type !== "internal" || !r.uid || !r.required) continue;
      if (!(await reviewerCapabilities(r.uid, workspaceId, round.projectId)).canDecide) return bad(`${r.displayName} can no longer approve reviews on this project. Replace them or make them optional first.`, 409, "reviewer_cannot_decide");
    }
    const res = await mutateRound(round.id, (r) => ({ reviewers: r.reviewers ?? {}, startNow: true, patch: { requestedAt: new Date().toISOString() } }));
    if (!res.ok) return bad(res.error, res.status, res.code);
    // Sending makes this the live round: any earlier round of the asset that is still open stops taking decisions (history kept).
    for (const prev of await roundsForAsset(workspaceId, res.after.assetGroupId as string)) {
      if (prev.id !== res.after.id && (prev.roundNumber ?? 0) < (res.after.roundNumber ?? 0) && isRoundOpen({ status: normalizeRoundStatus(prev.status), supersededByRoundId: prev.supersededByRoundId }) && normalizeRoundStatus(prev.status) !== "draft") {
        await db.collection("reviews").doc(prev.id).update({ supersededByRoundId: res.after.id });
      }
    }
    await announceRound(res.after);
    await finalizeTransition(res.before, res.after, { id: uid, name: actor.displayName });
    return NextResponse.json({ success: true });
  }

  if (action === "details") {
    // The roster with what the person MANAGING needs: outside reviewers' addresses and whether each team reviewer can still take part.
    // Anyone else who can start a round (project editors) gets the roster without addresses — enough to prefill the next round's team reviewers.
    if (!isManager && !access.canWrite) return bad("You don't have permission to manage this review.", 403);
    const identities = isManager ? await loadIdentities(round.id) : {};
    const reviewers = [];
    for (const r of Object.values(round.reviewers ?? {})) {
      let cap = null;
      if (isManager && r.type === "internal" && r.uid) {
        const c = await reviewerCapabilities(r.uid, workspaceId, round.projectId);
        cap = { onProject: c.onProject, canView: c.canView, canDecide: c.canDecide };
      }
      reviewers.push({ key: r.key, type: r.type, uid: r.uid, displayName: r.displayName, required: r.required, guest: r.guest, removedAt: r.removedAt, email: identities[r.key] ?? null, capability: cap });
    }
    return NextResponse.json({ reviewers, canManage: isManager });
  }

  if (action === "manage") {
    if (!isManager) return bad("You don't have permission to manage this review.", 403);
    // Reviewer management applies to an OPEN round only — a closed round's roster and decisions are history and are never rewritten.
    if (isOutcomeReached(status) || round.supersededByRoundId) return bad("This round is closed. Start a new round to change reviewers.", 409, "round_closed");

    const current = round.reviewers ?? {};
    const addItems = Array.isArray(body.addInternal) ? body.addInternal : [];
    const replaceItems = (Array.isArray(body.replace) ? body.replace : []).filter((x): x is { from: string; to: { uid: string; required?: boolean } } => !!x && typeof x.from === "string" && !!x.to && typeof x.to.uid === "string");
    const defaults = new Map<string, boolean>(replaceItems.map((x) => [x.to.uid, current[x.from]?.required ?? true]));
    const resolved = await resolveInternal([...addItems, ...replaceItems.map((x) => x.to)], workspaceId, round.projectId, defaults);
    if (!resolved.ok) return bad(resolved.error);
    const specByUid = new Map(resolved.specs.map((s) => [s.uid, s]));

    const remove = new Set((Array.isArray(body.remove) ? body.remove : []).filter((k): k is string => typeof k === "string"));
    const required = new Map((Array.isArray(body.setRequired) ? body.setRequired : []).filter((x) => x && typeof x.key === "string" && typeof x.required === "boolean").map((x: { key: string; required: boolean }) => [x.key, x.required]));
    // Promoting a team reviewer to REQUIRED needs their CURRENT ability to decide.
    for (const [key, req] of required) {
      const cur = current[key];
      if (!req || !cur || cur.removedAt || cur.type !== "internal" || !cur.uid) continue;
      if (!(await reviewerCapabilities(cur.uid, workspaceId, round.projectId)).canDecide) return bad(`${cur.displayName} can't approve reviews, so they can't be a required reviewer.`);
    }

    let guestRefused = false;
    const res = await mutateRound(round.id, (r) => {
      guestRefused = false;
      const reviewers = { ...(r.reviewers ?? {}) };
      const now = new Date().toISOString();
      const drop = (key: string) => {
        const cur = reviewers[key];
        if (!cur || cur.removedAt) return;
        if (cur.firstViewedAt || cur.commentedAt || cur.decision) reviewers[key] = { ...cur, removedAt: now }; // keep what they did
        else delete reviewers[key];
      };
      const put = (s: InternalSpec) => {
        const key = reviewerKeyInternal(s.uid);
        if (reviewers[key] && !reviewers[key]!.removedAt) return;
        reviewers[key] = newReviewer({ key, type: "internal", uid: s.uid, displayName: s.displayName, required: s.required });
      };
      for (const key of remove) drop(key);
      for (const rep of replaceItems) {
        if (!reviewers[rep.from] || reviewers[rep.from]!.removedAt) continue;
        const spec = specByUid.get(rep.to.uid);
        if (!spec) continue;
        drop(rep.from);
        put(spec);
      }
      for (const item of addItems) {
        const spec = specByUid.get((item as { uid: string }).uid);
        if (spec) put(spec);
      }
      for (const [key, req] of required) {
        const cur = reviewers[key];
        if (!cur || cur.removedAt) continue;
        if (cur.guest && req) { guestRefused = true; continue; }
        reviewers[key] = { ...cur, required: req };
      }
      return { reviewers };
    });
    if (!res.ok) return bad(res.error, res.status, res.code);

    // Every roster change is audited (ids and keys only — never an address). The aggregate is recomputed centrally by mutateRound.
    const before = res.before.reviewers ?? {};
    const after = res.after.reviewers ?? {};
    const wasActive = (m: Record<string, RoundReviewer>, k: string) => !!m[k] && !m[k]!.removedAt;
    const replaced = replaceItems.filter((x) => wasActive(before, x.from) && !wasActive(after, x.from) && wasActive(after, reviewerKeyInternal(x.to.uid)));
    const replacedFrom = new Set(replaced.map((x) => x.from));
    const replacedTo = new Set(replaced.map((x) => reviewerKeyInternal(x.to.uid)));
    const added = Object.keys(after).filter((k) => wasActive(after, k) && !wasActive(before, k) && !replacedTo.has(k));
    const removed = Object.keys(before).filter((k) => wasActive(before, k) && !wasActive(after, k) && !replacedFrom.has(k));
    const reqChanged = Object.keys(after).filter((k) => wasActive(before, k) && wasActive(after, k) && before[k]!.required !== after[k]!.required);
    const audit = (a: string, details: Record<string, unknown>) => writeRoundAudit(res.after, { action: a, actorId: uid, actorName: actor.displayName, details: { roundNumber: res.after.roundNumber, ...details } });
    if (added.length) await audit("review_reviewer_added", { reviewers: added });
    if (removed.length) await audit("review_reviewer_removed", { reviewers: removed });
    for (const x of replaced) await audit("review_reviewer_replaced", { from: x.from, to: reviewerKeyInternal(x.to.uid) });
    if (reqChanged.length) await audit("review_reviewer_required_changed", { changes: reqChanged.map((k) => ({ reviewer: k, required: after[k]!.required })) });

    if (status !== "draft") {
      for (const k of [...added, ...replacedTo]) {
        const r = after[k];
        if (r?.uid && r.uid !== uid) await notifyInternal(res.after, r.uid, `requested:${round.id}:${r.uid}`, "Review requested", `${actor.displayName} asked you to review "${round.title}" (v${round.version}, round ${round.roundNumber}).`);
      }
    }
    // A roster change can complete the round (e.g. the last un-approved required reviewer was removed): same one-time side effects as any transition.
    await finalizeTransition(res.before, res.after, { id: uid, name: actor.displayName });
    return NextResponse.json({ success: true, status: res.after.status, summary: aggregateRound(Object.values(after)), note: guestRefused ? "Open guests can't be required reviewers." : undefined });
  }

  return bad("Unknown action.", 404);
}
