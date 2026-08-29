import { NextRequest, NextResponse } from "next/server";
import { syncPlatformRole, AuthVerificationError } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

/**
 * Called once after every sign-in (see authService.syncPlatformRole /
 * AuthContext.loadProfile) so the Super Admin's `platformRole` gets
 * self-healed onto its own `users/{uid}` doc before it ever needs to
 * call a billing action route — see syncPlatformRole's doc comment in
 * firebaseAdmin.ts for why this is safe for every account to call.
 */
export async function POST(request: NextRequest) {
  try {
    const { platformRole } = await syncPlatformRole(request);
    return NextResponse.json({ success: true, platformRole });
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Not authorized." }, { status });
  }
}
