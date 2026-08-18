import { auth } from "@/lib/firebase/config";
import { GmailConnectionStatus } from "@/types/gmail.types";

/**
 * Client-side calls to the Gmail-connect API routes
 * (src/app/api/auth/google/*) — every call attaches the current
 * user's real Firebase ID token as a Bearer header, which is the ONLY
 * identity those routes ever trust (see verifyRequestAuth in
 * lib/server/firebaseAdmin.ts). This module never sees an OAuth
 * access/refresh token — those exist only server-side.
 */

async function authHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  return { Authorization: `Bearer ${idToken}` };
}

/** Fetches the Google consent-screen URL for the current user, then the CALLER navigates there via `window.location.href` — see the doc comment on /api/auth/google/route.ts for why this can't be a plain link. */
export async function getGmailAuthUrl(): Promise<string> {
  const headers = await authHeader();
  const response = await fetch("/api/auth/google", { headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error ?? "Couldn't start the Gmail connection.");
  }
  return data.authUrl as string;
}

export async function getGmailConnectionStatus(): Promise<GmailConnectionStatus> {
  const headers = await authHeader();
  const response = await fetch("/api/auth/google/status", { headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error ?? "Couldn't check Gmail connection status.");
  }
  return data as GmailConnectionStatus;
}

export async function disconnectGmail(): Promise<void> {
  const headers = await authHeader();
  const response = await fetch("/api/auth/google/disconnect", { method: "POST", headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error ?? "Couldn't disconnect Gmail.");
  }
}
