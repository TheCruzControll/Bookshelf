import { z } from "zod";
import { EntityIdSchema } from "./auth";

export const ImportStatusSchema = z.enum([
  "pending",
  "processing",
  "needs_review",
  "completed",
  "failed",
]);

export const ImportSourceSchema = z.enum(["goodreads", "manual"]);

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

export const CreateImportOutputSchema = z.object({
  import: ImportSchema,
  duplicate: z.boolean(),
});

export const TransitionImportStatusInputSchema = z.object({
  id: EntityIdSchema,
  toStatus: ImportStatusSchema,
});

export const ListImportsOutputSchema = z.array(ImportSchema);

export type ImportStatusInput = z.infer<typeof ImportStatusSchema>;
export type ImportSourceInput = z.infer<typeof ImportSourceSchema>;
export type ImportOutput = z.infer<typeof ImportSchema>;
export type CreateImportOutput = z.infer<typeof CreateImportOutputSchema>;
export type TransitionImportStatusInput = z.infer<typeof TransitionImportStatusInputSchema>;
