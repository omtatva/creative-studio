/**
 * REVIEW ROUNDS — the single place that defines what a round is, what a reviewer's
 * status is, and how individual decisions aggregate into the round's outcome.
 * Pure (no I/O) and shared by the server (which enforces it inside transactions)
 * and every screen (which only displays it) so the two can never disagree.
 *
 * ONE MODEL: a round is a document in the existing `reviews` collection (what the app
 * already calls a "review request"). Documents written before rounds existed have no
 * `schemaVersion` and keep working unchanged (`pending` ≡ waiting); round documents carry
 * `schemaVersion: 2`, are written ONLY by the server, and hold their reviewers inline.
 */

export type RoundStatus = "draft" | "waiting" | "in_review" | "changes_requested" | "approved";
export type ReviewerStatus = "waiting" | "viewed" | "commented" | "changes_requested" | "approved";
export type ReviewerType = "internal" | "external";
export type ReviewDecision = "approved" | "changes_requested";

export interface RoundReviewer {
  /** Stable id of this reviewer WITHIN the round: `u_<uid>` (internal), `e_<hash(round, email)>` (named external), `g_<sessionId>` (open guest). Opaque. */
  key: string;
  type: ReviewerType;
  /** Internal only. */
  uid: string | null;
  // NOTE: no email here. A round document is readable by every project member, so an outside reviewer's address is kept in the
  // server-only `review_reviewer_identities` collection and only ever returned to the person managing the review.
  displayName: string;
  /** Required reviewers gate the round's approval; optional reviewers can review and comment but never block it. */
  required: boolean;
  /** true = an unverified "anyone with the link" visitor who joined by acting (never required, identity is only a display name). */
  guest: boolean;
  invitedAt: string;
  firstViewedAt: string | null;
  lastActivityAt: string | null;
  commentedAt: string | null;
  decision: ReviewDecision | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Set when removed from the round; kept (not deleted) if they had already acted so history stays truthful. */
  removedAt: string | null;
}

export interface RoundSummary {
  status: RoundStatus;
  requiredTotal: number;
  requiredApproved: number;
  requiredChanges: number;
  /** True once any (active) reviewer has viewed, commented or decided. */
  hasInteraction: boolean;
}

/** Reviewers that count (removed-and-silent reviewers vanish; removed reviewers who already decided/commented don't count towards a new outcome either). */
export const activeReviewers = (reviewers: RoundReviewer[]): RoundReviewer[] => reviewers.filter((r) => !r.removedAt);

/** What a reviewer's row shows. Decision wins over comment, comment over view, view over waiting — and a later comment NEVER downgrades a decision. */
export function reviewerStatus(r: Pick<RoundReviewer, "decision" | "commentedAt" | "firstViewedAt">): ReviewerStatus {
  if (r.decision === "approved") return "approved";
  if (r.decision === "changes_requested") return "changes_requested";
  if (r.commentedAt) return "commented";
  if (r.firstViewedAt) return "viewed";
  return "waiting";
}

/**
 * THE aggregation rule (deterministic, order matters):
 *   1. any REQUIRED reviewer requested changes            → changes_requested
 *   2. there are required reviewers and ALL approved       → approved
 *   3. NO required reviewers (e.g. only open guests): fall back to whoever decided —
 *        any changes_requested → changes_requested; else any approved → approved
 *   4. anyone viewed / commented / decided                 → in_review
 *   5. otherwise                                           → waiting
 * Optional reviewers never block (rules 1–2 look only at required reviewers).
 * `draft` is an explicit state set at creation, never produced by aggregation.
 */
export function aggregateRound(reviewers: RoundReviewer[]): RoundSummary {
  const active = activeReviewers(reviewers);
  const required = active.filter((r) => r.required);
  const requiredApproved = required.filter((r) => r.decision === "approved").length;
  const requiredChanges = required.filter((r) => r.decision === "changes_requested").length;
  const hasInteraction = active.some((r) => r.firstViewedAt || r.commentedAt || r.decision);

  let status: RoundStatus;
  if (requiredChanges > 0) status = "changes_requested";
  else if (required.length > 0 && requiredApproved === required.length) status = "approved";
  else if (required.length === 0 && active.some((r) => r.decision === "changes_requested")) status = "changes_requested";
  else if (required.length === 0 && active.some((r) => r.decision === "approved")) status = "approved";
  else if (hasInteraction) status = "in_review";
  else status = "waiting";

  return { status, requiredTotal: required.length, requiredApproved, requiredChanges, hasInteraction };
}

/** A round is OPEN (decisions may be made/changed) only while waiting / in review and not superseded by a newer round. */
export function isRoundOpen(round: { status: RoundStatus | "pending"; supersededByRoundId?: string | null }): boolean {
  if (round.supersededByRoundId) return false;
  return round.status === "waiting" || round.status === "in_review" || round.status === "pending";
}

/** Outcome reached = the round is closed to further DECISIONS (comments are still version comments and remain possible). */
export const isOutcomeReached = (status: RoundStatus): boolean => status === "approved" || status === "changes_requested";

/** The file's review status (existing AssetStatus vocabulary) implied by a round. Only ever applied to the round's OWN version. */
export function fileStatusForRound(status: RoundStatus): "none" | "pending_review" | "approved" | "changes_requested" {
  switch (status) {
    case "approved": return "approved";
    case "changes_requested": return "changes_requested";
    case "waiting":
    case "in_review": return "pending_review";
    default: return "none";
  }
}

/** Legacy (pre-rounds) `pending` and any unknown value read as `waiting`. */
export function normalizeRoundStatus(status: string | undefined): RoundStatus {
  switch (status) {
    case "draft": case "waiting": case "in_review": case "changes_requested": case "approved": return status;
    default: return "waiting";
  }
}

export const ROUND_STATUS_LABEL: Record<RoundStatus, string> = {
  draft: "Draft",
  waiting: "Waiting for reviewers",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
};

export const REVIEWER_STATUS_LABEL: Record<ReviewerStatus, string> = {
  waiting: "Waiting",
  viewed: "Viewed",
  commented: "Commented",
  changes_requested: "Changes requested",
  approved: "Approved",
};

/** Headline progress text. A required "changes requested" is the PRIMARY status — never a misleading "2 / 3 approved". */
export function progressLabel(summary: RoundSummary): string {
  if (summary.status === "changes_requested") return "Changes requested";
  if (summary.requiredTotal === 0) return summary.status === "approved" ? "Approved" : "No required reviewers";
  return `${summary.requiredApproved} / ${summary.requiredTotal} required approvals`;
}

/** Next round number for an asset, from the round numbers that already exist. */
export const nextRoundNumber = (existing: number[]): number => (existing.length ? Math.max(...existing) : 0) + 1;

/** "Needs attention" statuses for dashboards: a round still waiting for / in the middle of review, or a legacy pending request. */
export function isPendingRoundStatus(status: string): boolean {
  return status === "waiting" || status === "in_review" || status === "pending";
}

/* ───────────────────────────── selection / navigation (pure, shared by the panel and tests) ───────────────────────────── */

interface RoundRef { id: string; status: string; roundNumber?: number; fileId?: string; version?: number; supersededByRoundId?: string | null }

/**
 * Which round the panel shows. `selectedId` comes from the history list or a `?round=` link and is NAVIGATION ONLY: it must be one of
 * the rounds the caller was already allowed to read for this asset, otherwise it is silently ignored (no error, nothing revealed)
 * and the default applies — the round of the version on screen, else the newest round. `rounds` is newest first.
 */
export function pickRound<R extends RoundRef>(rounds: R[], selectedId: string | null, assetFileId: string): { round: R | null; isHistorical: boolean } {
  const latest = rounds[0] ?? null;
  const round = (selectedId ? rounds.find((r) => r.id === selectedId) : undefined) ?? rounds.find((r) => r.fileId === assetFileId) ?? latest;
  return { round, isHistorical: !!round && round !== latest };
}

/** The file (version) to switch to so a chosen round is never shown beside a different version; null = already on it / unavailable. */
export function versionSwitchTarget(round: Pick<RoundRef, "fileId">, assetFileId: string, versionFileIds: string[]): string | null {
  return round.fileId && round.fileId !== assetFileId && versionFileIds.includes(round.fileId) ? round.fileId : null;
}

/**
 * "Start Review Round N" is offered (never auto-sent) when the version on screen is the newest, it is newer than the version of the
 * latest round, and that round is finished (approved / changes requested) or superseded.
 */
export function shouldOfferNextRound(latest: RoundRef | null, asset: { versionNumber?: number; isLatestVersion?: boolean }): boolean {
  if (!latest || !asset.isLatestVersion) return false;
  const finished = latest.status === "approved" || latest.status === "changes_requested" || !!latest.supersededByRoundId;
  return (latest.version ?? 0) < (asset.versionNumber ?? 1) && finished;
}
