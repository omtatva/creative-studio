import { getCurrentUser } from "@/lib/firebase/auth";
import type { AssetType } from "@/types/file.types";

export interface ComparePreviewSide {
  ticket: string;
  fileId: string;
  versionNumber: number;
  assetType: AssetType;
  contentType: string;
  fileName: string;
  durationSeconds: number | null;
}

/** Media URL for a preview ticket — served by /api/files/preview, which re-checks project access on every request. */
export const previewUrl = (ticket: string) => `/api/files/preview?t=${encodeURIComponent(ticket)}`;

/** Issues a preview ticket for ONE file (the normal review player). Throws a readable Error when refused. */
export async function createPreviewTicket(workspaceId: string, fileId: string): Promise<{ ticket: string; expiresAtMs: number }> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch("/api/files/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ workspaceId, fileId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? "Couldn't load the preview.");
  return data;
}

/**
 * Asks the server to validate a pair of versions (same project, same asset, caller has project access) and issue
 * short-lived PREVIEW tickets for them. Throws a user-readable Error when the pair is refused.
 */
export async function createInternalCompare(workspaceId: string, fileIdA: string, fileIdB: string): Promise<{ a: ComparePreviewSide; b: ComparePreviewSide }> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch("/api/files/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ workspaceId, fileIdA, fileIdB }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? "Couldn't open the comparison.");
  return data;
}
