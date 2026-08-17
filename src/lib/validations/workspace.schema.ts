import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z.string().min(2, "Workspace name must be at least 2 characters"),
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
  companyEmail: z.string().email("Enter a valid email").or(z.literal("")).optional().default(""),
  companyWebsite: z
    .string()
    .regex(/^https?:\/\/.+/, "Include https:// at the start")
    .or(z.literal(""))
    .optional()
    .default(""),
  timezone: z.string().min(1, "Choose a timezone"),
  defaultLanguage: z.string().min(1, "Choose a language"),
});

export type CreateWorkspaceFormValues = z.infer<typeof createWorkspaceSchema>;
