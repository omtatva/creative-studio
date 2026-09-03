import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, AuthVerificationError } from "@/lib/server/firebaseAdmin";
import { encryptSecret } from "@/lib/server/secretCrypto";

export const runtime = "nodejs";

interface EncryptRequestBody {
  apiKey: string;
}

/**
 * Stateless crypto endpoint: the client sends a plaintext Gemini key
 * exactly once (over HTTPS, immediately after the user types it into
 * Settings > AI), this route encrypts it with the server-only
 * SETTINGS_ENCRYPTION_KEY, and returns only the ciphertext + a safe
 * 4-character suffix — never the plaintext. The client then writes
 * that ciphertext to Firestore itself (see aiConfigService.ts); this
 * route never touches Firestore, keeping it a pure, auditable crypto
 * boundary.
 *
 * SECURITY: requires sign-in (verifyRequestAuth) — this had no auth
 * check at all before, letting anyone use the server as a free
 * encryption oracle for arbitrary text.
 */
export async function POST(request: NextRequest) {
  try {
    await verifyRequestAuth(request);
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed." }, { status });
  }

  let body: EncryptRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "API key is required." }, { status: 400 });
  }
  if (apiKey.length < 8) {
    return NextResponse.json({ error: "That doesn't look like a valid API key." }, { status: 400 });
  }

  try {
    const { ciphertext, iv, authTag } = encryptSecret(apiKey);
    const keySuffix = apiKey.slice(-4);
    return NextResponse.json({ ciphertext, iv, authTag, keySuffix });
  } catch (err) {
    console.error("[settings/ai-key/encrypt] encryption failed:", err);
    const message = err instanceof Error ? err.message : "Encryption failed.";
    // SETTINGS_ENCRYPTION_KEY misconfiguration is the only realistic
    // failure here — safe to surface since it names no secret value.
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
