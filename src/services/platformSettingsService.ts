import { getDoc } from "firebase/firestore";
import { platformSettingsDoc } from "@/lib/firebase/firestore";
import { getCurrentUser } from "@/lib/firebase/auth";
import type { PlatformSettings, PlatformIntegrationStatus } from "@/types/platformSettings.types";
import { DEFAULT_PLATFORM_SETTINGS } from "@/types/platformSettings.types";

/** Public (any signed-in user) read — see firestore.rules' platform_settings block. Returns the seeded defaults if no Super Admin has ever saved a change yet. */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const snapshot = await getDoc(platformSettingsDoc());
  if (!snapshot.exists()) {
    const now = new Date().toISOString();
    return { ...DEFAULT_PLATFORM_SETTINGS, createdAt: now, updatedAt: now } as PlatformSettings;
  }
  return snapshot.data();
}

async function authHeader(): Promise<Record<string, string>> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  return { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };
}

/** Super-Admin-only (enforced server-side by verifySuperAdminAuth, not this function) — see /api/platform-settings/update. */
export async function updatePlatformSettings(patch: Partial<Pick<PlatformSettings, "platformName" | "platformUrl" | "supportEmail" | "timezone" | "maintenanceMode">>): Promise<PlatformSettings> {
  const headers = await authHeader();
  const response = await fetch("/api/platform-settings/update", { method: "POST", headers, body: JSON.stringify(patch) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error ?? "Couldn't save platform settings.");
  }
  return data.settings as PlatformSettings;
}

/** Super-Admin-only read-only integration status — see /api/platform-settings/status. */
export async function getPlatformIntegrationStatus(): Promise<PlatformIntegrationStatus> {
  const headers = await authHeader();
  const response = await fetch("/api/platform-settings/status", { headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error ?? "Couldn't load platform integration status.");
  }
  return data as PlatformIntegrationStatus;
}
