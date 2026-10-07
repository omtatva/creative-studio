"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { FolderKanban } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useToast } from "@/hooks/useToast";
import { usePlatformAppearance } from "@/hooks/usePlatformAppearance";
import { saveProjectHeaderAppearance } from "@/services/platformAppearanceService";
import { formatDate } from "@/lib/utils/date";
import {
  DEFAULT_PROJECT_HEADER_STYLE,
  PROJECT_HEADER_DIRECTIONS,
  PROJECT_HEADER_GRADIENT,
  hexToRgbTriplet,
  isValidHexColor,
  type ProjectHeaderDirection,
  type ProjectHeaderStyle,
} from "@/lib/constants/projectAppearance";

/**
 * Super Admin > Platform Settings > Appearance > Project header.
 * "Save as default" only changes what NEW projects get; "Apply to
 * Existing Projects" additionally stamps ONE global timestamp so every
 * existing project renders the style too — no project documents are
 * written (see lib/constants/projectAppearance.ts). Writes go through
 * the Super-Admin-only /api/platform-settings/appearance route; this
 * component's own visibility is only a convenience.
 */
export function ProjectAppearanceSection() {
  const toast = useToast();
  const { appearance, isLoading } = usePlatformAppearance();
  const saved: ProjectHeaderStyle = appearance?.projectHeader ?? DEFAULT_PROJECT_HEADER_STYLE;
  const [draft, setDraft] = useState<ProjectHeaderStyle>(saved);
  const [isSeeded, setIsSeeded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Seed the draft once the saved doc has loaded; later snapshots (our own save echoing back) must not clobber edits.
  useEffect(() => {
    if (!isLoading && !isSeeded) {
      setDraft(saved);
      setIsSeeded(true);
    }
  }, [isLoading, isSeeded, saved]);

  const isValid = isValidHexColor(draft.primary) && isValidHexColor(draft.secondary);
  const isDirty = draft.primary.toUpperCase() !== saved.primary.toUpperCase() || draft.secondary.toUpperCase() !== saved.secondary.toUpperCase() || draft.direction !== saved.direction;
  const neverSaved = !appearance;

  const previewVars = isValid
    ? ({
        "--project-header-primary": hexToRgbTriplet(draft.primary),
        "--project-header-secondary": hexToRgbTriplet(draft.secondary),
        "--project-header-gradient-direction": draft.direction,
      } as CSSProperties)
    : undefined;

  async function save(applyToExisting: boolean) {
    if (!isValid) return;
    if (applyToExisting) setIsApplying(true);
    else setIsSaving(true);
    try {
      await saveProjectHeaderAppearance(draft, applyToExisting);
      toast.success(applyToExisting ? "Project header style applied to all existing projects." : "Saved as the default for new projects.");
      setIsConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save appearance.");
    } finally {
      setIsSaving(false);
      setIsApplying(false);
    }
  }

  return (
    <SettingsSection
      title="Appearance — Project header"
      description="The banner at the top of every project (project page, Creative Workspace) and the cover on project cards. A project's own cover image always wins. Buttons, sidebar, billing, status badges and Super Admin pages are not affected."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ColorField label="Primary color" value={draft.primary} onChange={(v) => setDraft({ ...draft, primary: v })} />
          <ColorField label="Secondary color" value={draft.secondary} onChange={(v) => setDraft({ ...draft, secondary: v })} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-header-direction" className="text-sm font-medium text-foreground">Gradient direction</label>
            <select
              id="project-header-direction"
              value={draft.direction}
              onChange={(e) => setDraft({ ...draft, direction: e.target.value as ProjectHeaderDirection })}
              className="h-10 w-full rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {PROJECT_HEADER_DIRECTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2" aria-label="Live preview">
          <p className="text-sm font-medium text-foreground">Live preview</p>
          <div style={previewVars} className="overflow-hidden rounded-theme border border-border bg-cards">
            <div className="h-20 w-full" style={{ background: PROJECT_HEADER_GRADIENT }} />
            <div className="flex items-center gap-3 p-3">
              <div className="-mt-9 flex h-12 w-12 items-center justify-center rounded-theme border-4 border-cards bg-cards shadow-soft">
                <FolderKanban className="h-5 w-5 text-foreground-muted" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Sample project</p>
                <p className="text-xs text-foreground-muted">Project header preview</p>
              </div>
            </div>
          </div>
          {!isValid && <p className="text-xs text-error">Enter both colors as #RRGGBB hex values to preview.</p>}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => save(false)} isLoading={isSaving} disabled={!isValid || isApplying || (!neverSaved && !isDirty)}>
          Save as default for new projects
        </Button>
        <Button size="sm" variant="outline" onClick={() => setIsConfirmOpen(true)} disabled={!isValid || isSaving} >
          Apply to Existing Projects
        </Button>
        {isDirty && <Badge variant="warning">Unsaved changes</Badge>}
      </div>

      <div className="mt-3 flex flex-col gap-1 text-xs text-foreground-muted">
        <p>
          {appearance?.defaultSavedAt
            ? `Default saved — new projects use this style (since ${formatDate(appearance.defaultSavedAt)}).`
            : "No default saved yet — every project shows the Omtatva blue default (a project with its own deliberately chosen color keeps it)."}
        </p>
        <p>
          {appearance?.appliedToAllAt
            ? `Applied to all existing projects on ${formatDate(appearance.appliedToAllAt)}. Existing projects follow the saved style automatically.`
            : "Not applied to existing projects — they keep their current header until you apply it."}
        </p>
        <p>Applying updates one platform setting, not each project, so it takes effect immediately and can be changed again at any time.</p>
      </div>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => save(true)}
        isSubmitting={isApplying}
        title="Apply to existing projects?"
        description="Apply this project header style to all existing projects? This will replace the current project header style for existing projects."
        confirmLabel="Apply to All Projects"
      />
    </SettingsSection>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const isValid = isValidHexColor(value);
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <Input
          label={label}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          maxLength={7}
          spellCheck={false}
          error={isValid ? undefined : "Use #RRGGBB"}
        />
      </div>
      <input
        type="color"
        aria-label={`${label} picker`}
        value={isValid ? value.toLowerCase() : "#000000"}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="mb-0.5 h-10 w-12 cursor-pointer rounded-theme border border-border bg-surface p-1"
      />
    </div>
  );
}
