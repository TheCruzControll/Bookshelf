import {
  BooksCreateManualInputSchema,
  type BooksCreateManualInput,
} from "@hone/domain";

/**
 * Submission shim for the `books.createManual` mutation (#75) on native.
 *
 * Mirrors `apps/web/app/books/new/submitManualBook.ts`. The native app
 * has no tRPC client wired in yet (same deferred pattern as #76 / #143);
 * for now we re-validate the payload against the shared schema so the
 * call surface is correct end-to-end and a malformed call surfaces a
 * thrown error to the form. When a native tRPC caller lands, this body
 * is the single seam to swap to:
 *
 *   await trpc.books.createManual.mutate(input);
 *
 * Returning `void` keeps the form's contract simple — the screen just
 * needs to know the call succeeded so it can navigate or surface a
 * success state.
 */
export async function submitManualBook(
  input: BooksCreateManualInput,
): Promise<void> {
  BooksCreateManualInputSchema.parse(input);
  // TODO(#80 follow-up): once a native-side tRPC caller exists, replace
  // this body with a call to the `books.createManual` mutation. The
  // server already returns a Book + Edition with `source: "manual"` on
  // the Edition (#75 acceptance criterion).
}
