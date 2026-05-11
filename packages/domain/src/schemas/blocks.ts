import { z } from "zod";
import { EntityIdSchema } from "./auth";
import { BlockSchema } from "./profiles";

export const BlockCreateInputSchema = z.object({
  blockedId: EntityIdSchema,
});

export const BlockCreateOutputSchema = z.object({
  block: BlockSchema,
});

export const BlockDeleteInputSchema = z.object({
  blockedId: EntityIdSchema,
});

export const BlockDeleteOutputSchema = z.object({
  success: z.boolean(),
});

export type BlockCreateInput = z.infer<typeof BlockCreateInputSchema>;
export type BlockCreateOutput = z.infer<typeof BlockCreateOutputSchema>;
export type BlockDeleteInput = z.infer<typeof BlockDeleteInputSchema>;
export type BlockDeleteOutput = z.infer<typeof BlockDeleteOutputSchema>;
