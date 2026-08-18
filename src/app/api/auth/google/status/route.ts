import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { GmailConnection, GmailConnectionStatus } from "@/types/gmail.types";

export const runtime = "nodejs";

/**
 * Whether the CALLING user (proven via their own ID token, never a
 * uid the client could pass in) has a connected Gmail account, and
 * which address — nothing else. Token material never leaves
 * gmailClient.ts/the callback route; this response shape is
 * literally incapable of including it (see GmailConnectionStatus).
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

  try {
    const snapshot = await adminDb().collection("gmail_connections").doc(uid).get();
    if (!snapshot.exists) {
      const result: GmailConnectionStatus = { connected: false, email: null };
      return NextResponse.json(result);
    }
    const data = snapshot.data() as GmailConnection;
    const result: GmailConnectionStatus = { connected: true, email: data.gmailEmail };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[auth/google/status] Firestore read failed for uid:", uid, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't check Gmail connection status. Try again." }, { status: 500 });
  }
}
