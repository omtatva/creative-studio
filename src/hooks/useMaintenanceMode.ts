"use client";

import { useFirestoreDoc } from "./useFirestoreDoc";
import { platformSettingsDoc } from "@/lib/firebase/firestore";
import type { PlatformSettings } from "@/types/platformSettings.types";

/**
 * Live subscription to platform_settings/global's maintenanceMode flag
 * — see MainLayout.tsx for the gate this drives. Readable by any
 * signed-in user (see firestore.rules); the doc simply doesn't exist
 * yet on a deployment where no Super Admin has ever visited Platform
 * Settings, which is the normal (not-in-maintenance) state.
 */
export function useMaintenanceMode(): { maintenanceMode: boolean; isLoading: boolean } {
  const { data, status } = useFirestoreDoc<PlatformSettings>(platformSettingsDoc());
  return { maintenanceMode: data?.maintenanceMode === true, isLoading: status === "loading" || status === "idle" };
}
