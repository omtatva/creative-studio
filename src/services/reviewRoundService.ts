import { getCurrentUser } from "@/lib/firebase/auth";
import type { ReviewSharePermissions } from "@/types/reviewShare.types";

/** Internal (signed-in) side of review rounds — every call is re-authorized per project on the server (/api/review-rounds). */
async function call<T>(payload: Record<string, unknown>): Promise<T> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch("/api/review-rounds", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? "Something went wrong.");
  return data as T;
}

export interface NewRoundInput {
  workspaceId: string;
  fileId: string;
  title?: string;
  message?: string;
  draft?: boolean;
  internalReviewers: { uid: string; required: boolean }[];
  externalReviewers: { email: string; required: boolean }[];
  link?: { password?: string; expiresAt?: string | null; permissions?: ReviewSharePermissions };
}

export const createReviewRound = (input: NewRoundInput) =>
  call<{ reviewId: string; roundNumber: number; token: string | null; shareId: string | null; emailFailures: string[] }>({ action: "create", ...input });
export const sendReviewRound = (workspaceId: string, reviewId: string) => call<{ success: true }>({ action: "send", workspaceId, reviewId });
export const markRoundViewed = (workspaceId: string, reviewId: string) => call<{ tracked: boolean }>({ action: "viewed", workspaceId, reviewId });
export const decideReviewRound = (workspaceId: string, reviewId: string, decision: "approved" | "changes_requested", note?: string) =>
  call<{ status: string }>({ action: "decide", workspaceId, reviewId, decision, note: note ?? null });
export const manageReviewRound = (
  workspaceId: string,
  reviewId: string,
  change: { addInternal?: { uid: string; required: boolean }[]; remove?: string[]; setRequired?: { key: string; required: boolean }[]; replace?: { from: string; to: { uid: string; required?: boolean } }[] }
) => call<{ status: string; note?: string }>({ action: "manage", workspaceId, reviewId, ...change });

export interface EligibleReviewer { uid: string; displayName: string; photoURL: string | null; projectRole: string | null; canDecide: boolean }
/** The reviewer picker: members of THIS file's project only, and whether each can make a formal decision. No addresses. */
export const listEligibleReviewers = (workspaceId: string, fileId: string) => call<{ reviewers: EligibleReviewer[] }>({ action: "eligible", workspaceId, fileId });
/** What the signed-in user can do on this round RIGHT NOW (the server re-derives it; the UI only reflects it). */
export const getRoundCapabilities = (workspaceId: string, reviewId: string) => call<{ isReviewer: boolean; canDecide: boolean; canManage: boolean }>({ action: "capabilities", workspaceId, reviewId });
export const markRoundCommented = (workspaceId: string, reviewId: string) => call<{ tracked: boolean }>({ action: "commented", workspaceId, reviewId });

export interface RoundReviewerDetail {
  key: string; type: "internal" | "external"; uid: string | null; displayName: string; required: boolean; guest: boolean; removedAt: string | null;
  /** Outside reviewers' address — present only for the person managing the review. */
  email: string | null;
  /** Team reviewers only (managers): whether they can still take part / decide. */
  capability: { onProject: boolean; canView: boolean; canDecide: boolean } | null;
}
export const getRoundDetails = (workspaceId: string, reviewId: string) => call<{ reviewers: RoundReviewerDetail[]; canManage: boolean }>({ action: "details", workspaceId, reviewId });
