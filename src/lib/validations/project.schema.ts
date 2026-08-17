import { z } from "zod";

/**
 * statusId/priorityId/color/icon are validated as non-empty strings
 * here rather than z.enum([...]) because their valid values come
 * from the workspace's Settings (WorkspaceSettings.projectOptions),
 * not a fixed list known at compile time. The form layer cross-
 * checks the selected value against the live options before submit.
 */
export const projectFormSchema = z
  .object({
    name: z.string().min(2, "Project name must be at least 2 characters").max(80, "Keep it under 80 characters"),
    description: z.string().max(600, "Keep it under 600 characters").optional().default(""),
    color: z.string().min(1, "Choose a color"),
    icon: z.string().min(1, "Choose an icon"),
    statusId: z.string().min(1, "Choose a status"),
    priorityId: z.string().min(1, "Choose a priority"),
    startDate: z.string().nullable().optional().default(null),
    dueDate: z.string().nullable().optional().default(null),
    tags: z.array(z.string()).default([]),
  })
  .refine((data) => !data.startDate || !data.dueDate || data.startDate <= data.dueDate, {
    message: "Due date must be on or after the start date",
    path: ["dueDate"],
  });

export type ProjectFormValues = z.infer<typeof projectFormSchema>;
