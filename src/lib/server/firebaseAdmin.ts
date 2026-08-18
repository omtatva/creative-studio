import "server-only";
import { cert, getApps, initializeApp, applicationDefault, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Server-only Firebase Admin entry point — completely separate from
 * lib/firebase/config.ts's CLIENT sdk (which every browser component
 * uses and which is bound by Firestore security rules). This one
 * runs with full trust and bypasses security rules entirely, so it
 * must never be imported by a client component — the `server-only`
 * import above makes that a build-time error rather than a runtime
 * leak, same guard as secretCrypto.ts.
 *
 * Used for exactly two things, both required by the Gmail OAuth
 * feature's authorization model (see gmail_connections rules in
 * firestore.rules, which deny ALL direct client access — only this
 * admin path may ever touch that collection):
 *   1. verifyIdToken() — the only way a Next.js API route can
 *      independently prove which Firebase UID is really calling it,
 *      instead of trusting a uid the browser could simply claim.
 *   2. Admin Firestore reads/writes for gmail_connections/{uid} and
 *      trusted cross-checks (workspace_invites, members) inside
 *      /api/invites/send — see that route for why a server-side
 *      re-check is required even though the client SDK's rules
 *      already gate the equivalent client-side actions.
 *
 * Credentials: in Firebase App Hosting (Cloud Run under the hood)
 * Application Default Credentials are provided automatically — no
 * extra config needed there. For local development, set
 * FIREBASE_SERVICE_ACCOUNT_KEY in .env.local to a base64-encoded
 * service account JSON (Project Settings > Service Accounts >
 * Generate new private key in the Firebase console), matching this
 * codebase's existing convention of explicit .env.local secrets
 * rather than relying on ambient gcloud CLI state.
 */

function buildCredential() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (encoded) {
    try {
      const json = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
      return cert(json);
    } catch (err) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT_KEY is set but couldn't be parsed as base64-encoded service-account JSON: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  }
  // Falls back to Application Default Credentials — automatically
  // available in Firebase App Hosting / Cloud Run. Fails at first
  // real use (not at import time) if neither is available.
  return applicationDefault();
}

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0]!;
  return initializeApp({
    credential: buildCredential(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = () => getFirestore(getAdminApp());

export class AuthVerificationError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Verifies the `Authorization: Bearer <idToken>` header on an
 * incoming request and returns the REAL, server-verified Firebase
 * UID — the only UID any Gmail-related route may ever trust. Throws
 * AuthVerificationError (never a raw Firebase error, which can be
 * verbose) on a missing header, malformed token, expired token, or
 * any other verification failure.
 */
export async function verifyRequestAuth(request: Request): Promise<{ uid: string; email: string | null }> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    throw new AuthVerificationError("Missing or invalid Authorization header. Sign in and try again.", 401);
  }
  const idToken = header.slice("Bearer ".length).trim();
  if (!idToken) {
    throw new AuthVerificationError("Missing ID token. Sign in and try again.", 401);
  }
  try {
    const decoded = await adminAuth().verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch (err) {
    console.error("[firebaseAdmin] verifyIdToken failed:", err instanceof Error ? err.message : err);
    throw new AuthVerificationError("Your session has expired or is invalid. Sign in again.", 401);
  }
}
