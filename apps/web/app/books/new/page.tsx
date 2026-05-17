import type { Metadata } from "next";
import { Nav } from "../../components/Nav";
import { ManualBookForm } from "./ManualBookForm";
import { submitManualBookAction } from "./submitManualBook";

export const metadata: Metadata = {
  title: "Add a book manually · Hone",
  description:
    "Can't find your book in the catalog? Add it manually with a title, author, and optional details.",
};

/**
 * Manual book creation route (G-05, #79).
 *
 * Renders the ManualBookForm and wires it to the `submitManualBookAction`
 * server action. The action mirrors the contract of the eventual
 * `books.createManual` tRPC mutation (#75); when a tRPC client lands the
 * action body is the single seam to swap.
 */
export default function NewBookPage() {
  return (
    <main className="shell manualBookShell">
      <Nav currentPath="/books/new" />
      <section className="hero">
        <p className="eyebrow">Add a book</p>
        <h1>Manual entry</h1>
        <p className="lede">
          Use this when a book isn&rsquo;t in the catalog. We&rsquo;ll
          create the book and an edition tagged &ldquo;manual&rdquo;
          owned by you.
        </p>
      </section>
      <section className="board" aria-label="Manual book entry">
        <ManualBookForm onSubmit={submitManualBookAction} />
      </section>
    </main>
  );
}
