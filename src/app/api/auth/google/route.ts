import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, AuthVerificationError } from "@/lib/server/firebaseAdmin";
import { createOAuthState } from "@/lib/server/oauthState";

export const runtime = "nodejs";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

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
 */
export async function GET(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    const message = err instanceof Error ? err.message : "Authentication failed.";
    return NextResponse.json({ error: message }, { status });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    console.error("[auth/google] GOOGLE_CLIENT_ID/GOOGLE_REDIRECT_URI not configured on the server.");
    return NextResponse.json(
      { error: "Gmail connect isn't configured on the server yet. Add GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI." },
      { status: 503 }
    );
  }

  const state = createOAuthState(uid);
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GMAIL_SEND_SCOPE);
  // offline + consent together guarantee Google returns a
  // refresh_token on every connect, including a user reconnecting
  // after a prior disconnect (without `prompt=consent`, Google only
  // issues a refresh_token on a user's very first-ever authorization).
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  return NextResponse.json({ authUrl: authUrl.toString() });
}
