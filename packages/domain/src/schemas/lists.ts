import { z } from "zod";
import { EntityIdSchema } from "./auth";
import { VisibilitySchema } from "./profiles";

export const ListSchema = z.object({
  id: EntityIdSchema,
  ownerId: EntityIdSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  visibility: VisibilitySchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ListItemSchema = z.object({
  id: EntityIdSchema,
  listId: EntityIdSchema,
  bookId: EntityIdSchema,
  position: z.number().int().positive(),
  addedAt: z.date(),
});

export const CreateListInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  visibility: VisibilitySchema.default("public"),
});

export const UpdateListInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  visibility: VisibilitySchema.optional(),
});

export const AddListItemInputSchema = z.object({
  listId: EntityIdSchema,
  bookId: EntityIdSchema,
  position: z.number().int().positive(),
});

export type ListInput = z.infer<typeof ListSchema>;
export type ListItemInput = z.infer<typeof ListItemSchema>;
export type CreateListInput = z.infer<typeof CreateListInputSchema>;
export type UpdateListInput = z.infer<typeof UpdateListInputSchema>;
export type AddListItemInput = z.infer<typeof AddListItemInputSchema>;
