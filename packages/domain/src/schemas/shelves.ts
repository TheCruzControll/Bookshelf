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

export const ShelfSchema = z.object({
  id: EntityIdSchema,
  ownerId: EntityIdSchema,
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  visibility: VisibilitySchema,
  isSystem: z.boolean(),
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

export type ReadingStatusInput = z.infer<typeof ReadingStatusSchema>;
export type AuthorInput = z.infer<typeof AuthorSchema>;
export type BookInput = z.infer<typeof BookSchema>;
export type EditionInput = z.infer<typeof EditionSchema>;
export type ShelfInput = z.infer<typeof ShelfSchema>;
export type ShelfItemInput = z.infer<typeof ShelfItemSchema>;
export type CreateShelfInput = z.infer<typeof CreateShelfInputSchema>;
export type AddShelfItemInput = z.infer<typeof AddShelfItemInputSchema>;
