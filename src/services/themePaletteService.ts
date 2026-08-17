import { arrayRemove, arrayUnion, updateDoc } from "firebase/firestore";
import { settingsDoc } from "@/lib/firebase/firestore";
import { BrandPalette } from "@/types/theme.types";

/**
 * Manages the workspace's LIBRARY of saved palettes
 * (settings.theme.savedPalettes) independently of which theme is
 * currently applied. Saving a new palette here doesn't change what
 * the app looks like right now — that only happens when the
 * Branding page calls ThemeContext.setTheme with the palette's
 * colors (i.e. "Apply" or "Save Theme"). Kept as its own service
 * rather than folded into settingsService's generic patch, since it
 * needs arrayUnion/arrayRemove instead of a full-object overwrite.
 */
export async function saveNamedPalette(workspaceId: string, palette: BrandPalette): Promise<void> {
  await updateDoc(settingsDoc(workspaceId), {
    "theme.savedPalettes": arrayUnion(palette),
  } as never);
}

export async function deleteNamedPalette(workspaceId: string, palette: BrandPalette): Promise<void> {
  await updateDoc(settingsDoc(workspaceId), {
    "theme.savedPalettes": arrayRemove(palette),
  } as never);
}
