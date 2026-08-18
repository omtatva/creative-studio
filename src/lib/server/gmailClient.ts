import "server-only";
import { decryptSecret, type EncryptedSecret } from "@/lib/server/secretCrypto";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { GmailConnection } from "@/types/gmail.types";

/**
 * Server-only Gmail API client — the replacement for the old Resend
 * proxy. Sends the exact same HTML invitation email, but FROM the
 * inviting user's own connected Gmail account instead of a shared
 * sender, via the Gmail API's `users.messages.send` endpoint. Same
 * "raw fetch, no extra SDK" approach as nvidiaClient.ts — Google's
 * OAuth token endpoint and Gmail API are both plain REST, so the
 * `googleapis` npm package (large, mostly unused surface) isn't
 * needed for this one operation.
 *
 * Deliberately does NOT persist an access token anywhere — access
 * tokens are short-lived (~1 hour) and refresh tokens generally
 * aren't, so every send mints a fresh access token from the stored
 * (encrypted) refresh token right before use. One extra round trip
 * per send, but it means there's no token-expiry bookkeeping to get
 * wrong and nothing but the refresh token is ever at rest.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export class GmailApiError extends Error {
  status: number;
  code: "not_connected" | "token_invalid" | "quota_exceeded" | "send_failed" | "network_error";
  constructor(message: string, status: number, code: GmailApiError["code"]) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function gmailConnectionsCol() {
  // Deliberately NOT in lib/firebase/firestore.ts — that file is for
  // the CLIENT sdk only. This collection is admin-sdk-only (see
  // gmail.types.ts and the firestore.rules `if false` guard on it).
  return adminDb().collection("gmail_connections");
}

async function getConnection(uid: string): Promise<GmailConnection | null> {
  const snapshot = await gmailConnectionsCol().doc(uid).get();
  if (!snapshot.exists) return null;
  return snapshot.data() as GmailConnection;
}

/** Mints a fresh Gmail API access token from a user's stored (encrypted) refresh token. Never returns/logs the token itself. */
async function getFreshAccessToken(uid: string): Promise<{ accessToken: string; gmailEmail: string }> {
  const connection = await getConnection(uid);
  if (!connection) {
    throw new GmailApiError("Gmail isn't connected yet. Connect your Gmail account in Settings > Users to send invitations.", 400, "not_connected");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("[gmailClient] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not configured on the server.");
    throw new GmailApiError("Gmail sending isn't configured on the server yet.", 503, "not_connected");
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(connection.refreshToken as EncryptedSecret);
  } catch (err) {
    console.error("[gmailClient] failed to decrypt stored refresh token for uid:", uid, err instanceof Error ? err.message : err);
    throw new GmailApiError("This Gmail connection is corrupted. Disconnect and reconnect Gmail in Settings > Users.", 500, "token_invalid");
  }

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch (err) {
    console.error("[gmailClient] network error refreshing access token:", err instanceof Error ? err.message : err);
    throw new GmailApiError("Couldn't reach Google to refresh the Gmail connection. Try again in a moment.", 502, "network_error");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const errorCode = body?.error;
    console.error("[gmailClient] token refresh failed", { status: response.status, errorCode });
    // "invalid_grant" is Google's code for "the refresh token was
    // revoked or expired" — e.g. the user removed the app's access
    // from their Google Account, or the OAuth consent was reset.
    if (errorCode === "invalid_grant") {
      throw new GmailApiError("Your Gmail permission was revoked or expired. Reconnect Gmail in Settings > Users.", 401, "token_invalid");
    }
    throw new GmailApiError("Couldn't refresh the Gmail connection. Reconnect Gmail in Settings > Users.", 401, "token_invalid");
  }

  const data = await response.json();
  if (typeof data.access_token !== "string") {
    throw new GmailApiError("Google didn't return a usable access token. Reconnect Gmail in Settings > Users.", 502, "token_invalid");
  }

  return { accessToken: data.access_token, gmailEmail: connection.gmailEmail };
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** RFC 2047-encodes a header value if it contains non-ASCII characters (e.g. a workspace name with accented characters); leaves plain ASCII subjects untouched. */
function encodeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function buildMimeMessage(params: { fromEmail: string; to: string; subject: string; html: string }): string {
  const { fromEmail, to, subject, html } = params;
  const lines = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf8").toString("base64"),
  ];
  return lines.join("\r\n");
}

/**
 * Sends an HTML email via the Gmail API on behalf of `uid`'s
 * connected Gmail account. Throws GmailApiError (never a raw
 * Google/network error) with a `.code` the caller can map to a
 * specific, user-facing message — see /api/invites/send/route.ts.
 */
export async function sendGmailMessage(params: { uid: string; to: string; subject: string; html: string }): Promise<void> {
  const { uid, to, subject, html } = params;
  const startedAt = Date.now();
  const { accessToken, gmailEmail } = await getFreshAccessToken(uid);

  const raw = base64UrlEncode(buildMimeMessage({ fromEmail: gmailEmail, to, subject, html }));

  console.log("[gmailClient] send started", { uid, hasTo: Boolean(to) });

  let response: Response;
  try {
    response = await fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
  } catch (err) {
    console.error("[gmailClient] network error calling Gmail API:", err instanceof Error ? err.message : err);
    throw new GmailApiError("Couldn't reach Gmail. Try again in a moment.", 502, "network_error");
  }

  const elapsedMs = Date.now() - startedAt;

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const reason = body?.error?.status ?? body?.error?.message ?? "unknown";
    console.error("[gmailClient] Gmail API rejected the send", { status: response.status, reason, elapsedMs });

    if (response.status === 401) {
      throw new GmailApiError("Your Gmail permission was revoked or expired. Reconnect Gmail in Settings > Users.", 401, "token_invalid");
    }
    if (response.status === 403) {
      throw new GmailApiError("This Gmail account doesn't have permission to send mail via the API. Reconnect Gmail and re-grant access.", 403, "token_invalid");
    }
    if (response.status === 429 || response.status === 403 && reason === "rateLimitExceeded") {
      throw new GmailApiError("Gmail's sending limit was reached. Try again in a few minutes.", 429, "quota_exceeded");
    }
    throw new GmailApiError(`Gmail rejected the email (${reason}).`, 502, "send_failed");
  }

  console.log("[gmailClient] send completed", { uid, elapsedMs });
}

/**
 * Best-effort revoke of `uid`'s stored refresh token with Google
 * (properly severs the OAuth grant, not just our own copy of it) —
 * used by /api/auth/google/disconnect/route.ts, which deletes the
 * Firestore doc regardless of whether this succeeds, so a corrupted
 * or already-invalid token can never block disconnecting.
 */
export async function revokeGoogleToken(uid: string): Promise<void> {
  const connection = await getConnection(uid);
  if (!connection) return;

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(connection.refreshToken as EncryptedSecret);
  } catch {
    // Corrupted ciphertext — nothing to revoke with Google, the
    // caller will still delete the Firestore doc.
    return;
  }

  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, { method: "POST" });
  } catch (err) {
    console.error("[gmailClient] revoke request failed (doc will still be deleted):", err instanceof Error ? err.message : err);
  }
}
