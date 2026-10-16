import "server-only";
import { Timestamp } from "firebase-admin/firestore";

/**
 * Firestore TTL-ready expiry. Every short-lived server-only document (preview/download tickets,
 * reviewer sessions, email codes) carries BOTH:
 *   - a numeric epoch-ms field the code actually checks (`expiresAt` / `expiresAtMs`) — authorization
 *     is decided from THIS, on every request, so an expired document is refused immediately even if
 *     Firestore has not deleted it yet; and
 *   - `expireAt`, a real Firestore Timestamp, which is what a Firestore TTL policy deletes by.
 * Adding the field does NOT enable cleanup: a TTL policy must also be switched on per collection group
 * (see docs in the final report / `gcloud firestore fields ttls update`). Until then documents simply
 * accumulate, harmlessly — they are inert once expired.
 */
export const expireAt = (epochMs: number): Timestamp => Timestamp.fromMillis(epochMs);

/** How long a preview ticket lives. Long enough for a review session (a ticket swap mid-playback would reset the video); NOT the security boundary — project access is re-checked on every media request. */
export const PREVIEW_TICKET_TTL_MS = 4 * 60 * 60_000;
