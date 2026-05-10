import { z } from "zod";
import { EntityIdSchema } from "./auth";

export const ImportSourceSchema = z.enum(["goodreads", "manual"]);

export const ImportStatusSchema = z.enum([
  "pending",
  "processing",
  "needs_review",
  "completed",
  "failed",
]);

export const ReuploadStrategySchema = z.enum([
  "process_from_scratch",
  "merge_changes_only",
  "cancel",
]);

export const ImportSchema = z.object({
  id: EntityIdSchema,
  ownerId: EntityIdSchema,
  source: ImportSourceSchema,
  idempotencyHash: z.string().optional(),
  conflictCount: z.number().int().nonnegative(),
  status: ImportStatusSchema,
  createdAt: z.date(),
  completedAt: z.date().optional(),
});

export const CheckImportInputSchema = z.object({
  fileHash: z.string().length(64).regex(/^[0-9a-f]+$/),
});

export const CheckImportOutputSchema = z.object({
  isDuplicate: z.boolean(),
  existingImportId: EntityIdSchema.optional(),
  options: z
    .array(ReuploadStrategySchema)
    .optional(),
});

export const ConfirmReuploadInputSchema = z.object({
  fileHash: z.string().length(64).regex(/^[0-9a-f]+$/),
  strategy: ReuploadStrategySchema,
});

export const ConfirmReuploadOutputSchema = z.object({
  importId: EntityIdSchema.optional(),
  status: z.enum(["created", "cancelled"]),
});

export type ReuploadStrategy = z.infer<typeof ReuploadStrategySchema>;
export type CheckImportInput = z.infer<typeof CheckImportInputSchema>;
export type CheckImportOutput = z.infer<typeof CheckImportOutputSchema>;
export type ConfirmReuploadInput = z.infer<typeof ConfirmReuploadInputSchema>;
export type ConfirmReuploadOutput = z.infer<typeof ConfirmReuploadOutputSchema>;
