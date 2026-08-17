"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Upload } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { PlanUsageSection } from "@/components/settings/PlanUsageSection";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/useToast";
import { updateWorkspaceProfile, updateWorkspaceLogo } from "@/services/workspaceService";
import { workspaceSettingsSchema, type WorkspaceSettingsFormValues } from "@/lib/validations/settings.schema";

export default function WorkspaceSettingsPage() {
  const { workspace, isLoading, refreshWorkspace } = useWorkspaceContext();
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<WorkspaceSettingsFormValues>({ resolver: zodResolver(workspaceSettingsSchema) });

  useEffect(() => {
    if (workspace) {
      reset({
        name: workspace.name,
        companyName: workspace.companyName,
        slug: workspace.slug,
        companyEmail: workspace.companyEmail ?? "",
        companyWebsite: workspace.companyWebsite ?? "",
      });
      setLogoPreview(workspace.companyLogoUrl);
    }
  }, [workspace, reset]);

  async function onSubmit(values: WorkspaceSettingsFormValues) {
    if (!workspace) return;
    setIsSaving(true);
    try {
      if (logoFile) {
        await updateWorkspaceLogo(workspace.id, logoFile);
      }
      await updateWorkspaceProfile(workspace.id, {
        name: values.name,
        companyName: values.companyName,
        slug: values.slug,
        companyEmail: values.companyEmail || null,
        companyWebsite: values.companyWebsite || null,
      });
      await refreshWorkspace();
      setLogoFile(null);
      toast.success("Workspace settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save workspace settings");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || !workspace) return <Loader label="Loading workspace..." />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Workspace</h1>
        <p className="mt-1 text-sm text-foreground-muted">Workspace name, company details, and contact info.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <SettingsSection
          title="Workspace profile"
          action={
            <Button type="submit" size="sm" isLoading={isSaving} disabled={!isDirty && !logoFile}>
              Save changes
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <label
                htmlFor="workspace-logo-upload"
                className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-theme border border-dashed border-border bg-surface-muted"
              >
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="Company logo" className="h-full w-full object-cover" />
                ) : (
                  <Upload className="h-5 w-5 text-foreground-muted" />
                )}
              </label>
              <input
                id="workspace-logo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setLogoFile(file);
                  if (file) setLogoPreview(URL.createObjectURL(file));
                }}
              />
              <div>
                <p className="text-sm font-medium text-foreground">Company logo</p>
                <p className="text-xs text-foreground-muted">PNG or JPG, click to change</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Workspace name" error={errors.name?.message} {...register("name")} />
              <Input label="Company name" error={errors.companyName?.message} {...register("companyName")} />
              <Input label="Workspace URL" hint="app.creativestudio.com/w/your-slug" error={errors.slug?.message} {...register("slug")} />
              <Input label="Company email" type="email" placeholder="hello@company.com" error={errors.companyEmail?.message} {...register("companyEmail")} />
              <div className="sm:col-span-2">
                <Input label="Company website" placeholder="https://company.com" error={errors.companyWebsite?.message} {...register("companyWebsite")} />
              </div>
            </div>
          </div>
        </SettingsSection>
      </form>

      <PlanUsageSection workspace={workspace} />
    </div>
  );
}
