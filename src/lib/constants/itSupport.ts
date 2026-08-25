/**
 * The single designated IT Support account with cross-workspace,
 * cross-project global visibility (see the `isItSupport()` Firestore
 * rules function in firestore.rules for the actual enforcement — this
 * client-side check only decides which QUERY to run, e.g. "fetch
 * every workspace" vs. "fetch only my memberships"; it grants no
 * access on its own).
 *
 * Deliberately NOT trusting a plain string the client could forge:
 * `firebaseUser.email`/`.emailVerified` on the Firebase Auth SDK's
 * `User` object are populated from the user's signed ID token, the
 * same server-verified claim Firestore rules check via
 * `request.auth.token.email`/`email_verified` — not a value read
 * from a request body or header this app controls. A workspace admin
 * (even a malicious one) cannot make themselves this account without
 * actually controlling itsupport@omtatvadigitals.com's real
 * credentials.
 */
export const IT_SUPPORT_EMAIL = "itsupport@omtatvadigitals.com";

export function isItSupportUser(user: { email: string | null; emailVerified: boolean } | null | undefined): boolean {
  if (!user) return false;
  return user.email === IT_SUPPORT_EMAIL && user.emailVerified === true;
}
