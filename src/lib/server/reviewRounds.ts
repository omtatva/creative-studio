import "server-only";
import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { createNotificationOnce } from "@/lib/server/notifications";
import { resolveProjectAccess } from "@/lib/server/projectAccess";
import { fileReviewRoute, projectRoute } from "@/lib/constants/routes";
import {
  activeReviewers, aggregateRound, fileStatusForRound, isOutcomeReached, isRoundOpen, nextRoundNumber, normalizeRoundStatus,
  type ReviewDecision, type RoundReviewer, type RoundStatus,
} from "@/lib/reviewRounds";
import type { Review } from "@/types/review.types";
import type { TaskActor } from "@/types/task.types";

/**
 * SERVER-SIDE REVIEW ROUNDS. Every reviewer mutation (viewed / commented / decision / roster
 * change) runs inside ONE Firestore transaction that re-reads the round, applies the change,
 * re-aggregates with the shared lib/reviewRounds rule and writes the result — so two reviewers
 * acting at the same moment can never overwrite each other or leave a stale status. Side effects
 * (file status, notifications, audit) run after the commit and are keyed so a retry or a replay
 * can't repeat them.
 */

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
export const reviewerKeyInternal = (uid: string) => `u_${uid}`;
/** Salted per round, so the key reveals nothing about the address and can't be correlated across rounds. */
export const reviewerKeyEmail = (reviewId: string, email: string) => `e_${sha(`${reviewId}|${email.trim().toLowerCase()}`).slice(0, 24)}`;
export const reviewerKeyGuest = (reviewerId: string) => `g_${reviewerId.replace(/-/g, "")}`;

export function newReviewer(p: Partial<RoundReviewer> & Pick<RoundReviewer, "key" | "type" | "displayName">): RoundReviewer {
  return {
    uid: null, required: true, guest: false, invitedAt: new Date().toISOString(),
    firstViewedAt: null, lastActivityAt: null, commentedAt: null, decision: null, decidedAt: null, decisionNote: null, removedAt: null,
    ...p,
  };
}

interface FileInfo { id: string; workspaceId: string; projectId: string; fileName: string; assetGroupId: string; version: number; stageId: string | null }

/** Round documents only (schemaVersion 2); legacy reviews are ignored here. */
export async function loadRound(reviewId: string): Promise<Review | null> {
  const snap = await adminDb().collection("reviews").doc(reviewId).get();
  const r = snap.data() as Review | undefined;
  return snap.exists && r && r.schemaVersion === 2 ? { ...r, id: snap.id } : null;
}

export async function roundsForAsset(workspaceId: string, assetGroupId: string): Promise<Review[]> {
  const snap = await adminDb().collection("reviews").where("workspaceId", "==", workspaceId).where("assetGroupId", "==", assetGroupId).get();
  return snap.docs
    .map((d) => ({ ...(d.data() as Review), id: d.id }))
    .filter((r) => r.schemaVersion === 2)
    .sort((a, b) => (b.roundNumber ?? 0) - (a.roundNumber ?? 0));
}

export function fileInfo(id: string, f: Record<string, unknown>): FileInfo {
  return {
    id, workspaceId: f.workspaceId as string, projectId: f.projectId as string, fileName: f.fileName as string,
    assetGroupId: ((f.assetGroupId as string | undefined) || id), version: (f.versionNumber as number | undefined) ?? 1, stageId: (f.stageId as string | null | undefined) ?? null,
  };
}

const reviewLink = (r: Pick<Review, "projectId" | "fileId" | "id">, stageId: string | null) =>
  r.fileId ? `${fileReviewRoute(r.projectId, stageId ?? "none", r.fileId)}?round=${r.id}` : projectRoute(r.projectId, "reviews");

/* ───────────────────────────── audit ───────────────────────────── */

export async function writeRoundAudit(round: Pick<Review, "id" | "workspaceId" | "fileId">, entry: { action: string; actorId: string; actorName: string; details?: Record<string, unknown> }): Promise<void> {
  try {
    const ref = adminDb().collection("audit_logs").doc();
    const now = new Date().toISOString();
    // Ids, names and plain facts only — never a token, password, email code or media ticket.
    await ref.set({
      id: ref.id, workspaceId: round.workspaceId, userId: entry.actorId, userName: entry.actorName, action: entry.action,
      targetType: "review_round", targetId: round.id, ipAddress: "Not recorded", userAgent: "server", previousValue: null,
      newValue: entry.details ? JSON.stringify(entry.details) : null, createdAt: now, updatedAt: now,
    });
    await adminDb().collection("workspaces").doc(round.workspaceId).collection("activity_logs").add({
      actorId: entry.actorId, actorName: entry.actorName, action: entry.action.replace(/_/g, " "), targetType: "file", targetId: round.fileId ?? round.id, createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[reviewRounds] audit write failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

/* ───────────────────────────── file status ───────────────────────────── */

/** Sets the file's review status from its round — but only for the round's OWN version, and only if this is that version's newest round. Older versions/rounds never overwrite a newer state. */
export async function syncFileStatus(round: Review): Promise<void> {
  if (!round.fileId) return;
  try {
    const sameFile = (await adminDb().collection("reviews").where("workspaceId", "==", round.workspaceId).where("fileId", "==", round.fileId).get()).docs
      .map((d) => d.data() as Review)
      .filter((r) => r.schemaVersion === 2);
    const newest = Math.max(...sameFile.map((r) => r.roundNumber ?? 0), 0);
    if ((round.roundNumber ?? 0) < newest) return;
    const fileRef = adminDb().collection("files").doc(round.fileId);
    const file = (await fileRef.get()).data();
    if (!file || file.reviewStatus === "archived") return;
    await fileRef.update({ reviewStatus: fileStatusForRound(normalizeRoundStatus(round.status)), updatedAt: FieldValue.serverTimestamp() });
  } catch (err) {
    console.error("[reviewRounds] file status sync failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

/* ───────────────────────────── notifications ───────────────────────────── */

async function stageOf(round: Review): Promise<string | null> {
  if (!round.fileId) return null;
  const f = (await adminDb().collection("files").doc(round.fileId).get()).data();
  return (f?.stageId as string | null | undefined) ?? null;
}

/** Notify one INTERNAL person about a round — only if they can still open the project, deduped by `eventKey`. */
export async function notifyInternal(round: Review, uid: string, eventKey: string, title: string, body: string): Promise<void> {
  try {
    const access = await resolveProjectAccess(uid, round.workspaceId, round.projectId);
    if (!access.canRead) return;
    await createNotificationOnce(round.workspaceId, uid, `round:${eventKey}`, { title, body, link: reviewLink(round, await stageOf(round)), type: "review_round", projectId: round.projectId });
  } catch (err) {
    console.error("[reviewRounds] notification failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

/* ───────────────────────────── transactional mutation ───────────────────────────── */

export type Mutation =
  | { deny: { status: number; code: string; error: string } }
  | { noop: true }
  | { reviewers: Record<string, RoundReviewer>; patch?: Partial<Review>; startNow?: boolean };

export type MutateResult =
  | { ok: true; before: Review; after: Review; changed: boolean }
  | { ok: false; status: number; code: string; error: string };

export async function mutateRound(reviewId: string, fn: (review: Review) => Mutation): Promise<MutateResult> {
  const ref = adminDb().collection("reviews").doc(reviewId);
  const result = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.data() as Review | undefined;
    if (!snap.exists || !current || current.schemaVersion !== 2) return { ok: false as const, status: 404, code: "not_found", error: "This review isn't available." };
    const before: Review = { ...current, id: snap.id };
    const mutation = fn(before);
    if ("deny" in mutation) return { ok: false as const, ...mutation.deny };
    if ("noop" in mutation) return { ok: true as const, before, after: before, changed: false };

    const summary = aggregateRound(Object.values(mutation.reviewers));
    const prevStatus = normalizeRoundStatus(before.status);
    // A draft stays a draft until it is explicitly sent; everything else follows the shared aggregation rule.
    const status: RoundStatus = prevStatus === "draft" && !mutation.startNow ? "draft" : summary.status;
    const now = new Date().toISOString();
    const patch: Partial<Review> = { ...mutation.patch, reviewers: mutation.reviewers, status };
    // Outcome reached → the round CLOSES to further decisions (comments remain possible; a new round is the way forward).
    if (isOutcomeReached(status) && !before.completedAt) patch.completedAt = now;
    tx.update(ref, { ...patch, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true as const, before, after: { ...before, ...patch } as Review, changed: status !== prevStatus };
  });
  return result;
}

/** Side effects that must happen exactly once per status transition — all keyed on (round, status). */
export async function finalizeTransition(before: Review, after: Review, actor: { id: string; name: string }): Promise<void> {
  return afterTransition(before, after, actor);
}

async function afterTransition(before: Review, after: Review, actor: { id: string; name: string }): Promise<void> {
  const status = normalizeRoundStatus(after.status);
  if (status === normalizeRoundStatus(before.status)) return;
  await syncFileStatus(after);
  if (status === "approved" || status === "changes_requested") {
    await writeRoundAudit(after, { action: "review_round_completed", actorId: actor.id, actorName: actor.name, details: { outcome: status, roundNumber: after.roundNumber, version: after.version } });
    // Exactly once per round: a round enters each outcome at most once because it closes there.
    await notifyInternal(
      after, after.requestedBy.uid, `${status}:${after.id}`,
      status === "approved" ? "Review approved" : "Changes requested",
      status === "approved"
        ? `Round ${after.roundNumber} of "${after.title}" (v${after.version}) is approved by all required reviewers.`
        : `Round ${after.roundNumber} of "${after.title}" (v${after.version}) needs changes.`
    );
  }
}

export interface ReviewerSeed { displayName: string; type: "internal" | "external"; uid?: string | null; guest?: boolean }

/** First real view / first comment by a reviewer. No-op on closed, superseded or draft rounds, and for removed reviewers. */
export async function touchReviewer(reviewId: string, key: string, kind: "viewed" | "commented", seed?: ReviewerSeed): Promise<MutateResult> {
  const now = new Date().toISOString();
  const res = await mutateRound(reviewId, (review) => {
    const status = normalizeRoundStatus(review.status);
    if (status === "draft" || !isRoundOpen({ status, supersededByRoundId: review.supersededByRoundId })) return { noop: true };
    const reviewers = { ...(review.reviewers ?? {}) };
    let r = reviewers[key];
    if (!r) {
      if (!seed || !seed.guest) return { noop: true }; // only open guests may join by acting; named reviewers are declared by the sender
      r = newReviewer({ key, type: seed.type, displayName: seed.displayName, uid: seed.uid ?? null, guest: true, required: false });
    }
    if (r.removedAt) return { noop: true };
    const next = { ...r, lastActivityAt: now, firstViewedAt: r.firstViewedAt ?? now, commentedAt: kind === "commented" ? (r.commentedAt ?? now) : r.commentedAt };
    // Skip the write when nothing meaningful changed (a refresh must not churn the document).
    if (r === reviewers[key] && r.firstViewedAt && (kind === "viewed" || r.commentedAt)) return { noop: true };
    reviewers[key] = next;
    return { reviewers };
  });
  if (res.ok && res.changed) await afterTransition(res.before, res.after, { id: key, name: seed?.displayName ?? "Reviewer" });
  if (res.ok && res.after !== res.before && kind === "viewed" && !res.before.reviewers?.[key]?.firstViewedAt) {
    await writeRoundAudit(res.after, { action: "review_viewed", actorId: key, actorName: seed?.displayName ?? res.after.reviewers?.[key]?.displayName ?? "Reviewer", details: { roundNumber: res.after.roundNumber } });
  }
  return res;
}

/**
 * Record a reviewer's decision.
 *  - Allowed only while the round is OPEN (waiting / in review, not superseded). A closed round is frozen: no decision is
 *    silently changed, and an old link can never decide a newer round (the route also checks the share belongs to this round).
 *  - While open, a reviewer MAY change their decision (approve ⇄ request changes); every change is audited.
 */
export async function recordDecision(reviewId: string, key: string, decision: ReviewDecision, note: string | null, seed?: ReviewerSeed): Promise<MutateResult & { previous?: ReviewDecision | null; reviewer?: RoundReviewer }> {
  const now = new Date().toISOString();
  let previous: ReviewDecision | null = null;
  let reviewerAfter: RoundReviewer | undefined;
  let replay: RoundReviewer | undefined;
  const res = await mutateRound(reviewId, (review) => {
    const status = normalizeRoundStatus(review.status);
    if (status === "draft") return { deny: { status: 409, code: "round_not_sent", error: "This review hasn't been sent yet." } };
    if (!isRoundOpen({ status, supersededByRoundId: review.supersededByRoundId })) {
      return { deny: { status: 409, code: "round_closed", error: review.supersededByRoundId ? "A newer review round has started — this one no longer takes decisions." : "This review round is closed." } };
    }
    const reviewers = { ...(review.reviewers ?? {}) };
    let r = reviewers[key];
    if (!r) {
      if (!seed || !seed.guest) return { deny: { status: 403, code: "not_a_reviewer", error: "You aren't a reviewer on this round." } };
      r = newReviewer({ key, type: seed.type, displayName: seed.displayName, uid: seed.uid ?? null, guest: true, required: false });
    }
    if (r.removedAt) return { deny: { status: 403, code: "not_a_reviewer", error: "You're no longer a reviewer on this round." } };
    previous = r.decision;
    // Re-submitting the SAME decision (a retry, a double click) changes nothing: no new timestamp, audit entry or notification.
    if (r.decision === decision) { replay = r; return { noop: true }; }
    reviewerAfter = { ...r, decision, decidedAt: now, decisionNote: note, lastActivityAt: now, firstViewedAt: r.firstViewedAt ?? now };
    reviewers[key] = reviewerAfter;
    // For legacy list cards ("Approved by X"): remember who decided last.
    const patch: Partial<Review> = { reviewedBy: { uid: key, displayName: r.displayName, photoURL: null, email: "" } as TaskActor, reviewNote: note };
    return { reviewers, patch };
  });
  if (!res.ok) return res;
  if (replay) return { ...res, previous, reviewer: replay };
  const reviewer = reviewerAfter as RoundReviewer;
  await writeRoundAudit(res.after, {
    action: previous && previous !== decision ? "review_decision_changed" : decision === "approved" ? "review_approved" : "review_changes_requested",
    actorId: key, actorName: reviewer.displayName, details: { decision, previous, roundNumber: res.after.roundNumber, version: res.after.version },
  });
  // One notification per (round, reviewer, decision, moment): a retry of the same request can't duplicate it.
  await notifyInternal(
    res.after, res.after.requestedBy.uid, `decision:${reviewId}:${key}:${decision}:${Date.parse(reviewer.decidedAt as string)}`,
    decision === "approved" ? `${reviewer.displayName} approved` : `${reviewer.displayName} requested changes`,
    `${reviewer.displayName} ${decision === "approved" ? "approved" : "requested changes on"} round ${res.after.roundNumber} of "${res.after.title}" (v${res.after.version}).`
  );
  await afterTransition(res.before, res.after, { id: key, name: reviewer.displayName });
  return { ...res, previous, reviewer };
}

/** An open guest typed their name after their row already exists — keep the row's display name in step. */
export async function renameGuest(reviewId: string, key: string, name: string): Promise<void> {
  await mutateRound(reviewId, (review) => {
    const r = review.reviewers?.[key];
    // Open guests and verified named outside reviewers may set the name they are shown under.
    if (!r || (!r.guest && r.type !== "external") || r.displayName === name) return { noop: true };
    return { reviewers: { ...(review.reviewers ?? {}), [key]: { ...r, displayName: name } } };
  });
}

/* ───────────────────────────── creating rounds ───────────────────────────── */

/**
 * A named outside reviewer's address lives ONLY here (deny-all in firestore.rules, Admin SDK only), never on the
 * project-readable round document. One doc per (round, reviewer key).
 */
export const IDENTITIES = "review_reviewer_identities";

export async function saveIdentity(round: Pick<Review, "id" | "workspaceId" | "projectId">, key: string, email: string): Promise<void> {
  await adminDb().collection(IDENTITIES).doc(`${round.id}_${key}`).set({ reviewId: round.id, workspaceId: round.workspaceId, projectId: round.projectId, key, email, createdAt: new Date().toISOString() });
}

/** key -> email for a round. Only for responses going to the person MANAGING the review. */
export async function loadIdentities(reviewId: string): Promise<Record<string, string>> {
  const snap = await adminDb().collection(IDENTITIES).where("reviewId", "==", reviewId).get();
  return Object.fromEntries(snap.docs.map((d) => [d.data().key as string, d.data().email as string]));
}

export interface InternalSpec { uid: string; displayName: string; required: boolean }
export interface ExternalSpec { email: string; required: boolean }

export async function createRound(args: {
  file: FileInfo; requestedBy: TaskActor; title: string; message: string | null; internal: InternalSpec[]; external: ExternalSpec[]; draft: boolean;
}): Promise<{ review: Review; supersededId: string | null }> {
  const { file, requestedBy, title, message, internal, external, draft } = args;
  const existing = await roundsForAsset(file.workspaceId, file.assetGroupId);
  const roundNumber = nextRoundNumber(existing.map((r) => r.roundNumber ?? 0));
  const ref = adminDb().collection("reviews").doc();
  const now = new Date().toISOString();
  const reviewers: RoundReviewer[] = [
    ...internal.map((i) => newReviewer({ key: reviewerKeyInternal(i.uid), type: "internal", uid: i.uid, displayName: i.displayName, required: i.required })),
    // Outside reviewers are shown by a neutral label until they introduce themselves — never by their address.
    ...external.map((e, n) => newReviewer({ key: reviewerKeyEmail(ref.id, e.email), type: "external", displayName: `External reviewer ${n + 1}`, required: e.required })),
  ];
  const map = Object.fromEntries(reviewers.map((r) => [r.key, r]));
  const review: Review = {
    id: ref.id, schemaVersion: 2, workspaceId: file.workspaceId, projectId: file.projectId, title, fileIds: [file.id], fileId: file.id,
    assetGroupId: file.assetGroupId, version: file.version, roundNumber, message, requestedBy, requestedAt: now, completedAt: null,
    supersededByRoundId: null, reviewers: map, status: draft ? "draft" : "waiting", reviewedBy: null, reviewNote: null,
    createdAt: now, updatedAt: now,
  };
  // Stored as server timestamps (like legacy reviews) so the lists' orderBy("createdAt") stays one type.
  await ref.set({ ...review, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  for (const e of external) await saveIdentity(review, reviewerKeyEmail(ref.id, e.email), e.email);

  // A newer round supersedes any earlier round of this asset that is still open (it can no longer take decisions). History is kept.
  let supersededId: string | null = null;
  if (!draft) {
    for (const prev of existing) {
      if (isRoundOpen({ status: normalizeRoundStatus(prev.status), supersededByRoundId: prev.supersededByRoundId })) {
        await adminDb().collection("reviews").doc(prev.id).update({ supersededByRoundId: ref.id, updatedAt: FieldValue.serverTimestamp() });
        supersededId = prev.id;
      }
    }
    await syncFileStatus(review);
  }
  await writeRoundAudit(review, { action: "review_round_created", actorId: requestedBy.uid, actorName: requestedBy.displayName, details: { roundNumber, version: file.version, draft, reviewers: reviewers.length } });
  if (!draft) await announceRound(review);
  return { review, supersededId };
}

/** Sending a round: the audit event + a notification to each INTERNAL reviewer (not the sender). Never called from merely opening the modal. */
export async function announceRound(review: Review): Promise<void> {
  await writeRoundAudit(review, { action: "review_requested", actorId: review.requestedBy.uid, actorName: review.requestedBy.displayName, details: { roundNumber: review.roundNumber, version: review.version } });
  for (const r of activeReviewers(Object.values(review.reviewers ?? {}))) {
    if (r.type !== "internal" || !r.uid || r.uid === review.requestedBy.uid) continue;
    await notifyInternal(review, r.uid, `requested:${review.id}:${r.uid}`, "Review requested", `${review.requestedBy.displayName} asked you to review "${review.title}" (v${review.version}, round ${review.roundNumber}).`);
  }
}

/** The latest round for an asset, if any. */
export async function latestRound(workspaceId: string, assetGroupId: string): Promise<Review | null> {
  return (await roundsForAsset(workspaceId, assetGroupId))[0] ?? null;
}

/** Reuse the asset's open round for THIS version, else start a new one (used when a review link is created on its own). */
export async function ensureRoundForLink(file: FileInfo, requestedBy: TaskActor): Promise<Review> {
  const latest = await latestRound(file.workspaceId, file.assetGroupId);
  if (latest && latest.fileId === file.id && isRoundOpen({ status: normalizeRoundStatus(latest.status), supersededByRoundId: latest.supersededByRoundId }) && normalizeRoundStatus(latest.status) !== "draft") return latest;
  const { review } = await createRound({ file, requestedBy, title: `${file.fileName} — v${file.version} review`, message: null, internal: [], external: [], draft: false });
  return review;
}

/** Public-safe projection of a round for an EXTERNAL reviewer: progress and their own state, never other reviewers' identities. */
export function externalRoundView(round: Review, key: string) {
  const summary = aggregateRound(Object.values(round.reviewers ?? {}));
  const me = round.reviewers?.[key];
  return {
    roundNumber: round.roundNumber ?? 1, version: round.version ?? 1, status: normalizeRoundStatus(round.status),
    superseded: !!round.supersededByRoundId, open: isRoundOpen({ status: normalizeRoundStatus(round.status), supersededByRoundId: round.supersededByRoundId }),
    requiredTotal: summary.requiredTotal, requiredApproved: summary.requiredApproved,
    me: me ? { required: me.required, decision: me.decision, decidedAt: me.decidedAt } : null,
  };
}
