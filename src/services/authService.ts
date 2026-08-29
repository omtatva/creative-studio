import { setDoc, getDoc, getDocs, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import {
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
  resetPassword,
} from "@/lib/firebase/auth";
import { userDoc, usersCol } from "@/lib/firebase/firestore";
import { AppUser, AuthCredentials, SignupPayload } from "@/types/user.types";

/**
 * Orchestrates Firebase Auth + the mirrored `users/{uid}` Firestore
 * profile. UI components call this layer, never `lib/firebase/auth`
 * directly, so profile creation can never drift out of sync with
 * account creation.
 */

export async function login({ email, password }: AuthCredentials): Promise<User> {
  return signInWithEmail(email, password);
}

export async function signup({ email, password, displayName }: SignupPayload): Promise<User> {
  const user = await signUpWithEmail(email, password, displayName);
  await createUserProfile(user);
  return user;
}

export async function logout(): Promise<void> {
  await signOutUser();
}

export async function sendPasswordReset(email: string): Promise<void> {
  await resetPassword(email);
}

async function createUserProfile(user: User): Promise<void> {
  const profile: Partial<AppUser> = {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? "",
    photoURL: user.photoURL,
    activeWorkspaceId: null,
    onboardingComplete: false,
  };

  await setDoc(userDoc(user.uid), {
    ...profile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as never);
}

export async function getUserProfile(uid: string): Promise<AppUser | null> {
  const snapshot = await getDoc(userDoc(uid));
  return snapshot.exists() ? (snapshot.data() as AppUser) : null;
}

/** Super Admin > Users — every account on the platform. Firestore rules gate `users/{uid}` reads to `isSelf(uid) || isSuperAdmin()`, so this unfiltered query naturally returns only the caller's own doc for anyone else. */
export async function getAllUsers(): Promise<AppUser[]> {
  const snapshot = await getDocs(usersCol());
  return snapshot.docs.map((d) => d.data());
}

/**
 * Self-heals `platformRole` onto this account's own profile doc — see
 * /api/auth/sync-platform-role and firebaseAdmin.ts's syncPlatformRole
 * for the full trust chain. Called once after every sign-in
 * (AuthContext.loadProfile); best-effort and silent on failure since a
 * normal user's login must never depend on this succeeding — it only
 * ever matters for the one designated Super Admin account.
 */
export async function syncPlatformRole(user: User): Promise<AppUser["platformRole"] | null> {
  try {
    const idToken = await user.getIdToken();
    const response = await fetch("/api/auth/sync-platform-role", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { platformRole?: AppUser["platformRole"] | null };
    return data.platformRole ?? null;
  } catch (err) {
    console.error("[authService] syncPlatformRole failed:", err);
    return null;
  }
}
