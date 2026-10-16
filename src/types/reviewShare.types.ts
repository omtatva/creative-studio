/**
 * EXTERNAL REVIEW LINKS — a SEPARATE authorization model from workspace
 * membership and project membership. A reviewer holding a valid link is
 * never a workspace member, project member, or Team member; every
 * operation they perform goes through /api/review/* which resolves the
 * share server-side. These documents are Admin-SDK-only (firestore.rules
 * denies all client access) and are never read by the client SDK.
 */

import type { RoundStatus } from "@/lib/reviewRounds";

export type ReviewShareAccessMode = "anyone_with_link" | "specific_emails";
/** `expired` is never stored — it is derived from `expiresAt` on every use (see effectiveShareStatus). */
export type ReviewShareStatus = "active" | "revoked" | "expired";

export interface ReviewSharePermissions {
  canComment: boolean;
  canApprove: boolean;
  canRequestChanges: boolean;
  canDownload: boolean;
  canViewPreviousVersions: boolean;
}

/** Secure defaults: feedback on, decisions on, nothing that hands over the file. */
export const DEFAULT_REVIEW_SHARE_PERMISSIONS: ReviewSharePermissions = {
  canComment: true,
  canApprove: true,
  canRequestChanges: true,
  canDownload: false,
  canViewPreviousVersions: false,
};

/** `review_shares/{id}`. The raw token is NEVER stored — only its SHA-256 (`tokenHash`). */
export interface ReviewShare {
  id: string;
  workspaceId: string;
  projectId: string;
  /** The exact file (version) document the link opens. Scope never widens beyond this + (optionally) earlier versions of the same asset. */
  fileId: string;
  assetGroupId: string;
  version: number;
  tokenHash: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "revoked";
  revokedAt: string | null;
  revokedBy: string | null;
  accessMode: ReviewShareAccessMode;
  /** Lowercased; only meaningful for `specific_emails`. */
  allowedEmails: string[];
  /** scrypt hash string, or null. Never the password. */
  passwordHash: string | null;
  expiresAt: string | null;
  permissions: ReviewSharePermissions;
  title: string | null;
  message: string | null;
  /** The review ROUND (a `reviews` document, schemaVersion 2) this link belongs to. A link can never act on any other round. */
  reviewId: string;
  /** Bumped whenever the password / email list / access mode changes — reviewer sessions from an older epoch stop working. */
  authEpoch: number;
  firstViewedAt: string | null;
}

/** `review_sessions/{sha256(sessionToken)}` — a reviewer's browser session, created only by the server after the link's gates are satisfied. */
export interface ReviewSession {
  shareId: string;
  reviewerId: string;
  displayName: string | null;
  email: string | null;
  emailVerified: boolean;
  passwordOk: boolean;
  authEpoch: number;
  createdAt: string;
  expiresAtMs: number;
  openedLogged: boolean;
}

/** What the internal management UI sees — never the token hash, password hash, or the token. */
export interface ReviewShareSummary {
  id: string;
  fileId: string;
  version: number;
  status: ReviewShareStatus;
  accessMode: ReviewShareAccessMode;
  allowedEmails: string[];
  passwordProtected: boolean;
  expiresAt: string | null;
  permissions: ReviewSharePermissions;
  title: string | null;
  message: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  /** Which round this link belongs to, and that round's aggregated status (see lib/reviewRounds.ts). */
  roundNumber: number;
  roundStatus: RoundStatus;
  firstViewedAt: string | null;
}

/** An external reviewer's view of a comment — no internal uids, no workspace data. */
export interface ExternalComment {
  id: string;
  authorName: string;
  authorKind: "external" | "member";
  body: string;
  parentCommentId: string | null;
  isResolved: boolean;
  timestampSeconds: number | null;
  positionX: number | null;
  positionY: number | null;
  pageNumber: number | null;
  markerNumber: number | null;
  createdAt: string;
  isMine: boolean;
}
