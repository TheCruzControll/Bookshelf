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

export const CreateImportInputSchema = z.object({
  source: ImportSourceSchema,
  idempotencyHash: z.string().length(64),
});

export const UpdateImportStatusInputSchema = z.object({
  id: EntityIdSchema,
  status: ImportStatusSchema,
  completedAt: z.date().optional(),
});

export type ImportOutput = z.infer<typeof ImportSchema>;
export type CreateImportInput = z.infer<typeof CreateImportInputSchema>;
export type UpdateImportStatusInput = z.infer<typeof UpdateImportStatusInputSchema>;
