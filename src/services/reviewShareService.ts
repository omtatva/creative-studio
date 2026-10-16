import { getCurrentUser } from "@/lib/firebase/auth";
import type { ReviewShareAccessMode, ReviewSharePermissions, ReviewShareSummary } from "@/types/reviewShare.types";

/** Internal (signed-in) side: create / list / update / revoke external review links via /api/review-shares. */
async function manage<T>(payload: Record<string, unknown>): Promise<T> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch("/api/review-shares", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? "Something went wrong.");
  return data as T;
}

export interface CreateReviewLinkInput {
  workspaceId: string;
  fileId: string;
  accessMode: ReviewShareAccessMode;
  emails?: string[];
  password?: string;
  expiresAt?: string | null;
  permissions: ReviewSharePermissions;
  title?: string;
}

export const reviewLinkUrl = (token: string) => `${window.location.origin}/review/share/${token}`;

export const createReviewLink = (input: CreateReviewLinkInput) => manage<{ token: string; share: ReviewShareSummary }>({ action: "create", ...input });
export const listReviewLinks = (workspaceId: string, fileId: string) => manage<{ shares: ReviewShareSummary[] }>({ action: "list", workspaceId, fileId });
export const updateReviewLink = (shareId: string, patch: Record<string, unknown>) => manage<{ token: string | null; share: ReviewShareSummary }>({ action: "update", shareId, ...patch });
export const revokeReviewLink = (shareId: string) => manage<{ success: true }>({ action: "revoke", shareId });

/** External (reviewer) side: calls /api/review/[action] — authenticated only by the server-issued session cookie. */
export async function reviewApi<T = Record<string, unknown>>(action: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> {
  const response = await fetch(`/api/review/${action}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}
