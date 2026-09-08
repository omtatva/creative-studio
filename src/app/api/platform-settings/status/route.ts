import { NextRequest, NextResponse } from "next/server";
import { verifySuperAdminAuth, AuthVerificationError } from "@/lib/server/firebaseAdmin";
import type { PlatformIntegrationStatus } from "@/types/platformSettings.types";

export const runtime = "nodejs";

/**
 * Super Admin > Platform Settings' "AI Providers" / "Security" /
 * "Billing" read-only status panels. Every value returned here is a
 * derived boolean or a non-sensitive label — NEVER the actual
 * GEMINI_API_KEY/NVIDIA_API_KEY value, and this route runs only after
 * verifySuperAdminAuth, so no unauthenticated caller can even probe
 * which keys are configured.
 *
 * Deliberately does NOT report Gmail connection status — Gmail is
 * connected per-user (see gmail.types.ts), not platform-wide, so the
 * page fetches that separately via the existing
 * getGmailConnectionStatus() (it reflects the viewing Super Admin's
 * own account, not a platform-wide sender).
 */
export async function GET(request: NextRequest) {
  try {
    await verifySuperAdminAuth(request);
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 403;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Not authorized." }, { status });
  }

  const status: PlatformIntegrationStatus = {
    ai: {
      gemini: { configured: Boolean(process.env.GEMINI_API_KEY), defaultModel: "gemini-2.5-flash" },
      nvidia: { configured: Boolean(process.env.NVIDIA_API_KEY), defaultModel: "meta/llama-3.1-8b-instruct" },
      ollama: { note: "Configured per-workspace (Settings > AI), not globally — no server-side key required." },
    },
    security: {
      authProvider: "Firebase Authentication (ID tokens, verified server-side on every request)",
      sessionModel: "Stateless — short-lived Firebase ID tokens, no server-side session store",
      securityHeaders: ["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Strict-Transport-Security"],
      rateLimiting: "Distributed, Firestore-transaction-based (safe across multiple server instances)",
    },
    billing: {
      paymentProvider: null,
    },
  };

  return NextResponse.json(status);
}
