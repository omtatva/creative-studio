import { setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import {
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
  resetPassword,
} from "@/lib/firebase/auth";
import { userDoc } from "@/lib/firebase/firestore";
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
