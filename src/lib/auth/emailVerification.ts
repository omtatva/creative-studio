/**
 * Pure helpers for the email-verification step of accepting a workspace invitation (no Firebase, no React — unit-testable).
 *
 * The browser's own `emailVerified` flag is only used to decide WHICH screen to show. The server never trusts it: /api/invites/accept re-reads the
 * Firebase Auth record itself and refuses an unverified address (see app/api/invites/accept/route.ts).
 */

/** Minimum gap between two "resend verification email" requests from the same page (Firebase also rate-limits server-side). */
export const RESEND_COOLDOWN_MS = 60_000;

/** Milliseconds until another verification email may be requested; 0 when allowed now. */
export function cooldownRemainingMs(lastSentAt: number | null, now: number = Date.now(), cooldownMs: number = RESEND_COOLDOWN_MS): number {
  if (lastSentAt === null || !Number.isFinite(lastSentAt)) return 0;
  return Math.max(0, lastSentAt + cooldownMs - now);
}

/**
 * When the verification email was last sent, as far as the page can tell. A brand-new email/password account is sent one at signup, so an account created
 * moments ago starts inside the cooldown instead of inviting an immediate duplicate.
 */
export function initialLastSentAt(creationTime: string | undefined | null, now: number = Date.now(), cooldownMs: number = RESEND_COOLDOWN_MS): number | null {
  if (!creationTime) return null;
  const created = Date.parse(creationTime);
  if (!Number.isFinite(created)) return null;
  return now - created < cooldownMs ? created : null;
}

/** A readable message for a Firebase Auth error raised while sending the verification email or refreshing the user. */
export function mapVerificationError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  switch (code) {
    case "auth/too-many-requests":
      return "Too many verification emails were requested. Wait a few minutes before asking for another.";
    case "auth/network-request-failed":
      return "Couldn't reach the server. Check your connection and try again.";
    case "auth/user-token-expired":
    case "auth/user-disabled":
    case "auth/user-not-found":
    case "auth/requires-recent-login":
      return "Your sign-in session has expired. Sign out and sign in again, then retry.";
    default:
      return "Something went wrong. Please try again in a moment.";
  }
}

export type AcceptFailure = "email_not_verified" | "already_used" | "already_member" | "expired" | "cancelled" | "domain_not_allowed" | "wrong_account" | "member_limit" | "other";

/** Maps the machine-readable `code` / HTTP status returned by /api/invites/accept to what the invite page should do. */
export function classifyAcceptFailure(code: string | undefined, status: number | undefined): AcceptFailure {
  switch (code) {
    case "EMAIL_NOT_VERIFIED": return "email_not_verified";
    case "INVITE_ALREADY_USED": return "already_used";
    case "ALREADY_MEMBER": return "already_member";
    case "INVITE_CANCELLED": return "cancelled";
    case "EMAIL_DOMAIN_NOT_ALLOWED": return "domain_not_allowed";
    case "WORKSPACE_MEMBER_LIMIT_REACHED":
    case "MEMBER_LIMIT_REACHED": return "member_limit";
    case "WORKSPACE_ACCESS_DENIED": return "wrong_account";
    default:
      if (status === 410) return "expired";
      return "other";
  }
}
