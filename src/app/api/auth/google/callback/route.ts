import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { verifyOAuthState, InvalidOAuthStateError } from "@/lib/server/oauthState";
import { encryptSecret } from "@/lib/server/secretCrypto";

export const runtime = "nodejs";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Redirects back into the app with a short, non-sensitive result code — read client-side via plain `window.location.search` (not next/navigation's useSearchParams, which would require a Suspense boundary on that page for no real benefit here) by GmailConnectionSection. Never puts token material or verbose error detail in the URL. */
function resultRedirect(status: "connected" | "error", reason?: string) {
  const url = new URL("/settings/users", appUrl());
  url.searchParams.set("gmail", status);
  if (reason) url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

/**
 * Step 2 of the Gmail Connect flow — Google redirects the user's
 * browser here after they approve (or deny) the consent screen. Exchanges
 * the one-time `code` for real tokens, records which Gmail address was
 * actually granted, and stores the connection encrypted under the UID
 * that /api/auth/google's signed `state` proves initiated this flow —
 * never a UID read from the query string or any client-supplied value.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const googleError = searchParams.get("error");
  if (googleError) {
    console.warn("[auth/google/callback] Google returned an error:", googleError);
    return resultRedirect("error", googleError === "access_denied" ? "denied" : "google_error");
  }

  const code = searchParams.get("code");
  if (!code) {
    return resultRedirect("error", "missing_code");
  }

  let uid: string;
  try {
    uid = verifyOAuthState(searchParams.get("state"));
  } catch (err) {
    console.error("[auth/google/callback] state verification failed:", err instanceof InvalidOAuthStateError ? err.message : err);
    return resultRedirect("error", "invalid_state");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    console.error("[auth/google/callback] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI not configured.");
    return resultRedirect("error", "server_not_configured");
  }

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
  } catch (err) {
    console.error("[auth/google/callback] network error exchanging code:", err instanceof Error ? err.message : err);
    return resultRedirect("error", "token_exchange_failed");
  }

  if (!tokenResponse.ok) {
    const body = await tokenResponse.json().catch(() => null);
    console.error("[auth/google/callback] token exchange rejected:", { status: tokenResponse.status, error: body?.error });
    return resultRedirect("error", "token_exchange_failed");
  }

  const tokenData = await tokenResponse.json();
  const refreshToken: string | undefined = tokenData.refresh_token;
  const accessToken: string | undefined = tokenData.access_token;

  if (!accessToken) {
    console.error("[auth/google/callback] token response missing access_token.");
    return resultRedirect("error", "token_exchange_failed");
  }
  if (!refreshToken) {
    // Shouldn't happen — the initiate route always sends
    // access_type=offline&prompt=consent — but Google's behavior
    // here isn't 100% guaranteed, so fail loudly with a clear,
    // actionable reason rather than silently storing nothing.
    console.error("[auth/google/callback] token response missing refresh_token for uid:", uid);
    return resultRedirect("error", "no_refresh_token");
  }

  let userInfoResponse: Response;
  try {
    userInfoResponse = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    console.error("[auth/google/callback] network error fetching userinfo:", err instanceof Error ? err.message : err);
    return resultRedirect("error", "userinfo_failed");
  }

  if (!userInfoResponse.ok) {
    console.error("[auth/google/callback] userinfo request failed:", userInfoResponse.status);
    return resultRedirect("error", "userinfo_failed");
  }

  const userInfo = await userInfoResponse.json();
  const gmailEmail: string | undefined = userInfo.email;
  if (!gmailEmail) {
    console.error("[auth/google/callback] userinfo response missing email.");
    return resultRedirect("error", "userinfo_failed");
  }

  const encryptedRefreshToken = encryptSecret(refreshToken);

  try {
    const docRef = adminDb().collection("gmail_connections").doc(uid);
    const existing = await docRef.get();
    await docRef.set(
      {
        uid,
        gmailEmail,
        refreshToken: encryptedRefreshToken,
        updatedAt: FieldValue.serverTimestamp(),
        ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("[auth/google/callback] Firestore write failed for uid:", uid, err instanceof Error ? err.message : err);
    return resultRedirect("error", "storage_failed");
  }

  console.log("[auth/google/callback] Gmail connected", { uid, gmailEmail });
  return resultRedirect("connected");
}
