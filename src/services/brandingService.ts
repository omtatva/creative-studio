import { updateDoc } from "firebase/firestore";
import { settingsDoc } from "@/lib/firebase/firestore";
import { uploadFile, workspaceBrandingLogoRef } from "@/lib/firebase/storage";
import { ref } from "firebase/storage";
import { storage } from "@/lib/firebase/config";
import { BrandingSettings } from "@/types/settings.types";

/**
 * File uploads for the Branding page's four image slots (logo,
 * favicon, login background, dashboard background). Each just
 * uploads to Storage and patches the matching field on
 * settings.branding via dot-notation (`updateDoc(..., {"branding.logoUrl": url})`),
 * which only ever touches that one nested field — every other field
 * on the settings doc (theme, notifications, security, sidebarConfig,
 * ...) is left completely untouched by this call. Text/color fields
 * on this page go through useWorkspaceSettings/updateWorkspaceSettings
 * directly, and colors reuse ThemeContext (see the Branding page), so
 * nothing about color persistence is duplicated here.
 */

const MAX_BRANDING_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB — logos/favicons/backgrounds are small, static images, not creative-asset uploads (which allow up to 500 MB elsewhere)
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml", "image/gif"];

function assertValidBrandingImage(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(`"${file.name}" isn't a supported image type. Use PNG, JPG, WEBP, GIF, or SVG.`);
  }
  if (file.size > MAX_BRANDING_IMAGE_BYTES) {
    throw new Error(`"${file.name}" is too large (max ${MAX_BRANDING_IMAGE_BYTES / (1024 * 1024)} MB).`);
  }
}

export async function uploadBrandingAsset(
  workspaceId: string,
  field: keyof BrandingSettings,
  file: File
): Promise<string> {
  assertValidBrandingImage(file);

  // The logo specifically uses a FIXED path (see workspaceBrandingLogoRef's
  // doc comment) so a re-upload replaces the previous logo in place
  // instead of accumulating a new Storage object per upload — the
  // other three assets keep their existing timestamped-path behavior,
  // unchanged.
  const fileRef =
    field === "logoUrl" ? workspaceBrandingLogoRef(workspaceId) : ref(storage, `workspaces/${workspaceId}/branding/${field}-${Date.now()}-${file.name}`);

  const url = await uploadFile(fileRef, file);
  await updateDoc(settingsDoc(workspaceId), { [`branding.${field}`]: url } as never);
  return url;
}
