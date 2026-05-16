import { z } from "zod";

export const AccountDeletionSchema = z.object({
  profileId: z.string().uuid(),
  requestedAt: z.date(),
  hardDeleteAfter: z.date(),
  exportedAt: z.date().optional(),
});

export const RequestDeleteInputSchema = z.object({});

export const RequestDeleteOutputSchema = z.object({
  deletion: AccountDeletionSchema,
});

export const CancelDeleteOutputSchema = z.object({
  cancelled: z.boolean(),
});

export const RequestExportInputSchema = z.object({});

export const RequestExportOutputSchema = z.object({
  url: z.string(),
  expiresAt: z.date(),
});

export type RequestDeleteInput = z.infer<typeof RequestDeleteInputSchema>;
export type RequestDeleteOutput = z.infer<typeof RequestDeleteOutputSchema>;
export type CancelDeleteOutput = z.infer<typeof CancelDeleteOutputSchema>;
export type RequestExportInput = z.infer<typeof RequestExportInputSchema>;
export type RequestExportOutput = z.infer<typeof RequestExportOutputSchema>;
