"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Upload } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useDebounce } from "@/hooks/useDebounce";
import { createWorkspaceSchema, type CreateWorkspaceFormValues } from "@/lib/validations/workspace.schema";
import { slugify } from "@/lib/utils/slug";
import { TIMEZONE_OPTIONS, LANGUAGE_OPTIONS, getDefaultTimezone } from "@/lib/constants/localization";
import { DEFAULT_PLAN, PLAN_DISPLAY_NAMES, PLAN_PRICING } from "@/lib/constants/planLimits";
import type { WorkspacePlan } from "@/types/workspace.types";

interface CreateWorkspaceFormProps {
  onSuccess: (workspaceId: string) => void;
  submitLabel?: string;
  /** Plan picked on /pricing before signup, carried through via ?plan= — see workspace/create/page.tsx. Omitted = free plan, no summary shown. */
  initialPlan?: WorkspacePlan;
}

/**
 * The actual create-workspace form — extracted from the standalone
 * /workspace/create page so the SAME form (same fields, same
 * validation, same service call) can also run inside a modal. Two
 * surfaces, one implementation: the page still uses this for
 * direct-URL access; CreateWorkspaceModal uses it for the inline
 * "no workspace yet" flow so the user never leaves the page they
 * were on (e.g. Projects).
 */
export function CreateWorkspaceForm({ onSuccess, submitLabel = "Create workspace", initialPlan }: CreateWorkspaceFormProps) {
  const { create, isSubmitting, error, checkSlug } = useWorkspace();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateWorkspaceFormValues>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { timezone: getDefaultTimezone(), defaultLanguage: "en" },
  });

  const nameValue = watch("name");
  const slugValue = watch("slug");
  const debouncedSlug = useDebounce(slugValue, 400);

  useEffect(() => {
    if (nameValue) setValue("slug", slugify(nameValue));
  }, [nameValue, setValue]);

  useEffect(() => {
    if (!debouncedSlug || debouncedSlug.length < 3) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    checkSlug(debouncedSlug).then((available) => setSlugStatus(available ? "available" : "taken"));
  }, [debouncedSlug, checkSlug]);

  function handleLogoChange(file: File | null) {
    setLogoFile(file);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function onSubmit(values: CreateWorkspaceFormValues) {
    const newWorkspaceId = await create(
      {
        ...values,
        companyEmail: values.companyEmail || null,
        companyWebsite: values.companyWebsite || null,
        companyLogoFile: logoFile,
        plan: initialPlan,
      },
      { redirectOnSuccess: false }
    );
    if (newWorkspaceId) onSuccess(newWorkspaceId);
  }

  const isPaidPlan = initialPlan && initialPlan !== DEFAULT_PLAN;

  return (
    <form className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1" onSubmit={handleSubmit(onSubmit)}>
      {isPaidPlan && (
        <div className="flex items-center justify-between rounded-theme border border-primary/30 bg-primary/5 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-foreground">{PLAN_DISPLAY_NAMES[initialPlan]} plan selected</p>
            <p className="text-xs text-foreground-muted">
              {PLAN_PRICING[initialPlan].monthlyUsd !== null
                ? `$${PLAN_PRICING[initialPlan].monthlyUsd}/mo — activates once payment is confirmed`
                : "Our team will follow up to confirm pricing"}
            </p>
          </div>
          <Badge variant="info">Pending</Badge>
        </div>
      )}

      <div className="flex items-center gap-3">
        <label
          htmlFor="logo-upload"
          className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-theme border border-dashed border-border bg-surface-muted"
        >
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" />
          ) : (
            <Upload className="h-5 w-5 text-foreground-muted" />
          )}
        </label>
        <input
          id="logo-upload"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleLogoChange(e.target.files?.[0] ?? null)}
        />
        <div>
          <p className="text-sm font-medium text-foreground">Company logo</p>
          <p className="text-xs text-foreground-muted">Optional, PNG or JPG</p>
        </div>
      </div>

      <Input label="Workspace name" placeholder="Acme Creative" error={errors.name?.message} {...register("name")} />
      <Input label="Company name" placeholder="Acme Inc." error={errors.companyName?.message} {...register("companyName")} />
      <Input
        label="Workspace URL"
        placeholder="acme-creative"
        hint={
          slugStatus === "available"
            ? "This URL is available"
            : slugStatus === "taken"
            ? undefined
            : "app.creativestudio.com/w/your-slug"
        }
        error={errors.slug?.message ?? (slugStatus === "taken" ? "This URL is already taken" : undefined)}
        {...register("slug")}
      />
      <Input label="Company email" type="email" placeholder="hello@company.com" error={errors.companyEmail?.message} {...register("companyEmail")} />
      <Input label="Website" placeholder="https://company.com" error={errors.companyWebsite?.message} {...register("companyWebsite")} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Timezone</label>
          <select
            {...register("timezone")}
            className="h-10 w-full rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Default language</label>
          <select
            {...register("defaultLanguage")}
            className="h-10 w-full rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {LANGUAGE_OPTIONS.map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" isLoading={isSubmitting} disabled={slugStatus === "taken"} className="mt-1 w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
