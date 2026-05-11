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

export type RequestDeleteInput = z.infer<typeof RequestDeleteInputSchema>;
export type RequestDeleteOutput = z.infer<typeof RequestDeleteOutputSchema>;
export type CancelDeleteOutput = z.infer<typeof CancelDeleteOutputSchema>;
