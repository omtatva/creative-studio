import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { revokeGoogleToken } from "@/lib/server/gmailClient";

export const runtime = "nodejs";

/**
 * Disconnects the CALLING user's own Gmail connection — never
 * another uid, since the uid comes only from a verified ID token.
 * Revokes the grant with Google (best-effort — see
 * revokeGoogleToken's doc comment) and always deletes the Firestore
 * doc regardless of whether the revoke call itself succeeded, so a
 * user can never get stuck "connected" because of a transient
 * network error talking to Google.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    const message = err instanceof Error ? err.message : "Authentication failed.";
    return NextResponse.json({ error: message }, { status });
  }

  try {
    await revokeGoogleToken(uid);
  } catch (err) {
    console.error("[auth/google/disconnect] revoke failed (doc will still be deleted):", uid, err instanceof Error ? err.message : err);
  }

  try {
    await adminDb().collection("gmail_connections").doc(uid).delete();
  } catch (err) {
    console.error("[auth/google/disconnect] Firestore delete failed for uid:", uid, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't disconnect Gmail. Try again." }, { status: 500 });
  }

  console.log("[auth/google/disconnect] Gmail disconnected", { uid });
  return NextResponse.json({ success: true });
}
