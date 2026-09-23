"use client";

import { useMemo } from "react";
import { useFirestoreDoc } from "./useFirestoreDoc";
import { platformSettingsDoc } from "@/lib/firebase/firestore";
import type { PlatformSettings } from "@/types/platformSettings.types";

/**
 * Live subscription to platform_settings/global's maintenanceMode flag
 * — see MainLayout.tsx for the gate this drives. Readable by any
 * signed-in user (see firestore.rules); the doc simply doesn't exist
 * yet on a deployment where no Super Admin has ever visited Platform
 * Settings, which is the normal (not-in-maintenance) state.
 *
 * The ref MUST be memoized: `platformSettingsDoc()` builds a fresh
 * DocumentReference every call, and MainLayout runs this hook on every
 * authenticated route — an unmemoized ref makes useFirestoreDoc's
 * effect re-subscribe on every render, which stalls the whole app
 * shell in a render loop.
 */
export function useMaintenanceMode(): { maintenanceMode: boolean; isLoading: boolean } {
  const ref = useMemo(() => platformSettingsDoc(), []);
  const { data, status } = useFirestoreDoc<PlatformSettings>(ref);
  return { maintenanceMode: data?.maintenanceMode === true, isLoading: status === "loading" || status === "idle" };
}
