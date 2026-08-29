import { getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { platformPlanConfigDoc } from "@/lib/firebase/firestore";
import type { PlatformPlanConfig, PlanConfigEntry } from "@/types/platformConfig.types";
import type { WorkspacePlan } from "@/types/workspace.types";

/** Public read (see firestore.rules) — used by the pricing page (even logged out) and Super Admin > Plans. */
export async function getPlanConfig(): Promise<PlatformPlanConfig | null> {
  const snapshot = await getDoc(platformPlanConfigDoc());
  return snapshot.exists() ? snapshot.data() : null;
}

/**
 * Super-Admin-only (enforced by firestore.rules, not this function).
 * Merges onto whatever's already saved for OTHER plans — a save for
 * "pro" never touches "starter"/"business"/"enterprise"'s entries.
 */
export async function updatePlanConfig(planId: WorkspacePlan, entry: PlanConfigEntry, updatedBy: string): Promise<void> {
  const existing = await getPlanConfig();
  const next: PlatformPlanConfig = {
    plans: { ...(existing?.plans ?? {}), [planId]: entry },
    updatedBy,
    createdAt: existing?.createdAt ?? (serverTimestamp() as never),
    updatedAt: serverTimestamp() as never,
  };
  await setDoc(platformPlanConfigDoc(), next);
}
