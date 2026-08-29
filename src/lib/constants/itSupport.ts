import type { AppUser } from "@/types/user.types";

/**
 * The Omtatva platform has exactly two administration levels:
 *
 *   LEVEL 1 — Workspace Owner/Admin: manages ONLY their own workspace
 *   (see Member.role in workspace.types.ts — a per-workspace concept).
 *
 *   LEVEL 2 — Super Admin: the single Omtatva internal account with
 *   PLATFORM-WIDE visibility across every customer workspace. This is
 *   NOT a workspace role — it's `platformRole` on the user's global
 *   `users/{uid}` profile (see AppUser in user.types.ts), completely
 *   independent of which (if any) workspace they belong to.
 *
 * Trust chain (why this can't be forged from the browser):
 *   - `platformRole` is written ONLY by firebase-admin (see
 *     verifySuperAdminAuth in lib/server/firebaseAdmin.ts), which sets
 *     it to "super_admin" ONLY for the one server-verified email below
 *     — server-verified meaning Firebase's own ID-token claim, checked
 *     against Google's auth backend via the Admin SDK, not a value the
 *     client supplied in a request body/header.
 *   - firestore.rules' users/{uid} block independently denies ANY
 *     client write that changes `platformRole` (create OR update) —
 *     so even a compromised or malicious workspace owner cannot grant
 *     themselves this role by calling the client SDK directly.
 *   - Every actual Super Admin read/write (Firestore rules'
 *     isSuperAdmin(), and every /api/billing/* Super-Admin route) is
 *     re-verified against this same server-side source of truth. The
 *     `isSuperAdminUser()` check below is a UI convenience ONLY — it
 *     decides what to SHOW, never what to ALLOW.
 *   - A second Super Admin can be added later with zero code changes:
 *     just set `platformRole: "super_admin"` on their `users/{uid}`
 *     doc directly in the Firebase Console (see verifySuperAdminAuth's
 *     doc comment).
 */
export const SUPER_ADMIN_EMAIL = "itsupport@omtatvadigitals.com";

/**
 * CLIENT-SIDE check for whether this profile is the platform Super
 * Admin. Takes the Firestore-mirrored `AppUser` profile (AuthContext's
 * `profile`) — NEVER the raw Firebase Auth `user.email` — because
 * `platformRole` is the actual authorized value; `email` alone proves
 * nothing on its own once other admins could theoretically be added.
 */
export function isSuperAdminUser(profile: Pick<AppUser, "platformRole"> | null | undefined): boolean {
  return profile?.platformRole === "super_admin";
}
