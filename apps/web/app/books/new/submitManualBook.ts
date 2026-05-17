"use server";

import {
  BooksCreateManualInputSchema,
  type BooksCreateManualInput,
} from "@hone/domain";

/**
 * Server action shim for the `books.createManual` mutation (#75).
 *
 * The web app has no tRPC client wired in yet (mirrors #76 / #142). For
 * now we validate the payload against the shared schema so the call
 * surface is correct end-to-end, and throw if the viewer somehow gets
 * past the client-side validation. When a tRPC server-side caller lands,
 * this is the single seam to swap to:
 *
 *   await ctx.trpc.books.createManual.mutate(input);
 *
 * Returning `void` keeps the form's contract simple — the page just
 * needs to know the call succeeded so it can redirect or surface a
 * success state.
 *
 * Re-validating with the same schema the server-side procedure uses
 * means a hand-crafted POST cannot bypass the client-side checks while
 * the tRPC client is still missing — Acceptance criterion: "Validates
 * required fields client + server".
 */
export async function submitManualBookAction(
  input: BooksCreateManualInput,
): Promise<void> {
  BooksCreateManualInputSchema.parse(input);
  // TODO(#79 follow-up): once a web-side tRPC caller exists, replace this
  // body with a call to the `books.createManual` mutation. The server
  // already returns a Book + Edition with `source: "manual"` on the
  // Edition (#75 acceptance criterion).
}
