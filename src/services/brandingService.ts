import { updateDoc } from "firebase/firestore";
import { settingsDoc } from "@/lib/firebase/firestore";
import { uploadFile } from "@/lib/firebase/storage";
import { ref } from "firebase/storage";
import { storage } from "@/lib/firebase/config";
import { BrandingSettings } from "@/types/settings.types";

/**
 * File uploads for the Branding page's four image slots (logo,
 * favicon, login background, dashboard background). Each just
 * uploads to Storage and patches the matching field on
 * settings.branding — text/color fields on this page go through
 * useWorkspaceSettings/updateWorkspaceSettings directly, and colors
 * reuse ThemeContext (see the Branding page), so nothing about
 * color persistence is duplicated here.
 */
export async function uploadBrandingAsset(
  workspaceId: string,
  field: keyof BrandingSettings,
  file: File
): Promise<string> {
  const path = `workspaces/${workspaceId}/branding/${field}-${Date.now()}-${file.name}`;
  const fileRef = ref(storage, path);
  const url = await uploadFile(fileRef, file);
  await updateDoc(settingsDoc(workspaceId), { [`branding.${field}`]: url } as never);
  return url;
}
