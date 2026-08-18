import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Signs/verifies the OAuth `state` parameter for the Gmail connect
 * flow (see src/app/api/auth/google/route.ts and callback/route.ts).
 *
 * Why this exists: Google's consent screen requires a full top-level
 * browser redirect, which can't carry a custom Authorization header —
 * so the UID a completed OAuth grant gets attached to can't come from
 * a bearer token at callback time. Instead, /api/auth/google verifies
 * the caller's ID token ONCE (via a same-origin fetch, which CAN carry
 * the header) and mints this signed state carrying that already-
 * verified UID. The callback then only needs to verify the signature
 * — proving the state wasn't tampered with — not re-authenticate the
 * user, while still guaranteeing the connection can only ever be
 * attached to the UID that actually initiated it.
 *
 * Reuses SETTINGS_ENCRYPTION_KEY as the HMAC key rather than
 * introducing a second secret — it's already a required, base64
 * 32-byte server secret in this codebase (see secretCrypto.ts).
 */

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — plenty for a user to complete Google's consent screen.

function getStateSecret(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("SETTINGS_ENCRYPTION_KEY is not configured on the server. Add it to .env.local and restart the server.");
  }
  return Buffer.from(raw, "base64");
}

export function createOAuthState(uid: string): string {
  const payload = JSON.stringify({ uid, nonce: randomBytes(8).toString("hex"), exp: Date.now() + STATE_TTL_MS });
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  const signature = createHmac("sha256", getStateSecret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

export class InvalidOAuthStateError extends Error {}

/** Verifies signature + expiry and returns the UID the state was minted for. Throws InvalidOAuthStateError on any tampering, expiry, or malformed input. */
export function verifyOAuthState(state: string | null): string {
  if (!state || !state.includes(".")) {
    throw new InvalidOAuthStateError("Missing or malformed OAuth state.");
  }
  const [payloadB64, signature] = state.split(".");
  if (!payloadB64 || !signature) {
    throw new InvalidOAuthStateError("Malformed OAuth state.");
  }

  const expectedSignature = createHmac("sha256", getStateSecret()).update(payloadB64).digest("base64url");
  const provided = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new InvalidOAuthStateError("OAuth state signature verification failed.");
  }

  let payload: { uid?: string; exp?: number };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    throw new InvalidOAuthStateError("Malformed OAuth state payload.");
  }

  if (typeof payload.uid !== "string" || !payload.uid) {
    throw new InvalidOAuthStateError("OAuth state is missing a uid.");
  }
  if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
    throw new InvalidOAuthStateError("OAuth state has expired. Start the connect flow again.");
  }

  return payload.uid;
}
