import { getCurrentUser } from "@/lib/firebase/auth";

export interface ProfileUpdate {
  displayName: string;
  phone: string;
  jobTitle: string;
}

/** Saves the signed-in user's OWN profile through /api/profile/update (the server derives who it is from the ID token). */
export async function updateMyProfile(update: ProfileUpdate): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch("/api/profile/update", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(update),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? "Couldn't save your profile. Try again.");
  // Pull the new display name into the Firebase Auth user object too.
  await user.reload().catch(() => undefined);
}
