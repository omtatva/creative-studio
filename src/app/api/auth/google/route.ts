import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, AuthVerificationError } from "@/lib/server/firebaseAdmin";
import { createOAuthState } from "@/lib/server/oauthState";

export const runtime = "nodejs";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

// Minimal scope set — `openid email profile` is required so the
// CALLBACK can identify which Google account was actually connected
// (it calls Google's userinfo endpoint with the resulting access
// token; that endpoint 403s without at least one of these identity
// scopes, no matter how valid the token otherwise is — that 403 was
// the exact, confirmed root cause of "Couldn't confirm the connected
// Gmail address"). `gmail.send` is the only Gmail-specific scope —
// deliberately NOT gmail.readonly/gmail.modify/mail.google.com, which
// this app has no use for and must not request.
const GMAIL_OAUTH_SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.send"].join(" ");

/**
 * Step 1 of the Gmail Connect flow — mints the Google consent-screen
 * URL for the CALLING user's own Firebase UID.
 *
 * Why this is a fetch-then-redirect, not a plain `<a href>` link: the
 * actual navigation to Google MUST be a full top-level browser
 * redirect (that's an OAuth/consent-screen requirement, not a choice
 * this app makes), and top-level navigations can't carry a custom
 * Authorization header — so there'd be no way to know which Firebase
 * user is connecting once Google redirects back. Splitting it into
 * "authenticated fetch that returns a URL" + "plain navigation to
 * that URL" lets this route verify the caller's ID token (via the
 * fetch, which CAN carry the header) and bake the resulting
 * already-verified UID into a signed `state` param that survives the
 * round trip to Google and back — see oauthState.ts and
 * callback/route.ts. GOOGLE_CLIENT_SECRET is never touched here; it's
 * only needed in the callback's code-for-token exchange.
 *
 * Every branch below logs enough to trace a real failure from the
 * server terminal (uid, which step, error type/message) — but NEVER
 * the Authorization header, the raw ID token, GOOGLE_CLIENT_SECRET,
 * or any OAuth token. Every exit path returns JSON with a real
 * `error` string, including a catch-all around state creation, so a
 * client-side "Couldn't start the Gmail connection." fallback should
 * only ever appear if this route is unreachable at the network level
 * — never as a stand-in for a swallowed server error.
 */
export async function GET(request: NextRequest) {
  console.log("[auth/google] GET request received");

  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
    console.log("[auth/google] auth verified", { uid });
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    const message = err instanceof Error ? err.message : "Authentication failed.";
    console.error("[auth/google] auth verification failed", { status, message });
    return NextResponse.json({ error: message }, { status });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  console.log("[auth/google] env check", {
    hasClientId: Boolean(clientId),
    hasClientSecret: Boolean(clientSecret),
    hasRedirectUri: Boolean(redirectUri),
    redirectUri: redirectUri ?? null, // not secret — this is a public callback URL, not a credential
  });

  const missing = [
    !clientId && "GOOGLE_CLIENT_ID",
    !clientSecret && "GOOGLE_CLIENT_SECRET",
    !redirectUri && "GOOGLE_REDIRECT_URI",
  ].filter(Boolean);
  if (missing.length > 0) {
    console.error("[auth/google] missing required env var(s):", missing.join(", "));
    return NextResponse.json(
      { error: `Gmail connect isn't configured on the server yet. Missing: ${missing.join(", ")}. Add it to .env.local and restart the dev server.` },
      { status: 503 }
    );
  }

  let state: string;
  try {
    // The one call in this route that can throw for a reason unrelated
    // to auth or config presence (e.g. SETTINGS_ENCRYPTION_KEY set but
    // not valid base64) — wrapped explicitly so any such failure still
    // produces a real JSON error instead of an unhandled 500 (which is
    // exactly what would make the client fall back to its generic
    // "Couldn't start the Gmail connection." message instead of
    // showing the real cause).
    state = createOAuthState(uid);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error creating OAuth state.";
    console.error("[auth/google] createOAuthState failed:", message);
    return NextResponse.json({ error: `Couldn't start the Gmail connection: ${message}` }, { status: 500 });
  }

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId!);
  authUrl.searchParams.set("redirect_uri", redirectUri!);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GMAIL_OAUTH_SCOPES);
  // offline + consent together guarantee Google returns a
  // refresh_token on every connect, including a user reconnecting
  // after a prior disconnect (without `prompt=consent`, Google only
  // issues a refresh_token on a user's very first-ever authorization).
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  console.log("[auth/google] authUrl minted", { uid, redirectUri, scope: GMAIL_OAUTH_SCOPES });
  return NextResponse.json({ authUrl: authUrl.toString() });
}
