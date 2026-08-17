import { ID, Timestamps } from "./common.types";

/**
 * A Firebase Auth-backed user profile, mirrored into Firestore
 * at users/{uid}. This is the GLOBAL user record — it is not
 * scoped to a workspace. Workspace-specific role/permission data
 * lives on the `Member` type instead (see workspace.types.ts),
 * because one user can belong to many workspaces.
 */
export interface AppUser extends Timestamps {
  uid: ID;
  email: string;
  displayName: string;
  photoURL: string | null;
  activeWorkspaceId: ID | null;
  onboardingComplete: boolean;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface SignupPayload extends AuthCredentials {
  displayName: string;
}
