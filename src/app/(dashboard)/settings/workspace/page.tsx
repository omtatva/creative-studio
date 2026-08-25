"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Upload } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { PlanUsageSection } from "@/components/settings/PlanUsageSection";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { useToast } from "@/hooks/useToast";
import { updateWorkspaceProfile, updateWorkspaceLogo, deleteWorkspaceAccess } from "@/services/workspaceService";
import { workspaceSettingsSchema, type WorkspaceSettingsFormValues } from "@/lib/validations/settings.schema";
import { ROUTES } from "@/lib/constants/routes";

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const { workspace, workspaces, isLoading, refreshWorkspace, switchWorkspace } = useWorkspaceContext();
  const { role } = useCurrentMemberRole();
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDeleteWorkspace() {
    if (!workspace) return;
    setIsDeleting(true);
    try {
      await deleteWorkspaceAccess(workspace.id);
      toast.success(`"${workspace.name}" deleted`);
      const remaining = workspaces.filter((w) => w.id !== workspace.id);
      if (remaining.length > 0) await switchWorkspace(remaining[0]!.id);
      else router.push(ROUTES.workspaceCreate);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete this workspace");
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
      setDeleteConfirmText("");
    }
  }

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

      {role === "owner" && (
        <SettingsSection title="Danger zone" description="Irreversible actions — think before you click.">
          <div className="flex items-center justify-between gap-4 rounded-theme border border-error/30 bg-error/5 p-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">Delete this workspace</p>
              <p className="text-xs text-foreground-muted">
                Removes it from every member&apos;s account immediately. Projects, files, and tasks are left in place but
                become unreachable — not permanently erased.
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={() => setIsDeleteModalOpen(true)}>
              Delete workspace
            </Button>
          </div>
        </SettingsSection>
      )}

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeleteConfirmText("");
        }}
        title="Delete this workspace?"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 rounded-theme border border-error/30 bg-error/5 p-3 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error" />
            <span>
              Every member loses access to <strong>{workspace.name}</strong> immediately. This can&apos;t be undone from here.
            </span>
          </div>
          <label className="flex flex-col gap-1.5 text-sm text-foreground">
            Type <strong>{workspace.name}</strong> to confirm
            <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder={workspace.name} />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setIsDeleteModalOpen(false); setDeleteConfirmText(""); }} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteWorkspace} isLoading={isDeleting} disabled={deleteConfirmText !== workspace.name}>
              Delete workspace
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
