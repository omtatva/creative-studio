import { ID, Timestamps } from "./common.types";

/**
 * One Firebase Auth user's connected Gmail account — used to send
 * workspace-invitation emails FROM that user's own Gmail address via
 * the Gmail API (see src/lib/server/gmailClient.ts), replacing the
 * shared Resend sender. Document id IS the Firebase UID
 * (`gmail_connections/{uid}`), so a user has at most one Gmail
 * connection, independent of which workspace(s) they belong to.
 *
 * This collection is NEVER read or written by the client Firestore
 * SDK — firestore.rules denies all direct client access to it, and
 * it's deliberately absent from lib/firebase/firestore.ts's
 * collection-helper map (which is for the client SDK only). The only
 * code that ever touches it is server-side, via firebase-admin
 * (src/lib/server/firebaseAdmin.ts), inside the
 * src/app/api/auth/google/* routes and /api/invites/send — all of
 * which independently verify the caller's Firebase ID token first,
 * so a doc here can only ever be read/written on behalf of the UID
 * that doc actually belongs to.
 *
 * `refreshToken` is AES-256-GCM ciphertext (see
 * src/lib/server/secretCrypto.ts) — meaningless without
 * SETTINGS_ENCRYPTION_KEY, which never leaves the server process.
 * The short-lived Gmail API access token is never persisted at all;
 * gmailClient.ts mints a fresh one from the refresh token
 * immediately before every send.
 */
export interface GmailConnection extends Timestamps {
  uid: ID;
  gmailEmail: string;
  refreshToken: {
    ciphertext: string;
    iv: string;
    authTag: string;
  };
}

/** The only shape of gmail_connections data that's ever allowed to reach the client — see /api/auth/google/status/route.ts. Never includes token material. */
export interface GmailConnectionStatus {
  connected: boolean;
  email: string | null;
}
