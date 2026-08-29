import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
  type Unsubscribe,
} from "firebase/auth";
import { auth } from "./config";

/**
 * Thin wrappers around the Firebase Auth SDK. Kept free of
 * Firestore/UI concerns so `authService.ts` can compose these with
 * profile-document creation and error mapping.
 */

export function subscribeToAuthChanges(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

export async function signUpWithEmail(email: string, password: string, displayName: string) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  return credential.user;
}

export async function signInWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signOutUser() {
  await signOut(auth);
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

/**
 * Re-sends Firebase's own verification email to the SIGNED-IN account.
 * Exists specifically for accounts (like itsupport@omtatvadigitals.com —
 * see lib/constants/itSupport.ts) created directly in the Firebase
 * Console rather than through the normal signup flow: the console never
 * sends a verification email, and verifySuperAdminAuth's self-heal
 * (firebaseAdmin.ts) requires `emailVerified === true`
 * before granting cross-workspace access — with no verification email
 * ever sent, that requirement could never be satisfied. Clicking the
 * link in the resulting email is what actually flips emailVerified;
 * this only triggers Firebase to send it.
 */
export async function resendVerificationEmail(): Promise<void> {
  if (!auth.currentUser) throw new Error("Not signed in.");
  await sendEmailVerification(auth.currentUser);
}

/**
 * Silent, no-form sign-in for a public share link's "anyone can view" mode
 * (see FileShareSettings) — gives an otherwise-unauthenticated visitor a
 * real Firebase Auth uid (so their comments have a stable authorId and
 * Firestore rules can require `isSignedIn()` on writes as a basic
 * anti-abuse floor) without ever showing them a login form. Requires
 * Anonymous sign-in to be enabled in the Firebase Console — if it isn't,
 * this rejects and the caller should fall back to view-only.
 */
export async function signInGuest() {
  const credential = await signInAnonymously(auth);
  return credential.user;
}
