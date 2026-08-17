"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ImageUploadSlot } from "@/components/settings/ImageUploadSlot";
import { ColorRoleRow } from "@/components/settings/color/ColorRoleRow";
import { PalettePresetGrid } from "@/components/settings/color/PalettePresetGrid";
import { SavedPalettesPanel } from "@/components/settings/color/SavedPalettesPanel";
import { BrandingLivePreview } from "@/components/settings/color/BrandingLivePreview";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/hooks/useToast";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { uploadBrandingAsset } from "@/services/brandingService";
import { saveNamedPalette, deleteNamedPalette } from "@/services/themePaletteService";
import { DEFAULT_BRANDING_SETTINGS } from "@/lib/constants/settingsDefaults";
import { DEFAULT_COLOR_ROLES, COLOR_ROLES, ColorRoles, BrandPalette, BrandColor } from "@/types/theme.types";

/**
 * Logo/favicon/backgrounds still save instantly on upload (unchanged
 * from before). Colors now work differently: editing builds a local
 * DRAFT (this page's own state) that live-previews via
 * BrandingLivePreview without touching the rest of the app — nothing
 * is written to Firestore, and the global theme doesn't change,
 * until "Save Theme" is clicked. "Reset to Default" both resets the
 * draft AND saves immediately, since a reset is meant to take effect
 * right away rather than sit as a pending, unsaved change.
 */
export default function BrandingSettingsPage() {
  const { settings, isLoading, workspaceId } = useWorkspaceSettings();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const { canManageWorkspace } = useCurrentMemberRole();

  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [draftColors, setDraftColors] = useState<ColorRoles>(DEFAULT_COLOR_ROLES);
  const [draftActivePaletteId, setDraftActivePaletteId] = useState<string | null>(theme.activePaletteId);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPalette, setIsSavingPalette] = useState(false);

  useEffect(() => {
    setDraftColors(theme.colors);
    setDraftActivePaletteId(theme.activePaletteId);
  }, [theme.colors, theme.activePaletteId]);

  const branding = settings?.branding ?? DEFAULT_BRANDING_SETTINGS;
  const isDirty = JSON.stringify(draftColors) !== JSON.stringify(theme.colors) || draftActivePaletteId !== theme.activePaletteId;

  async function handleUpload(field: "logoUrl" | "faviconUrl" | "loginBackgroundUrl" | "dashboardBackgroundUrl", file: File) {
    if (!workspaceId) return;
    setUploadingField(field);
    try {
      await uploadBrandingAsset(workspaceId, field, file);
      toast.success("Image updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingField(null);
    }
  }

  function updateRole(key: keyof ColorRoles, color: BrandColor) {
    setDraftColors((prev) => ({ ...prev, [key]: color }));
    setDraftActivePaletteId(null); // any hand-edit clears the active-preset highlight — this is now "Custom"
  }

  function applyPalette(palette: BrandPalette) {
    setDraftColors(palette.colors);
    setDraftActivePaletteId(palette.id);
  }

  async function handleSaveTheme() {
    setIsSaving(true);
    try {
      await setTheme({ colors: draftColors, activePaletteId: draftActivePaletteId });
      toast.success("Theme saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save theme");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleResetToDefault() {
    setDraftColors(DEFAULT_COLOR_ROLES);
    setDraftActivePaletteId("modern");
    setIsSaving(true);
    try {
      await setTheme({ colors: DEFAULT_COLOR_ROLES, activePaletteId: "modern" });
      toast.success("Reset to default colors");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reset theme");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveAsPalette(name: string) {
    if (!workspaceId) return;
    setIsSavingPalette(true);
    try {
      const newPalette: BrandPalette = { id: crypto.randomUUID(), name, colors: draftColors };
      await saveNamedPalette(workspaceId, newPalette);
      toast.success(`Saved "${name}" to your palette library`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save palette");
    } finally {
      setIsSavingPalette(false);
    }
  }

  async function handleDeletePalette(palette: BrandPalette) {
    if (!workspaceId) return;
    try {
      await deleteNamedPalette(workspaceId, palette);
      toast.success(`Deleted "${palette.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete palette");
    }
  }

  if (isLoading) return <Loader label="Loading branding..." />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Branding</h1>
        <p className="mt-1 text-sm text-foreground-muted">Logo, favicon, backgrounds, and your full brand color system.</p>
      </div>

      <SettingsSection
        title="Images"
        description={!canManageWorkspace ? "Only workspace owners and admins can change these." : undefined}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <ImageUploadSlot label="Logo" previewUrl={branding.logoUrl} isUploading={uploadingField === "logoUrl"} onUpload={(f) => handleUpload("logoUrl", f)} disabled={!canManageWorkspace} />
          <ImageUploadSlot label="Favicon" previewUrl={branding.faviconUrl} isUploading={uploadingField === "faviconUrl"} onUpload={(f) => handleUpload("faviconUrl", f)} disabled={!canManageWorkspace} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ImageUploadSlot
            label="Login background"
            description="Shown behind the login form"
            aspect="wide"
            previewUrl={branding.loginBackgroundUrl}
            isUploading={uploadingField === "loginBackgroundUrl"}
            onUpload={(f) => handleUpload("loginBackgroundUrl", f)}
            disabled={!canManageWorkspace}
          />
          <ImageUploadSlot
            label="Dashboard background"
            description="Shown behind the main app"
            aspect="wide"
            previewUrl={branding.dashboardBackgroundUrl}
            isUploading={uploadingField === "dashboardBackgroundUrl"}
            onUpload={(f) => handleUpload("dashboardBackgroundUrl", f)}
            disabled={!canManageWorkspace}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Preset palettes" description="Quick-start themes — pick one, then fine-tune any color below.">
        <PalettePresetGrid activePaletteId={draftActivePaletteId} onApply={applyPalette} />
      </SettingsSection>

      <SettingsSection
        title="Brand colors"
        description="Unlimited custom colors — click any swatch for the full picker (HEX, RGB, HSL, and opacity)."
        action={
          canManageWorkspace && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleResetToDefault} isLoading={isSaving}>
                <RotateCcw className="h-4 w-4" />
                Reset to Default
              </Button>
              <Button size="sm" onClick={handleSaveTheme} isLoading={isSaving} disabled={!isDirty}>
                <Save className="h-4 w-4" />
                Save Theme
              </Button>
            </div>
          )
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            {COLOR_ROLES.map((role) => (
              <ColorRoleRow
                key={role.key}
                label={role.label}
                description={role.description}
                color={draftColors[role.key]}
                onChange={(color) => updateRole(role.key, color)}
              />
            ))}
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Live preview</p>
            <BrandingLivePreview colors={draftColors} />
            {isDirty && <p className="mt-2 text-xs text-amber-500">You have unsaved color changes.</p>}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Saved palettes" description="Build a library of your own brand color sets.">
        <SavedPalettesPanel
          palettes={theme.savedPalettes}
          activePaletteId={draftActivePaletteId}
          onApply={applyPalette}
          onDelete={handleDeletePalette}
          onSaveCurrent={handleSaveAsPalette}
          isSaving={isSavingPalette}
        />
      </SettingsSection>
    </div>
  );
}
