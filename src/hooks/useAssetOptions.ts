"use client";

import { useEffect, useState } from "react";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { getWorkspaceSettings, updateWorkspaceSettings } from "@/services/settingsService";
import { AssetOptionsSettings, AssetStatusOption } from "@/types/settings.types";
import { DEFAULT_ASSET_OPTIONS } from "@/lib/constants/assetOptions";

/**
 * Single source every Creative Review Workspace component reads
 * asset statuses/colors from — never a hardcoded list. Mirrors
 * useProjectOptions.ts exactly (one-shot fetch, not realtime — same
 * convention already established there). Falls back to
 * DEFAULT_ASSET_OPTIONS only while loading or for a workspace created
 * before `assetOptions` existed on the settings doc.
 */
export function useAssetOptions() {
  const { workspaceId } = useWorkspaceContext();
  const [options, setOptions] = useState<AssetOptionsSettings>(DEFAULT_ASSET_OPTIONS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setOptions(DEFAULT_ASSET_OPTIONS);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    getWorkspaceSettings(workspaceId)
      .then((settings) => {
        if (cancelled) return;
        setOptions(settings?.assetOptions ?? DEFAULT_ASSET_OPTIONS);
      })
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const getStatus = (id: string) => options.statuses.find((s) => s.id === id) ?? options.statuses[0];

  async function saveStatuses(statuses: AssetStatusOption[]) {
    if (!workspaceId) return;
    await updateWorkspaceSettings(workspaceId, { assetOptions: { statuses } });
    setOptions({ statuses });
  }

  return { options, isLoading, getStatus, saveStatuses };
}
