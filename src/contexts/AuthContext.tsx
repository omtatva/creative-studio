"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import { subscribeToAuthChanges, getCurrentUser } from "@/lib/firebase/auth";
import { getUserProfile, syncPlatformRole } from "@/services/authService";
import { AppUser } from "@/types/user.types";

/**
 * Root auth context. Wraps the whole app (see app/layout.tsx) and
 * exposes both the raw Firebase `User` (for uid/email) and the
 * mirrored Firestore `AppUser` profile (for activeWorkspaceId,
 * onboardingComplete, etc.) so consumers never have to fetch the
 * profile document themselves.
 */
interface AuthContextValue {
  firebaseUser: User | null;
  profile: AppUser | null;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadProfile(uid: string) {
    // DIAGNOSTIC: this read runs on every auth state change, before
    // any workspace-related code runs at all. It previously had no
    // try/catch — a rejection here became an unhandled promise
    // rejection with no path/uid/error context, which could produce
    // an identical-looking "Missing or insufficient permissions" to
    // anything happening later in workspace creation, with no way to
    // tell them apart.
    console.log("[AuthContext.loadProfile] reading users/" + uid, {
      uid,
      path: `users/${uid}`,
      authCurrentUserExists: getCurrentUser() !== null,
      authCurrentUserUid: getCurrentUser()?.uid ?? null,
    });
    try {
      const userProfile = await getUserProfile(uid);
      console.log("[AuthContext.loadProfile] read users/" + uid + " OK", { found: userProfile !== null });
      setProfile(userProfile);

      // Self-heal platformRole (see authService.syncPlatformRole) once
      // per session, only when it isn't already synced — solves the
      // bootstrap chicken-and-egg where client-side Super Admin gating
      // reads `profile.platformRole`, which has to exist BEFORE the
      // Super Admin can reach any gated page in the first place.
      // Best-effort and silent for every other account.
      if (userProfile && userProfile.platformRole !== "super_admin") {
        const currentUser = getCurrentUser();
        if (currentUser) {
          const syncedRole = await syncPlatformRole(currentUser);
          if (syncedRole === "super_admin") {
            setProfile(await getUserProfile(uid));
          }
        }
      }
    } catch (err) {
      const firebaseErr = err as { code?: string; message?: string; stack?: string };
      console.error("[AuthContext.loadProfile] FAILED reading users/" + uid, err);
      console.error("[AuthContext.loadProfile] error.code:", firebaseErr?.code);
      console.error("[AuthContext.loadProfile] error.message:", firebaseErr?.message);
      console.error("[AuthContext.loadProfile] error.stack:", firebaseErr?.stack);
      setProfile(null);
    }
  }

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges(async (user) => {
      setFirebaseUser(user);
      if (user) {
        await loadProfile(user.uid);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      profile,
      isLoading,
      refreshProfile: async () => {
        if (firebaseUser) await loadProfile(firebaseUser.uid);
      },
    }),
    [firebaseUser, profile, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
}
