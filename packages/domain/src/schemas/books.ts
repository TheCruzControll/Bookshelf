import { z } from "zod";
import { BookSchema, EditionSchema } from "./shelves";

/**
 * Zod schemas for the `books.createManual` tRPC procedure (#75).
 *
 * The viewer supplies the minimum metadata required to add a book that
 * isn't in the external catalog: a title, at least one author, and
 * optionally an ISBN, publish year, and cover URL. The service layer
 * normalizes the ISBN (10 → 13) and validates checksums; the schema only
 * enforces shape and basic bounds so the client gets fast feedback on
 * obviously-wrong input.
 */

export const BooksCreateManualInputSchema = z.object({
  title: z.string().trim().min(1).max(500),
  authors: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
  /**
   * Optional ISBN-10 or ISBN-13. Hyphens / spaces tolerated. Validity
   * (length + checksum) is enforced server-side in `BookService.createManual`
   * via `normalizeIsbn`, which surfaces a typed `INVALID_INPUT` error if the
   * value is malformed.
   */
  isbn: z.string().trim().min(10).max(20).optional(),
  year: z.number().int().gte(0).lte(9999).optional(),
  coverUrl: z.string().url().max(2048).optional(),
});

export const BooksCreateManualOutputSchema = z.object({
  book: BookSchema,
  edition: EditionSchema,
});

export type BooksCreateManualInput = z.infer<typeof BooksCreateManualInputSchema>;
export type BooksCreateManualOutput = z.infer<typeof BooksCreateManualOutputSchema>;
