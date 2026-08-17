import { z } from "zod";

/**
 * As with project.schema.ts, statusId/priorityId/labelIds are
 * validated as non-empty strings rather than z.enum([...]) because
 * their valid values live in WorkspaceSettings.taskOptions, not a
 * compile-time list.
 */
export const taskFormSchema = z
  .object({
    title: z.string().min(2, "Task title must be at least 2 characters").max(140, "Keep it under 140 characters"),
    descriptionHtml: z.string().optional().default(""),
    assigneeUid: z.string().nullable().optional().default(null),
    statusId: z.string().min(1, "Choose a status"),
    priorityId: z.string().min(1, "Choose a priority"),
    startDate: z.string().nullable().optional().default(null),
    dueDate: z.string().nullable().optional().default(null),
    estimatedMinutes: z.number().nullable().optional().default(null),
    tags: z.array(z.string()).default([]),
    labelIds: z.array(z.string()).default([]),
  })
  .refine((data) => !data.startDate || !data.dueDate || data.startDate <= data.dueDate, {
    message: "Due date must be on or after the start date",
    path: ["dueDate"],
  });

export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const checklistItemSchema = z.object({
  text: z.string().min(1, "Checklist item can't be empty").max(200, "Keep it under 200 characters"),
});

export const commentSchema = z.object({
  bodyHtml: z.string().min(1, "Write a comment before posting"),
});
