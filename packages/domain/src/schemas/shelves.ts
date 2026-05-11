import { z } from "zod";
import { EntityIdSchema } from "./auth";
import { VisibilitySchema } from "./profiles";

export const ReadingStatusSchema = z.enum(["want_to_read", "reading", "finished", "dropped"]);

export const EditionSourceSchema = z.enum(["open_library", "google_books", "manual"]);

export const AuthorSchema = z.object({
  id: EntityIdSchema,
  name: z.string().min(1),
});

export const BookSchema = z.object({
  id: EntityIdSchema,
  canonicalTitle: z.string().min(1),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  coverUrl: z.string().url().optional(),
  firstPublishedYear: z.number().int().positive().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const EditionSchema = z.object({
  id: EntityIdSchema,
  bookId: EntityIdSchema,
  isbn10: z.string().length(10).optional(),
  isbn13: z.string().length(13).optional(),
  title: z.string().min(1),
  publisher: z.string().optional(),
  publishedDate: z.string().optional(),
  pageCount: z.number().int().positive().optional(),
  source: EditionSourceSchema,
  sourceKey: z.string().optional(),
});

export const ShelfKindSchema = z.enum(["system", "custom", "list"]);

export const ShelfAuthorTypeSchema = z.enum(["user", "internal_editorial", "algorithmic"]);

export const ShelfSchema = z.object({
  id: EntityIdSchema,
  ownerId: EntityIdSchema,
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  visibility: VisibilitySchema,
  isSystem: z.boolean(),
  kind: ShelfKindSchema,
  authorType: ShelfAuthorTypeSchema,
  curatorTier: z.number().int().nonnegative().optional(),
  description: z.string().optional(),
  publishedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ShelfItemSchema = z.object({
  id: EntityIdSchema,
  shelfId: EntityIdSchema,
  bookId: EntityIdSchema,
  editionId: EntityIdSchema.optional(),
  status: ReadingStatusSchema,
  rank: z.number().int().positive().optional(),
  notes: z.string().optional(),
  position: z.number().int().nonnegative().optional(),
  addedAt: z.date(),
  updatedAt: z.date(),
});

export const CreateShelfInputSchema = z.object({
  name: z.string().min(1).max(100),
  visibility: VisibilitySchema.default("public"),
});

export const AddShelfItemInputSchema = z.object({
  shelfId: EntityIdSchema,
  bookId: EntityIdSchema,
  editionId: EntityIdSchema.optional(),
  status: ReadingStatusSchema,
});

export const UpdateShelfInputSchema = z.object({
  id: EntityIdSchema,
  version: z.number().int().positive(),
  name: z.string().min(1).max(100).optional(),
  visibility: VisibilitySchema.optional(),
  description: z.string().optional(),
});

export const DeleteShelfInputSchema = z.object({
  id: EntityIdSchema,
});

export const ListShelvesInputSchema = z.object({
  ownerId: EntityIdSchema,
});

export const CreateShelfOutputSchema = z.object({
  shelf: ShelfSchema,
});

export const UpdateShelfOutputSchema = z.object({
  shelf: ShelfSchema,
});

export const DeleteShelfOutputSchema = z.object({
  success: z.boolean(),
});

export const ListShelvesOutputSchema = z.object({
  shelves: z.array(ShelfSchema),
});

export const UpsertShelfItemInputSchema = z.object({
  shelfId: EntityIdSchema,
  bookId: EntityIdSchema,
  editionId: EntityIdSchema.optional(),
  notes: z.string().max(10000).optional(),
  position: z.number().int().nonnegative().optional(),
});

export const UpsertShelfItemOutputSchema = z.object({
  shelfItem: ShelfItemSchema,
});

export const MoveShelfItemInputSchema = z.object({
  shelfId: EntityIdSchema,
  bookId: EntityIdSchema,
  position: z.number().int().nonnegative(),
});

export const MoveShelfItemOutputSchema = z.object({
  shelfItem: ShelfItemSchema,
});

export const DeleteShelfItemInputSchema = z.object({
  shelfId: EntityIdSchema,
  bookId: EntityIdSchema,
});

export const DeleteShelfItemOutputSchema = z.object({
  success: z.boolean(),
});

export type ReadingStatusInput = z.infer<typeof ReadingStatusSchema>;
export type AuthorInput = z.infer<typeof AuthorSchema>;
export type BookInput = z.infer<typeof BookSchema>;
export type EditionInput = z.infer<typeof EditionSchema>;
export type ShelfKindInput = z.infer<typeof ShelfKindSchema>;
export type ShelfAuthorTypeInput = z.infer<typeof ShelfAuthorTypeSchema>;
export type ShelfInput = z.infer<typeof ShelfSchema>;
export type ShelfItemInput = z.infer<typeof ShelfItemSchema>;
export type CreateShelfInput = z.infer<typeof CreateShelfInputSchema>;
export type UpdateShelfInput = z.infer<typeof UpdateShelfInputSchema>;
export type DeleteShelfInput = z.infer<typeof DeleteShelfInputSchema>;
export type ListShelvesInput = z.infer<typeof ListShelvesInputSchema>;
export type AddShelfItemInput = z.infer<typeof AddShelfItemInputSchema>;
export type CreateShelfOutput = z.infer<typeof CreateShelfOutputSchema>;
export type UpdateShelfOutput = z.infer<typeof UpdateShelfOutputSchema>;
export type DeleteShelfOutput = z.infer<typeof DeleteShelfOutputSchema>;
export type ListShelvesOutput = z.infer<typeof ListShelvesOutputSchema>;
export type UpsertShelfItemInput = z.infer<typeof UpsertShelfItemInputSchema>;
export type UpsertShelfItemOutput = z.infer<typeof UpsertShelfItemOutputSchema>;
export type MoveShelfItemInput = z.infer<typeof MoveShelfItemInputSchema>;
export type MoveShelfItemOutput = z.infer<typeof MoveShelfItemOutputSchema>;
export const PublishShelfInputSchema = z.object({
  id: EntityIdSchema,
  version: z.number().int().positive(),
});

export const PublishShelfOutputSchema = z.object({
  shelf: ShelfSchema,
});

export const UnpublishShelfInputSchema = z.object({
  id: EntityIdSchema,
  version: z.number().int().positive(),
});

export const UnpublishShelfOutputSchema = z.object({
  shelf: ShelfSchema,
});

export type DeleteShelfItemInput = z.infer<typeof DeleteShelfItemInputSchema>;
export type DeleteShelfItemOutput = z.infer<typeof DeleteShelfItemOutputSchema>;
export type PublishShelfInput = z.infer<typeof PublishShelfInputSchema>;
export type PublishShelfOutput = z.infer<typeof PublishShelfOutputSchema>;
export type UnpublishShelfInput = z.infer<typeof UnpublishShelfInputSchema>;
export type UnpublishShelfOutput = z.infer<typeof UnpublishShelfOutputSchema>;
