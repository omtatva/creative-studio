import { z } from "zod";

/** Workspace identity — name/company/slug/contact fields. */
export const workspaceSettingsSchema = z.object({
  name: z.string().min(2, "Workspace name must be at least 2 characters"),
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  slug: z.string().min(3, "Slug must be at least 3 characters").regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  companyEmail: z.string().email("Enter a valid email").or(z.literal("")).nullable().optional(),
  companyWebsite: z
    .string()
    .regex(/^https?:\/\/.+/, "Include https:// at the start")
    .or(z.literal(""))
    .nullable()
    .optional(),
});
export type WorkspaceSettingsFormValues = z.infer<typeof workspaceSettingsSchema>;

/** Security — password policy + session timeout + 2FA + allowed domains. */
export const securitySettingsSchema = z.object({
  twoFactorRequired: z.boolean(),
  sessionTimeoutMinutes: z.number().min(5, "At least 5 minutes").max(1440, "At most 24 hours (1440 minutes)"),
  allowedEmailDomainsText: z.string(),
  minLength: z.number().min(6, "At least 6 characters").max(64),
  requireUppercase: z.boolean(),
  requireNumber: z.boolean(),
  requireSymbol: z.boolean(),
});
export type SecuritySettingsFormValues = z.infer<typeof securitySettingsSchema>;

/** Storage — max upload size + allowed extensions. */
export const storageSettingsSchema = z.object({
  maxUploadSizeMb: z.number().min(1, "At least 1 MB").max(5000, "At most 5000 MB"),
  allowedFileTypesText: z.string().min(1, "List at least one file type"),
});
export type StorageSettingsFormValues = z.infer<typeof storageSettingsSchema>;

/** Notifications — channels + digest + Slack webhook. */
export const notificationSettingsSchema = z.object({
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  slackEnabled: z.boolean(),
  slackWebhookUrl: z
    .string()
    .regex(/^https:\/\/hooks\.slack\.com\/.+/, "Must be a Slack webhook URL")
    .or(z.literal(""))
    .nullable()
    .optional(),
  digestFrequency: z.enum(["off", "daily", "weekly"]),
});
export type NotificationSettingsFormValues = z.infer<typeof notificationSettingsSchema>;

/** Invite a user by email + system role. */
export const inviteUserSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  role: z.enum(["admin", "member", "viewer"]),
});
export type InviteUserFormValues = z.infer<typeof inviteUserSchema>;

/** Create/edit a custom role. */
export const customRoleSchema = z.object({
  name: z.string().min(2, "Role name must be at least 2 characters").max(40, "Keep it under 40 characters"),
  description: z.string().max(160, "Keep it under 160 characters").optional().default(""),
  permissions: z.array(z.string()).min(1, "Select at least one permission"),
});
export type CustomRoleFormValues = z.infer<typeof customRoleSchema>;

/** Project/Task option (status/priority/label) — shared shape for the color+label CRUD rows on Project/Task Settings. */
export const optionFormSchema = z.object({
  label: z.string().min(1, "Label is required").max(30, "Keep it under 30 characters"),
  color: z.string().min(1, "Choose a color"),
});
export type OptionFormValues = z.infer<typeof optionFormSchema>;

/** A project or task template. */
export const templateFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(60, "Keep it under 60 characters"),
  description: z.string().max(300, "Keep it under 300 characters").optional().default(""),
});
export type TemplateFormValues = z.infer<typeof templateFormSchema>;
