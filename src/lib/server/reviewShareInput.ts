import "server-only";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { generateToken, hashPassword, sha256Hex, writeAudit } from "@/lib/server/reviewShare";
import { DEFAULT_REVIEW_SHARE_PERMISSIONS, type ReviewShare, type ReviewShareAccessMode, type ReviewSharePermissions } from "@/types/reviewShare.types";

export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export const MAX_ACTIVE_PER_ASSET = 25;

export function parsePermissions(input: unknown, base: ReviewSharePermissions): ReviewSharePermissions | null {
  if (input === undefined) return base;
  if (!input || typeof input !== "object") return null;
  const out = { ...base };
  for (const key of Object.keys(DEFAULT_REVIEW_SHARE_PERMISSIONS) as (keyof ReviewSharePermissions)[]) {
    const v = (input as Record<string, unknown>)[key];
    if (v === undefined) continue;
    if (typeof v !== "boolean") return null;
    out[key] = v;
  }
  return out;
}

export function parseExpiry(input: unknown): { ok: true; value: string | null } | { ok: false } {
  if (input === undefined || input === null || input === "") return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false };
  const ms = Date.parse(input);
  if (!Number.isFinite(ms) || ms <= Date.now() || ms > Date.now() + 2 * 365 * 24 * 3600 * 1000) return { ok: false };
  return { ok: true, value: new Date(ms).toISOString() };
}

export function parseEmails(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const emails = [...new Set(input.map((e) => (typeof e === "string" ? e.trim().toLowerCase() : "")))];
  if (emails.length === 0 || emails.length > 20 || !emails.every((e) => EMAIL.test(e))) return null;
  return emails;
}

export interface NewShareArgs {
  uid: string;
  actorName: string;
  file: { id: string; workspaceId: string; projectId: string; assetGroupId: string; version: number };
  /** The review ROUND this link belongs to — a link can only ever act on this round, for this version. */
  reviewId: string;
  accessMode: ReviewShareAccessMode;
  allowedEmails: string[];
  password?: unknown;
  expiresAt?: unknown;
  permissions?: unknown;
  title?: string | null;
  message?: string | null;
}

/** Validates the link settings and writes ONE share (token returned once, only its hash stored). Returns an error string instead of throwing so routes can answer 400. */
export async function createShareDoc(a: NewShareArgs): Promise<{ ok: true; token: string; share: ReviewShare } | { ok: false; error: string; status: number }> {
  const db = adminDb();
  let passwordHash: string | null = null;
  if (a.password !== undefined && a.password !== null && a.password !== "") {
    if (typeof a.password !== "string" || a.password.length < 6 || a.password.length > 128) return { ok: false, error: "Password must be 6–128 characters.", status: 400 };
    passwordHash = await hashPassword(a.password);
  }
  const expiry = parseExpiry(a.expiresAt); // omitted = no expiration
  if (!expiry.ok) return { ok: false, error: "Expiration must be a future date within 2 years.", status: 400 };
  const permissions = parsePermissions(a.permissions, DEFAULT_REVIEW_SHARE_PERMISSIONS);
  if (!permissions) return { ok: false, error: "Invalid permissions.", status: 400 };

  const existing = await db.collection("review_shares").where("assetGroupId", "==", a.file.assetGroupId).get();
  if (existing.docs.filter((d) => d.data().status === "active").length >= MAX_ACTIVE_PER_ASSET) {
    return { ok: false, error: "This asset already has the maximum number of active review links. Revoke one first.", status: 400 };
  }

  const token = generateToken();
  const now = new Date().toISOString();
  const ref = db.collection("review_shares").doc();
  const share: ReviewShare = {
    id: ref.id, workspaceId: a.file.workspaceId, projectId: a.file.projectId, fileId: a.file.id, assetGroupId: a.file.assetGroupId, version: a.file.version,
    tokenHash: sha256Hex(token), createdBy: a.uid, createdByName: a.actorName, createdAt: now, updatedAt: now, status: "active", revokedAt: null, revokedBy: null,
    accessMode: a.accessMode, allowedEmails: a.allowedEmails, passwordHash, expiresAt: expiry.value, permissions, title: a.title ?? null, message: a.message ?? null,
    reviewId: a.reviewId, authEpoch: 1, firstViewedAt: null,
  };
  await ref.set(share);
  await writeAudit(share, { action: "review_link_created", actorId: a.uid, actorName: a.actorName, details: { accessMode: a.accessMode, passwordProtected: !!passwordHash, expiresAt: expiry.value, permissions, reviewId: a.reviewId } });
  return { ok: true, token, share };
}
