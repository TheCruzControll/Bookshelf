import { TRPCError } from "@trpc/server";
import {
  AppServices,
  BooksCreateManualInputSchema,
  BooksCreateManualOutputSchema,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

/**
 * tRPC procedures for user-driven book authorship (#75).
 *
 * Currently exposes only `books.createManual`, which writes a Book + an
 * Edition with `source: "manual"` for books that aren't in the external
 * catalog. Requires authentication — the writeback is owned by the
 * authenticated viewer for downstream audit / abuse plumbing.
 */
export const booksRouter = router({
  createManual: publicProcedure
    .input(BooksCreateManualInputSchema)
    .output(BooksCreateManualOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Repositories not configured",
        });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => ctx.identity,
      });
      try {
        const createInput: Parameters<typeof services.books.createManual>[0] = {
          title: input.title,
          authors: input.authors,
        };
        if (input.isbn !== undefined) createInput.isbn = input.isbn;
        if (input.year !== undefined) createInput.year = input.year;
        if (input.coverUrl !== undefined) createInput.coverUrl = input.coverUrl;
        const { book, edition } = await services.books.createManual(createInput);
        return { book, edition };
      } catch (err) {
        if (err instanceof Error) {
          const code = (err as Error & { code?: string }).code;
          if (code === "INVALID_INPUT") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: err.message,
              cause: err,
            });
          }
        }
        throw err;
      }
    }),
});
