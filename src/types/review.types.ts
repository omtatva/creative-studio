import { ID, Timestamps } from "./common.types";
import { TaskActor } from "./task.types";
import type { RoundReviewer, RoundStatus } from "@/lib/reviewRounds";

/** `pending` is the pre-rounds spelling of `waiting`; round documents use RoundStatus (draft / waiting / in_review / changes_requested / approved). */
export type ReviewStatus = RoundStatus | "pending";

/**
 * A review request — and, for documents with `schemaVersion: 2`, ONE ROUND of review of ONE
 * version of an asset. Approving a review flips the file's `reviewStatus`, which is what makes
 * it eligible for Downloads (see reviewService / lib/server/reviewRounds).
 *
 * Older documents (no `schemaVersion`) are the degenerate single-decider shape and keep
 * working unchanged. Round documents are written ONLY by the server (/api/review-rounds,
 * /api/review/*): firestore.rules refuses client writes to them, so reviewers, decisions and
 * the aggregated status can't be forged from a browser.
 *
 * Rounds are history: starting round 2 for version 2 never rewrites round 1.
 */
export interface Review extends Timestamps {
  id: ID;
  workspaceId: ID;
  projectId: ID;
  title: string;
  fileIds: ID[];
  status: ReviewStatus;
  requestedBy: TaskActor;
  reviewedBy: TaskActor | null;
  reviewNote: string | null;

  // ---- round fields (schemaVersion 2 only) ----
  schemaVersion?: 2;
  /** The asset (all of its versions share this id — see ProjectFile.assetGroupId). */
  assetGroupId?: ID;
  /** The exact file document (= version) this round reviews. Approval applies to THIS version only. */
  fileId?: ID;
  version?: number;
  roundNumber?: number;
  message?: string | null;
  requestedAt?: string;
  /** Set when an outcome (approved / changes requested) is reached — after that, decisions are frozen. */
  completedAt?: string | null;
  /** Set when a newer round for the same asset started while this one was still open — it can no longer take decisions. */
  supersededByRoundId?: ID | null;
  reviewers?: Record<string, RoundReviewer>;
}
